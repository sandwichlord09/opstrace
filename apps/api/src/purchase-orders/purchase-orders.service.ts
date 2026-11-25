import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  PaginatedResponse,
  PurchaseOrderDto,
  PurchaseOrderStatus,
  PurchaseOrderSummaryMetrics,
} from '@opstrace/shared-types';
import {
  CreatePurchaseOrderInput,
  PurchaseOrderQueryInput,
  UpdatePurchaseOrderInput,
} from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Creates a Purchase Order and its line items atomically inside a single
   * Prisma transaction.
   *
   * SECURITY & INTEGRITY:
   * - Scoped to the active `organizationId` from TenantContext.
   * - Verifies that `supplierId`, `warehouseId`, and all `productId`s belong
   *   to the active organization to prevent cross-tenant foreign-key references.
   * - Catches `P2002` on `(organizationId, poNumber)` to return 409 Conflict.
   */
  async create(input: CreatePurchaseOrderInput): Promise<PurchaseOrderDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertTenantReferencesExist(
          tx,
          organizationId,
          input.supplierId,
          input.warehouseId,
          input.items.map((item) => item.productId),
        );

        const po = await tx.purchaseOrder.create({
          data: {
            organizationId,
            supplierId: input.supplierId,
            warehouseId: input.warehouseId,
            poNumber: input.poNumber,
            orderDate: input.orderDate,
            expectedDeliveryDate: input.expectedDeliveryDate ?? null,
            status: input.status,
            createdBy: userId,
            items: {
              create: input.items.map((item) => ({
                productId: item.productId,
                orderedQuantity: item.orderedQuantity,
                unitPrice: new Prisma.Decimal(item.unitPrice),
              })),
            },
          },
          include: {
            supplier: { select: { id: true, name: true } },
            warehouse: { select: { id: true, name: true, code: true } },
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                    unitOfMeasure: true,
                    barcode: true,
                  },
                },
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: userId,
            action: AuditAction.CREATE,
            entityType: 'PurchaseOrder',
            entityId: po.id,
            metadata: {
              poNumber: po.poNumber,
              status: po.status,
              itemCount: input.items.length,
            },
          },
        });

        return this.mapPurchaseOrderDto(po);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Purchase order "${input.poNumber}" already exists in this organization`,
        );
      }
      throw error;
    }
  }

  /**
   * Returns a paginated list of Purchase Orders scoped to the active tenant,
   * with optional filtering by status, warehouseId, supplierId, and poNumber search.
   */
  async findAll(
    query: PurchaseOrderQueryInput,
  ): Promise<PaginatedResponse<PurchaseOrderDto>> {
    const organizationId = this.tenantContext.getOrganizationId();
    const { page, limit, search, status, warehouseId, supplierId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(search
        ? {
            poNumber: { contains: search, mode: 'insensitive' },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.mapPurchaseOrderDto(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Returns a single Purchase Order with its line items, product details, and
   * computed summary metrics (`ordered`, `received`, `damaged`, `accepted`, `outstanding`).
   */
  async findOne(id: string): Promise<PurchaseOrderDto> {
    const organizationId = this.tenantContext.getOrganizationId();

    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: {
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                unitOfMeasure: true,
                barcode: true,
              },
            },
            goodsReceiptItems: {
              select: {
                receivedQuantity: true,
                damagedQuantity: true,
              },
            },
          },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Purchase order ${id} not found`);
    }

    const summary = this.computeSummaryMetrics(po.items);
    return {
      ...this.mapPurchaseOrderDto(po),
      summary,
    };
  }

  /**
   * Updates a DRAFT Purchase Order. Line items cannot be edited once the PO has
   * been ISSUED or has progressed beyond DRAFT.
   */
  async update(
    id: string,
    input: UpdatePurchaseOrderInput,
  ): Promise<PurchaseOrderDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    const existing = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Purchase order ${id} not found`);
    }

    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot edit purchase order in status "${existing.status}". Only DRAFT orders can be modified.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.items) {
        await this.assertProductsBelongToTenant(
          tx,
          organizationId,
          input.items.map((item) => item.productId),
        );

        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });
      }

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(input.expectedDeliveryDate !== undefined
            ? { expectedDeliveryDate: input.expectedDeliveryDate }
            : {}),
          ...(input.items
            ? {
                items: {
                  create: input.items.map((item) => ({
                    productId: item.productId,
                    orderedQuantity: item.orderedQuantity,
                    unitPrice: new Prisma.Decimal(item.unitPrice),
                  })),
                },
              }
            : {}),
        },
        include: {
          supplier: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  unitOfMeasure: true,
                  barcode: true,
                },
              },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.UPDATE,
          entityType: 'PurchaseOrder',
          entityId: updated.id,
          metadata: {
            updatedExpectedDeliveryDate: input.expectedDeliveryDate !== undefined,
            updatedItemsCount: input.items?.length,
          },
        },
      });

      return this.mapPurchaseOrderDto(updated);
    });
  }

  /**
   * Transitions a Purchase Order from DRAFT to ISSUED and records an audit log.
   */
  async issue(id: string): Promise<PurchaseOrderDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    const existing = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Purchase order ${id} not found`);
    }

    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot issue purchase order in status "${existing.status}". Only DRAFT orders can be issued.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: PurchaseOrderStatus.ISSUED },
        include: {
          supplier: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.UPDATE,
          entityType: 'PurchaseOrder',
          entityId: updated.id,
          metadata: {
            previousStatus: existing.status,
            newStatus: PurchaseOrderStatus.ISSUED,
          },
        },
      });

      return this.mapPurchaseOrderDto(updated);
    });
  }

  /**
   * Cancels a Purchase Order if it has not been received or completed yet.
   * Rejects cancellation for COMPLETED, PARTIALLY_RECEIVED, FULLY_RECEIVED, or
   * already CANCELLED orders.
   */
  async cancel(id: string): Promise<PurchaseOrderDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    const existing = await this.prisma.purchaseOrder.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundException(`Purchase order ${id} not found`);
    }

    const nonCancellableStatuses: string[] = [
      PurchaseOrderStatus.COMPLETED,
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
      PurchaseOrderStatus.CANCELLED,
      'FULLY_RECEIVED',
    ];

    if (nonCancellableStatuses.includes(existing.status)) {
      throw new BadRequestException(
        `Cannot cancel purchase order in status "${existing.status}".`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: PurchaseOrderStatus.CANCELLED },
        include: {
          supplier: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.UPDATE,
          entityType: 'PurchaseOrder',
          entityId: updated.id,
          metadata: {
            previousStatus: existing.status,
            newStatus: PurchaseOrderStatus.CANCELLED,
          },
        },
      });

      return this.mapPurchaseOrderDto(updated);
    });
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private async assertTenantReferencesExist(
    tx: Prisma.TransactionClient,
    organizationId: string,
    supplierId: string,
    warehouseId: string,
    productIds: string[],
  ): Promise<void> {
    const [supplier, warehouse] = await Promise.all([
      tx.supplier.findFirst({
        where: { id: supplierId, organizationId },
        select: { id: true },
      }),
      tx.warehouse.findFirst({
        where: { id: warehouseId, organizationId },
        select: { id: true },
      }),
    ]);

    if (!supplier) {
      throw new BadRequestException(
        `Supplier ${supplierId} does not exist in this organization`,
      );
    }

    if (!warehouse) {
      throw new BadRequestException(
        `Warehouse ${warehouseId} does not exist in this organization`,
      );
    }

    await this.assertProductsBelongToTenant(tx, organizationId, productIds);
  }

  private async assertProductsBelongToTenant(
    tx: Prisma.TransactionClient,
    organizationId: string,
    productIds: string[],
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(productIds));
    if (uniqueIds.length !== productIds.length) {
      throw new BadRequestException(
        'Duplicate productId entries are not allowed within the same purchase order',
      );
    }

    const products = await tx.product.findMany({
      where: { id: { in: uniqueIds }, organizationId },
      select: { id: true },
    });

    if (products.length !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more productIds do not exist in this organization',
      );
    }
  }

  private computeSummaryMetrics(
    items: Array<{
      orderedQuantity: number;
      goodsReceiptItems: Array<{
        receivedQuantity: number;
        damagedQuantity: number;
      }>;
    }>,
  ): PurchaseOrderSummaryMetrics {
    let ordered = 0;
    let received = 0;
    let damaged = 0;

    for (const item of items) {
      ordered += item.orderedQuantity;
      for (const gri of item.goodsReceiptItems) {
        received += gri.receivedQuantity;
        damaged += gri.damagedQuantity;
      }
    }

    const accepted = Math.max(0, received - damaged);
    const outstanding = Math.max(0, ordered - accepted);

    return { ordered, received, damaged, accepted, outstanding };
  }

  private mapPurchaseOrderDto(po: {
    id: string;
    organizationId: string;
    supplierId: string;
    warehouseId: string;
    poNumber: string;
    orderDate: Date;
    expectedDeliveryDate: Date | null;
    status: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    supplier?: { id: string; name: string };
    warehouse?: { id: string; name: string; code: string };
    items?: Array<{
      id: string;
      purchaseOrderId: string;
      productId: string;
      orderedQuantity: number;
      unitPrice: Prisma.Decimal;
      product?: {
        id: string;
        sku: string;
        name: string;
        unitOfMeasure: string;
        barcode: string | null;
      };
    }>;
  }): PurchaseOrderDto {
    return {
      id: po.id,
      organizationId: po.organizationId,
      supplierId: po.supplierId,
      warehouseId: po.warehouseId,
      poNumber: po.poNumber,
      orderDate: po.orderDate,
      expectedDeliveryDate: po.expectedDeliveryDate,
      status: po.status,
      createdBy: po.createdBy,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      ...(po.supplier ? { supplier: po.supplier } : {}),
      ...(po.warehouse ? { warehouse: po.warehouse } : {}),
      ...(po.items
        ? {
            items: po.items.map((item) => ({
              id: item.id,
              purchaseOrderId: item.purchaseOrderId,
              productId: item.productId,
              orderedQuantity: item.orderedQuantity,
              unitPrice: item.unitPrice.toFixed(2),
              ...(item.product ? { product: item.product } : {}),
            })),
          }
        : {}),
    };
  }
}
