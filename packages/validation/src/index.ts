import { z } from 'zod';
import {
  ProductStatus,
  ResolutionType,
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

export const GoodsReceiptItemInputSchema = z.object({
  purchaseOrderItemId: z.string().uuid(),
  productId: z.string().uuid(),
  receivedQuantity: z.number().int().nonnegative('Received quantity must be non-negative'),
  damagedQuantity: z.number().int().nonnegative('Damaged quantity must be non-negative').default(0),
  notes: z.string().max(1000).optional(),
});

export const SubmitGoodsReceiptSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  receiptNumber: z.string().min(1, 'Receipt number is required'),
  receivedAt: z.coerce.date().default(() => new Date()),
  items: z.array(GoodsReceiptItemInputSchema).min(1, 'At least one item must be received'),
  idempotencyKey: z.string().uuid('Idempotency key must be a valid UUID'),
});

export type SubmitGoodsReceiptInput = z.infer<typeof SubmitGoodsReceiptSchema>;

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
  assignedToUserId: z.string().uuid(),
});

export type AssignExceptionInput = z.infer<typeof AssignExceptionSchema>;

export const ResolveExceptionSchema = z.object({
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
