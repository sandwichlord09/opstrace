import { Injectable } from '@nestjs/common';
import {
  GoodsReceiptDto,
  StockInspectionDto,
  SyncBatchItemResultDto,
  SyncBatchItemStatus,
  SyncBatchResponseDto,
  SyncOperationStatus,
} from '@opstrace/shared-types';
import {
  BatchSyncInspectionsInput,
  BatchSyncReceivingInput,
} from '@opstrace/validation';
import { GoodsReceiptsService } from '../goods-receipts/goods-receipts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { StockInspectionsService } from '../stock-inspections/stock-inspections.service';

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly goodsReceiptsService: GoodsReceiptsService,
    private readonly stockInspectionsService: StockInspectionsService,
  ) {}

  /**
   * Process an ordered batch of offline Goods Receipts queued on mobile.
   *
   * RESILIENCE & IDEMPOTENCY:
   * - Each item carries a client-generated `idempotencyKey`.
   * - Already-completed keys return `DUPLICATE_SKIPPED` with the original record.
   * - One invalid or conflicting draft returns `FAILED` with its error message
   *   without aborting subsequent valid items in the queue.
   */
  async syncReceiving(
    input: BatchSyncReceivingInput,
  ): Promise<SyncBatchResponseDto<GoodsReceiptDto>> {
    const { organizationId } = this.tenantContext.getOrFail();

    const results: SyncBatchItemResultDto<GoodsReceiptDto>[] = [];
    let synced = 0;
    let duplicatesSkipped = 0;
    let failed = 0;

    for (const item of input.items) {
      try {
        const existingSync = await this.prisma.syncOperation.findUnique({
          where: {
            uq_sync_org_idempotency_key: {
              organizationId,
              idempotencyKey: item.idempotencyKey,
            },
          },
        });

        if (
          existingSync?.status === SyncOperationStatus.COMPLETED &&
          existingSync.serverRecordId
        ) {
          const existingRecord = await this.goodsReceiptsService.findOne(
            existingSync.serverRecordId,
          );
          duplicatesSkipped++;
          results.push({
            idempotencyKey: item.idempotencyKey,
            status: SyncBatchItemStatus.DUPLICATE_SKIPPED,
            record: existingRecord,
          });
          continue;
        }

        const record = await this.goodsReceiptsService.submit(item);
        synced++;
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: SyncBatchItemStatus.SYNCED,
          record,
        });
      } catch (err) {
        failed++;
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: SyncBatchItemStatus.FAILED,
          error: err instanceof Error ? err.message : 'Sync failed',
        });
      }
    }

    return {
      total: input.items.length,
      synced,
      duplicatesSkipped,
      failed,
      results,
    };
  }

  /**
   * Process an ordered batch of offline Stock Inspections queued on mobile.
   *
   * Same per-item idempotent isolation as `syncReceiving`.
   */
  async syncInspections(
    input: BatchSyncInspectionsInput,
  ): Promise<SyncBatchResponseDto<StockInspectionDto>> {
    const { organizationId } = this.tenantContext.getOrFail();

    const results: SyncBatchItemResultDto<StockInspectionDto>[] = [];
    let synced = 0;
    let duplicatesSkipped = 0;
    let failed = 0;

    for (const item of input.items) {
      try {
        const existingSync = await this.prisma.syncOperation.findUnique({
          where: {
            uq_sync_org_idempotency_key: {
              organizationId,
              idempotencyKey: item.idempotencyKey,
            },
          },
        });

        if (
          existingSync?.status === SyncOperationStatus.COMPLETED &&
          existingSync.serverRecordId
        ) {
          const existingRow = await this.prisma.stockInspection.findFirst({
            where: { id: existingSync.serverRecordId, organizationId },
          });
          if (existingRow) {
            duplicatesSkipped++;
            results.push({
              idempotencyKey: item.idempotencyKey,
              status: SyncBatchItemStatus.DUPLICATE_SKIPPED,
              record: {
                id: existingRow.id,
                organizationId: existingRow.organizationId,
                warehouseId: existingRow.warehouseId,
                productId: existingRow.productId,
                recordedQuantity: existingRow.recordedQuantity,
                physicalQuantity: existingRow.physicalQuantity,
                variance: existingRow.difference,
                performedBy: existingRow.performedBy,
                status: existingRow.status,
                inspectedAt: existingRow.inspectedAt,
                createdAt: existingRow.createdAt,
              },
            });
            continue;
          }
        }

        const record = await this.stockInspectionsService.submit(item);
        synced++;
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: SyncBatchItemStatus.SYNCED,
          record,
        });
      } catch (err) {
        failed++;
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: SyncBatchItemStatus.FAILED,
          error: err instanceof Error ? err.message : 'Sync failed',
        });
      }
    }

    return {
      total: input.items.length,
      synced,
      duplicatesSkipped,
      failed,
      results,
    };
  }
}
