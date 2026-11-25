import { Test, TestingModule } from '@nestjs/testing';
import {
  ExceptionSeverity,
  ExceptionStatus,
  RelatedRecordType,
} from '@opstrace/shared-types';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const userId = '33333333-3333-3333-3333-333333333333';
  const warehouseId = '55555555-5555-5555-5555-555555555555';

  let mockPrisma: {
    purchaseOrder: { count: jest.Mock; findMany: jest.Mock };
    exception: { groupBy: jest.Mock; findMany: jest.Mock };
    goodsReceiptItem: { aggregate: jest.Mock };
    goodsReceipt: { findMany: jest.Mock };
    stockInspection: { count: jest.Mock; findMany: jest.Mock };
    warehouse: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      purchaseOrder: {
        count: jest.fn().mockResolvedValue(4),
        findMany: jest.fn().mockResolvedValue([]),
      },
      exception: {
        groupBy: jest.fn().mockResolvedValue([
          { severity: ExceptionSeverity.HIGH, _count: { _all: 2 } },
          { severity: ExceptionSeverity.CRITICAL, _count: { _all: 1 } },
        ]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'exc-1',
            status: ExceptionStatus.OPEN,
            relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
            relatedRecordId: 'gr-1',
            detectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
          },
          {
            id: 'exc-2',
            status: ExceptionStatus.INVESTIGATING,
            relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
            relatedRecordId: 'gr-1',
            detectedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10d ago
          },
          {
            id: 'exc-3',
            status: ExceptionStatus.RESOLVED,
            relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
            relatedRecordId: 'gr-1',
            detectedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // resolved, excluded from aging
          },
        ]),
      },
      goodsReceiptItem: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { receivedQuantity: 500, damagedQuantity: 15 },
        }),
      },
      goodsReceipt: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'gr-1',
            purchaseOrder: {
              supplier: { id: 'sup-1', name: 'Metro Supply Co.' },
            },
          },
        ]),
      },
      stockInspection: {
        count: jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(8),
        findMany: jest.fn().mockResolvedValue([
          { warehouseId, difference: 0 },
          { warehouseId, difference: -5 },
        ]),
      },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([
          { id: warehouseId, name: 'Cebu Hub', code: 'WH-CEB-01' },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  const runAsOrgA = <T>(fn: () => Promise<T>) =>
    tenantContext.run(
      {
        userId,
        organizationId: orgA,
        email: 'manager@opstrace.local',
        roles: ['OPS_MANAGER'],
        permissions: ['reports:view'],
      },
      fn,
    );

  it('returns tenant-scoped KPI overview including stock accuracy rate', async () => {
    const overview = await runAsOrgA(() => service.getOverview({ warehouseId }));

    expect(overview).toEqual({
      activePurchaseOrders: 4,
      openExceptionsBySeverity: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 2,
        CRITICAL: 1,
        total: 3,
      },
      totalReceivedUnits: 500,
      totalDamagedUnits: 15,
      stockAccuracyRate: 80,
    });
    expect(mockPrisma.purchaseOrder.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgA, warehouseId }),
      }),
    );
  });

  it('aggregates supplier discrepancies, warehouse variances, and aging buckets', async () => {
    const discrepancies = await runAsOrgA(() => service.getDiscrepancies({}));

    expect(discrepancies.bySupplier).toEqual([
      {
        supplierId: 'sup-1',
        supplierName: 'Metro Supply Co.',
        exceptionCount: 3,
      },
    ]);
    expect(discrepancies.byWarehouse).toEqual([
      {
        warehouseId,
        warehouseName: 'Cebu Hub',
        warehouseCode: 'WH-CEB-01',
        inspectionCount: 2,
        varianceCount: 1,
        totalAbsoluteVariance: 5,
      },
    ]);
    expect(discrepancies.exceptionAgingBuckets).toEqual({
      under24h: 1,
      days1To3: 0,
      days3To7: 0,
      over7d: 1,
    });
  });
});
