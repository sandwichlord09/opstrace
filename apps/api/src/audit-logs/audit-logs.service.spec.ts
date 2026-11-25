import { Test, TestingModule } from '@nestjs/testing';
import { AuditAction } from '@opstrace/shared-types';
import { AuditLogsService } from './audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let tenantContext: TenantContext;

  const orgA = '11111111-1111-1111-1111-111111111111';
  const userId = '33333333-3333-3333-3333-333333333333';
  const entityId = '44444444-4444-4444-4444-444444444444';

  let mockPrisma: {
    auditLog: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-1',
            organizationId: orgA,
            actorUserId: userId,
            action: AuditAction.RESOLVE,
            entityType: 'Exception',
            entityId,
            metadata: { newStatus: 'RESOLVED' },
            createdAt: new Date('2026-11-25T10:00:00Z'),
            actor: {
              id: userId,
              firstName: 'Alex',
              lastName: 'Reyes',
              email: 'alex@opstrace.local',
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogsService,
        TenantContext,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditLogsService>(AuditLogsService);
    tenantContext = module.get<TenantContext>(TenantContext);
  });

  it('scopes audit log queries strictly to organizationId and applies filters', async () => {
    const fromDate = new Date('2026-11-01T00:00:00Z');
    const toDate = new Date('2026-11-30T23:59:59Z');

    const result = await tenantContext.run(
      {
        userId,
        organizationId: orgA,
        email: 'auditor@opstrace.local',
        roles: ['AUDITOR'],
        permissions: ['audit:view'],
      },
      () =>
        service.findAll({
          page: 1,
          limit: 20,
          entityType: 'Exception',
          entityId,
          actorUserId: userId,
          action: AuditAction.RESOLVE,
          fromDate,
          toDate,
        }),
    );

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: orgA,
          entityType: 'Exception',
          entityId,
          actorUserId: userId,
          action: AuditAction.RESOLVE,
          createdAt: { gte: fromDate, lte: toDate },
        },
      }),
    );
  });
});
