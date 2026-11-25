import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction, PurchaseOrderStatus } from '@opstrace/shared-types';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const supplierId = '44444444-4444-4444-4444-444444444444';
  const warehouseId = '55555555-5555-5555-5555-555555555555';
  const productId = '66666666-6666-6666-6666-666666666666';
  const poId = '77777777-7777-7777-7777-777777777777';

  const mockPo = {
    id: poId,
    organizationId: orgA,
    supplierId,
    warehouseId,
    poNumber: 'PO-2026-001',
    orderDate: new Date('2026-11-25'),
    expectedDeliveryDate: new Date('2026-12-01'),
    status: PurchaseOrderStatus.DRAFT,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    supplier: { id: supplierId, name: 'Metro Supply' },
    warehouse: { id: warehouseId, name: 'Cebu Hub', code: 'WH-CEB-01' },
    items: [
      {
        id: 'item-1',
        purchaseOrderId: poId,
        productId,
        orderedQuantity: 100,
        unitPrice: new Prisma.Decimal('250.50'),
        product: {
          id: productId,
          sku: 'SKU-1001',
          name: 'Pallet Wrap',
          unitOfMeasure: 'ROLL',
          barcode: null,
        },
        goodsReceiptItems: [
          { receivedQuantity: 92, damagedQuantity: 4 },
        ],
      },
    ],
  };

  let mockTx: {
    supplier: { findFirst: jest.Mock };
    warehouse: { findFirst: jest.Mock };
    product: { findMany: jest.Mock };
    purchaseOrder: { create: jest.Mock; update: jest.Mock };
    purchaseOrderItem: { deleteMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  let mockPrisma: {
    purchaseOrder: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: supplierId }) },
      warehouse: { findFirst: jest.fn().mockResolvedValue({ id: warehouseId }) },
      product: { findMany: jest.fn().mockResolvedValue([{ id: productId }]) },
      purchaseOrder: {
        create: jest.fn().mockResolvedValue(mockPo),
        update: jest.fn().mockResolvedValue(mockPo),
      },
      purchaseOrderItem: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };

    mockPrisma = {
      purchaseOrder: {
        findMany: jest.fn().mockResolvedValue([mockPo]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(mockPo),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) =>
          cb(mockTx),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  function runAsTenant<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      {
        userId,
        email: 'manager@org.com',
        organizationId: orgId,
        roles: ['OPS_MANAGER'],
        permissions: ['po:create', 'po:view', 'po:cancel'],
      },
      fn,
    );
  }

  it('creates a Purchase Order with Decimal unitPrice and audit log inside $transaction', async () => {
    const result = await runAsTenant(orgA, () =>
      service.create({
        supplierId,
        warehouseId,
        poNumber: 'PO-2026-001',
        orderDate: new Date('2026-11-25'),
        status: PurchaseOrderStatus.DRAFT,
        items: [{ productId, orderedQuantity: 100, unitPrice: '250.50' }],
      }),
    );

    expect(result.poNumber).toBe('PO-2026-001');
    expect(result.items?.[0]?.unitPrice).toBe('250.50');
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        actorUserId: userId,
        action: AuditAction.CREATE,
        entityType: 'PurchaseOrder',
        entityId: poId,
      }),
    });
  });

  it('throws 409 Conflict when poNumber already exists in the same organization (P2002)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.14.0',
    });
    mockTx.purchaseOrder.create.mockRejectedValueOnce(p2002);

    await expect(
      runAsTenant(orgA, () =>
        service.create({
          supplierId,
          warehouseId,
          poNumber: 'PO-2026-001',
          orderDate: new Date('2026-11-25'),
          status: PurchaseOrderStatus.DRAFT,
          items: [{ productId, orderedQuantity: 10, unitPrice: '100.00' }],
        }),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects cross-tenant foreign-key references (supplierId or productId from another org)', async () => {
    // Simulate Org B trying to use Org A's supplierId
    mockTx.supplier.findFirst.mockResolvedValueOnce(null);

    await expect(
      runAsTenant(orgB, () =>
        service.create({
          supplierId,
          warehouseId,
          poNumber: 'PO-ORG-B-001',
          orderDate: new Date('2026-11-25'),
          status: PurchaseOrderStatus.DRAFT,
          items: [{ productId, orderedQuantity: 10, unitPrice: '50.00' }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    // Simulate valid supplier & warehouse in Org B, but productId belongs to Org A
    mockTx.supplier.findFirst.mockResolvedValueOnce({ id: supplierId });
    mockTx.warehouse.findFirst.mockResolvedValueOnce({ id: warehouseId });
    mockTx.product.findMany.mockResolvedValueOnce([]);

    await expect(
      runAsTenant(orgB, () =>
        service.create({
          supplierId,
          warehouseId,
          poNumber: 'PO-ORG-B-002',
          orderDate: new Date('2026-11-25'),
          status: PurchaseOrderStatus.DRAFT,
          items: [{ productId, orderedQuantity: 10, unitPrice: '50.00' }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('computes PO summary metrics (ordered, received, damaged, accepted, outstanding) in findOne()', async () => {
    const res = await runAsTenant(orgA, () => service.findOne(poId));

    expect(res.summary).toEqual({
      ordered: 100,
      received: 92,
      damaged: 4,
      accepted: 88,
      outstanding: 12,
    });
  });

  it('prevents editing line items once PO is ISSUED', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce({
      ...mockPo,
      status: PurchaseOrderStatus.ISSUED,
    });

    await expect(
      runAsTenant(orgA, () =>
        service.update(poId, {
          items: [{ productId, orderedQuantity: 50, unitPrice: '250.50' }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('transitions DRAFT -> ISSUED and logs state transition in audit_logs', async () => {
    mockTx.purchaseOrder.update.mockResolvedValueOnce({
      ...mockPo,
      status: PurchaseOrderStatus.ISSUED,
    });

    const res = await runAsTenant(orgA, () => service.issue(poId));

    expect(res.status).toBe(PurchaseOrderStatus.ISSUED);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AuditAction.UPDATE,
        entityType: 'PurchaseOrder',
        metadata: {
          previousStatus: PurchaseOrderStatus.DRAFT,
          newStatus: PurchaseOrderStatus.ISSUED,
        },
      }),
    });
  });

  it('prevents cancelling a COMPLETED / FULLY_RECEIVED PO', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce({
      ...mockPo,
      status: PurchaseOrderStatus.COMPLETED,
    });

    await expect(
      runAsTenant(orgA, () => service.cancel(poId)),
    ).rejects.toThrow(BadRequestException);

    mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce({
      ...mockPo,
      status: 'FULLY_RECEIVED',
    });

    await expect(
      runAsTenant(orgA, () => service.cancel(poId)),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when Org B tries to read Org A PO', async () => {
    mockPrisma.purchaseOrder.findFirst.mockResolvedValueOnce(null);

    await expect(
      runAsTenant(orgB, () => service.findOne(poId)),
    ).rejects.toThrow(NotFoundException);
  });
});
