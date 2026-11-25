import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  ExceptionCategory,
  GoodsReceiptStatus,
  PurchaseOrderStatus,
  SyncOperationStatus,
} from '@opstrace/shared-types';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('GoodsReceiptsService', () => {
  let service: GoodsReceiptsService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const userId = '33333333-3333-3333-3333-333333333333';
  const warehouseId = '55555555-5555-5555-5555-555555555555';
  const productId = '66666666-6666-6666-6666-666666666666';
  const poId = '77777777-7777-7777-7777-777777777777';
  const poItemId = '88888888-8888-8888-8888-888888888888';
  const receiptId = '99999999-9999-9999-9999-999999999999';
  const idempotencyKey = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const baseInput = {
    purchaseOrderId: poId,
    warehouseId,
    receiptNumber: 'GR-2026-001',
    receivedAt: new Date('2026-11-25T10:00:00Z'),
    idempotencyKey,
    items: [
      {
        purchaseOrderItemId: poItemId,
        productId,
        receivedQuantity: 100,
        damagedQuantity: 0,
      },
    ],
  };

  const mockPo = {
    id: poId,
    organizationId: orgA,
    warehouseId,
    status: PurchaseOrderStatus.ISSUED,
    items: [{ id: poItemId, productId, orderedQuantity: 100 }],
  };

  const mockCreatedReceipt = {
    id: receiptId,
    organizationId: orgA,
    purchaseOrderId: poId,
    warehouseId,
    receivedBy: userId,
    receiptNumber: 'GR-2026-001',
    status: GoodsReceiptStatus.SUBMITTED,
    receivedAt: baseInput.receivedAt,
    submittedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id: 'gr-item-1',
        goodsReceiptId: receiptId,
        purchaseOrderItemId: poItemId,
        productId,
        receivedQuantity: 100,
        damagedQuantity: 0,
        notes: null,
      },
    ],
  };

  let mockTx: {
    syncOperation: { findUnique: jest.Mock; upsert: jest.Mock };
    purchaseOrder: { findFirst: jest.Mock; update: jest.Mock };
    warehouse: { findFirst: jest.Mock };
    goodsReceipt: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    goodsReceiptItem: { findMany: jest.Mock };
    inventorySnapshot: { findFirst: jest.Mock; create: jest.Mock };
    exception: { create: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  let mockPrisma: {
    goodsReceipt: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      syncOperation: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'sync-1' }),
      },
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue(mockPo),
        update: jest.fn().mockResolvedValue(mockPo),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: warehouseId, organizationId: orgA }),
      },
      goodsReceipt: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(mockCreatedReceipt),
        update: jest.fn().mockResolvedValue({
          ...mockCreatedReceipt,
          status: GoodsReceiptStatus.RECONCILED,
        }),
      },
      goodsReceiptItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            purchaseOrderItemId: poItemId,
            productId,
            receivedQuantity: 100,
            damagedQuantity: 0,
          },
        ]),
      },
      inventorySnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'snap-1', quantity: 100 }),
      },
      exception: {
        create: jest.fn().mockResolvedValue({ id: 'exc-1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockPrisma = {
      goodsReceipt: {
        findMany: jest.fn().mockResolvedValue([mockCreatedReceipt]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(mockCreatedReceipt),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceiptsService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GoodsReceiptsService>(GoodsReceiptsService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  const runAsOrgA = <T>(fn: () => Promise<T>) =>
    tenantContext.run(
      {
        userId,
        organizationId: orgA,
        email: 'receiver@opstrace.local',
        roles: ['WAREHOUSE_EMPLOYEE'],
        permissions: ['receipt:submit', 'receipt:view'],
      },
      fn,
    );

  it('submits exact-match receipt, marks PO COMPLETED, updates inventory, and writes audit log', async () => {
    const result = await runAsOrgA(() => service.submit(baseInput));

    expect(result.status).toBe(GoodsReceiptStatus.RECONCILED);
    expect(result.items?.[0]?.acceptedQuantity).toBe(100);
    expect(mockTx.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: poId },
      data: { status: PurchaseOrderStatus.COMPLETED },
    });
    expect(mockTx.inventorySnapshot.create).toHaveBeenCalledWith({
      data: {
        organizationId: orgA,
        warehouseId,
        productId,
        quantity: 100,
        sourceReference: 'GR-2026-001',
      },
    });
    expect(mockTx.exception.create).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: orgA,
          action: AuditAction.RECONCILE,
          entityType: 'GoodsReceipt',
          entityId: receiptId,
        }),
      }),
    );
    expect(mockTx.syncOperation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          idempotencyKey,
          status: SyncOperationStatus.COMPLETED,
          serverRecordId: receiptId,
        }),
      }),
    );
  });

  it('returns existing receipt without duplicate writes when idempotencyKey was already processed', async () => {
    mockTx.syncOperation.findUnique.mockResolvedValue({
      id: 'sync-1',
      serverRecordId: receiptId,
    });
    mockTx.goodsReceipt.findUnique.mockResolvedValue({
      ...mockCreatedReceipt,
      status: GoodsReceiptStatus.RECONCILED,
    });

    const result = await runAsOrgA(() => service.submit(baseInput));

    expect(result.id).toBe(receiptId);
    expect(mockTx.goodsReceipt.create).not.toHaveBeenCalled();
    expect(mockTx.inventorySnapshot.create).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
  });

  it('excludes damaged goods from inventory snapshot and persists DAMAGED_GOODS exception', async () => {
    const damagedInput = {
      ...baseInput,
      items: [
        {
          purchaseOrderItemId: poItemId,
          productId,
          receivedQuantity: 50,
          damagedQuantity: 10,
          conditionNotes: 'Water damage on 10 cartons',
        },
      ],
    };

    mockTx.goodsReceipt.create.mockResolvedValue({
      ...mockCreatedReceipt,
      items: [
        {
          id: 'gr-item-1',
          goodsReceiptId: receiptId,
          purchaseOrderItemId: poItemId,
          productId,
          receivedQuantity: 50,
          damagedQuantity: 10,
          notes: 'Water damage on 10 cartons',
        },
      ],
    });
    mockTx.goodsReceiptItem.findMany.mockResolvedValue([
      {
        purchaseOrderItemId: poItemId,
        productId,
        receivedQuantity: 50,
        damagedQuantity: 10,
      },
    ]);

    const result = await runAsOrgA(() => service.submit(damagedInput));

    expect(result.items?.[0]?.acceptedQuantity).toBe(40);
    expect(mockTx.inventorySnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quantity: 40, // 50 received - 10 damaged = 40 accepted only
      }),
    });
    expect(mockTx.exception.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        category: ExceptionCategory.DAMAGED_GOODS,
      }),
    });
  });

  it('increments inventory by only the current receipt delta on subsequent partial deliveries', async () => {
    // Existing snapshot already has 40 units from Receipt #1
    mockTx.inventorySnapshot.findFirst.mockResolvedValue({
      id: 'snap-prev',
      quantity: 40,
    });
    // Receipt #2 brings 30 more units (total across PO = 70)
    const secondInput = {
      ...baseInput,
      receiptNumber: 'GR-2026-002',
      items: [
        {
          purchaseOrderItemId: poItemId,
          productId,
          receivedQuantity: 30,
          damagedQuantity: 0,
        },
      ],
    };
    mockTx.goodsReceiptItem.findMany.mockResolvedValue([
      { purchaseOrderItemId: poItemId, productId, receivedQuantity: 40, damagedQuantity: 0 },
      { purchaseOrderItemId: poItemId, productId, receivedQuantity: 30, damagedQuantity: 0 },
    ]);

    await runAsOrgA(() => service.submit(secondInput));

    expect(mockTx.inventorySnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        quantity: 70, // 40 existing + 30 new delta (NOT 40 + 70)
      }),
    });
    expect(mockTx.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: poId },
      data: { status: PurchaseOrderStatus.PARTIALLY_RECEIVED },
    });
  });

  it('rejects cross-tenant PO with NotFoundException', async () => {
    mockTx.purchaseOrder.findFirst.mockResolvedValue(null);

    await expect(runAsOrgA(() => service.submit(baseInput))).rejects.toThrow(
      NotFoundException,
    );
    expect(mockTx.goodsReceipt.create).not.toHaveBeenCalled();
  });

  it('rejects PO in non-receivable status (DRAFT or COMPLETED)', async () => {
    mockTx.purchaseOrder.findFirst.mockResolvedValue({
      ...mockPo,
      status: PurchaseOrderStatus.DRAFT,
    });

    await expect(runAsOrgA(() => service.submit(baseInput))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects purchaseOrderItemId that does not belong to the target PO', async () => {
    const foreignItemInput = {
      ...baseInput,
      items: [
        {
          purchaseOrderItemId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          productId,
          receivedQuantity: 10,
          damagedQuantity: 0,
        },
      ],
    };

    await expect(runAsOrgA(() => service.submit(foreignItemInput))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects duplicate receiptNumber within the same organization with ConflictException', async () => {
    mockTx.goodsReceipt.findUnique.mockResolvedValue({ id: 'existing-gr' });

    await expect(runAsOrgA(() => service.submit(baseInput))).rejects.toThrow(
      ConflictException,
    );
  });

  it('propagates transaction rollback when a downstream write fails', async () => {
    mockTx.auditLog.create.mockRejectedValue(new Error('DB write failure'));

    await expect(runAsOrgA(() => service.submit(baseInput))).rejects.toThrow(
      'DB write failure',
    );
    expect(mockTx.syncOperation.upsert).not.toHaveBeenCalled();
  });

  it('scopes findAll and findOne strictly to organizationId', async () => {
    const list = await runAsOrgA(() =>
      service.findAll({ page: 1, limit: 20, purchaseOrderId: poId }),
    );
    expect(list.data).toHaveLength(1);
    expect(mockPrisma.goodsReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgA, purchaseOrderId: poId }),
      }),
    );

    mockPrisma.goodsReceipt.findFirst.mockResolvedValue(null);
    await expect(runAsOrgA(() => service.findOne(receiptId))).rejects.toThrow(
      NotFoundException,
    );
  });
});
