import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  ExceptionCategory,
  ExceptionSeverity,
  StockInspectionStatus,
  SyncOperationStatus,
} from '@opstrace/shared-types';
import { StockInspectionsService } from './stock-inspections.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('StockInspectionsService', () => {
  let service: StockInspectionsService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const userId = '33333333-3333-3333-3333-333333333333';
  const warehouseId = '55555555-5555-5555-5555-555555555555';
  const productId = '66666666-6666-6666-6666-666666666666';
  const inspectionId = '77777777-7777-7777-7777-777777777777';
  const idempotencyKey = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  let mockTx: {
    syncOperation: { findUnique: jest.Mock; upsert: jest.Mock };
    warehouse: { findFirst: jest.Mock };
    product: { findFirst: jest.Mock };
    inventorySnapshot: { findFirst: jest.Mock; create: jest.Mock };
    stockInspection: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    exception: { create: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  let mockPrisma: {
    stockInspection: { findMany: jest.Mock; count: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      syncOperation: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: 'sync-1' }),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: warehouseId, code: 'WH-CEB-01' }),
      },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: productId, sku: 'SKU-1001', name: 'Widget' }),
      },
      inventorySnapshot: {
        findFirst: jest.fn().mockResolvedValue({ id: 'snap-1', quantity: 50 }),
        create: jest.fn().mockResolvedValue({ id: 'snap-2', quantity: 43 }),
      },
      stockInspection: {
        findFirst: jest.fn().mockResolvedValue({
          id: inspectionId,
          organizationId: orgA,
          warehouseId,
          productId,
          recordedQuantity: 50,
          physicalQuantity: 43,
          difference: -7,
          performedBy: userId,
          status: StockInspectionStatus.DISCREPANCY_FLAGGED,
          inspectedAt: new Date(),
          createdAt: new Date(),
        }),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: inspectionId,
          ...data,
          createdAt: new Date(),
        })),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: inspectionId,
          organizationId: orgA,
          warehouseId,
          productId,
          recordedQuantity: 50,
          physicalQuantity: 43,
          difference: -7,
          performedBy: userId,
          status: data.status,
          inspectedAt: new Date(),
          createdAt: new Date(),
        })),
      },
      exception: {
        create: jest.fn().mockResolvedValue({ id: 'exc-inv-1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockPrisma = {
      stockInspection: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockInspectionsService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StockInspectionsService>(StockInspectionsService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  const runAsOrgA = <T>(fn: () => Promise<T>) =>
    tenantContext.run(
      {
        userId,
        organizationId: orgA,
        email: 'inspector@opstrace.local',
        roles: ['WAREHOUSE_SUPERVISOR'],
        permissions: ['inspection:perform', 'inspection:review', 'inspection:view'],
      },
      fn,
    );

  it('computes variance = physical - recorded and triggers INVENTORY_VARIANCE exception when variance !== 0', async () => {
    const result = await runAsOrgA(() =>
      service.submit({
        warehouseId,
        productId,
        physicalQuantity: 43, // recorded is 50 -> variance = -7 (14% -> HIGH)
        inspectedAt: new Date(),
        notes: 'Missing 7 cartons in Aisle B',
        idempotencyKey,
      }),
    );

    expect(result.recordedQuantity).toBe(50);
    expect(result.physicalQuantity).toBe(43);
    expect(result.variance).toBe(-7);
    expect(result.status).toBe(StockInspectionStatus.DISCREPANCY_FLAGGED);
    expect(result.exceptionId).toBe('exc-inv-1');

    expect(mockTx.exception.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        category: ExceptionCategory.INVENTORY_VARIANCE,
        severity: ExceptionSeverity.HIGH,
      }),
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.CREATE,
          entityType: 'StockInspection',
        }),
      }),
    );
    expect(mockTx.syncOperation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: SyncOperationStatus.COMPLETED,
          serverRecordId: inspectionId,
        }),
      }),
    );
  });

  it('marks inspection ACCEPTED with no exception when variance === 0', async () => {
    const result = await runAsOrgA(() =>
      service.submit({
        warehouseId,
        productId,
        physicalQuantity: 50,
        inspectedAt: new Date(),
        idempotencyKey,
      }),
    );

    expect(result.variance).toBe(0);
    expect(result.status).toBe(StockInspectionStatus.ACCEPTED);
    expect(mockTx.exception.create).not.toHaveBeenCalled();
  });

  it('updates inventory_snapshots and writes audit log when approving a flagged inspection', async () => {
    const result = await runAsOrgA(() => service.approve(inspectionId));

    expect(result.status).toBe(StockInspectionStatus.ACCEPTED);
    expect(mockTx.inventorySnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        warehouseId,
        productId,
        quantity: 43,
      }),
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.RECONCILE,
          entityType: 'StockInspection',
          entityId: inspectionId,
        }),
      }),
    );
  });

  it('rejects approving an already ACCEPTED inspection', async () => {
    mockTx.stockInspection.findFirst.mockResolvedValue({
      id: inspectionId,
      status: StockInspectionStatus.ACCEPTED,
    });

    await expect(runAsOrgA(() => service.approve(inspectionId))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects cross-tenant warehouse with NotFoundException', async () => {
    mockTx.warehouse.findFirst.mockResolvedValue(null);

    await expect(
      runAsOrgA(() =>
        service.submit({
          warehouseId,
          productId,
          physicalQuantity: 50,
          inspectedAt: new Date(),
          idempotencyKey,
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
