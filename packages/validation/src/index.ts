import { z } from 'zod';
import {
  AuditAction,
  ExceptionCategory,
  ExceptionSeverity,
  ExceptionStatus,
  ProductStatus,
  PurchaseOrderStatus,
  ResolutionType,
  StockInspectionStatus,
  SupplierStatus,
  WarehouseStatus,
} from '@opstrace/shared-types';

// ============================================================================
// Auth & Identity Validation Schemas
// ============================================================================

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
});

export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;

// ============================================================================
// Operations & Receiving Schemas
// ============================================================================

// ============================================================================
// Stock Inspection Schemas
// ============================================================================

export const SubmitStockInspectionSchema = z.object({
  warehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  physicalQuantity: z.number().int().nonnegative('Physical quantity cannot be negative'),
  inspectedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.string().uuid('Idempotency key must be a valid UUID'),
});

export type SubmitStockInspectionInput = z.infer<typeof SubmitStockInspectionSchema>;

// ============================================================================
// Exceptions & Resolution Schemas
// ============================================================================

export const AssignExceptionSchema = z.object({
  assignedToUserId: z.string().uuid('assignedToUserId must be a valid UUID'),
});

export type AssignExceptionInput = z.infer<typeof AssignExceptionSchema>;

export const AddExceptionCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Comment content is required')
    .max(2000, 'Comment cannot exceed 2000 characters'),
});

export type AddExceptionCommentInput = z.infer<typeof AddExceptionCommentSchema>;

export const ResolveExceptionSchema = z.object({
  status: z
    .enum([ExceptionStatus.RESOLVED, ExceptionStatus.DISMISSED])
    .default(ExceptionStatus.RESOLVED),
  resolutionType: z.nativeEnum(ResolutionType),
  resolutionNotes: z.string().min(5, 'Resolution notes must be at least 5 characters').max(2000),
});

export type ResolveExceptionInput = z.infer<typeof ResolveExceptionSchema>;

// ============================================================================
// Shared Pagination & Master Data Query Schemas
// ============================================================================

export const BasePaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const ExceptionQuerySchema = BasePaginationQuerySchema.extend({
  status: z.nativeEnum(ExceptionStatus).optional(),
  severity: z.nativeEnum(ExceptionSeverity).optional(),
  type: z.nativeEnum(ExceptionCategory).optional(),
  warehouseId: z.string().uuid().optional(),
  assignedToUserId: z.string().uuid().optional(),
});

export type ExceptionQueryInput = z.infer<typeof ExceptionQuerySchema>;

export const StockInspectionQuerySchema = BasePaginationQuerySchema.extend({
  warehouseId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  status: z.nativeEnum(StockInspectionStatus).optional(),
});

export type StockInspectionQueryInput = z.infer<typeof StockInspectionQuerySchema>;

export const AuditLogQuerySchema = BasePaginationQuerySchema.extend({
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction).optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export type AuditLogQueryInput = z.infer<typeof AuditLogQuerySchema>;

// ============================================================================
// Operations & Receiving Schemas
// ============================================================================

export const GoodsReceiptItemInputSchema = z
  .object({
    purchaseOrderItemId: z.string().uuid('purchaseOrderItemId must be a valid UUID'),
    productId: z.string().uuid('productId must be a valid UUID'),
    receivedQuantity: z.number().int().nonnegative('Received quantity must be non-negative'),
    damagedQuantity: z
      .number()
      .int()
      .nonnegative('Damaged quantity must be non-negative')
      .default(0),
    conditionNotes: z.string().max(1000).optional(),
  })
  .refine((data) => data.damagedQuantity <= data.receivedQuantity, {
    message: 'damagedQuantity cannot exceed receivedQuantity',
    path: ['damagedQuantity'],
  });

export const SubmitGoodsReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid('purchaseOrderId must be a valid UUID'),
  warehouseId: z.string().uuid('warehouseId must be a valid UUID'),
  receiptNumber: z.string().min(1, 'Receipt number is required').max(100),
  receivedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(2000).optional(),
  items: z.array(GoodsReceiptItemInputSchema).min(1, 'At least one item must be received'),
  idempotencyKey: z.string().uuid('Idempotency key must be a valid UUID'),
});

export type SubmitGoodsReceiptInput = z.infer<typeof SubmitGoodsReceiptSchema>;

export const GoodsReceiptQuerySchema = BasePaginationQuerySchema.extend({
  purchaseOrderId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  status: z.enum(['IN_PROGRESS', 'SUBMITTED', 'RECONCILED']).optional(),
});

export type GoodsReceiptQueryInput = z.infer<typeof GoodsReceiptQuerySchema>;

// ============================================================================
// Warehouse Schemas
// ============================================================================

export const CreateWarehouseSchema = z.object({
  name: z.string().trim().min(1, 'Warehouse name is required').max(255),
  code: z
    .string()
    .trim()
    .min(1, 'Warehouse code is required')
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code must contain only letters, numbers, hyphens, or underscores'),
  address: z.string().trim().max(500).optional(),
});

export type CreateWarehouseInput = z.infer<typeof CreateWarehouseSchema>;

export const UpdateWarehouseSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code must contain only letters, numbers, hyphens, or underscores')
    .optional(),
  address: z.string().trim().max(500).nullable().optional(),
  status: z.nativeEnum(WarehouseStatus).optional(),
});

export type UpdateWarehouseInput = z.infer<typeof UpdateWarehouseSchema>;

export const WarehouseQuerySchema = BasePaginationQuerySchema.extend({
  status: z.nativeEnum(WarehouseStatus).optional(),
});

export type WarehouseQueryInput = z.infer<typeof WarehouseQuerySchema>;

// ============================================================================
// Product Schemas
// ============================================================================

export const CreateProductSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(100),
  name: z.string().trim().min(1, 'Product name is required').max(255),
  description: z.string().trim().max(2000).optional(),
  barcode: z.string().trim().max(100).optional(),
  unitOfMeasure: z.string().trim().min(1).max(50).default('PIECE'),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = z.object({
  sku: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  barcode: z.string().trim().max(100).nullable().optional(),
  unitOfMeasure: z.string().trim().min(1).max(50).optional(),
  status: z.nativeEnum(ProductStatus).optional(),
});

export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const ProductQuerySchema = BasePaginationQuerySchema.extend({
  status: z.nativeEnum(ProductStatus).optional(),
});

export type ProductQueryInput = z.infer<typeof ProductQuerySchema>;

// ============================================================================
// Supplier Schemas
// ============================================================================

export const CreateSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(255),
  email: z.string().trim().email('Invalid supplier email').max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
});

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;

export const UpdateSupplierSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email('Invalid supplier email').max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  status: z.nativeEnum(SupplierStatus).optional(),
});

export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;

export const SupplierQuerySchema = BasePaginationQuerySchema.extend({
  status: z.nativeEnum(SupplierStatus).optional(),
});

export type SupplierQueryInput = z.infer<typeof SupplierQuerySchema>;

// ============================================================================
// Purchase Order Schemas
// ============================================================================

export const PurchaseOrderItemInputSchema = z.object({
  productId: z.string().uuid('Product ID must be a valid UUID'),
  orderedQuantity: z
    .number()
    .int('Ordered quantity must be a whole integer')
    .positive('Ordered quantity must be greater than 0'),
  unitPrice: z
    .union([
      z.number().nonnegative('Unit price cannot be negative'),
      z
        .string()
        .trim()
        .regex(
          /^\d+(\.\d{1,2})?$/,
          'Unit price must be a non-negative decimal with up to 2 decimal places',
        ),
    ])
    .transform((val) => Number(val).toFixed(2)),
});

export type PurchaseOrderItemInput = z.infer<typeof PurchaseOrderItemInputSchema>;

export const CreatePurchaseOrderSchema = z.object({
  supplierId: z.string().uuid('Supplier ID must be a valid UUID'),
  warehouseId: z.string().uuid('Warehouse ID must be a valid UUID'),
  poNumber: z.string().trim().min(1, 'PO number is required').max(100),
  orderDate: z.coerce.date(),
  expectedDeliveryDate: z.coerce.date().optional(),
  status: z
    .enum([PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.ISSUED])
    .default(PurchaseOrderStatus.DRAFT),
  items: z
    .array(PurchaseOrderItemInputSchema)
    .min(1, 'Purchase order must contain at least one line item'),
});

export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>;

export const UpdatePurchaseOrderSchema = z.object({
  expectedDeliveryDate: z.coerce.date().nullable().optional(),
  items: z
    .array(PurchaseOrderItemInputSchema)
    .min(1, 'Purchase order must contain at least one line item')
    .optional(),
});

export type UpdatePurchaseOrderInput = z.infer<typeof UpdatePurchaseOrderSchema>;

export const PurchaseOrderQuerySchema = BasePaginationQuerySchema.extend({
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
  warehouseId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
});

export type PurchaseOrderQueryInput = z.infer<typeof PurchaseOrderQuerySchema>;

// ============================================================================
// CSV Bulk Import Row Schemas
// ============================================================================

export const CsvPurchaseOrderRowSchema = z.object({
  poNumber: z.string().trim().min(1, 'po_number is required').max(100),
  supplierName: z.string().trim().min(1, 'supplier_name is required').max(255),
  warehouseCode: z.string().trim().min(1, 'warehouse_code is required').max(50),
  orderDate: z.coerce.date(),
  expectedDeliveryDate: z.preprocess(
    (val) => (val === '' || val === null || val === undefined ? undefined : val),
    z.coerce.date().optional(),
  ),
  sku: z.string().trim().min(1, 'sku is required').max(100),
  orderedQuantity: z.coerce
    .number()
    .int('ordered_quantity must be an integer')
    .positive('ordered_quantity must be greater than 0'),
  unitPrice: z
    .union([
      z.coerce.number().nonnegative('unit_price cannot be negative'),
      z
        .string()
        .trim()
        .regex(/^\d+(\.\d{1,2})?$/, 'unit_price must be a non-negative decimal'),
    ])
    .transform((val) => Number(val).toFixed(2)),
});

export type CsvPurchaseOrderRowInput = z.infer<typeof CsvPurchaseOrderRowSchema>;
