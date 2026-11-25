import { Test, TestingModule } from '@nestjs/testing';
import {
  SyncBatchItemStatus,
  SyncOperationStatus,
} from '@opstrace/shared-types';
import { SyncService } from './sync.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { GoodsReceiptsService } from '../goods-receipts/goods-receipts.service';
import { StockInspectionsService } from '../stock-inspections/stock-inspections.service';

describe('SyncService', () => {
  let service: SyncService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const userId = '33333333-3333-3333-3333-333333333333';
  const poId = '77777777-7777-7777-7777-777777777777';
  const poItemId = '88888888-8888-8888-8888-888888888888';
  const warehouseId = '55555555-5555-5555-5555-555555555555';
  const productId = '66666666-6666-6666-6666-666666666666';

  let mockPrisma: {
    syncOperation: { findUnique: jest.Mock };
    stockInspection: { findFirst: jest.Mock };
  };
  let mockGoodsReceiptsService: {
    submit: jest.Mock;
    findOne: jest.Mock;
  };
  let mockStockInspectionsService: {
    submit: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      syncOperation: { findUnique: jest.fn().mockResolvedValue(null) },
      stockInspection: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockGoodsReceiptsService = {
      submit: jest.fn().mockResolvedValue({ id: 'gr-new' }),
      findOne: jest.fn().mockResolvedValue({ id: 'gr-existing' }),
    };

    mockStockInspectionsService = {
      submit: jest.fn().mockResolvedValue({ id: 'insp-new' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GoodsReceiptsService, useValue: mockGoodsReceiptsService },
        {
          provide: StockInspectionsService,
          useValue: mockStockInspectionsService,
        },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  const runAsOrgA = <T>(fn: () => Promise<T>) =>
    tenantContext.run(
      {
        userId,
        organizationId: orgA,
        email: 'mobile@opstrace.local',
        roles: ['WAREHOUSE_EMPLOYEE'],
        permissions: ['receipt:submit', 'inspection:perform'],
      },
      fn,
    );

  const makeReceipt = (key: string, receiptNumber: string) => ({
    purchaseOrderId: poId,
    warehouseId,
    receiptNumber,
    receivedAt: new Date(),
    idempotencyKey: key,
    items: [
      {
        purchaseOrderItemId: poItemId,
        productId,
        receivedQuantity: 10,
        damagedQuantity: 0,
      },
    ],
  });

  it('reports SYNCED, DUPLICATE_SKIPPED, and FAILED per item without aborting the batch', async () => {
    const keyDup = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const keyFail = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const keyOk = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    mockPrisma.syncOperation.findUnique
      .mockResolvedValueOnce({
        status: SyncOperationStatus.COMPLETED,
        serverRecordId: 'gr-existing',
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockGoodsReceiptsService.submit
      .mockRejectedValueOnce(new Error('PO is already COMPLETED'))
      .mockResolvedValueOnce({ id: 'gr-new' });

    const res = await runAsOrgA(() =>
      service.syncReceiving({
        items: [
          makeReceipt(keyDup, 'GR-1'),
          makeReceipt(keyFail, 'GR-2'),
          makeReceipt(keyOk, 'GR-3'),
        ],
      }),
    );

    expect(res.total).toBe(3);
    expect(res.duplicatesSkipped).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.synced).toBe(1);
    expect(res.results[0]).toMatchObject({
      idempotencyKey: keyDup,
      status: SyncBatchItemStatus.DUPLICATE_SKIPPED,
    });
    expect(res.results[1]).toMatchObject({
      idempotencyKey: keyFail,
      status: SyncBatchItemStatus.FAILED,
      error: 'PO is already COMPLETED',
    });
    expect(res.results[2]).toMatchObject({
      idempotencyKey: keyOk,
      status: SyncBatchItemStatus.SYNCED,
    });
  });

  it('processes batch inspections with idempotency and partial-failure isolation', async () => {
    const keyDup = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const keyOk = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    mockPrisma.syncOperation.findUnique
      .mockResolvedValueOnce({
        status: SyncOperationStatus.COMPLETED,
        serverRecordId: 'insp-existing',
      })
      .mockResolvedValueOnce(null);

    mockPrisma.stockInspection.findFirst.mockResolvedValueOnce({
      id: 'insp-existing',
      organizationId: orgA,
      warehouseId,
      productId,
      recordedQuantity: 10,
      physicalQuantity: 10,
      difference: 0,
      performedBy: userId,
      status: 'ACCEPTED',
      inspectedAt: new Date(),
      createdAt: new Date(),
    });

    const res = await runAsOrgA(() =>
      service.syncInspections({
        items: [
          {
            warehouseId,
            productId,
            physicalQuantity: 10,
            inspectedAt: new Date(),
            idempotencyKey: keyDup,
          },
          {
            warehouseId,
            productId,
            physicalQuantity: 12,
            inspectedAt: new Date(),
            idempotencyKey: keyOk,
          },
        ],
      }),
    );

    expect(res.duplicatesSkipped).toBe(1);
    expect(res.synced).toBe(1);
    expect(res.failed).toBe(0);
  });
});
