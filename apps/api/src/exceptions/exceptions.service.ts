import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  ExceptionDto,
  ExceptionStatus,
  MembershipStatus,
  PaginatedResponse,
  PurchaseOrderStatus,
  RelatedRecordType,
} from '@opstrace/shared-types';
import {
  AddExceptionCommentInput,
  AssignExceptionInput,
  ExceptionQueryInput,
  ResolveExceptionInput,
} from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

/** Terminal exception statuses that cannot be transitioned or rolled back. */
const TERMINAL_EXCEPTION_STATUSES: ReadonlySet<string> = new Set([
  ExceptionStatus.RESOLVED,
  ExceptionStatus.DISMISSED,
  ExceptionStatus.CLOSED,
]);

/** Allowed target statuses when resolving an exception. */
const ALLOWED_RESOLUTION_TARGETS: ReadonlySet<string> = new Set([
  ExceptionStatus.RESOLVED,
  ExceptionStatus.DISMISSED,
]);

@Injectable()
export class ExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * List Exceptions for the active tenant with optional filtering and pagination.
   *
   * MULTI-TENANCY: Scoped strictly to `organizationId` from TenantContext.
   * When `warehouseId` is supplied, resolves matching related record IDs within
   * the same organization before querying exceptions.
   */
  async findAll(
    query: ExceptionQueryInput,
  ): Promise<PaginatedResponse<ExceptionDto>> {
    const { organizationId } = this.tenantContext.getOrFail();
    const {
      page,
      limit,
      search,
      status,
      severity,
      type,
      warehouseId,
      assignedToUserId,
    } = query;
    const skip = (page - 1) * limit;

    let warehouseFilter: Prisma.ExceptionWhereInput = {};
    if (warehouseId) {
      const [grs, pos, inspections] = await Promise.all([
        this.prisma.goodsReceipt.findMany({
          where: { organizationId, warehouseId },
          select: { id: true },
        }),
        this.prisma.purchaseOrder.findMany({
          where: { organizationId, warehouseId },
          select: { id: true },
        }),
        this.prisma.stockInspection.findMany({
          where: { organizationId, warehouseId },
          select: { id: true },
        }),
      ]);

      warehouseFilter = {
        OR: [
          {
            relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
            relatedRecordId: { in: grs.map((g) => g.id) },
          },
          {
            relatedRecordType: RelatedRecordType.PURCHASE_ORDER,
            relatedRecordId: { in: pos.map((p) => p.id) },
          },
          {
            relatedRecordType: RelatedRecordType.STOCK_INSPECTION,
            relatedRecordId: { in: inspections.map((i) => i.id) },
          },
        ],
      };
    }

    const where: Prisma.ExceptionWhereInput = {
      organizationId,
      ...(status && { status }),
      ...(severity && { severity }),
      ...(type && { category: type }),
      ...(assignedToUserId && {
        assignments: { some: { assignedTo: assignedToUserId } },
      }),
      ...(search && {
        OR: [
          { exceptionNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...warehouseFilter,
    };

    const [data, total] = await Promise.all([
      this.prisma.exception.findMany({
        where,
        skip,
        take: limit,
        orderBy: { detectedAt: 'desc' },
        include: {
          assignments: {
            include: {
              assignee: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          resolution: true,
        },
      }),
      this.prisma.exception.count({ where }),
    ]);

    return {
      data: data.map((exc) => this.mapExceptionToDto(exc)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve full exception details including linked PO/Receipt/Inspection,
   * assignments, chronological comments, and resolution record.
   *
   * MULTI-TENANCY: Scoped to `organizationId` from TenantContext.
   */
  async findOne(id: string): Promise<ExceptionDto> {
    const { organizationId } = this.tenantContext.getOrFail();

    const exception = await this.prisma.exception.findFirst({
      where: { id, organizationId },
      include: {
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: {
            assignee: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        resolution: {
          include: {
            resolver: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    if (!exception) {
      throw new NotFoundException(`Exception "${id}" not found.`);
    }

    const relatedRecord = await this.loadRelatedRecord(
      organizationId,
      exception.relatedRecordType,
      exception.relatedRecordId,
    );

    return {
      ...this.mapExceptionToDto(exception),
      relatedRecord,
    };
  }

  /**
   * Assign an investigator within the same organization to an exception.
   *
   * STATE MACHINE:
   * - Rejects terminal exceptions (`RESOLVED`, `DISMISSED`, `CLOSED`).
   * - Transitions `OPEN` -> `INVESTIGATING`.
   * - Validates the target user has an `ACTIVE` membership in the active org.
   * - Writes an `audit_logs` entry inside `prisma.$transaction()`.
   */
  async assign(id: string, input: AssignExceptionInput): Promise<ExceptionDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    return this.prisma.$transaction(async (tx) => {
      const exception = await tx.exception.findFirst({
        where: { id, organizationId },
      });

      if (!exception) {
        throw new NotFoundException(`Exception "${id}" not found.`);
      }

      if (TERMINAL_EXCEPTION_STATUSES.has(exception.status)) {
        throw new BadRequestException(
          `Cannot assign exception in terminal status "${exception.status}".`,
        );
      }

      const targetMembership = await tx.membership.findFirst({
        where: {
          organizationId,
          userId: input.assignedToUserId,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (!targetMembership) {
        throw new NotFoundException(
          `User "${input.assignedToUserId}" is not an active member of your organization.`,
        );
      }

      await tx.exceptionAssignment.create({
        data: {
          exceptionId: id,
          assignedTo: input.assignedToUserId,
          assignedBy: userId,
        },
      });

      const nextStatus =
        exception.status === ExceptionStatus.OPEN ||
        exception.status === ExceptionStatus.ASSIGNED ||
        exception.status === ExceptionStatus.REOPENED
          ? ExceptionStatus.INVESTIGATING
          : exception.status;

      const updated = await tx.exception.update({
        where: { id },
        data: { status: nextStatus },
        include: {
          assignments: {
            orderBy: { assignedAt: 'desc' },
            include: {
              assignee: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          resolution: true,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.ASSIGN,
          entityType: 'Exception',
          entityId: id,
          metadata: {
            assignedToUserId: input.assignedToUserId,
            previousStatus: exception.status,
            newStatus: nextStatus,
          },
        },
      });

      return this.mapExceptionToDto(updated);
    });
  }

  /**
   * Append an investigation comment to an exception.
   *
   * STATE MACHINE:
   * - Rejects comments on terminal exceptions (`RESOLVED`, `DISMISSED`, `CLOSED`).
   * - Transitions `OPEN` / `ASSIGNED` -> `INVESTIGATING` when investigation begins.
   * - Writes an `audit_logs` entry inside `prisma.$transaction()`.
   */
  async addComment(id: string, input: AddExceptionCommentInput) {
    const { organizationId, userId } = this.tenantContext.getOrFail();

    return this.prisma.$transaction(async (tx) => {
      const exception = await tx.exception.findFirst({
        where: { id, organizationId },
      });

      if (!exception) {
        throw new NotFoundException(`Exception "${id}" not found.`);
      }

      if (TERMINAL_EXCEPTION_STATUSES.has(exception.status)) {
        throw new BadRequestException(
          `Cannot add comments to exception in terminal status "${exception.status}".`,
        );
      }

      const comment = await tx.exceptionComment.create({
        data: {
          exceptionId: id,
          userId,
          content: input.content,
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      if (
        exception.status === ExceptionStatus.OPEN ||
        exception.status === ExceptionStatus.ASSIGNED ||
        exception.status === ExceptionStatus.REOPENED
      ) {
        await tx.exception.update({
          where: { id },
          data: { status: ExceptionStatus.INVESTIGATING },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.UPDATE,
          entityType: 'ExceptionComment',
          entityId: comment.id,
          metadata: {
            exceptionId: id,
          },
        },
      });

      return comment;
    });
  }

  /**
   * Formally resolve or dismiss an exception.
   *
   * STATE MACHINE & INTEGRITY:
   * - Enforces `OPEN` / `ASSIGNED` / `INVESTIGATING` -> `RESOLVED` | `DISMISSED`.
   * - Prevents silent rollbacks or re-resolution once `RESOLVED`, `DISMISSED`, or `CLOSED`.
   * - Persists an `exception_resolutions` record and sets `resolvedAt`.
   * - If all blocking exceptions on a linked Purchase Order are resolved and all
   *   ordered quantities have been accepted, updates the PO status to `COMPLETED`.
   * - Writes an `audit_logs` entry inside the same `prisma.$transaction()`.
   */
  async resolve(id: string, input: ResolveExceptionInput): Promise<ExceptionDto> {
    const { organizationId, userId } = this.tenantContext.getOrFail();
    const targetStatus = input.status ?? ExceptionStatus.RESOLVED;

    if (!ALLOWED_RESOLUTION_TARGETS.has(targetStatus)) {
      throw new BadRequestException(
        `Invalid resolution target status "${targetStatus}".`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const exception = await tx.exception.findFirst({
        where: { id, organizationId },
      });

      if (!exception) {
        throw new NotFoundException(`Exception "${id}" not found.`);
      }

      if (TERMINAL_EXCEPTION_STATUSES.has(exception.status)) {
        throw new BadRequestException(
          `Exception "${exception.exceptionNumber}" is already in terminal status "${exception.status}" and cannot be modified or rolled back.`,
        );
      }

      const resolvedAt = new Date();

      const updated = await tx.exception.update({
        where: { id },
        data: {
          status: targetStatus,
          resolvedAt,
        },
        include: {
          assignments: {
            include: {
              assignee: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          comments: {
            orderBy: { createdAt: 'asc' },
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      });

      const resolution = await tx.exceptionResolution.create({
        data: {
          exceptionId: id,
          resolvedBy: userId,
          resolutionType: input.resolutionType,
          resolutionNotes: input.resolutionNotes,
          resolvedAt,
        },
        include: {
          resolver: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      await this.maybeCompleteLinkedPurchaseOrder(
        tx,
        organizationId,
        exception.relatedRecordType,
        exception.relatedRecordId,
      );

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.RESOLVE,
          entityType: 'Exception',
          entityId: id,
          metadata: {
            previousStatus: exception.status,
            newStatus: targetStatus,
            resolutionType: input.resolutionType,
          },
        },
      });

      return this.mapExceptionToDto({ ...updated, resolution });
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async maybeCompleteLinkedPurchaseOrder(
    tx: Prisma.TransactionClient,
    organizationId: string,
    relatedRecordType: string,
    relatedRecordId: string,
  ): Promise<void> {
    let purchaseOrderId: string | null = null;

    if (relatedRecordType === RelatedRecordType.GOODS_RECEIPT) {
      const gr = await tx.goodsReceipt.findFirst({
        where: { id: relatedRecordId, organizationId },
        select: { purchaseOrderId: true },
      });
      purchaseOrderId = gr?.purchaseOrderId ?? null;
    } else if (relatedRecordType === RelatedRecordType.PURCHASE_ORDER) {
      purchaseOrderId = relatedRecordId;
    }

    if (!purchaseOrderId) return;

    const po = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, organizationId },
      include: {
        items: {
          include: {
            goodsReceiptItems: {
              select: { receivedQuantity: true, damagedQuantity: true },
            },
          },
        },
        goodsReceipts: { select: { id: true } },
      },
    });

    if (!po || po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) {
      return;
    }

    const relatedIds = [po.id, ...po.goodsReceipts.map((g) => g.id)];
    const remainingOpen = await tx.exception.count({
      where: {
        organizationId,
        relatedRecordId: { in: relatedIds },
        status: {
          notIn: [
            ExceptionStatus.RESOLVED,
            ExceptionStatus.DISMISSED,
            ExceptionStatus.CLOSED,
          ],
        },
      },
    });

    if (remainingOpen > 0) return;

    const allFulfilled = po.items.every((item) => {
      const accepted = item.goodsReceiptItems.reduce(
        (sum, gri) => sum + (gri.receivedQuantity - gri.damagedQuantity),
        0,
      );
      return accepted >= item.orderedQuantity;
    });

    if (allFulfilled) {
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: PurchaseOrderStatus.COMPLETED },
      });
    }
  }

  private async loadRelatedRecord(
    organizationId: string,
    relatedRecordType: string,
    relatedRecordId: string,
  ): Promise<Record<string, unknown> | null> {
    if (relatedRecordType === RelatedRecordType.GOODS_RECEIPT) {
      return (await this.prisma.goodsReceipt.findFirst({
        where: { id: relatedRecordId, organizationId },
        include: {
          purchaseOrder: { select: { id: true, poNumber: true, status: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
      })) as Record<string, unknown> | null;
    }

    if (relatedRecordType === RelatedRecordType.PURCHASE_ORDER) {
      return (await this.prisma.purchaseOrder.findFirst({
        where: { id: relatedRecordId, organizationId },
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          supplier: { select: { id: true, name: true } },
        },
      })) as Record<string, unknown> | null;
    }

    if (relatedRecordType === RelatedRecordType.STOCK_INSPECTION) {
      return (await this.prisma.stockInspection.findFirst({
        where: { id: relatedRecordId, organizationId },
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, sku: true, name: true } },
        },
      })) as Record<string, unknown> | null;
    }

    return null;
  }

  private mapExceptionToDto(exc: {
    id: string;
    organizationId: string;
    exceptionNumber: string;
    category: string;
    severity: string;
    status: string;
    title: string;
    description: string | null;
    relatedRecordType: string;
    relatedRecordId: string;
    detectedAt: Date;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    assignments?: ExceptionDto['assignments'];
    comments?: ExceptionDto['comments'];
    resolution?: ExceptionDto['resolution'];
  }): ExceptionDto {
    return {
      id: exc.id,
      organizationId: exc.organizationId,
      exceptionNumber: exc.exceptionNumber,
      category: exc.category,
      severity: exc.severity,
      status: exc.status,
      title: exc.title,
      description: exc.description,
      relatedRecordType: exc.relatedRecordType,
      relatedRecordId: exc.relatedRecordId,
      detectedAt: exc.detectedAt,
      resolvedAt: exc.resolvedAt,
      createdAt: exc.createdAt,
      updatedAt: exc.updatedAt,
      assignments: exc.assignments,
      comments: exc.comments,
      resolution: exc.resolution,
    };
  }
}
