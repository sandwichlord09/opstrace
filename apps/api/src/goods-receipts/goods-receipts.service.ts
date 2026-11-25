import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  ExceptionStatus,
  GoodsReceiptDto,
  GoodsReceiptStatus,
  PaginatedResponse,
  PurchaseOrderStatus,
  RelatedRecordType,
  SyncOperationStatus,
  SyncOperationType,
} from '@opstrace/shared-types';
import { GoodsReceiptQueryInput, SubmitGoodsReceiptInput } from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { reconcile } from './reconciliation.engine';

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Submit a Goods Receipt for a Purchase Order.
   *
   * TRANSACTION BOUNDARY: Everything — receipt persistence, reconciliation,
   * inventory snapshot upserts, exception creation, audit log, and idempotency
   * record — happens inside a single prisma.$transaction() so the database
   * is never left in a partially-updated state.
   *
   * IDEMPOTENCY: If the same idempotencyKey has already been processed for
   * this organization, the existing receipt is returned without creating a
   * duplicate. This is safe for mobile clients that may retry after a
   * network dropout.
   *
   * MULTI-TENANCY: organizationId is taken exclusively from TenantContext
   * (injected by JwtAuthGuard). It is never read from the request body.
   */
  async submit(input: SubmitGoodsReceiptInput): Promise<GoodsReceiptDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    return this.prisma.$transaction(async (tx) => {
      // ------------------------------------------------------------------
      // Step 1: Idempotency guard — check for prior submission
      // ------------------------------------------------------------------
      const existingSync = await tx.syncOperation.findUnique({
        where: {
          uq_sync_org_idempotency_key: {
            organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      if (existingSync?.serverRecordId) {
        // Already processed — return the existing receipt without touching the DB
        const existing = await tx.goodsReceipt.findUnique({
          where: { id: existingSync.serverRecordId },
          include: { items: true },
        });
        if (existing) {
          return this.mapReceiptToDto(existing);
        }
      }

      // ------------------------------------------------------------------
      // Step 2: Validate the Purchase Order belongs to this tenant and
      //         is in a receivable status.
      // ------------------------------------------------------------------
      const po = await tx.purchaseOrder.findFirst({
        where: { id: input.purchaseOrderId, organizationId },
        include: {
          items: true,
        },
      });

      if (!po) {
        throw new NotFoundException(
          `Purchase Order ${input.purchaseOrderId} not found in your organization.`,
        );
      }

      const receivableStatuses: string[] = [
        PurchaseOrderStatus.ISSUED,
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
      ];
      if (!receivableStatuses.includes(po.status)) {
        throw new BadRequestException(
          `Purchase Order is in status "${po.status}" and cannot accept new receipts. ` +
            `Only ISSUED or PARTIALLY_RECEIVED orders can be received against.`,
        );
      }

      // ------------------------------------------------------------------
      // Step 3: Validate warehouse belongs to this tenant & PO line items
      //         belong to this Purchase Order (prevents cross-tenant FK links)
      // ------------------------------------------------------------------
      const warehouse = await tx.warehouse.findFirst({
        where: { id: input.warehouseId, organizationId },
      });
      if (!warehouse) {
        throw new NotFoundException(
          `Warehouse ${input.warehouseId} not found in your organization.`,
        );
      }

      const poItemIds = new Set(po.items.map((item) => item.id));
      for (const item of input.items) {
        if (!poItemIds.has(item.purchaseOrderItemId)) {
          throw new BadRequestException(
            `Purchase Order Item ${item.purchaseOrderItemId} does not belong to Purchase Order ${input.purchaseOrderId}.`,
          );
        }
      }

      // ------------------------------------------------------------------
      // Step 4: Validate receipt number uniqueness (org-scoped)
      // ------------------------------------------------------------------
      const receiptNumberConflict = await tx.goodsReceipt.findUnique({
        where: {
          uq_goods_receipts_org_receipt_number: {
            organizationId,
            receiptNumber: input.receiptNumber,
          },
        },
      });
      if (receiptNumberConflict) {
        throw new ConflictException(
          `Receipt number "${input.receiptNumber}" already exists in your organization.`,
        );
      }

      // ------------------------------------------------------------------
      // Step 5: Persist the new Goods Receipt and its line items
      // ------------------------------------------------------------------
      const goodsReceipt = await tx.goodsReceipt.create({
        data: {
          organizationId,
          purchaseOrderId: input.purchaseOrderId,
          warehouseId: input.warehouseId,
          receivedBy: userId,
          receiptNumber: input.receiptNumber,
          status: GoodsReceiptStatus.SUBMITTED,
          receivedAt: input.receivedAt,
          submittedAt: new Date(),
          items: {
            create: input.items.map((item) => ({
              purchaseOrderItemId: item.purchaseOrderItemId,
              productId: item.productId,
              receivedQuantity: item.receivedQuantity,
              damagedQuantity: item.damagedQuantity,
              notes: item.conditionNotes ?? null,
            })),
          },
        },
        include: { items: true },
      });

      // ------------------------------------------------------------------
      // Step 6: Fetch ALL receipt items for this PO (including the new one)
      //         for a full reconciliation across partial deliveries.
      // ------------------------------------------------------------------
      const allReceiptItems = await tx.goodsReceiptItem.findMany({
        where: {
          goodsReceipt: {
            purchaseOrderId: input.purchaseOrderId,
            organizationId,
            status: { in: [GoodsReceiptStatus.SUBMITTED, GoodsReceiptStatus.RECONCILED] },
          },
        },
        select: {
          purchaseOrderItemId: true,
          productId: true,
          receivedQuantity: true,
          damagedQuantity: true,
        },
      });

      // ------------------------------------------------------------------
      // Step 7: Run the deterministic reconciliation engine
      // ------------------------------------------------------------------
      const reconcileResult = reconcile({
        purchaseOrderItems: po.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          orderedQuantity: item.orderedQuantity,
        })),
        allReceiptItems,
        isFinalDelivery: false, // Mobile clients can submit multiple receipts; finalization is explicit
      });

      // ------------------------------------------------------------------
      // Step 8: Update Purchase Order status based on reconciliation
      // ------------------------------------------------------------------
      await tx.purchaseOrder.update({
        where: { id: input.purchaseOrderId },
        data: { status: reconcileResult.poStatus },
      });

      // ------------------------------------------------------------------
      // Step 9: Upsert inventory snapshots — only THIS receipt's acceptedQuantity
      //         enters inventory. Damaged goods MUST NOT be counted as available stock.
      // ------------------------------------------------------------------
      const knownPoProductIds = new Set(po.items.map((item) => item.productId));
      const acceptedByProduct = new Map<string, number>();

      for (const item of input.items) {
        if (!knownPoProductIds.has(item.productId)) continue;
        const acceptedQty = item.receivedQuantity - item.damagedQuantity;
        if (acceptedQty <= 0) continue;
        acceptedByProduct.set(
          item.productId,
          (acceptedByProduct.get(item.productId) ?? 0) + acceptedQty,
        );
      }

      for (const [productId, acceptedDelta] of acceptedByProduct.entries()) {
        // Fetch the latest snapshot for this (org, warehouse, product) combination
        const latestSnapshot = await tx.inventorySnapshot.findFirst({
          where: {
            organizationId,
            warehouseId: input.warehouseId,
            productId,
          },
          orderBy: { recordedAt: 'desc' },
        });

        const currentQty = latestSnapshot?.quantity ?? 0;
        await tx.inventorySnapshot.create({
          data: {
            organizationId,
            warehouseId: input.warehouseId,
            productId,
            quantity: currentQty + acceptedDelta,
            sourceReference: goodsReceipt.receiptNumber,
          },
        });
      }

      // ------------------------------------------------------------------
      // Step 10: Persist exceptions detected by the reconciliation engine
      // ------------------------------------------------------------------
      let exceptionCounter = 1;
      for (const exc of reconcileResult.exceptions) {
        // Generate a human-readable exception number
        const exceptionNumber = `EX-${new Date().getFullYear()}-${String(exceptionCounter++).padStart(4, '0')}-${goodsReceipt.id.slice(0, 8)}`;

        await tx.exception.create({
          data: {
            organizationId,
            exceptionNumber,
            category: exc.category,
            severity: exc.severity,
            status: ExceptionStatus.OPEN,
            title: exc.title,
            description: exc.description,
            relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
            relatedRecordId: goodsReceipt.id,
          },
        });
      }

      // ------------------------------------------------------------------
      // Step 11: Mark the goods receipt as RECONCILED
      // ------------------------------------------------------------------
      await tx.goodsReceipt.update({
        where: { id: goodsReceipt.id },
        data: { status: GoodsReceiptStatus.RECONCILED },
      });

      // ------------------------------------------------------------------
      // Step 12: Write audit log
      // ------------------------------------------------------------------
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.RECONCILE,
          entityType: 'GoodsReceipt',
          entityId: goodsReceipt.id,
          metadata: {
            purchaseOrderId: input.purchaseOrderId,
            receiptNumber: input.receiptNumber,
            newPoStatus: reconcileResult.poStatus,
            exceptionsRaised: reconcileResult.exceptions.length,
            lineMetrics:
              reconcileResult.lineMetrics as unknown as Prisma.InputJsonValue,
          },
        },
      });

      // ------------------------------------------------------------------
      // Step 13: Register idempotency record so retries return early
      // ------------------------------------------------------------------
      await tx.syncOperation.upsert({
        where: {
          uq_sync_org_idempotency_key: {
            organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        create: {
          organizationId,
          userId,
          idempotencyKey: input.idempotencyKey,
          operationType: SyncOperationType.GOODS_RECEIPT_SUBMIT,
          status: SyncOperationStatus.COMPLETED,
          serverRecordId: goodsReceipt.id,
        },
        update: {
          status: SyncOperationStatus.COMPLETED,
          serverRecordId: goodsReceipt.id,
        },
      });

      return this.mapReceiptToDto({ ...goodsReceipt, status: GoodsReceiptStatus.RECONCILED });
    });
  }

  /**
   * List all Goods Receipts for the active tenant with optional filters and pagination.
   *
   * MULTI-TENANCY: Strictly scoped to organizationId from TenantContext.
   */
  async findAll(query: GoodsReceiptQueryInput): Promise<PaginatedResponse<GoodsReceiptDto>> {
    const { organizationId } = this.tenantContext.getOrFail();
    const { page, limit, purchaseOrderId, warehouseId, status } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      ...(purchaseOrderId && { purchaseOrderId }),
      ...(warehouseId && { warehouseId }),
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);

    return {
      data: data.map((r) => this.mapReceiptToDto(r)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve a single Goods Receipt by ID.
   *
   * MULTI-TENANCY: `organizationId` from TenantContext prevents cross-tenant reads.
   */
  async findOne(id: string): Promise<GoodsReceiptDto> {
    const { organizationId } = this.tenantContext.getOrFail();

    const receipt = await this.prisma.goodsReceipt.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });

    if (!receipt) {
      throw new NotFoundException(`Goods Receipt "${id}" not found.`);
    }

    return this.mapReceiptToDto(receipt);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Maps a Prisma GoodsReceipt (with items) to a GoodsReceiptDto.
   * Computes the derived `acceptedQuantity` field here so it is never stored
   * and always consistent with the raw received/damaged values.
   */
  private mapReceiptToDto(
    receipt: {
      id: string;
      organizationId: string;
      purchaseOrderId: string;
      warehouseId: string;
      receivedBy: string;
      receiptNumber: string;
      status: string;
      receivedAt: Date;
      submittedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      items?: {
        id: string;
        goodsReceiptId: string;
        purchaseOrderItemId: string;
        productId: string;
        receivedQuantity: number;
        damagedQuantity: number;
        notes: string | null;
      }[];
    },
  ): GoodsReceiptDto {
    return {
      id: receipt.id,
      organizationId: receipt.organizationId,
      purchaseOrderId: receipt.purchaseOrderId,
      warehouseId: receipt.warehouseId,
      receivedBy: receipt.receivedBy,
      receiptNumber: receipt.receiptNumber,
      status: receipt.status,
      receivedAt: receipt.receivedAt,
      submittedAt: receipt.submittedAt,
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
      items: receipt.items?.map((item) => ({
        id: item.id,
        goodsReceiptId: item.goodsReceiptId,
        purchaseOrderItemId: item.purchaseOrderItemId,
        productId: item.productId,
        receivedQuantity: item.receivedQuantity,
        damagedQuantity: item.damagedQuantity,
        acceptedQuantity: item.receivedQuantity - item.damagedQuantity,
        conditionNotes: item.notes,
      })),
    };
  }
}
