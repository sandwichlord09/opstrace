import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  PaginatedResponse,
  WarehouseDto,
  WarehouseStatus,
} from '@opstrace/shared-types';
import {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  WarehouseQueryInput,
} from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Creates a new warehouse for the active organization and records an
   * append-only audit log inside the same transaction.
   *
   * @throws ConflictException if the warehouse code already exists in this organization.
   */
  async create(input: CreateWarehouseInput): Promise<WarehouseDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await tx.warehouse.create({
          data: {
            organizationId,
            name: input.name,
            code: input.code,
            address: input.address ?? null,
            status: WarehouseStatus.ACTIVE,
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: userId,
            action: AuditAction.CREATE,
            entityType: 'Warehouse',
            entityId: warehouse.id,
            metadata: {
              name: warehouse.name,
              code: warehouse.code,
            },
          },
        });

        return warehouse;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Warehouse with code "${input.code}" already exists in this organization`,
        );
      }
      throw error;
    }
  }

  /**
   * Returns a paginated, searchable list of warehouses strictly scoped to the
   * active organization.
   */
  async findAll(
    query: WarehouseQueryInput,
  ): Promise<PaginatedResponse<WarehouseDto>> {
    const organizationId = this.tenantContext.getOrganizationId();
    const { page, limit, search, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WarehouseWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.warehouse.count({ where }),
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
   * Finds a single warehouse by ID within the active organization.
   *
   * SECURITY INTENT: Filters by both `id` AND `organizationId` so a user in
   * Org A cannot probe or read a warehouse UUID belonging to Org B.
   */
  async findOne(id: string): Promise<WarehouseDto> {
    const organizationId = this.tenantContext.getOrganizationId();

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, organizationId },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse ${id} not found`);
    }

    return warehouse;
  }

  /**
   * Updates a warehouse within the active organization and writes an audit log
   * atomically inside the same transaction.
   */
  async update(id: string, input: UpdateWarehouseInput): Promise<WarehouseDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    await this.findOne(id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.warehouse.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.code !== undefined ? { code: input.code } : {}),
            ...(input.address !== undefined ? { address: input.address } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: userId,
            action: AuditAction.UPDATE,
            entityType: 'Warehouse',
            entityId: updated.id,
            metadata: input as Prisma.InputJsonValue,
          },
        });

        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Warehouse with code "${input.code}" already exists in this organization`,
        );
      }
      throw error;
    }
  }

  /**
   * Soft-deactivates a warehouse (sets status to INACTIVE) and logs an audit entry
   * inside a single transaction. Historical POs and receipts remain intact.
   */
  async deactivate(id: string): Promise<WarehouseDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const deactivated = await tx.warehouse.update({
        where: { id },
        data: { status: WarehouseStatus.INACTIVE },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.DELETE,
          entityType: 'Warehouse',
          entityId: deactivated.id,
          metadata: {
            deactivated: true,
            status: WarehouseStatus.INACTIVE,
          },
        },
      });

      return deactivated;
    });
  }
}
