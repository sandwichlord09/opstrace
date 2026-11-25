import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction, ProductStatus } from '@opstrace/shared-types';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('ProductsService', () => {
  let service: ProductsService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const orgB = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const productId = '55555555-5555-5555-5555-555555555555';

  const mockProductOrgA = {
    id: productId,
    organizationId: orgA,
    sku: 'SKU-1001',
    name: 'Industrial Pallet Wrap',
    description: 'Heavy duty shrink film',
    barcode: '4800012345678',
    unitOfMeasure: 'ROLL',
    status: ProductStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockTx: {
    product: { create: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let mockPrisma: {
    product: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      product: {
        create: jest.fn().mockResolvedValue(mockProductOrgA),
        update: jest.fn().mockResolvedValue(mockProductOrgA),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockPrisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([mockProductOrgA]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(mockProductOrgA),
      },
      $transaction: jest.fn().mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) =>
        cb(mockTx),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  function runAsTenant<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      {
        userId,
        email: 'admin@org.com',
        organizationId: orgId,
        roles: ['ORG_ADMIN'],
        permissions: ['products:manage', 'products:view'],
      },
      fn,
    );
  }

  it('creates a product and logs an audit entry in a single transaction', async () => {
    const res = await runAsTenant(orgA, () =>
      service.create({
        sku: 'SKU-1001',
        name: 'Industrial Pallet Wrap',
        unitOfMeasure: 'ROLL',
      }),
    );

    expect(res.sku).toBe('SKU-1001');
    expect(mockTx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        sku: 'SKU-1001',
      }),
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        actorUserId: userId,
        action: AuditAction.CREATE,
        entityType: 'Product',
        entityId: productId,
      }),
    });
  });

  it('throws 409 Conflict when duplicate SKU is created in the same organization (P2002)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.14.0',
    });
    mockTx.product.create.mockRejectedValueOnce(p2002);

    await expect(
      runAsTenant(orgA, () =>
        service.create({
          sku: 'SKU-1001',
          name: 'Duplicate SKU Product',
          unitOfMeasure: 'PIECE',
        }),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('allows the same SKU to be created under a different organization (Org B)', async () => {
    const mockProductOrgB = { ...mockProductOrgA, id: '66666666-6666-6666-6666-666666666666', organizationId: orgB };
    mockTx.product.create.mockResolvedValueOnce(mockProductOrgB);

    const res = await runAsTenant(orgB, () =>
      service.create({
        sku: 'SKU-1001',
        name: 'Industrial Pallet Wrap',
        unitOfMeasure: 'ROLL',
      }),
    );

    expect(res.organizationId).toBe(orgB);
    expect(mockTx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgB,
        sku: 'SKU-1001',
      }),
    });
  });

  it('enforces cross-tenant isolation: Org B cannot read Org A product', async () => {
    mockPrisma.product.findFirst.mockResolvedValueOnce(null);

    await expect(
      runAsTenant(orgB, () => service.findOne(productId)),
    ).rejects.toThrow(NotFoundException);

    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: productId, organizationId: orgB },
    });
  });

  it('soft-deactivates product (DISCONTINUED) and logs audit entry', async () => {
    const discontinued = { ...mockProductOrgA, status: ProductStatus.DISCONTINUED };
    mockTx.product.update.mockResolvedValueOnce(discontinued);

    const res = await runAsTenant(orgA, () => service.deactivate(productId));

    expect(res.status).toBe(ProductStatus.DISCONTINUED);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: orgA,
        action: AuditAction.DELETE,
        entityType: 'Product',
        entityId: productId,
      }),
    });
  });
});
