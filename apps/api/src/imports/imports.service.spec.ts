import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ImportJobStatus, PurchaseOrderStatus } from '@opstrace/shared-types';
import { ImportsService } from './imports.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('ImportsService', () => {
  let service: ImportsService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const importJobId = '88888888-8888-8888-8888-888888888888';

  const baseJob = {
    id: importJobId,
    organizationId: orgA,
    uploadedBy: userId,
    fileName: 'pos.csv',
    status: ImportJobStatus.PENDING,
    totalRows: 0,
    successfulRows: 0,
    failedRows: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockTx: {
    purchaseOrder: { create: jest.Mock };
    importJob: { update: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  let mockPrisma: {
    importJob: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    supplier: { findMany: jest.Mock };
    warehouse: { findMany: jest.Mock };
    product: { findMany: jest.Mock };
    purchaseOrder: { findMany: jest.Mock };
    auditLog: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      purchaseOrder: {
        create: jest.fn().mockResolvedValue({
          id: 'po-new-1',
          poNumber: 'PO-CSV-001',
          status: PurchaseOrderStatus.DRAFT,
        }),
      },
      importJob: {
        update: jest.fn().mockImplementation(({ data }) => ({
          ...baseJob,
          ...data,
        })),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockPrisma = {
      importJob: {
        create: jest.fn().mockResolvedValue(baseJob),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...baseJob,
          ...data,
        })),
        findFirst: jest.fn().mockResolvedValue(baseJob),
      },
      supplier: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'sup-1', name: 'Metro Supply' }]),
      },
      warehouse: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'wh-1', code: 'WH-CEB-01' }]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'prod-1', sku: 'SKU-1001' },
          { id: 'prod-2', sku: 'SKU-1002' },
        ]),
      },
      purchaseOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) =>
          cb(mockTx),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportsService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ImportsService>(ImportsService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  function runAsTenant<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      {
        userId,
        email: 'manager@org.com',
        organizationId: orgId,
        roles: ['OPS_MANAGER'],
        permissions: ['po:create', 'po:view'],
      },
      fn,
    );
  }

  it('parses valid CSV rows and atomically creates Purchase Orders', async () => {
    const csv = [
      'po_number,supplier_name,warehouse_code,order_date,expected_delivery_date,sku,ordered_quantity,unit_price',
      'PO-CSV-001,Metro Supply,WH-CEB-01,2026-11-25,2026-12-01,SKU-1001,50,120.00',
      'PO-CSV-001,Metro Supply,WH-CEB-01,2026-11-25,2026-12-01,SKU-1002,25,80.50',
    ].join('\n');

    const result = await runAsTenant(orgA, () =>
      service.enqueuePurchaseOrderImport('pos.csv', csv),
    );

    expect(result.status).toBe(ImportJobStatus.COMPLETED);
    expect(result.totalRows).toBe(2);
    expect(result.successfulRows).toBe(2);
    expect(result.failedRows).toBe(0);
    expect(result.errors).toEqual([]);
    expect(mockTx.purchaseOrder.create).toHaveBeenCalledTimes(1);
  });

  it('reports row-level validation errors for invalid quantities and unknown SKUs without creating partial POs', async () => {
    const csv = [
      'po_number,supplier_name,warehouse_code,order_date,expected_delivery_date,sku,ordered_quantity,unit_price',
      'PO-CSV-BAD1,Metro Supply,WH-CEB-01,2026-11-25,,SKU-1001,-5,100.00',
      'PO-CSV-BAD2,Metro Supply,WH-CEB-01,2026-11-25,,UNKNOWN-SKU,10,50.00',
      'PO-CSV-GOOD,Metro Supply,WH-CEB-01,2026-11-25,,SKU-1001,10,50.00',
    ].join('\n');

    const result = await runAsTenant(orgA, () =>
      service.enqueuePurchaseOrderImport('mixed.csv', csv),
    );

    expect(result.status).toBe(ImportJobStatus.COMPLETED);
    expect(result.totalRows).toBe(3);
    expect(result.successfulRows).toBe(1);
    expect(result.failedRows).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors?.[0]?.rowNumber).toBe(2);
    expect(result.errors?.[1]?.rowNumber).toBe(3);
    expect(result.errors?.[1]?.errors[0]).toContain('UNKNOWN-SKU');
    expect(mockTx.purchaseOrder.create).toHaveBeenCalledTimes(1);
  });

  it('enforces cross-tenant isolation in findOne()', async () => {
    mockPrisma.importJob.findFirst.mockResolvedValueOnce(null);

    await expect(
      runAsTenant(orgB, () => service.findOne(importJobId)),
    ).rejects.toThrow(NotFoundException);

    expect(mockPrisma.importJob.findFirst).toHaveBeenCalledWith({
      where: { id: importJobId, organizationId: orgB },
    });
  });
});
