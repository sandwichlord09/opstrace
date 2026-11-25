import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuditAction, SupplierStatus } from '@opstrace/shared-types';
import { SuppliersService } from './suppliers.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('SuppliersService', () => {
  let service: SuppliersService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const supplierId = '77777777-7777-7777-7777-777777777777';

  const mockSupplier = {
    id: supplierId,
    organizationId: orgA,
    name: 'Metro Logistics Supply Co.',
    email: 'orders@metrologistics.ph',
    phone: '+63 32 555 0199',
    address: 'Cebu Port Area',
    status: SupplierStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockTx: {
    supplier: { create: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let mockPrisma: {
    supplier: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      supplier: {
        create: jest.fn().mockResolvedValue(mockSupplier),
        update: jest.fn().mockResolvedValue(mockSupplier),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockPrisma = {
      supplier: {
        findMany: jest.fn().mockResolvedValue([mockSupplier]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(mockSupplier),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) =>
        cb(mockTx),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  function runAsTenant<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      {
        userId,
        email: 'admin@org.com',
        organizationId: orgId,
        roles: ['ORG_ADMIN'],
        permissions: ['suppliers:manage', 'suppliers:view'],
      },
      fn,
    );
  }

  it('creates a supplier scoped to active org and logs audit entry in transaction', async () => {
    const res = await runAsTenant(orgA, () =>
      service.create({
        name: 'Metro Logistics Supply Co.',
        email: 'orders@metrologistics.ph',
      }),
    );

    expect(res.name).toBe('Metro Logistics Supply Co.');
    expect(mockTx.supplier.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        status: SupplierStatus.ACTIVE,
      }),
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        actorUserId: userId,
        action: AuditAction.CREATE,
        entityType: 'Supplier',
        entityId: supplierId,
      }),
    });
  });

  it('enforces cross-tenant isolation: Org B cannot read or update Org A supplier', async () => {
    mockPrisma.supplier.findFirst.mockResolvedValueOnce(null);

    await expect(
      runAsTenant(orgB, () => service.findOne(supplierId)),
    ).rejects.toThrow(NotFoundException);

    mockPrisma.supplier.findFirst.mockResolvedValueOnce(null);
    await expect(
      runAsTenant(orgB, () => service.update(supplierId, { name: 'Hijacked' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('soft-deactivates supplier (INACTIVE) and writes DELETE audit log', async () => {
    const deactivated = { ...mockSupplier, status: SupplierStatus.INACTIVE };
    mockTx.supplier.update.mockResolvedValueOnce(deactivated);

    const res = await runAsTenant(orgA, () => service.deactivate(supplierId));

    expect(res.status).toBe(SupplierStatus.INACTIVE);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        action: AuditAction.DELETE,
        entityType: 'Supplier',
        entityId: supplierId,
      }),
    });
  });
});
