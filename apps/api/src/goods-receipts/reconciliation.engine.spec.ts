import {
  ExceptionCategory,
  ExceptionSeverity,
  PurchaseOrderStatus,
} from '@opstrace/shared-types';
import { reconcile } from './reconciliation.engine';

describe('ReconciliationEngine (reconcile)', () => {
  const poItem1 = { id: 'po-item-1', productId: 'prod-1', orderedQuantity: 100 };
  const poItem2 = { id: 'po-item-2', productId: 'prod-2', orderedQuantity: 50 };

  it('returns COMPLETED with zero exceptions on exact match', () => {
    const result = reconcile({
      purchaseOrderItems: [poItem1],
      allReceiptItems: [
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 100,
          damagedQuantity: 0,
        },
      ],
      isFinalDelivery: false,
    });

    expect(result.poStatus).toBe(PurchaseOrderStatus.COMPLETED);
    expect(result.exceptions).toHaveLength(0);
    expect(result.lineMetrics).toEqual([
      {
        purchaseOrderItemId: 'po-item-1',
        productId: 'prod-1',
        orderedQuantity: 100,
        totalReceivedQuantity: 100,
        totalDamagedQuantity: 0,
        totalAcceptedQuantity: 100,
        outstandingQuantity: 0,
      },
    ]);
  });

  it('returns PARTIALLY_RECEIVED with no exceptions on non-final partial delivery', () => {
    const result = reconcile({
      purchaseOrderItems: [poItem1],
      allReceiptItems: [
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 40,
          damagedQuantity: 0,
        },
      ],
      isFinalDelivery: false,
    });

    expect(result.poStatus).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
    expect(result.exceptions).toHaveLength(0);
    expect(result.lineMetrics[0]?.totalAcceptedQuantity).toBe(40);
    expect(result.lineMetrics[0]?.outstandingQuantity).toBe(60);
  });

  it('accumulates multiple partial receipts to COMPLETED when exact total is reached', () => {
    const result = reconcile({
      purchaseOrderItems: [poItem1],
      allReceiptItems: [
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 40,
          damagedQuantity: 0,
        },
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 30,
          damagedQuantity: 0,
        },
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 30,
          damagedQuantity: 0,
        },
      ],
      isFinalDelivery: false,
    });

    expect(result.poStatus).toBe(PurchaseOrderStatus.COMPLETED);
    expect(result.exceptions).toHaveLength(0);
    expect(result.lineMetrics[0]?.totalAcceptedQuantity).toBe(100);
    expect(result.lineMetrics[0]?.outstandingQuantity).toBe(0);
  });

  it('flags QUANTITY_MISMATCH on over-delivery with appropriate severity', () => {
    const result = reconcile({
      purchaseOrderItems: [poItem1],
      allReceiptItems: [
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 125,
          damagedQuantity: 0,
        },
      ],
      isFinalDelivery: false,
    });

    expect(result.poStatus).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
    expect(result.lineMetrics[0]?.outstandingQuantity).toBe(0);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0]).toMatchObject({
      category: ExceptionCategory.QUANTITY_MISMATCH,
      severity: ExceptionSeverity.CRITICAL, // 25% > 20%
      purchaseOrderItemId: 'po-item-1',
      productId: 'prod-1',
      title: 'Over-Delivery Detected',
    });
  });

  it('flags QUANTITY_MISMATCH on short-delivery only when isFinalDelivery is true', () => {
    const result = reconcile({
      purchaseOrderItems: [poItem1],
      allReceiptItems: [
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 92,
          damagedQuantity: 0,
        },
      ],
      isFinalDelivery: true,
    });

    expect(result.poStatus).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
    expect(result.lineMetrics[0]?.outstandingQuantity).toBe(8);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0]).toMatchObject({
      category: ExceptionCategory.QUANTITY_MISMATCH,
      severity: ExceptionSeverity.MEDIUM, // 8% (>5% and <=10%)
      title: 'Short-Delivery on Final Receipt',
    });
  });

  it('excludes damaged goods from acceptedQuantity and raises DAMAGED_GOODS exception', () => {
    const result = reconcile({
      purchaseOrderItems: [poItem1],
      allReceiptItems: [
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 100,
          damagedQuantity: 10,
        },
      ],
      isFinalDelivery: false,
    });

    expect(result.poStatus).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
    expect(result.lineMetrics[0]).toMatchObject({
      totalReceivedQuantity: 100,
      totalDamagedQuantity: 10,
      totalAcceptedQuantity: 90,
      outstandingQuantity: 10,
    });
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0]).toMatchObject({
      category: ExceptionCategory.DAMAGED_GOODS,
      severity: ExceptionSeverity.MEDIUM,
      purchaseOrderItemId: 'po-item-1',
      productId: 'prod-1',
    });
  });

  it('raises HIGH severity DAMAGED_GOODS when >= 50% of received units are damaged', () => {
    const result = reconcile({
      purchaseOrderItems: [poItem1],
      allReceiptItems: [
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 20,
          damagedQuantity: 10,
        },
      ],
      isFinalDelivery: false,
    });

    expect(result.exceptions[0]).toMatchObject({
      category: ExceptionCategory.DAMAGED_GOODS,
      severity: ExceptionSeverity.HIGH,
    });
  });

  it('raises UNEXPECTED_ITEM when receipt contains a product not on the PO', () => {
    const result = reconcile({
      purchaseOrderItems: [poItem1, poItem2],
      allReceiptItems: [
        {
          purchaseOrderItemId: 'po-item-1',
          productId: 'prod-1',
          receivedQuantity: 100,
          damagedQuantity: 0,
        },
        {
          purchaseOrderItemId: 'po-item-2',
          productId: 'prod-2',
          receivedQuantity: 50,
          damagedQuantity: 0,
        },
        {
          purchaseOrderItemId: 'unknown-po-item',
          productId: 'unexpected-prod-99',
          receivedQuantity: 5,
          damagedQuantity: 0,
        },
      ],
      isFinalDelivery: false,
    });

    expect(result.poStatus).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0]).toMatchObject({
      category: ExceptionCategory.UNEXPECTED_ITEM,
      severity: ExceptionSeverity.HIGH,
      productId: 'unexpected-prod-99',
    });
  });

  it('classifies quantity discrepancy severities across all threshold bands', () => {
    const low = reconcile({
      purchaseOrderItems: [poItem1],
      allReceiptItems: [
        { purchaseOrderItemId: 'po-item-1', productId: 'prod-1', receivedQuantity: 103, damagedQuantity: 0 },
      ],
      isFinalDelivery: false,
    });
    const high = reconcile({
      purchaseOrderItems: [poItem1],
      allReceiptItems: [
        { purchaseOrderItemId: 'po-item-1', productId: 'prod-1', receivedQuantity: 115, damagedQuantity: 0 },
      ],
      isFinalDelivery: false,
    });

    expect(low.exceptions[0]?.severity).toBe(ExceptionSeverity.LOW); // 3% <= 5%
    expect(high.exceptions[0]?.severity).toBe(ExceptionSeverity.HIGH); // 15% > 10%
  });
});
