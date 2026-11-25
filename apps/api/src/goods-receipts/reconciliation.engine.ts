/**
 * OpsTrace Deterministic Reconciliation Engine
 *
 * This module is a pure, side-effect-free domain function.
 * It has ZERO dependencies on Prisma, NestJS DI, or any external service.
 *
 * BUSINESS RULE SUMMARY:
 *  1. Aggregate received/damaged quantities across ALL submitted goods receipts for a PO.
 *  2. Compute per-line acceptedQuantity = receivedQuantity - damagedQuantity.
 *  3. Compute outstandingQuantity = max(0, orderedQuantity - totalAcceptedQuantity).
 *  4. Raise exceptions deterministically for OVER_DELIVERY, SHORT_DELIVERY,
 *     DAMAGED_GOODS, and UNEXPECTED_ITEM.
 *  5. Recommend a PO status update (PARTIALLY_RECEIVED, COMPLETED, DISCREPANCY).
 *
 * This engine is called inside a prisma.$transaction() after the new receipt is persisted,
 * so it always evaluates the full set of receipts (including the one just saved).
 */

import {
  ExceptionCategory,
  ExceptionSeverity,
  LineReconciliationMetric,
  PurchaseOrderStatus,
  ReconciliationException,
  ReconciliationResult,
} from '@opstrace/shared-types';

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ReconcilePoItem {
  id: string;
  productId: string;
  orderedQuantity: number;
}

export interface ReconcileReceiptItem {
  purchaseOrderItemId: string;
  productId: string;
  receivedQuantity: number;
  damagedQuantity: number;
}

export interface ReconcileInput {
  /**
   * All line items on the Purchase Order being reconciled.
   * Each item carries the contracted ordered quantity.
   */
  purchaseOrderItems: ReconcilePoItem[];

  /**
   * ALL goods receipt items for this PO across ALL submitted receipts
   * (not just the most recent one — partial deliveries must accumulate).
   */
  allReceiptItems: ReconcileReceiptItem[];

  /**
   * When true, the submitter indicates this is the final delivery.
   * A SHORT_DELIVERY exception is raised only on a final delivery so that
   * partially-received POs are not prematurely flagged.
   */
  isFinalDelivery: boolean;
}

// ---------------------------------------------------------------------------
// Severity classification helpers
// ---------------------------------------------------------------------------

/**
 * Determine severity of a quantity-based discrepancy (over- or short-delivery).
 *
 * Thresholds (documented per PRD §11.5):
 *  - >20% variance  → CRITICAL
 *  - >10%           → HIGH
 *  - >5%            → MEDIUM
 *  - ≤5%            → LOW
 */
function quantityDiscrepancySeverity(
  orderedQuantity: number,
  discrepancyUnits: number,
): ExceptionSeverity {
  if (orderedQuantity === 0) return ExceptionSeverity.LOW;
  const pct = Math.abs(discrepancyUnits) / orderedQuantity;
  if (pct > 0.2) return ExceptionSeverity.CRITICAL;
  if (pct > 0.1) return ExceptionSeverity.HIGH;
  if (pct > 0.05) return ExceptionSeverity.MEDIUM;
  return ExceptionSeverity.LOW;
}

// ---------------------------------------------------------------------------
// Core reconciliation function
// ---------------------------------------------------------------------------

/**
 * Reconcile a Purchase Order against all submitted goods receipt items.
 *
 * TENANT ISOLATION: This function receives already-filtered data from the
 * calling service (which applies organizationId scoping before fetching).
 * The engine itself is agnostic to tenancy — it only sees the numbers.
 *
 * @param input - PO items + ALL receipt items + isFinalDelivery flag
 * @returns ReconciliationResult with recommended PO status, exceptions, and line metrics
 */
export function reconcile(input: ReconcileInput): ReconciliationResult {
  const { purchaseOrderItems, allReceiptItems, isFinalDelivery } = input;

  // Build a quick lookup of known product IDs on this PO
  const knownProductIds = new Set<string>(purchaseOrderItems.map((p) => p.productId));

  // -------------------------------------------------------------------------
  // Step 1: Aggregate received/damaged quantities per PO line item
  // -------------------------------------------------------------------------
  const aggregated = new Map<
    string, // purchaseOrderItemId
    { receivedQuantity: number; damagedQuantity: number; productId: string }
  >();

  // Initialize all PO lines at zero so lines with zero receipts still appear
  for (const poItem of purchaseOrderItems) {
    aggregated.set(poItem.id, {
      receivedQuantity: 0,
      damagedQuantity: 0,
      productId: poItem.productId,
    });
  }

  const unexpectedProductIds = new Set<string>();

  for (const ri of allReceiptItems) {
    // Detect unexpected items (product not on any PO line)
    if (!knownProductIds.has(ri.productId)) {
      unexpectedProductIds.add(ri.productId);
      continue; // Don't count towards reconciliation — it's a foreign item
    }

    const existing = aggregated.get(ri.purchaseOrderItemId);
    if (existing) {
      existing.receivedQuantity += ri.receivedQuantity;
      existing.damagedQuantity += ri.damagedQuantity;
    } else {
      // Receipt references a valid product but unknown poItemId — treat as unexpected
      unexpectedProductIds.add(ri.productId);
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Compute per-line metrics
  // -------------------------------------------------------------------------
  const lineMetrics: LineReconciliationMetric[] = [];
  const exceptions: ReconciliationException[] = [];

  let allFullyReceived = true; // assume true until proven otherwise
  let anyReceived = false;
  let hasOverDelivery = false;

  for (const poItem of purchaseOrderItems) {
    const agg = aggregated.get(poItem.id)!;
    const totalReceivedQuantity = agg.receivedQuantity;
    const totalDamagedQuantity = agg.damagedQuantity;

    /**
     * BUSINESS RULE: acceptedQuantity excludes damaged goods.
     * Damaged goods are quarantined and must NOT enter inventory.
     */
    const totalAcceptedQuantity = totalReceivedQuantity - totalDamagedQuantity;
    const outstandingQuantity = Math.max(0, poItem.orderedQuantity - totalAcceptedQuantity);

    lineMetrics.push({
      purchaseOrderItemId: poItem.id,
      productId: poItem.productId,
      orderedQuantity: poItem.orderedQuantity,
      totalReceivedQuantity,
      totalDamagedQuantity,
      totalAcceptedQuantity,
      outstandingQuantity,
    });

    if (totalAcceptedQuantity > 0) {
      anyReceived = true;
    }
    if (outstandingQuantity > 0) {
      allFullyReceived = false;
    }

    // -----------------------------------------------------------------------
    // RULE: OVER_DELIVERY — accepted quantity exceeds the ordered quantity
    // -----------------------------------------------------------------------
    if (totalAcceptedQuantity > poItem.orderedQuantity) {
      hasOverDelivery = true;
      const excess = totalAcceptedQuantity - poItem.orderedQuantity;
      exceptions.push({
        category: ExceptionCategory.QUANTITY_MISMATCH,
        severity: quantityDiscrepancySeverity(poItem.orderedQuantity, excess),
        purchaseOrderItemId: poItem.id,
        productId: poItem.productId,
        title: 'Over-Delivery Detected',
        description:
          `Ordered ${poItem.orderedQuantity} units but accepted ${totalAcceptedQuantity} ` +
          `(excess: ${excess}). Supplier delivered more than contracted.`,
      });
    }

    // -----------------------------------------------------------------------
    // RULE: SHORT_DELIVERY — only raised when this is the final delivery
    // -----------------------------------------------------------------------
    if (isFinalDelivery && totalAcceptedQuantity < poItem.orderedQuantity) {
      const shortfall = poItem.orderedQuantity - totalAcceptedQuantity;
      exceptions.push({
        category: ExceptionCategory.QUANTITY_MISMATCH,
        severity: quantityDiscrepancySeverity(poItem.orderedQuantity, shortfall),
        purchaseOrderItemId: poItem.id,
        productId: poItem.productId,
        title: 'Short-Delivery on Final Receipt',
        description:
          `Ordered ${poItem.orderedQuantity} units but only accepted ${totalAcceptedQuantity} ` +
          `(shortfall: ${shortfall}). PO marked as final.`,
      });
    }

    // -----------------------------------------------------------------------
    // RULE: DAMAGED_GOODS — any line with damaged units
    // -----------------------------------------------------------------------
    if (totalDamagedQuantity > 0) {
      exceptions.push({
        category: ExceptionCategory.DAMAGED_GOODS,
        severity:
          totalDamagedQuantity >= totalReceivedQuantity * 0.5
            ? ExceptionSeverity.HIGH
            : ExceptionSeverity.MEDIUM,
        purchaseOrderItemId: poItem.id,
        productId: poItem.productId,
        title: 'Damaged Goods Received',
        description:
          `${totalDamagedQuantity} of ${totalReceivedQuantity} received units were damaged ` +
          `and cannot be accepted into inventory.`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // RULE: UNEXPECTED_ITEM — products received that are not on the PO
  // -------------------------------------------------------------------------
  for (const productId of unexpectedProductIds) {
    exceptions.push({
      category: ExceptionCategory.UNEXPECTED_ITEM,
      severity: ExceptionSeverity.HIGH,
      productId,
      title: 'Unexpected Item Received',
      description:
        `Product ${productId} was received but does not appear on any line of this Purchase Order.`,
    });
  }

  // -------------------------------------------------------------------------
  // Step 3: Recommend PO status
  //
  // PRIORITY: DISCREPANCY > COMPLETED > PARTIALLY_RECEIVED > ISSUED
  // -------------------------------------------------------------------------
  let poStatus: PurchaseOrderStatus;

  if (hasOverDelivery || unexpectedProductIds.size > 0) {
    /**
     * Any over-delivery or unexpected item puts the PO into a DISCREPANCY state.
     * This requires manager review before the PO can be closed.
     * Mapped to PARTIALLY_RECEIVED in the enum (the schema uses PARTIALLY_RECEIVED
     * and COMPLETED; there is no separate DISCREPANCY status — the exception record
     * carries the discrepancy signal).
     *
     * We use PARTIALLY_RECEIVED here to indicate the PO is not cleanly done,
     * and the generated exceptions communicate the discrepancy.
     */
    poStatus = PurchaseOrderStatus.PARTIALLY_RECEIVED;
  } else if (allFullyReceived && anyReceived) {
    /**
     * All ordered quantities have been accepted (outstanding = 0 for every line)
     * and no over-delivery or unexpected items exist → PO fully and cleanly received.
     */
    poStatus = PurchaseOrderStatus.COMPLETED;
  } else if (anyReceived) {
    // Some items received but outstanding > 0 on at least one line
    poStatus = PurchaseOrderStatus.PARTIALLY_RECEIVED;
  } else {
    // Nothing received yet (edge case: all items had damagedQty = receivedQty)
    poStatus = PurchaseOrderStatus.ISSUED;
  }

  return { poStatus, exceptions, lineMetrics };
}
