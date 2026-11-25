import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  AuditAction,
  ExceptionCategory,
  ExceptionSeverity,
  ExceptionStatus,
  GoodsReceiptStatus,
  MembershipStatus,
  ProductStatus,
  PurchaseOrderStatus,
  RelatedRecordType,
  ResolutionType,
  RoleName,
  StockInspectionStatus,
  SupplierStatus,
  SyncOperationStatus,
  SyncOperationType,
  WarehouseStatus,
} from '@opstrace/shared-types';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from '../src/common/constants/permissions.constant';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123!';

/** Deterministic UUID helper so repeated seed runs stay idempotent. */
function seededUuid(prefix: string, index: number): string {
  const hexPrefix = prefix.padStart(8, '0').slice(0, 8);
  const hexIndex = index.toString(16).padStart(12, '0');
  return `${hexPrefix}-0000-4000-8000-${hexIndex}`;
}

async function seedPermissions() {
  for (const key of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: {
        key,
        description: `Permission: ${key}`,
      },
    });
  }
  return prisma.permission.findMany();
}

async function seedOrgWithRoles(
  orgId: string,
  name: string,
  slug: string,
  industry: string,
  permissionMap: Map<string, string>,
) {
  const org = await prisma.organization.upsert({
    where: { slug },
    update: { name, industry },
    create: { id: orgId, name, slug, industry },
  });

  const roleMap = new Map<string, string>();
  for (const roleName of Object.values(RoleName)) {
    let role = await prisma.role.findFirst({
      where: { organizationId: org.id, name: roleName },
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          organizationId: org.id,
          name: roleName,
          description: `${roleName} role for ${name}`,
        },
      });
    }
    roleMap.set(roleName, role.id);

    const permKeys = ROLE_PERMISSIONS[roleName] ?? [];
    for (const key of permKeys) {
      const permissionId = permissionMap.get(key);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  return { org, roleMap };
}

async function main() {
  console.log('Seeding OpsTrace synthetic demonstration dataset...');

  const permissions = await seedPermissions();
  const permissionMap = new Map(permissions.map((p) => [p.key, p.id]));
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // -------------------------------------------------------------------------
  // 1. Organizations (Primary + Secondary for multi-tenant isolation tests)
  // -------------------------------------------------------------------------
  const northstarOrgId = seededUuid('10000001', 1);
  const metroOrgId = seededUuid('20000001', 1);

  const { org: northstarOrg, roleMap: northstarRoles } = await seedOrgWithRoles(
    northstarOrgId,
    'Northstar Distribution Corporation',
    'northstar-distribution',
    'Wholesale Distribution (Synthetic Demo)',
    permissionMap,
  );

  const { org: metroOrg, roleMap: metroRoles } = await seedOrgWithRoles(
    metroOrgId,
    'Metro South Logistics Corp',
    'metro-south-logistics',
    'Third-Party Logistics (Synthetic Demo)',
    permissionMap,
  );

  // -------------------------------------------------------------------------
  // 2. Demo Users & Memberships (Password: Password123!)
  // -------------------------------------------------------------------------
  const northstarUsersSpec = [
    {
      id: seededUuid('10000002', 1),
      email: 'admin@northstar.ph',
      firstName: 'Elena',
      lastName: 'Santos',
      role: RoleName.ORG_ADMIN,
    },
    {
      id: seededUuid('10000002', 2),
      email: 'manager@northstar.ph',
      firstName: 'Marco',
      lastName: 'Reyes',
      role: RoleName.OPS_MANAGER,
    },
    {
      id: seededUuid('10000002', 3),
      email: 'supervisor@northstar.ph',
      firstName: 'Carlo',
      lastName: 'Mendoza',
      role: RoleName.WAREHOUSE_SUPERVISOR,
    },
    {
      id: seededUuid('10000002', 4),
      email: 'receiver@northstar.ph',
      firstName: 'Jessa',
      lastName: 'Cruz',
      role: RoleName.WAREHOUSE_EMPLOYEE,
    },
    {
      id: seededUuid('10000002', 5),
      email: 'auditor@northstar.ph',
      firstName: 'Rafael',
      lastName: 'Villanueva',
      role: RoleName.AUDITOR,
    },
  ];

  const userIdsByRole = new Map<string, string>();

  for (const u of northstarUsersSpec) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { firstName: u.firstName, lastName: u.lastName, passwordHash },
      create: {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        passwordHash,
      },
    });
    userIdsByRole.set(u.role, user.id);

    const roleId = northstarRoles.get(u.role)!;
    await prisma.membership.upsert({
      where: {
        uq_memberships_org_user: {
          organizationId: northstarOrg.id,
          userId: user.id,
        },
      },
      update: { roleId, status: MembershipStatus.ACTIVE },
      create: {
        organizationId: northstarOrg.id,
        userId: user.id,
        roleId,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  // Secondary isolated tenant user + data
  const metroAdmin = await prisma.user.upsert({
    where: { email: 'admin@metrosouth.ph' },
    update: { passwordHash },
    create: {
      id: seededUuid('20000002', 1),
      email: 'admin@metrosouth.ph',
      firstName: 'Diana',
      lastName: 'Lim',
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: {
      uq_memberships_org_user: {
        organizationId: metroOrg.id,
        userId: metroAdmin.id,
      },
    },
    update: {
      roleId: metroRoles.get(RoleName.ORG_ADMIN)!,
      status: MembershipStatus.ACTIVE,
    },
    create: {
      organizationId: metroOrg.id,
      userId: metroAdmin.id,
      roleId: metroRoles.get(RoleName.ORG_ADMIN)!,
      status: MembershipStatus.ACTIVE,
    },
  });

  await prisma.warehouse.upsert({
    where: {
      uq_warehouses_org_code: { organizationId: metroOrg.id, code: 'WH-MS-01' },
    },
    update: {},
    create: {
      id: seededUuid('20000003', 1),
      organizationId: metroOrg.id,
      name: 'Metro South Cavite Hub (Synthetic)',
      code: 'WH-MS-01',
      address: 'Carmona, Cavite',
      status: WarehouseStatus.ACTIVE,
    },
  });

  await prisma.exception.upsert({
    where: {
      uq_exceptions_org_number: {
        organizationId: metroOrg.id,
        exceptionNumber: 'EX-MS-2026-0001',
      },
    },
    update: {},
    create: {
      id: seededUuid('20000009', 1),
      organizationId: metroOrg.id,
      exceptionNumber: 'EX-MS-2026-0001',
      category: ExceptionCategory.QUANTITY_MISMATCH,
      severity: ExceptionSeverity.HIGH,
      status: ExceptionStatus.OPEN,
      title: 'Metro South Isolated Tenant Discrepancy',
      description: 'Must never be visible to Northstar Distribution users.',
      relatedRecordType: RelatedRecordType.PURCHASE_ORDER,
      relatedRecordId: seededUuid('20000006', 1),
    },
  });

  // -------------------------------------------------------------------------
  // 3. Northstar Master Data: 3 Warehouses, 20 Suppliers, 150 SKUs
  // -------------------------------------------------------------------------
  const warehouseSpecs = [
    {
      id: seededUuid('10000003', 1),
      code: 'WH-BUL-01',
      name: 'Bulacan Central Hub',
      address: 'Meycauayan Industrial Park, Bulacan',
    },
    {
      id: seededUuid('10000003', 2),
      code: 'WH-LAG-01',
      name: 'Laguna South Hub',
      address: 'Cabuyao Logistics Zone, Laguna',
    },
    {
      id: seededUuid('10000003', 3),
      code: 'WH-PAM-01',
      name: 'Pampanga North Hub',
      address: 'Clark Freeport Logistics Center, Pampanga',
    },
  ];

  const warehouseIds: string[] = [];
  for (const wh of warehouseSpecs) {
    const created = await prisma.warehouse.upsert({
      where: {
        uq_warehouses_org_code: { organizationId: northstarOrg.id, code: wh.code },
      },
      update: { name: wh.name, address: wh.address },
      create: {
        id: wh.id,
        organizationId: northstarOrg.id,
        code: wh.code,
        name: wh.name,
        address: wh.address,
        status: WarehouseStatus.ACTIVE,
      },
    });
    warehouseIds.push(created.id);
  }

  const supplierNames = [
    'Luzon Packaging Corp',
    'Manila Hardware & Fasteners',
    'Pacific Beverage Distributors',
    'Cavite Paper & Cartons Inc',
    'Archipelago FMCG Trading',
    'Metro Steel & Wiring Co',
    'Bulacan Agri-Foods Supply',
    'Southern Tagalog Plastics',
    'Rizal Industrial Adhesives',
    'Cordillera Bottling Works',
    'Bataan Polymer Products',
    'Quezon Hygiene & Home Care',
    'Subic Bay Freight Supplies',
    'Cebu Export Canning Co',
    'Davao Tropics Wholesale',
    'Iloilo Grain & Pantry Corp',
    'Pampanga Cold Chain Pack',
    'Tarlac Electrical Depot',
    'Batangas Safety Gear Inc',
    'Makati Office & Retail Supply',
  ];

  const supplierIds: string[] = [];
  for (let i = 0; i < supplierNames.length; i++) {
    const id = seededUuid('10000004', i + 1);
    const name = `${supplierNames[i]} (Demo)`;
    await prisma.supplier.upsert({
      where: { id },
      update: { name },
      create: {
        id,
        organizationId: northstarOrg.id,
        name,
        email: `orders+sup${i + 1}@northstar-demo.ph`,
        phone: `+63 2 8555 ${String(1000 + i)}`,
        address: `Industrial Ave Lot ${i + 1}, Metro Manila`,
        status: SupplierStatus.ACTIVE,
      },
    });
    supplierIds.push(id);
  }

  const productCategories = [
    'Corrugated Shipping Box',
    'Industrial Stretch Wrap',
    'Heavy-Duty Packing Tape',
    'Nitrile Safety Gloves',
    'LED Warehouse Floodlight',
    'Bottled Mineral Water 500ml',
    'Canned Sardines 155g Case',
    'Instant Coffee 3-in-1 Box',
    'PVC Pipe Schedule 40',
    'Galvanized Hex Bolt Pack',
  ];
  const uoms = ['CASE', 'ROLL', 'BOX', 'PACK', 'UNIT'];
  const productIds: string[] = [];

  for (let i = 1; i <= 150; i++) {
    const id = seededUuid('10000005', i);
    const sku = `SKU-NS-${String(i).padStart(4, '0')}`;
    const cat = productCategories[(i - 1) % productCategories.length]!;
    const uom = uoms[(i - 1) % uoms.length]!;
    await prisma.product.upsert({
      where: {
        uq_products_org_sku: { organizationId: northstarOrg.id, sku },
      },
      update: {},
      create: {
        id,
        organizationId: northstarOrg.id,
        sku,
        name: `${cat} #${i}`,
        description: `Synthetic demo catalog item ${sku}`,
        barcode: `4800000${String(i).padStart(6, '0')}`,
        unitOfMeasure: uom,
        status: ProductStatus.ACTIVE,
      },
    });
    productIds.push(id);
  }

  // -------------------------------------------------------------------------
  // 4. 100 Purchase Orders + 8 Scripted Discrepancy Scenarios
  // -------------------------------------------------------------------------
  const adminId = userIdsByRole.get(RoleName.ORG_ADMIN)!;
  const managerId = userIdsByRole.get(RoleName.OPS_MANAGER)!;
  const supervisorId = userIdsByRole.get(RoleName.WAREHOUSE_SUPERVISOR)!;
  const receiverId = userIdsByRole.get(RoleName.WAREHOUSE_EMPLOYEE)!;

  for (let i = 1; i <= 100; i++) {
    const poId = seededUuid('10000006', i);
    const poNumber = `PO-NS-2026-${String(i).padStart(4, '0')}`;
    const supplierId = supplierIds[(i - 1) % supplierIds.length]!;
    const warehouseId = warehouseIds[(i - 1) % warehouseIds.length]!;
    const productId = productIds[(i - 1) % productIds.length]!;
    const poItemId = seededUuid('10000007', i);

    let status: string = PurchaseOrderStatus.ISSUED;
    if (i <= 5) {
      status =
        i === 1 || i === 2
          ? PurchaseOrderStatus.COMPLETED
          : PurchaseOrderStatus.PARTIALLY_RECEIVED;
    } else if (i <= 20) {
      status = PurchaseOrderStatus.DRAFT;
    } else if (i <= 45) {
      status = PurchaseOrderStatus.ISSUED;
    } else if (i <= 65) {
      status = PurchaseOrderStatus.PARTIALLY_RECEIVED;
    } else if (i <= 90) {
      status = PurchaseOrderStatus.COMPLETED;
    } else {
      status = PurchaseOrderStatus.CANCELLED;
    }

    const existingPo = await prisma.purchaseOrder.findUnique({
      where: {
        uq_purchase_orders_org_po_number: { organizationId: northstarOrg.id, poNumber },
      },
    });

    if (!existingPo) {
      await prisma.purchaseOrder.create({
        data: {
          id: poId,
          organizationId: northstarOrg.id,
          supplierId,
          warehouseId,
          poNumber,
          orderDate: new Date(Date.now() - (100 - i) * 24 * 60 * 60 * 1000),
          expectedDeliveryDate: new Date(
            Date.now() + (10 - (i % 15)) * 24 * 60 * 60 * 1000,
          ),
          status,
          createdBy: managerId,
          items: {
            create: [
              {
                id: poItemId,
                productId,
                orderedQuantity: 100,
                unitPrice: new Prisma.Decimal(((i % 25) * 15 + 45.5).toFixed(2)),
              },
            ],
          },
        },
      });
    }
  }

  // Helper for idempotent Goods Receipt creation
  async function ensureReceipt(
    idx: number,
    poIndex: number,
    receiptNumber: string,
    receivedQty: number,
    damagedQty: number,
    notes?: string,
  ) {
    const grId = seededUuid('10000008', idx);
    const existing = await prisma.goodsReceipt.findUnique({
      where: {
        uq_goods_receipts_org_receipt_number: {
          organizationId: northstarOrg.id,
          receiptNumber,
        },
      },
    });
    if (existing) return existing;

    const poId = seededUuid('10000006', poIndex);
    const poItemId = seededUuid('10000007', poIndex);
    const productId = productIds[(poIndex - 1) % productIds.length]!;
    const warehouseId = warehouseIds[(poIndex - 1) % warehouseIds.length]!;

    return prisma.goodsReceipt.create({
      data: {
        id: grId,
        organizationId: northstarOrg.id,
        purchaseOrderId: poId,
        warehouseId,
        receivedBy: receiverId,
        receiptNumber,
        status: GoodsReceiptStatus.RECONCILED,
        receivedAt: new Date(Date.now() - idx * 12 * 60 * 60 * 1000),
        submittedAt: new Date(Date.now() - idx * 12 * 60 * 60 * 1000),
        items: {
          create: [
            {
              id: seededUuid('10000018', idx),
              purchaseOrderItemId: poItemId,
              productId,
              receivedQuantity: receivedQty,
              damagedQuantity: damagedQty,
              notes: notes ?? null,
            },
          ],
        },
      },
    });
  }

  // Scenario 1: Exact Match (PO #1: 100 ordered, 100 received)
  await ensureReceipt(1, 1, 'GR-NS-2026-0001', 100, 0, 'Exact match delivery');

  // Scenario 2: Partial Multi-Delivery (PO #2: 40 + 30 + 30 = 100)
  await ensureReceipt(2, 2, 'GR-NS-2026-0002-A', 40, 0, 'Partial delivery 1/3');
  await ensureReceipt(3, 2, 'GR-NS-2026-0002-B', 30, 0, 'Partial delivery 2/3');
  await ensureReceipt(4, 2, 'GR-NS-2026-0002-C', 30, 0, 'Partial delivery 3/3');

  // Scenario 3: Over-Delivery Exception (PO #3: 100 ordered, 118 received)
  const grOver = await ensureReceipt(
    5,
    3,
    'GR-NS-2026-0003',
    118,
    0,
    '18 extra cartons delivered',
  );
  await prisma.exception.upsert({
    where: {
      uq_exceptions_org_number: {
        organizationId: northstarOrg.id,
        exceptionNumber: 'EX-NS-2026-0001',
      },
    },
    update: {},
    create: {
      id: seededUuid('10000009', 1),
      organizationId: northstarOrg.id,
      exceptionNumber: 'EX-NS-2026-0001',
      category: ExceptionCategory.QUANTITY_MISMATCH,
      severity: ExceptionSeverity.HIGH,
      status: ExceptionStatus.OPEN,
      title: 'Over-Delivery Detected (18 excess units)',
      description: 'Ordered 100 units but accepted 118 units on GR-NS-2026-0003.',
      relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
      relatedRecordId: grOver.id,
    },
  });

  // Scenario 4: Short-Delivery Exception (PO #4: 100 ordered, 92 received)
  const grShort = await ensureReceipt(
    6,
    4,
    'GR-NS-2026-0004',
    92,
    0,
    '8 units missing from pallet',
  );
  await prisma.exception.upsert({
    where: {
      uq_exceptions_org_number: {
        organizationId: northstarOrg.id,
        exceptionNumber: 'EX-NS-2026-0002',
      },
    },
    update: {},
    create: {
      id: seededUuid('10000009', 2),
      organizationId: northstarOrg.id,
      exceptionNumber: 'EX-NS-2026-0002',
      category: ExceptionCategory.QUANTITY_MISMATCH,
      severity: ExceptionSeverity.MEDIUM,
      status: ExceptionStatus.INVESTIGATING,
      title: 'Short-Delivery on Receipt (8 units short)',
      description: 'Ordered 100 units but received 92 units on GR-NS-2026-0004.',
      relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
      relatedRecordId: grShort.id,
    },
  });

  // Scenario 5: Damaged Goods Excluded from Inventory (PO #5: 100 received, 5 damaged -> 95 accepted)
  const grDamaged = await ensureReceipt(
    7,
    5,
    'GR-NS-2026-0005',
    100,
    5,
    '5 units crushed in transit',
  );
  await prisma.exception.upsert({
    where: {
      uq_exceptions_org_number: {
        organizationId: northstarOrg.id,
        exceptionNumber: 'EX-NS-2026-0003',
      },
    },
    update: {},
    create: {
      id: seededUuid('10000009', 3),
      organizationId: northstarOrg.id,
      exceptionNumber: 'EX-NS-2026-0003',
      category: ExceptionCategory.DAMAGED_GOODS,
      severity: ExceptionSeverity.MEDIUM,
      status: ExceptionStatus.OPEN,
      title: 'Damaged Goods Received (5 units)',
      description: '5 of 100 units damaged on GR-NS-2026-0005; excluded from stock.',
      relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
      relatedRecordId: grDamaged.id,
    },
  });

  // Inventory Snapshots (including 95 accepted units for Scenario 5 & 50 baseline for Scenario 6)
  const existingSnapCount = await prisma.inventorySnapshot.count({
    where: { organizationId: northstarOrg.id },
  });
  if (existingSnapCount === 0) {
    await prisma.inventorySnapshot.createMany({
      data: [
        {
          organizationId: northstarOrg.id,
          warehouseId: warehouseIds[1]!,
          productId: productIds[4]!,
          quantity: 95,
          sourceReference: 'GR-NS-2026-0005',
        },
        {
          organizationId: northstarOrg.id,
          warehouseId: warehouseIds[0]!,
          productId: productIds[9]!,
          quantity: 50,
          sourceReference: 'INITIAL-BASELINE',
        },
      ],
    });
  }

  // Scenario 6: Stock Inspection Cycle-Count Variance (Recorded 50 vs Physical 43 -> -7)
  const inspId = seededUuid('10000010', 1);
  const existingInsp = await prisma.stockInspection.findUnique({
    where: { id: inspId },
  });
  if (!existingInsp) {
    await prisma.stockInspection.create({
      data: {
        id: inspId,
        organizationId: northstarOrg.id,
        warehouseId: warehouseIds[0]!,
        productId: productIds[9]!,
        recordedQuantity: 50,
        physicalQuantity: 43,
        difference: -7,
        performedBy: supervisorId,
        status: StockInspectionStatus.DISCREPANCY_FLAGGED,
      },
    });
  }

  await prisma.exception.upsert({
    where: {
      uq_exceptions_org_number: {
        organizationId: northstarOrg.id,
        exceptionNumber: 'EX-NS-2026-0004',
      },
    },
    update: {},
    create: {
      id: seededUuid('10000009', 4),
      organizationId: northstarOrg.id,
      exceptionNumber: 'EX-NS-2026-0004',
      category: ExceptionCategory.INVENTORY_VARIANCE,
      severity: ExceptionSeverity.HIGH,
      status: ExceptionStatus.OPEN,
      title: 'Inventory Variance Detected (SKU-NS-0010)',
      description: 'Physical cycle count found 43 units vs 50 recorded (variance: -7).',
      relatedRecordType: RelatedRecordType.STOCK_INSPECTION,
      relatedRecordId: inspId,
    },
  });

  // Scenario 7: Resolved Exception with Assignment, Comment, Resolution & Audit History
  const resolvedExcId = seededUuid('10000009', 5);
  await prisma.exception.upsert({
    where: {
      uq_exceptions_org_number: {
        organizationId: northstarOrg.id,
        exceptionNumber: 'EX-NS-2026-0005',
      },
    },
    update: {},
    create: {
      id: resolvedExcId,
      organizationId: northstarOrg.id,
      exceptionNumber: 'EX-NS-2026-0005',
      category: ExceptionCategory.QUANTITY_MISMATCH,
      severity: ExceptionSeverity.LOW,
      status: ExceptionStatus.RESOLVED,
      title: 'Resolved Short-Shipment Demo Case',
      description: 'Supplier confirmed backorder credit memo issued.',
      relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
      relatedRecordId: grShort.id,
      resolvedAt: new Date(),
    },
  });

  const existingResolution = await prisma.exceptionResolution.findUnique({
    where: { exceptionId: resolvedExcId },
  });
  if (!existingResolution) {
    await prisma.exceptionAssignment.create({
      data: {
        exceptionId: resolvedExcId,
        assignedTo: supervisorId,
        assignedBy: managerId,
      },
    });
    await prisma.exceptionComment.create({
      data: {
        exceptionId: resolvedExcId,
        userId: supervisorId,
        content: 'Verified pallet manifest and contacted supplier dispatch.',
      },
    });
    await prisma.exceptionResolution.create({
      data: {
        exceptionId: resolvedExcId,
        resolvedBy: managerId,
        resolutionType: ResolutionType.SUPPLIER_SHORT_SHIPMENT_ACCEPTED,
        resolutionNotes: 'Accepted short shipment with supplier credit memo #CM-8821.',
      },
    });
  }

  // Scenario 8: Offline-Synced Receipt in sync_operations
  const offlineKey = seededUuid('10000011', 1);
  await prisma.syncOperation.upsert({
    where: {
      uq_sync_org_idempotency_key: {
        organizationId: northstarOrg.id,
        idempotencyKey: offlineKey,
      },
    },
    update: {},
    create: {
      organizationId: northstarOrg.id,
      userId: receiverId,
      idempotencyKey: offlineKey,
      operationType: SyncOperationType.GOODS_RECEIPT_SUBMIT,
      status: SyncOperationStatus.COMPLETED,
      serverRecordId: grShort.id,
    },
  });

  // Additional realistic receiving & exception records for analytics richness
  for (let k = 6; k <= 25; k++) {
    const poIdx = 60 + k;
    const gr = await ensureReceipt(
      10 + k,
      poIdx,
      `GR-NS-2026-00${String(k).padStart(2, '0')}`,
      100,
      k % 4 === 0 ? 3 : 0,
    );
    if (k % 2 === 0) {
      await prisma.exception.upsert({
        where: {
          uq_exceptions_org_number: {
            organizationId: northstarOrg.id,
            exceptionNumber: `EX-NS-2026-00${String(k).padStart(2, '0')}`,
          },
        },
        update: {},
        create: {
          id: seededUuid('10000009', k),
          organizationId: northstarOrg.id,
          exceptionNumber: `EX-NS-2026-00${String(k).padStart(2, '0')}`,
          category:
            k % 4 === 0
              ? ExceptionCategory.DAMAGED_GOODS
              : ExceptionCategory.QUANTITY_MISMATCH,
          severity:
            k % 6 === 0 ? ExceptionSeverity.CRITICAL : ExceptionSeverity.MEDIUM,
          status:
            k % 3 === 0 ? ExceptionStatus.INVESTIGATING : ExceptionStatus.OPEN,
          title: `Synthetic Demo Discrepancy #${k}`,
          description: `Generated demonstration discrepancy for analytics & SLA aging.`,
          relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
          relatedRecordId: gr.id,
          detectedAt: new Date(Date.now() - (k % 10) * 24 * 60 * 60 * 1000),
        },
      });
    }
  }

  // Baseline Audit Logs
  const auditCount = await prisma.auditLog.count({
    where: { organizationId: northstarOrg.id },
  });
  if (auditCount === 0) {
    await prisma.auditLog.createMany({
      data: [
        {
          organizationId: northstarOrg.id,
          actorUserId: adminId,
          action: AuditAction.CREATE,
          entityType: 'Organization',
          entityId: northstarOrg.id,
          metadata: { note: 'Synthetic demo organization initialized' },
        },
        {
          organizationId: northstarOrg.id,
          actorUserId: receiverId,
          action: AuditAction.RECONCILE,
          entityType: 'GoodsReceipt',
          entityId: grDamaged.id,
          metadata: { receiptNumber: 'GR-NS-2026-0005', damagedQuantity: 5 },
        },
        {
          organizationId: northstarOrg.id,
          actorUserId: managerId,
          action: AuditAction.RESOLVE,
          entityType: 'Exception',
          entityId: resolvedExcId,
          metadata: {
            exceptionNumber: 'EX-NS-2026-0005',
            resolutionType: ResolutionType.SUPPLIER_SHORT_SHIPMENT_ACCEPTED,
          },
        },
      ],
    });
  }

  console.log('Seed completed cleanly for Northstar Distribution Corporation.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
