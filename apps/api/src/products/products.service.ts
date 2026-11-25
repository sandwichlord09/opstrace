import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  PaginatedResponse,
  ProductDto,
  ProductStatus,
} from '@opstrace/shared-types';
import {
  CreateProductInput,
  ProductQueryInput,
  UpdateProductInput,
} from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Creates a new product for the active organization and records an
   * append-only audit log inside the same transaction.
   *
   * MULTI-TENANT CONSTRAINT:
   * Enforces unique `(organizationId, sku)`. If Prisma throws `P2002` for a
   * duplicate SKU within the same organization, a 409 Conflict is returned.
   * Different organizations may use the same SKU independently.
   */
  async create(input: CreateProductInput): Promise<ProductDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            organizationId,
            sku: input.sku,
            name: input.name,
            description: input.description ?? null,
            barcode: input.barcode ?? null,
            unitOfMeasure: input.unitOfMeasure,
            status: ProductStatus.ACTIVE,
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: userId,
            action: AuditAction.CREATE,
            entityType: 'Product',
            entityId: product.id,
            metadata: {
              sku: product.sku,
              name: product.name,
            },
          },
        });

        return product;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Product with SKU "${input.sku}" already exists in this organization`,
        );
      }
      throw error;
    }
  }

  /**
   * Returns a paginated, searchable list of products strictly scoped to the
   * active organization.
   */
  async findAll(
    query: ProductQueryInput,
  ): Promise<PaginatedResponse<ProductDto>> {
    const organizationId = this.tenantContext.getOrganizationId();
    const { page, limit, search, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { sku: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { barcode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
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
   * Finds a single product by ID within the active organization.
   */
  async findOne(id: string): Promise<ProductDto> {
    const organizationId = this.tenantContext.getOrganizationId();

    const product = await this.prisma.product.findFirst({
      where: { id, organizationId },
    });

    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return product;
  }

  /**
   * Updates a product within the active organization and writes an audit log
   * atomically inside the same transaction.
   *
   * @throws ConflictException if updating SKU collides with another product in the same org.
   */
  async update(id: string, input: UpdateProductInput): Promise<ProductDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    await this.findOne(id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.product.update({
          where: { id },
          data: {
            ...(input.sku !== undefined ? { sku: input.sku } : {}),
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
            ...(input.unitOfMeasure !== undefined
              ? { unitOfMeasure: input.unitOfMeasure }
              : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: userId,
            action: AuditAction.UPDATE,
            entityType: 'Product',
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
          `Product with SKU "${input.sku}" already exists in this organization`,
        );
      }
      throw error;
    }
  }

  /**
   * Soft-deactivates a product (sets status to DISCONTINUED) and logs an audit
   * entry inside a single transaction.
   */
  async deactivate(id: string): Promise<ProductDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const deactivated = await tx.product.update({
        where: { id },
        data: { status: ProductStatus.DISCONTINUED },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.DELETE,
          entityType: 'Product',
          entityId: deactivated.id,
          metadata: {
            deactivated: true,
            status: ProductStatus.DISCONTINUED,
          },
        },
      });

      return deactivated;
    });
  }
}
