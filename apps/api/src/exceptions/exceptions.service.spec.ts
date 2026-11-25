import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  ExceptionCategory,
  ExceptionSeverity,
  ExceptionStatus,
  MembershipStatus,
  PurchaseOrderStatus,
  RelatedRecordType,
  ResolutionType,
} from '@opstrace/shared-types';
import { ExceptionsService } from './exceptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('ExceptionsService', () => {
  let service: ExceptionsService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const userId = '33333333-3333-3333-3333-333333333333';
  const assigneeId = '44444444-4444-4444-4444-444444444444';
  const exceptionId = '55555555-5555-5555-5555-555555555555';
  const grId = '66666666-6666-6666-6666-666666666666';
  const poId = '77777777-7777-7777-7777-777777777777';

  const baseException = {
    id: exceptionId,
    organizationId: orgA,
    exceptionNumber: 'EX-2026-0001',
    category: ExceptionCategory.QUANTITY_MISMATCH,
    severity: ExceptionSeverity.HIGH,
    status: ExceptionStatus.OPEN,
    title: 'Short-Delivery Detected',
    description: '8 units short',
    relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
    relatedRecordId: grId,
    detectedAt: new Date(),
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignments: [],
    comments: [],
    resolution: null,
  };

  let mockTx: {
    exception: { findFirst: jest.Mock; update: jest.Mock; count: jest.Mock };
    membership: { findFirst: jest.Mock };
    exceptionAssignment: { create: jest.Mock };
    exceptionComment: { create: jest.Mock };
    exceptionResolution: { create: jest.Mock };
    goodsReceipt: { findFirst: jest.Mock };
    purchaseOrder: { findFirst: jest.Mock; update: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  let mockPrisma: {
    exception: { findMany: jest.Mock; count: jest.Mock; findFirst: jest.Mock };
    goodsReceipt: { findMany: jest.Mock; findFirst: jest.Mock };
    purchaseOrder: { findMany: jest.Mock; findFirst: jest.Mock };
    stockInspection: { findMany: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      exception: {
        findFirst: jest.fn().mockResolvedValue(baseException),
        update: jest.fn().mockResolvedValue({
          ...baseException,
          status: ExceptionStatus.INVESTIGATING,
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      membership: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mem-1',
          organizationId: orgA,
          userId: assigneeId,
          status: MembershipStatus.ACTIVE,
        }),
      },
      exceptionAssignment: { create: jest.fn().mockResolvedValue({ id: 'assign-1' }) },
      exceptionComment: {
        create: jest.fn().mockResolvedValue({
          id: 'comment-1',
          exceptionId,
          userId,
          content: 'Checking warehouse CCTV',
          createdAt: new Date(),
        }),
      },
      exceptionResolution: {
        create: jest.fn().mockResolvedValue({
          id: 'res-1',
          exceptionId,
          resolvedBy: userId,
          resolutionType: ResolutionType.SUPPLIER_SHORT_SHIPMENT_ACCEPTED,
          resolutionNotes: 'Supplier issued credit memo',
          resolvedAt: new Date(),
        }),
      },
      goodsReceipt: {
        findFirst: jest.fn().mockResolvedValue({ purchaseOrderId: poId }),
      },
      purchaseOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: poId,
          status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
          goodsReceipts: [{ id: grId }],
          items: [
            {
              orderedQuantity: 100,
              goodsReceiptItems: [{ receivedQuantity: 100, damagedQuantity: 0 }],
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: poId, status: PurchaseOrderStatus.COMPLETED }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };

    mockPrisma = {
      exception: {
        findMany: jest.fn().mockResolvedValue([baseException]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(baseException),
      },
      goodsReceipt: {
        findMany: jest.fn().mockResolvedValue([{ id: grId }]),
        findFirst: jest.fn().mockResolvedValue({ id: grId, receiptNumber: 'GR-1' }),
      },
      purchaseOrder: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      stockInspection: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExceptionsService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ExceptionsService>(ExceptionsService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  const runAsOrgA = <T>(fn: () => Promise<T>) =>
    tenantContext.run(
      {
        userId,
        organizationId: orgA,
        email: 'manager@opstrace.local',
        roles: ['OPS_MANAGER'],
        permissions: [
          'exception:view',
          'exception:assign',
          'exception:comment',
          'exception:resolve',
        ],
      },
      fn,
    );

  it('assigns an active org member, transitions OPEN -> INVESTIGATING, and logs audit', async () => {
    const result = await runAsOrgA(() =>
      service.assign(exceptionId, { assignedToUserId: assigneeId }),
    );

    expect(result.status).toBe(ExceptionStatus.INVESTIGATING);
    expect(mockTx.exceptionAssignment.create).toHaveBeenCalledWith({
      data: {
        exceptionId,
        assignedTo: assigneeId,
        assignedBy: userId,
      },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: orgA,
          action: AuditAction.ASSIGN,
          entityType: 'Exception',
          entityId: exceptionId,
        }),
      }),
    );
  });

  it('rejects assigning a user from another organization', async () => {
    mockTx.membership.findFirst.mockResolvedValue(null);

    await expect(
      runAsOrgA(() =>
        service.assign(exceptionId, { assignedToUserId: assigneeId }),
      ),
    ).rejects.toThrow(NotFoundException);
    expect(mockTx.exceptionAssignment.create).not.toHaveBeenCalled();
  });

  it('appends comment and transitions OPEN -> INVESTIGATING', async () => {
    const comment = await runAsOrgA(() =>
      service.addComment(exceptionId, { content: 'Checking warehouse CCTV' }),
    );

    expect(comment.content).toBe('Checking warehouse CCTV');
    expect(mockTx.exception.update).toHaveBeenCalledWith({
      where: { id: exceptionId },
      data: { status: ExceptionStatus.INVESTIGATING },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalled();
  });

  it('resolves an INVESTIGATING exception, creates resolution, completes PO, and logs audit', async () => {
    mockTx.exception.findFirst.mockResolvedValue({
      ...baseException,
      status: ExceptionStatus.INVESTIGATING,
    });
    mockTx.exception.update.mockResolvedValue({
      ...baseException,
      status: ExceptionStatus.RESOLVED,
      resolvedAt: new Date(),
    });

    const result = await runAsOrgA(() =>
      service.resolve(exceptionId, {
        status: ExceptionStatus.RESOLVED,
        resolutionType: ResolutionType.SUPPLIER_SHORT_SHIPMENT_ACCEPTED,
        resolutionNotes: 'Supplier issued credit memo',
      }),
    );

    expect(result.status).toBe(ExceptionStatus.RESOLVED);
    expect(result.resolution?.resolutionType).toBe(
      ResolutionType.SUPPLIER_SHORT_SHIPMENT_ACCEPTED,
    );
    expect(mockTx.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: poId },
      data: { status: PurchaseOrderStatus.COMPLETED },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.RESOLVE,
          entityType: 'Exception',
          entityId: exceptionId,
        }),
      }),
    );
  });

  it('rejects state rollback or re-resolution once RESOLVED or DISMISSED', async () => {
    for (const terminalStatus of [
      ExceptionStatus.RESOLVED,
      ExceptionStatus.DISMISSED,
      ExceptionStatus.CLOSED,
    ]) {
      mockTx.exception.findFirst.mockResolvedValue({
        ...baseException,
        status: terminalStatus,
      });

      await expect(
        runAsOrgA(() =>
          service.resolve(exceptionId, {
            status: ExceptionStatus.RESOLVED,
            resolutionType: ResolutionType.FALSE_ALARM,
            resolutionNotes: 'Attempting illegal state change',
          }),
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        runAsOrgA(() =>
          service.assign(exceptionId, { assignedToUserId: assigneeId }),
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        runAsOrgA(() =>
          service.addComment(exceptionId, { content: 'Late comment' }),
        ),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('filters exceptions by warehouseId and organizationId', async () => {
    const warehouseId = '88888888-8888-8888-8888-888888888888';
    const res = await runAsOrgA(() =>
      service.findAll({ page: 1, limit: 20, warehouseId }),
    );

    expect(res.data).toHaveLength(1);
    expect(mockPrisma.goodsReceipt.findMany).toHaveBeenCalledWith({
      where: { organizationId: orgA, warehouseId },
      select: { id: true },
    });
  });
});
