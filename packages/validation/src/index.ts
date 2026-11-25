import { z } from 'zod';
import { ResolutionType } from '@opstrace/shared-types';

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
