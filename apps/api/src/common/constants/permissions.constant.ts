/**
 * Granular permission keys used throughout OpsTrace RBAC.
 *
 * Key format: `<resource>:<action>`
 * These keys are stored in the `permissions` table and assigned to roles via
 * `role_permissions`. They are loaded at login and embedded in the JWT payload
 * so the PermissionsGuard can authorize endpoints without a database round-trip.
 *
 * HOW TO READ THESE:
 * - `users:manage`      → Create, update, deactivate org users (Admin only)
 * - `po:create`         → Create purchase orders (Admin, Manager)
 * - `receipt:submit`    → Submit goods receipt from mobile (Employee, Supervisor)
 * - `exception:resolve` → Formally close an exception (Manager only)
 * - `reports:view`      → Read dashboards/reports (Manager, Supervisor, Auditor)
 */
export const PERMISSIONS = {
  // Organization & User Management
  USERS_MANAGE: 'users:manage',
  ROLES_MANAGE: 'roles:manage',
  ORG_SETTINGS: 'org:settings',

  // Master Data
  WAREHOUSES_VIEW: 'warehouses:view',
  WAREHOUSES_MANAGE: 'warehouses:manage',
  PRODUCTS_VIEW: 'products:view',
  PRODUCTS_MANAGE: 'products:manage',
  SUPPLIERS_VIEW: 'suppliers:view',
  SUPPLIERS_MANAGE: 'suppliers:manage',

  // Purchase Orders
  PO_CREATE: 'po:create',
  PO_VIEW: 'po:view',
  PO_CANCEL: 'po:cancel',

  // Goods Receiving
  RECEIPT_CREATE: 'receipt:create',
  RECEIPT_SUBMIT: 'receipt:submit',
  RECEIPT_VIEW: 'receipt:view',

  // Stock Inspections
  INSPECTION_PERFORM: 'inspection:perform',
  INSPECTION_REVIEW: 'inspection:review',
  INSPECTION_VIEW: 'inspection:view',

  // Exceptions & Discrepancies
  EXCEPTION_VIEW: 'exception:view',
  EXCEPTION_ASSIGN: 'exception:assign',
  EXCEPTION_COMMENT: 'exception:comment',
  EXCEPTION_RESOLVE: 'exception:resolve',

  // Reports & Analytics
  REPORTS_VIEW: 'reports:view',

  // Audit Logs
  AUDIT_VIEW: 'audit:view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Maps each system role to its set of allowed permissions.
 *
 * DESIGN RULE: These defaults are seeded into the database on first registration.
 * An Org Admin can extend custom roles but cannot remove core role permissions
 * via the UI (enforced at the service layer).
 */
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ORG_ADMIN: [
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.ROLES_MANAGE,
    PERMISSIONS.ORG_SETTINGS,
    PERMISSIONS.WAREHOUSES_VIEW,
    PERMISSIONS.WAREHOUSES_MANAGE,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_MANAGE,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.SUPPLIERS_MANAGE,
    PERMISSIONS.PO_CREATE,
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.PO_CANCEL,
    PERMISSIONS.RECEIPT_CREATE,
    PERMISSIONS.RECEIPT_SUBMIT,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.INSPECTION_PERFORM,
    PERMISSIONS.INSPECTION_REVIEW,
    PERMISSIONS.INSPECTION_VIEW,
    PERMISSIONS.EXCEPTION_VIEW,
    PERMISSIONS.EXCEPTION_ASSIGN,
    PERMISSIONS.EXCEPTION_COMMENT,
    PERMISSIONS.EXCEPTION_RESOLVE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  OPS_MANAGER: [
    PERMISSIONS.WAREHOUSES_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.PO_CREATE,
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.PO_CANCEL,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.INSPECTION_REVIEW,
    PERMISSIONS.INSPECTION_VIEW,
    PERMISSIONS.EXCEPTION_VIEW,
    PERMISSIONS.EXCEPTION_ASSIGN,
    PERMISSIONS.EXCEPTION_COMMENT,
    PERMISSIONS.EXCEPTION_RESOLVE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  WAREHOUSE_SUPERVISOR: [
    PERMISSIONS.WAREHOUSES_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.RECEIPT_CREATE,
    PERMISSIONS.RECEIPT_SUBMIT,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.INSPECTION_PERFORM,
    PERMISSIONS.INSPECTION_REVIEW,
    PERMISSIONS.INSPECTION_VIEW,
    PERMISSIONS.EXCEPTION_VIEW,
    PERMISSIONS.EXCEPTION_COMMENT,
    PERMISSIONS.REPORTS_VIEW,
  ],
  WAREHOUSE_EMPLOYEE: [
    PERMISSIONS.WAREHOUSES_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.RECEIPT_CREATE,
    PERMISSIONS.RECEIPT_SUBMIT,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.INSPECTION_PERFORM,
    PERMISSIONS.INSPECTION_VIEW,
    PERMISSIONS.EXCEPTION_VIEW,
    PERMISSIONS.EXCEPTION_COMMENT,
  ],
  AUDITOR: [
    PERMISSIONS.WAREHOUSES_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.PO_VIEW,
    PERMISSIONS.RECEIPT_VIEW,
    PERMISSIONS.INSPECTION_VIEW,
    PERMISSIONS.EXCEPTION_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
};
