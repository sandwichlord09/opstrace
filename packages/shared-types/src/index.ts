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
  INVENTORY_VARIANCE = 'INVENTORY_VARIANCE',
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
  INVESTIGATING = 'INVESTIGATING',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
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
  EXCEPTION = 'EXCEPTION',
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

// ============================================================================
// Purchase Orders & CSV Imports Interfaces
// ============================================================================

export interface PurchaseOrderSummaryMetrics {
  ordered: number;
  received: number;
  damaged: number;
  accepted: number;
  outstanding: number;
}

export interface PurchaseOrderItemDto {
  id: string;
  purchaseOrderId: string;
  productId: string;
  orderedQuantity: number;
  unitPrice: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    unitOfMeasure: string;
    barcode: string | null;
  };
}

export interface PurchaseOrderDto {
  id: string;
  organizationId: string;
  supplierId: string;
  warehouseId: string;
  poNumber: string;
  orderDate: Date | string;
  expectedDeliveryDate: Date | string | null;
  status: PurchaseOrderStatus | string;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  supplier?: {
    id: string;
    name: string;
  };
  warehouse?: {
    id: string;
    name: string;
    code: string;
  };
  items?: PurchaseOrderItemDto[];
  summary?: PurchaseOrderSummaryMetrics;
}

// ============================================================================
// Goods Receipts & Reconciliation Interfaces
// ============================================================================

export interface GoodsReceiptItemDto {
  id: string;
  goodsReceiptId: string;
  purchaseOrderItemId: string;
  productId: string;
  receivedQuantity: number;
  damagedQuantity: number;
  /** Derived field: receivedQuantity - damagedQuantity */
  acceptedQuantity: number;
  conditionNotes: string | null;
}

export interface GoodsReceiptDto {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  warehouseId: string;
  receivedBy: string;
  receiptNumber: string;
  status: GoodsReceiptStatus | string;
  receivedAt: Date | string;
  submittedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  items?: GoodsReceiptItemDto[];
}

/** Per-line aggregated metrics computed by the ReconciliationEngine. */
export interface LineReconciliationMetric {
  purchaseOrderItemId: string;
  productId: string;
  orderedQuantity: number;
  totalReceivedQuantity: number;
  totalDamagedQuantity: number;
  /** receivedQuantity - damagedQuantity aggregated across all receipts */
  totalAcceptedQuantity: number;
  /** max(0, orderedQuantity - totalAcceptedQuantity) */
  outstandingQuantity: number;
}

/** An exception to be persisted when the engine detects a discrepancy. */
export interface ReconciliationException {
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  purchaseOrderItemId?: string;
  productId?: string;
  title: string;
  description: string;
}

/** Full output of the ReconciliationEngine for a given goods receipt submission. */
export interface ReconciliationResult {
  /** The recommended new PO status after this round of receiving. */
  poStatus: PurchaseOrderStatus;
  /** Zero or more exceptions that must be persisted for this delivery. */
  exceptions: ReconciliationException[];
  /** Per-line metrics for inventory snapshot upserts and audit. */
  lineMetrics: LineReconciliationMetric[];
}

export interface ImportJobRowError {
  rowNumber: number;
  poNumber?: string;
  sku?: string;
  errors: string[];
}

export interface ImportJobDto {
  id: string;
  organizationId: string;
  uploadedBy: string;
  fileName: string;
  status: ImportJobStatus | string;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  errors?: ImportJobRowError[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================================================
// Exceptions, Stock Inspections & Audit Logs Interfaces
// ============================================================================

export interface ExceptionAssignmentDto {
  id: string;
  exceptionId: string;
  assignedTo: string;
  assignedBy: string;
  assignedAt: Date | string;
  assignee?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface ExceptionCommentDto {
  id: string;
  exceptionId: string;
  userId: string;
  content: string;
  createdAt: Date | string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface ExceptionResolutionDto {
  id: string;
  exceptionId: string;
  resolvedBy: string;
  resolutionType: ResolutionType | string;
  resolutionNotes: string;
  resolvedAt: Date | string;
  resolver?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface ExceptionDto {
  id: string;
  organizationId: string;
  exceptionNumber: string;
  category: ExceptionCategory | string;
  severity: ExceptionSeverity | string;
  status: ExceptionStatus | string;
  title: string;
  description: string | null;
  relatedRecordType: RelatedRecordType | string;
  relatedRecordId: string;
  detectedAt: Date | string;
  resolvedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  assignments?: ExceptionAssignmentDto[];
  comments?: ExceptionCommentDto[];
  resolution?: ExceptionResolutionDto | null;
  relatedRecord?: Record<string, unknown> | null;
}

export interface StockInspectionDto {
  id: string;
  organizationId: string;
  warehouseId: string;
  productId: string;
  recordedQuantity: number;
  physicalQuantity: number;
  /** variance = physicalQuantity - recordedQuantity */
  variance: number;
  performedBy: string;
  status: StockInspectionStatus | string;
  inspectedAt: Date | string;
  createdAt: Date | string;
  exceptionId?: string | null;
}

export interface AuditLogDto {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
  actor?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

// ============================================================================
// Attachments, Offline Sync & Analytics Interfaces
// ============================================================================

export interface AttachmentDto {
  id: string;
  organizationId: string;
  uploadedBy: string;
  relatedRecordType: RelatedRecordType | string;
  relatedRecordId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date | string;
}

export interface PresignAttachmentResponseDto {
  attachment: AttachmentDto;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface DownloadAttachmentUrlDto {
  attachmentId: string;
  downloadUrl: string;
  expiresInSeconds: number;
}

export enum SyncBatchItemStatus {
  SYNCED = 'SYNCED',
  DUPLICATE_SKIPPED = 'DUPLICATE_SKIPPED',
  FAILED = 'FAILED',
}

export interface SyncBatchItemResultDto<T> {
  idempotencyKey: string;
  status: SyncBatchItemStatus;
  record?: T;
  error?: string;
}

export interface SyncBatchResponseDto<T> {
  total: number;
  synced: number;
  duplicatesSkipped: number;
  failed: number;
  results: SyncBatchItemResultDto<T>[];
}

export interface AnalyticsOverviewDto {
  activePurchaseOrders: number;
  openExceptionsBySeverity: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
    total: number;
  };
  totalReceivedUnits: number;
  totalDamagedUnits: number;
  stockAccuracyRate: number;
}

export interface SupplierDiscrepancyDto {
  supplierId: string;
  supplierName: string;
  exceptionCount: number;
}

export interface WarehouseVarianceDto {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  inspectionCount: number;
  varianceCount: number;
  totalAbsoluteVariance: number;
}

export interface ExceptionAgingBucketsDto {
  under24h: number;
  days1To3: number;
  days3To7: number;
  over7d: number;
}

export interface AnalyticsDiscrepanciesDto {
  bySupplier: SupplierDiscrepancyDto[];
  byWarehouse: WarehouseVarianceDto[];
  exceptionAgingBuckets: ExceptionAgingBucketsDto;
}
