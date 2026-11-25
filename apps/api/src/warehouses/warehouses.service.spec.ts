import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction, WarehouseStatus } from '@opstrace/shared-types';
import { WarehousesService } from './warehouses.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('WarehousesService', () => {
  let service: WarehousesService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const warehouseId = '44444444-4444-4444-4444-444444444444';

  const mockWarehouse = {
    id: warehouseId,
    organizationId: orgA,
    name: 'Cebu Central Hub',
    code: 'WH-CEB-01',
    address: 'Mandaue City, Cebu',
    status: WarehouseStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockTx: {
    warehouse: { create: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let mockPrisma: {
    warehouse: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      warehouse: {
        create: jest.fn().mockResolvedValue(mockWarehouse),
        update: jest.fn().mockResolvedValue(mockWarehouse),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockPrisma = {
      warehouse: {
        findMany: jest.fn().mockResolvedValue([mockWarehouse]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(mockWarehouse),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) =>
        cb(mockTx),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehousesService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WarehousesService>(WarehousesService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  function runAsTenant<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      {
        userId,
        email: 'admin@org.com',
        organizationId: orgId,
        roles: ['ORG_ADMIN'],
        permissions: ['warehouses:manage', 'warehouses:view'],
      },
      fn,
    );
  }

  it('creates a warehouse scoped to active org and writes an audit log in the same transaction', async () => {
    const result = await runAsTenant(orgA, () =>
      service.create({
        name: 'Cebu Central Hub',
        code: 'WH-CEB-01',
        address: 'Mandaue City, Cebu',
      }),
    );

    expect(result).toEqual(mockWarehouse);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.warehouse.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        code: 'WH-CEB-01',
        status: WarehouseStatus.ACTIVE,
      }),
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        actorUserId: userId,
        action: AuditAction.CREATE,
        entityType: 'Warehouse',
        entityId: warehouseId,
      }),
    });
  });

  it('throws 409 Conflict when warehouse code collides (P2002)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.14.0',
    });
    mockTx.warehouse.create.mockRejectedValueOnce(p2002);

    await expect(
      runAsTenant(orgA, () =>
        service.create({ name: 'Dup Warehouse', code: 'WH-CEB-01' }),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('lists warehouses with pagination and search scoped to active org', async () => {
    const res = await runAsTenant(orgA, () =>
      service.findAll({ page: 1, limit: 10, search: 'Cebu' }),
    );

    expect(res.data).toHaveLength(1);
    expect(res.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(mockPrisma.warehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: orgA }),
        skip: 0,
        take: 10,
      }),
    );
  });

  it('enforces cross-tenant isolation: Org B cannot read Org A warehouse', async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValueOnce(null);

    await expect(
      runAsTenant(orgB, () => service.findOne(warehouseId)),
    ).rejects.toThrow(NotFoundException);

    expect(mockPrisma.warehouse.findFirst).toHaveBeenCalledWith({
      where: { id: warehouseId, organizationId: orgB },
    });
  });

  it('updates warehouse and writes UPDATE audit log inside transaction', async () => {
    const updated = { ...mockWarehouse, name: 'Cebu North Hub' };
    mockTx.warehouse.update.mockResolvedValueOnce(updated);

    const res = await runAsTenant(orgA, () =>
      service.update(warehouseId, { name: 'Cebu North Hub' }),
    );

    expect(res.name).toBe('Cebu North Hub');
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        action: AuditAction.UPDATE,
        entityType: 'Warehouse',
        entityId: warehouseId,
      }),
    });
  });

  it('soft-deactivates warehouse (INACTIVE) and writes DELETE audit log', async () => {
    const deactivated = { ...mockWarehouse, status: WarehouseStatus.INACTIVE };
    mockTx.warehouse.update.mockResolvedValueOnce(deactivated);

    const res = await runAsTenant(orgA, () => service.deactivate(warehouseId));

    expect(res.status).toBe(WarehouseStatus.INACTIVE);
    expect(mockTx.warehouse.update).toHaveBeenCalledWith({
      where: { id: warehouseId },
      data: { status: WarehouseStatus.INACTIVE },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        action: AuditAction.DELETE,
        entityType: 'Warehouse',
        entityId: warehouseId,
      }),
    });
  });
});
