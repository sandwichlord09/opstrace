/**
 * OpsTrace Shared Types & Enums
 * Authoritative types shared across API, Web, Mobile, and Worker services.
 */

// ============================================================================
// RBAC & Identity
// ============================================================================

export enum RoleName {
  ORG_ADMIN = 'ORG_ADMIN',
  OPS_MANAGER = 'OPS_MANAGER',
  WAREHOUSE_SUPERVISOR = 'WAREHOUSE_SUPERVISOR',
  WAREHOUSE_EMPLOYEE = 'WAREHOUSE_EMPLOYEE',
  AUDITOR = 'AUDITOR',
}

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  INVITED = 'INVITED',
  SUSPENDED = 'SUSPENDED',
}

// ============================================================================
// Master Data
// ============================================================================

export enum WarehouseStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  DISCONTINUED = 'DISCONTINUED',
}

export enum SupplierStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

// ============================================================================
// Operations: Purchase Orders, Receiving & Inventory
// ============================================================================

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum GoodsReceiptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  RECONCILED = 'RECONCILED',
}

export enum StockInspectionStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  ACCEPTED = 'ACCEPTED',
  DISCREPANCY_FLAGGED = 'DISCREPANCY_FLAGGED',
}

// ============================================================================
// Exceptions & Discrepancy Management
// ============================================================================

export enum ExceptionCategory {
  QUANTITY_MISMATCH = 'QUANTITY_MISMATCH',
  DAMAGED_GOODS = 'DAMAGED_GOODS',
  UNEXPECTED_ITEM = 'UNEXPECTED_ITEM',
  MISSING_EVIDENCE = 'MISSING_EVIDENCE',
  LATE_DELIVERY = 'LATE_DELIVERY',
  INVENTORY_DISCREPANCY = 'INVENTORY_DISCREPANCY',
}

export enum ExceptionSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ExceptionStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED',
}

export enum ResolutionType {
  SUPPLIER_SHORT_SHIPMENT_ACCEPTED = 'SUPPLIER_SHORT_SHIPMENT_ACCEPTED',
  SUPPLIER_REPLACEMENT_REQUESTED = 'SUPPLIER_REPLACEMENT_REQUESTED',
  INVENTORY_ADJUSTED = 'INVENTORY_ADJUSTED',
  COUNT_ERROR_CORRECTED = 'COUNT_ERROR_CORRECTED',
  DAMAGE_WRITTEN_OFF = 'DAMAGE_WRITTEN_OFF',
  FALSE_ALARM = 'FALSE_ALARM',
}

export enum RelatedRecordType {
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  STOCK_INSPECTION = 'STOCK_INSPECTION',
  PRODUCT = 'PRODUCT',
  INVENTORY_SNAPSHOT = 'INVENTORY_SNAPSHOT',
}

// ============================================================================
// Support, Jobs & Offline Sync
// ============================================================================

export enum ImportJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SyncOperationStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SyncOperationType {
  GOODS_RECEIPT_SUBMIT = 'GOODS_RECEIPT_SUBMIT',
  STOCK_INSPECTION_SUBMIT = 'STOCK_INSPECTION_SUBMIT',
  EVIDENCE_ATTACH = 'EVIDENCE_ATTACH',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  RECONCILE = 'RECONCILE',
  RESOLVE = 'RESOLVE',
  ASSIGN = 'ASSIGN',
  SYNC = 'SYNC',
}

// ============================================================================
// Core Shared Interfaces
// ============================================================================

export interface UserContext {
  userId: string;
  organizationId: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface DiscrepancyCalculationResult {
  hasDiscrepancy: boolean;
  category?: ExceptionCategory;
  severity?: ExceptionSeverity;
  expectedQuantity: number;
  actualQuantity: number;
  difference: number;
  discrepancyPercentage: number;
  notes: string;
}

// ============================================================================
// Master Data & Pagination Interfaces
// ============================================================================

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface WarehouseDto {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  address: string | null;
  status: WarehouseStatus | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProductDto {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  description: string | null;
  barcode: string | null;
  unitOfMeasure: string;
  status: ProductStatus | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface SupplierDto {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: SupplierStatus | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}
