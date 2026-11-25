import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogDto, PaginatedResponse } from '@opstrace/shared-types';
import { AuditLogQueryInput } from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Read-only paginated query over immutable `audit_logs`.
   *
   * SECURITY & ISOLATION:
   * - Strictly scoped to `organizationId` from TenantContext.
   * - Restricted to roles holding `audit:view` (ORG_ADMIN, OPS_MANAGER, AUDITOR).
   * - Supports filtering by entityType, entityId, actorUserId, action, and date range.
   */
  async findAll(
    query: AuditLogQueryInput,
  ): Promise<PaginatedResponse<AuditLogDto>> {
    const { organizationId } = this.tenantContext.getOrFail();
    const {
      page,
      limit,
      entityType,
      entityId,
      actorUserId,
      action,
      fromDate,
      toDate,
    } = query;
    const skip = (page - 1) * limit;

    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (fromDate) createdAtFilter.gte = fromDate;
    if (toDate) createdAtFilter.lte = toDate;

    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(entityType && { entityType }),
      ...(entityId && { entityId }),
      ...(actorUserId && { actorUserId }),
      ...(action && { action }),
      ...((fromDate || toDate) && { createdAt: createdAtFilter }),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: data.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        actorUserId: row.actorUserId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        createdAt: row.createdAt,
        actor: row.actor,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
