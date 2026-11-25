import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  ImportJobDto,
  ImportJobRowError,
  ImportJobStatus,
  PurchaseOrderStatus,
} from '@opstrace/shared-types';
import {
  CsvPurchaseOrderRowInput,
  CsvPurchaseOrderRowSchema,
} from '@opstrace/validation';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../prisma/tenant-context';

export const PO_IMPORTS_QUEUE = 'po-imports';

export interface PoImportJobPayload {
  importJobId: string;
  organizationId: string;
  userId: string;
  csvContent: string;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    @Optional()
    @InjectQueue(PO_IMPORTS_QUEUE)
    private readonly importQueue?: Queue<PoImportJobPayload>,
  ) {}

  /**
   * Creates an ImportJob record for the active tenant and either dispatches it
   * to the BullMQ Redis queue or executes synchronously in fallback/test mode.
   */
  async enqueuePurchaseOrderImport(
    fileName: string,
    csvContent: string,
  ): Promise<ImportJobDto> {
    if (!csvContent || !csvContent.trim()) {
      throw new BadRequestException('Uploaded CSV file is empty');
    }

    const { organizationId, userId } = this.tenantContext.getOrFail();

    const job = await this.prisma.importJob.create({
      data: {
        organizationId,
        uploadedBy: userId,
        fileName,
        status: ImportJobStatus.PENDING,
        totalRows: 0,
        successfulRows: 0,
        failedRows: 0,
      },
    });

    const useQueue =
      Boolean(this.importQueue) && process.env.IMPORT_SYNC_MODE !== 'true';

    if (useQueue && this.importQueue) {
      await this.importQueue.add('process-po-csv', {
        importJobId: job.id,
        organizationId,
        userId,
        csvContent,
      });

      this.logger.log(`Enqueued PO import job ${job.id} to BullMQ`);
      return job;
    }

    return this.processPurchaseOrderCsv(
      job.id,
      organizationId,
      userId,
      csvContent,
    );
  }

  /**
   * Parses CSV rows, validates schemas and tenant-scoped master data
   * (suppliers, warehouses, SKUs), records row-level errors, and atomically
   * creates valid Purchase Orders.
   */
  async processPurchaseOrderCsv(
    importJobId: string,
    organizationId: string,
    userId: string,
    csvContent: string,
  ): Promise<ImportJobDto> {
    await this.prisma.importJob.update({
      where: { id: importJobId },
      data: { status: ImportJobStatus.PROCESSING },
    });

    let rawRecords: Record<string, string>[];
    try {
      rawRecords = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, string>[];
    } catch {
      const parseError: ImportJobRowError = {
        rowNumber: 1,
        errors: ['Malformed CSV file: unable to parse headers or rows'],
      };
      return this.finalizeImportJob(
        importJobId,
        organizationId,
        userId,
        ImportJobStatus.FAILED,
        0,
        0,
        1,
        [parseError],
      );
    }

    const totalRows = rawRecords.length;
    const rowErrors: ImportJobRowError[] = [];

    type ParsedRow = {
      rowNumber: number;
      data: CsvPurchaseOrderRowInput;
    };

    const validSchemaRows: ParsedRow[] = [];

    // 1. Validate each row against CsvPurchaseOrderRowSchema
    rawRecords.forEach((raw, index) => {
      const rowNumber = index + 2; // +2 accounts for 1-based index + header row
      const normalized = {
        poNumber: raw.po_number ?? raw.poNumber ?? '',
        supplierName: raw.supplier_name ?? raw.supplierName ?? '',
        warehouseCode: raw.warehouse_code ?? raw.warehouseCode ?? '',
        orderDate: raw.order_date ?? raw.orderDate ?? '',
        expectedDeliveryDate:
          raw.expected_delivery_date ?? raw.expectedDeliveryDate,
        sku: raw.sku ?? '',
        orderedQuantity: raw.ordered_quantity ?? raw.orderedQuantity ?? '',
        unitPrice: raw.unit_price ?? raw.unitPrice ?? '',
      };

      const parsed = CsvPurchaseOrderRowSchema.safeParse(normalized);
      if (!parsed.success) {
        const messages = Object.entries(parsed.error.flatten().fieldErrors)
          .map(([field, errs]) => `${field}: ${(errs ?? []).join(', ')}`);
        rowErrors.push({
          rowNumber,
          poNumber: normalized.poNumber || undefined,
          sku: normalized.sku || undefined,
          errors: messages.length > 0 ? messages : ['Invalid row format'],
        });
      } else {
        validSchemaRows.push({ rowNumber, data: parsed.data });
      }
    });

    // 2. Resolve master data references strictly scoped to organizationId
    const supplierNames = Array.from(
      new Set(validSchemaRows.map((r) => r.data.supplierName)),
    );
    const warehouseCodes = Array.from(
      new Set(validSchemaRows.map((r) => r.data.warehouseCode)),
    );
    const skus = Array.from(new Set(validSchemaRows.map((r) => r.data.sku)));
    const poNumbers = Array.from(
      new Set(validSchemaRows.map((r) => r.data.poNumber)),
    );

    const [suppliers, warehouses, products, existingPos] = await Promise.all([
      supplierNames.length > 0
        ? this.prisma.supplier.findMany({
            where: { organizationId, name: { in: supplierNames } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      warehouseCodes.length > 0
        ? this.prisma.warehouse.findMany({
            where: { organizationId, code: { in: warehouseCodes } },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
      skus.length > 0
        ? this.prisma.product.findMany({
            where: { organizationId, sku: { in: skus } },
            select: { id: true, sku: true },
          })
        : Promise.resolve([]),
      poNumbers.length > 0
        ? this.prisma.purchaseOrder.findMany({
            where: { organizationId, poNumber: { in: poNumbers } },
            select: { poNumber: true },
          })
        : Promise.resolve([]),
    ]);

    const supplierMap = new Map(suppliers.map((s) => [s.name, s.id]));
    const warehouseMap = new Map(warehouses.map((w) => [w.code, w.id]));
    const productMap = new Map(products.map((p) => [p.sku, p.id]));
    const existingPoSet = new Set(existingPos.map((po) => po.poNumber));

    // 3. Group rows by poNumber and validate relational integrity per PO group
    const poGroups = new Map<string, ParsedRow[]>();
    for (const row of validSchemaRows) {
      const list = poGroups.get(row.data.poNumber) ?? [];
      list.push(row);
      poGroups.set(row.data.poNumber, list);
    }

    let successfulRows = 0;

    for (const [poNumber, rows] of poGroups.entries()) {
      const groupErrors: ImportJobRowError[] = [];
      const seenProductIds = new Set<string>();

      const firstRow = rows[0]!;
      const supplierId = supplierMap.get(firstRow.data.supplierName);
      const warehouseId = warehouseMap.get(firstRow.data.warehouseCode);

      if (existingPoSet.has(poNumber)) {
        for (const r of rows) {
          groupErrors.push({
            rowNumber: r.rowNumber,
            poNumber,
            sku: r.data.sku,
            errors: [`Purchase order "${poNumber}" already exists`],
          });
        }
      } else {
        for (const r of rows) {
          const errs: string[] = [];
          const rowSupplierId = supplierMap.get(r.data.supplierName);
          const rowWarehouseId = warehouseMap.get(r.data.warehouseCode);
          const productId = productMap.get(r.data.sku);

          if (!rowSupplierId) {
            errs.push(
              `Supplier "${r.data.supplierName}" not found in organization`,
            );
          } else if (rowSupplierId !== supplierId) {
            errs.push(`Inconsistent supplier across rows for PO "${poNumber}"`);
          }

          if (!rowWarehouseId) {
            errs.push(
              `Warehouse "${r.data.warehouseCode}" not found in organization`,
            );
          } else if (rowWarehouseId !== warehouseId) {
            errs.push(`Inconsistent warehouse across rows for PO "${poNumber}"`);
          }

          if (!productId) {
            errs.push(`Product SKU "${r.data.sku}" not found in organization`);
          } else if (seenProductIds.has(productId)) {
            errs.push(
              `Duplicate SKU "${r.data.sku}" within PO "${poNumber}"`,
            );
          } else {
            seenProductIds.add(productId);
          }

          if (errs.length > 0) {
            groupErrors.push({
              rowNumber: r.rowNumber,
              poNumber,
              sku: r.data.sku,
              errors: errs,
            });
          }
        }
      }

      if (groupErrors.length > 0 || !supplierId || !warehouseId) {
        rowErrors.push(...groupErrors);
        continue;
      }

      // 4. Create valid PO + items + audit log atomically
      await this.prisma.$transaction(async (tx) => {
        const po = await tx.purchaseOrder.create({
          data: {
            organizationId,
            supplierId,
            warehouseId,
            poNumber,
            orderDate: firstRow.data.orderDate,
            expectedDeliveryDate: firstRow.data.expectedDeliveryDate ?? null,
            status: PurchaseOrderStatus.DRAFT,
            createdBy: userId,
            items: {
              create: rows.map((r) => ({
                productId: productMap.get(r.data.sku)!,
                orderedQuantity: r.data.orderedQuantity,
                unitPrice: new Prisma.Decimal(r.data.unitPrice),
              })),
            },
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            actorUserId: userId,
            action: AuditAction.CREATE,
            entityType: 'PurchaseOrder',
            entityId: po.id,
            metadata: {
              source: 'CSV_IMPORT',
              importJobId,
              poNumber: po.poNumber,
              itemCount: rows.length,
            },
          },
        });
      });

      successfulRows += rows.length;
    }

    const failedRows = totalRows - successfulRows;
    const finalStatus =
      successfulRows === 0 && failedRows > 0
        ? ImportJobStatus.FAILED
        : ImportJobStatus.COMPLETED;

    return this.finalizeImportJob(
      importJobId,
      organizationId,
      userId,
      finalStatus,
      totalRows,
      successfulRows,
      failedRows,
      rowErrors,
    );
  }

  /**
   * Returns a single ImportJob with its persisted row-level errors,
   * strictly scoped to the active organization.
   */
  async findOne(id: string): Promise<ImportJobDto> {
    const organizationId = this.tenantContext.getOrganizationId();

    const job = await this.prisma.importJob.findFirst({
      where: { id, organizationId },
    });

    if (!job) {
      throw new NotFoundException(`Import job ${id} not found`);
    }

    const auditEntry = await this.prisma.auditLog.findFirst({
      where: {
        organizationId,
        entityType: 'ImportJob',
        entityId: job.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    const metadata = auditEntry?.metadata as
      | { errors?: ImportJobRowError[] }
      | null
      | undefined;

    return {
      ...job,
      errors: metadata?.errors ?? [],
    };
  }

  private async finalizeImportJob(
    importJobId: string,
    organizationId: string,
    userId: string,
    status: ImportJobStatus,
    totalRows: number,
    successfulRows: number,
    failedRows: number,
    errors: ImportJobRowError[],
  ): Promise<ImportJobDto> {
    const updatedJob = await this.prisma.$transaction(async (tx) => {
      const job = await tx.importJob.update({
        where: { id: importJobId },
        data: {
          status,
          totalRows,
          successfulRows,
          failedRows,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: userId,
          action: AuditAction.UPDATE,
          entityType: 'ImportJob',
          entityId: job.id,
          metadata: {
            status,
            totalRows,
            successfulRows,
            failedRows,
            errors: errors as unknown as Prisma.InputJsonValue,
          },
        },
      });

      return job;
    });

    return {
      ...updatedJob,
      errors,
    };
  }
}
