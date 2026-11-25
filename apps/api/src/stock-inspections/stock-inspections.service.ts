import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ExceptionCategory,
  ExceptionSeverity,
  ExceptionStatus,
  PaginatedResponse,
  RelatedRecordType,
  StockInspectionDto,
  StockInspectionStatus,
  SyncOperationStatus,
  SyncOperationType,
} from '@opstrace/shared-types';
import {
  StockInspectionQueryInput,
  SubmitStockInspectionInput,
} from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

function varianceSeverity(
  recordedQuantity: number,
  variance: number,
): ExceptionSeverity {
  const baseline = Math.max(1, recordedQuantity);
  const pct = Math.abs(variance) / baseline;
  if (pct > 0.2) return ExceptionSeverity.CRITICAL;
  if (pct > 0.1) return ExceptionSeverity.HIGH;
  if (pct > 0.05) return ExceptionSeverity.MEDIUM;
  return ExceptionSeverity.LOW;
}

@Injectable()
export class StockInspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Submit a physical cycle-count stock inspection.
   *
   * BUSINESS LOGIC & INTEGRITY:
   * - Enforces idempotency via `sync_operations` `(organizationId, idempotencyKey)`.
   * - Derives `recordedQuantity` authoritatively from the latest `inventory_snapshots`
   *   row for `(organizationId, warehouseId, productId)` (0 if none exists).
   * - Computes `variance = physicalQuantity - recordedQuantity`.
   * - Automatically creates an `INVENTORY_VARIANCE` exception when `variance !== 0`.
   * - Writes `audit_logs` and `sync_operations` inside a single `prisma.$transaction()`.
   */
  async submit(input: SubmitStockInspectionInput): Promise<StockInspectionDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    return this.prisma.$transaction(async (tx) => {
      // Step 1: Idempotency guard
      const existingSync = await tx.syncOperation.findUnique({
        where: {
          uq_sync_org_idempotency_key: {
            organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      if (existingSync?.serverRecordId) {
        const existing = await tx.stockInspection.findFirst({
          where: { id: existingSync.serverRecordId, organizationId },
        });
        if (existing) {
          return this.mapToDto(existing, null);
        }
      }

      // Step 2: Validate warehouse & product belong to active tenant
      const [warehouse, product] = await Promise.all([
        tx.warehouse.findFirst({
          where: { id: input.warehouseId, organizationId },
          select: { id: true, code: true },
        }),
        tx.product.findFirst({
          where: { id: input.productId, organizationId },
          select: { id: true, sku: true, name: true },
        }),
      ]);

      if (!warehouse) {
        throw new NotFoundException(
          `Warehouse "${input.warehouseId}" not found in your organization.`,
        );
      }
      if (!product) {
        throw new NotFoundException(
          `Product "${input.productId}" not found in your organization.`,
        );
      }

      // Step 3: Fetch latest inventory snapshot as authoritative recordedQuantity
      const latestSnapshot = await tx.inventorySnapshot.findFirst({
        where: {
          organizationId,
          warehouseId: input.warehouseId,
          productId: input.productId,
        },
        orderBy: { recordedAt: 'desc' },
      });

      const recordedQuantity = latestSnapshot?.quantity ?? 0;
      const variance = input.physicalQuantity - recordedQuantity;
      const status =
        variance === 0
          ? StockInspectionStatus.ACCEPTED
          : StockInspectionStatus.DISCREPANCY_FLAGGED;

      // Step 4: Persist stock inspection
      const inspection = await tx.stockInspection.create({
        data: {
          organizationId,
          warehouseId: input.warehouseId,
          productId: input.productId,
          recordedQuantity,
          physicalQuantity: input.physicalQuantity,
          difference: variance,
          performedBy: userId,
          status,
          inspectedAt: input.inspectedAt,
        },
      });

      // Step 5: Automatically raise INVENTORY_VARIANCE exception if variance !== 0
      let exceptionId: string | null = null;
      if (variance !== 0) {
        const exceptionNumber = `EX-${new Date().getFullYear()}-INV-${inspection.id.slice(0, 8)}`;
        const exc = await tx.exception.create({
          data: {
            organizationId,
            exceptionNumber,
            category: ExceptionCategory.INVENTORY_VARIANCE,
            severity: varianceSeverity(recordedQuantity, variance),
            status: ExceptionStatus.OPEN,
            title: `Inventory Variance Detected (${product.sku})`,
            description:
              `Physical cycle count at ${warehouse.code} found ${input.physicalQuantity} units ` +
              `of ${product.sku}, but system recorded ${recordedQuantity} (variance: ${variance}).` +
              (input.notes ? ` Notes: ${input.notes}` : ''),
            relatedRecordType: RelatedRecordType.STOCK_INSPECTION,
            relatedRecordId: inspection.id,
          },
        });
        exceptionId = exc.id;
      }

      // Step 6: Write audit log
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.CREATE,
          entityType: 'StockInspection',
          entityId: inspection.id,
          metadata: {
            warehouseId: input.warehouseId,
            productId: input.productId,
            recordedQuantity,
            physicalQuantity: input.physicalQuantity,
            variance,
            status,
            exceptionId,
          },
        },
      });

      // Step 7: Register idempotency record
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
          operationType: SyncOperationType.STOCK_INSPECTION_SUBMIT,
          status: SyncOperationStatus.COMPLETED,
          serverRecordId: inspection.id,
        },
        update: {
          status: SyncOperationStatus.COMPLETED,
          serverRecordId: inspection.id,
        },
      });

      return this.mapToDto(inspection, exceptionId);
    });
  }

  /**
   * Approve/reconcile a flagged or pending stock inspection and update
   * `inventory_snapshots` to match the verified physical quantity.
   *
   * MULTI-TENANCY: Scoped to `organizationId` from TenantContext.
   */
  async approve(id: string): Promise<StockInspectionDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    return this.prisma.$transaction(async (tx) => {
      const inspection = await tx.stockInspection.findFirst({
        where: { id, organizationId },
      });

      if (!inspection) {
        throw new NotFoundException(`Stock Inspection "${id}" not found.`);
      }

      if (inspection.status === StockInspectionStatus.ACCEPTED) {
        throw new BadRequestException(
          `Stock Inspection "${id}" is already ACCEPTED.`,
        );
      }

      const updated = await tx.stockInspection.update({
        where: { id },
        data: { status: StockInspectionStatus.ACCEPTED },
      });

      await tx.inventorySnapshot.create({
        data: {
          organizationId,
          warehouseId: inspection.warehouseId,
          productId: inspection.productId,
          quantity: inspection.physicalQuantity,
          sourceReference: `INSPECTION-${inspection.id.slice(0, 8)}`,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.RECONCILE,
          entityType: 'StockInspection',
          entityId: id,
          metadata: {
            previousStatus: inspection.status,
            newStatus: StockInspectionStatus.ACCEPTED,
            adjustedQuantity: inspection.physicalQuantity,
            variance: inspection.difference,
          },
        },
      });

      return this.mapToDto(updated, null);
    });
  }

  /**
   * List Stock Inspections for the active organization with pagination & filters.
   */
  async findAll(
    query: StockInspectionQueryInput,
  ): Promise<PaginatedResponse<StockInspectionDto>> {
    const { organizationId } = this.tenantContext.getOrFail();
    const { page, limit, warehouseId, productId, status } = query;
    const skip = (page - 1) * limit;

    const where = {
      organizationId,
      ...(warehouseId && { warehouseId }),
      ...(productId && { productId }),
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.stockInspection.findMany({
        where,
        skip,
        take: limit,
        orderBy: { inspectedAt: 'desc' },
      }),
      this.prisma.stockInspection.count({ where }),
    ]);

    return {
      data: data.map((row) => this.mapToDto(row, null)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private mapToDto(
    row: {
      id: string;
      organizationId: string;
      warehouseId: string;
      productId: string;
      recordedQuantity: number;
      physicalQuantity: number;
      difference: number;
      performedBy: string;
      status: string;
      inspectedAt: Date;
      createdAt: Date;
    },
    exceptionId: string | null,
  ): StockInspectionDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      warehouseId: row.warehouseId,
      productId: row.productId,
      recordedQuantity: row.recordedQuantity,
      physicalQuantity: row.physicalQuantity,
      variance: row.difference,
      performedBy: row.performedBy,
      status: row.status,
      inspectedAt: row.inspectedAt,
      createdAt: row.createdAt,
      ...(exceptionId !== null && { exceptionId }),
    };
  }
}
