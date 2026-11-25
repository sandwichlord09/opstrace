import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AnalyticsDiscrepanciesDto,
  AnalyticsOverviewDto,
  ExceptionSeverity,
  ExceptionStatus,
  PurchaseOrderStatus,
  RelatedRecordType,
} from '@opstrace/shared-types';
import { AnalyticsQueryInput } from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

const TERMINAL_STATUSES = [
  ExceptionStatus.RESOLVED,
  ExceptionStatus.DISMISSED,
  ExceptionStatus.CLOSED,
];

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Compute high-level operational KPIs for the active tenant.
   *
   * MULTI-TENANCY: Every aggregation is strictly filtered by `organizationId`.
   */
  async getOverview(query: AnalyticsQueryInput): Promise<AnalyticsOverviewDto> {
    const { organizationId } = this.tenantContext.getOrFail();
    const { warehouseId, fromDate, toDate } = query;

    const dateFilter: Prisma.DateTimeFilter | undefined =
      fromDate || toDate
        ? {
            ...(fromDate && { gte: fromDate }),
            ...(toDate && { lte: toDate }),
          }
        : undefined;

    const [
      activePurchaseOrders,
      openExceptionGroups,
      receivingAgg,
      totalInspections,
      accurateInspections,
    ] = await Promise.all([
      this.prisma.purchaseOrder.count({
        where: {
          organizationId,
          ...(warehouseId && { warehouseId }),
          status: {
            in: [
              PurchaseOrderStatus.ISSUED,
              PurchaseOrderStatus.PARTIALLY_RECEIVED,
            ],
          },
        },
      }),
      this.prisma.exception.groupBy({
        by: ['severity'],
        where: {
          organizationId,
          status: { notIn: TERMINAL_STATUSES },
          ...(dateFilter && { detectedAt: dateFilter }),
        },
        _count: { _all: true },
      }),
      this.prisma.goodsReceiptItem.aggregate({
        where: {
          goodsReceipt: {
            organizationId,
            ...(warehouseId && { warehouseId }),
            ...(dateFilter && { receivedAt: dateFilter }),
          },
        },
        _sum: {
          receivedQuantity: true,
          damagedQuantity: true,
        },
      }),
      this.prisma.stockInspection.count({
        where: {
          organizationId,
          ...(warehouseId && { warehouseId }),
          ...(dateFilter && { inspectedAt: dateFilter }),
        },
      }),
      this.prisma.stockInspection.count({
        where: {
          organizationId,
          ...(warehouseId && { warehouseId }),
          ...(dateFilter && { inspectedAt: dateFilter }),
          difference: 0,
        },
      }),
    ]);

    const openExceptionsBySeverity = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
      total: 0,
    };

    for (const group of openExceptionGroups) {
      const count = group._count._all;
      if (group.severity === ExceptionSeverity.LOW) {
        openExceptionsBySeverity.LOW = count;
      } else if (group.severity === ExceptionSeverity.MEDIUM) {
        openExceptionsBySeverity.MEDIUM = count;
      } else if (group.severity === ExceptionSeverity.HIGH) {
        openExceptionsBySeverity.HIGH = count;
      } else if (group.severity === ExceptionSeverity.CRITICAL) {
        openExceptionsBySeverity.CRITICAL = count;
      }
      openExceptionsBySeverity.total += count;
    }

    const stockAccuracyRate =
      totalInspections === 0
        ? 100
        : Number(((accurateInspections / totalInspections) * 100).toFixed(2));

    return {
      activePurchaseOrders,
      openExceptionsBySeverity,
      totalReceivedUnits: receivingAgg._sum.receivedQuantity ?? 0,
      totalDamagedUnits: receivingAgg._sum.damagedQuantity ?? 0,
      stockAccuracyRate,
    };
  }

  /**
   * Compute discrepancy breakdowns by supplier, warehouse variance, and
   * open exception aging buckets for the active tenant.
   */
  async getDiscrepancies(
    query: AnalyticsQueryInput,
  ): Promise<AnalyticsDiscrepanciesDto> {
    const { organizationId } = this.tenantContext.getOrFail();
    const { warehouseId, fromDate, toDate } = query;

    const dateFilter: Prisma.DateTimeFilter | undefined =
      fromDate || toDate
        ? {
            ...(fromDate && { gte: fromDate }),
            ...(toDate && { lte: toDate }),
          }
        : undefined;

    const [exceptions, warehouses, inspections] = await Promise.all([
      this.prisma.exception.findMany({
        where: {
          organizationId,
          ...(dateFilter && { detectedAt: dateFilter }),
        },
        select: {
          id: true,
          status: true,
          relatedRecordType: true,
          relatedRecordId: true,
          detectedAt: true,
        },
      }),
      this.prisma.warehouse.findMany({
        where: {
          organizationId,
          ...(warehouseId && { id: warehouseId }),
        },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.stockInspection.findMany({
        where: {
          organizationId,
          ...(warehouseId && { warehouseId }),
          ...(dateFilter && { inspectedAt: dateFilter }),
        },
        select: { warehouseId: true, difference: true },
      }),
    ]);

    // 1. Discrepancy frequency by supplier (via GoodsReceipt -> PurchaseOrder -> Supplier)
    const grIds = exceptions
      .filter((e) => e.relatedRecordType === RelatedRecordType.GOODS_RECEIPT)
      .map((e) => e.relatedRecordId);
    const poIds = exceptions
      .filter((e) => e.relatedRecordType === RelatedRecordType.PURCHASE_ORDER)
      .map((e) => e.relatedRecordId);

    const [grs, pos] = await Promise.all([
      grIds.length > 0
        ? this.prisma.goodsReceipt.findMany({
            where: { organizationId, id: { in: grIds } },
            select: {
              id: true,
              purchaseOrder: {
                select: {
                  supplier: { select: { id: true, name: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      poIds.length > 0
        ? this.prisma.purchaseOrder.findMany({
            where: { organizationId, id: { in: poIds } },
            select: {
              id: true,
              supplier: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const grSupplierMap = new Map(
      grs.map((g) => [g.id, g.purchaseOrder.supplier]),
    );
    const poSupplierMap = new Map(pos.map((p) => [p.id, p.supplier]));

    const supplierCounts = new Map<
      string,
      { supplierId: string; supplierName: string; exceptionCount: number }
    >();

    for (const exc of exceptions) {
      const supplier =
        exc.relatedRecordType === RelatedRecordType.GOODS_RECEIPT
          ? grSupplierMap.get(exc.relatedRecordId)
          : exc.relatedRecordType === RelatedRecordType.PURCHASE_ORDER
            ? poSupplierMap.get(exc.relatedRecordId)
            : undefined;

      if (!supplier) continue;

      const entry = supplierCounts.get(supplier.id) ?? {
        supplierId: supplier.id,
        supplierName: supplier.name,
        exceptionCount: 0,
      };
      entry.exceptionCount += 1;
      supplierCounts.set(supplier.id, entry);
    }

    const bySupplier = Array.from(supplierCounts.values()).sort(
      (a, b) => b.exceptionCount - a.exceptionCount,
    );

    // 2. Warehouse variance breakdown
    const whMap = new Map(
      warehouses.map((w) => [
        w.id,
        {
          warehouseId: w.id,
          warehouseName: w.name,
          warehouseCode: w.code,
          inspectionCount: 0,
          varianceCount: 0,
          totalAbsoluteVariance: 0,
        },
      ]),
    );

    for (const insp of inspections) {
      const entry = whMap.get(insp.warehouseId);
      if (!entry) continue;
      entry.inspectionCount += 1;
      if (insp.difference !== 0) {
        entry.varianceCount += 1;
        entry.totalAbsoluteVariance += Math.abs(insp.difference);
      }
    }

    const byWarehouse = Array.from(whMap.values());

    // 3. Open exception aging buckets
    const nowMs = Date.now();
    const hourMs = 60 * 60 * 1000;
    const exceptionAgingBuckets = {
      under24h: 0,
      days1To3: 0,
      days3To7: 0,
      over7d: 0,
    };

    for (const exc of exceptions) {
      if (TERMINAL_STATUSES.includes(exc.status as ExceptionStatus)) continue;
      const ageHours = (nowMs - new Date(exc.detectedAt).getTime()) / hourMs;
      if (ageHours < 24) {
        exceptionAgingBuckets.under24h += 1;
      } else if (ageHours < 72) {
        exceptionAgingBuckets.days1To3 += 1;
      } else if (ageHours < 168) {
        exceptionAgingBuckets.days3To7 += 1;
      } else {
        exceptionAgingBuckets.over7d += 1;
      }
    }

    return {
      bySupplier,
      byWarehouse,
      exceptionAgingBuckets,
    };
  }
}
