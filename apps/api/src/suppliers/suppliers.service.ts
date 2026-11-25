import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  PaginatedResponse,
  SupplierDto,
  SupplierStatus,
} from '@opstrace/shared-types';
import {
  CreateSupplierInput,
  SupplierQueryInput,
  UpdateSupplierInput,
} from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Creates a new supplier for the active organization and records an
   * append-only audit log inside the same transaction.
   */
  async create(input: CreateSupplierInput): Promise<SupplierDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          organizationId,
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          status: SupplierStatus.ACTIVE,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.CREATE,
          entityType: 'Supplier',
          entityId: supplier.id,
          metadata: {
            name: supplier.name,
            email: supplier.email,
          },
        },
      });

      return supplier;
    });
  }

  /**
   * Returns a paginated, searchable list of suppliers strictly scoped to the
   * active organization.
   */
  async findAll(
    query: SupplierQueryInput,
  ): Promise<PaginatedResponse<SupplierDto>> {
    const organizationId = this.tenantContext.getOrganizationId();
    const { page, limit, search, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Finds a single supplier by ID within the active organization.
   */
  async findOne(id: string): Promise<SupplierDto> {
    const organizationId = this.tenantContext.getOrganizationId();

    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier ${id} not found`);
    }

    return supplier;
  }

  /**
   * Updates a supplier within the active organization and writes an audit log
   * atomically inside the same transaction.
   */
  async update(id: string, input: UpdateSupplierInput): Promise<SupplierDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.UPDATE,
          entityType: 'Supplier',
          entityId: updated.id,
          metadata: input as Prisma.InputJsonValue,
        },
      });

      return updated;
    });
  }

  /**
   * Soft-deactivates a supplier (sets status to INACTIVE) and logs an audit
   * entry inside a single transaction.
   */
  async deactivate(id: string): Promise<SupplierDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const deactivated = await tx.supplier.update({
        where: { id },
        data: { status: SupplierStatus.INACTIVE },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.DELETE,
          entityType: 'Supplier',
          entityId: deactivated.id,
          metadata: {
            deactivated: true,
            status: SupplierStatus.INACTIVE,
          },
        },
      });

      return deactivated;
    });
  }
}
