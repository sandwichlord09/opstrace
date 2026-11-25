import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import {
  GoodsReceiptDto,
  StockInspectionDto,
  SyncBatchItemStatus,
  SyncBatchResponseDto,
} from '@opstrace/shared-types';
import {
  SubmitGoodsReceiptInput,
  SubmitStockInspectionInput,
} from '@opstrace/validation';
import { apiClient } from './api-client';

export type OfflineQueueStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
export type OfflineOperationType =
  | 'GOODS_RECEIPT_SUBMIT'
  | 'STOCK_INSPECTION_SUBMIT';

export interface OfflineQueueRecord {
  id: string;
  idempotencyKey: string;
  operationType: OfflineOperationType;
  payloadJson: string;
  status: OfflineQueueStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('opstrace_offline.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS offline_operations (
          id TEXT PRIMARY KEY NOT NULL,
          idempotency_key TEXT UNIQUE NOT NULL,
          operation_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

/**
 * Enqueue an offline Goods Receipt or Stock Inspection into SQLite
 * with a client-generated UUID `idempotencyKey`.
 */
export async function enqueueOperation(
  operationType: OfflineOperationType,
  payload: SubmitGoodsReceiptInput | SubmitStockInspectionInput,
): Promise<OfflineQueueRecord> {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const idempotencyKey = payload.idempotencyKey || Crypto.randomUUID();
  const now = new Date().toISOString();
  const payloadWithKey = { ...payload, idempotencyKey };
  const payloadJson = JSON.stringify(payloadWithKey);

  await db.runAsync(
    `INSERT INTO offline_operations
      (id, idempotency_key, operation_type, payload_json, status, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'PENDING', NULL, ?, ?)`,
    [id, idempotencyKey, operationType, payloadJson, now, now],
  );

  return {
    id,
    idempotencyKey,
    operationType,
    payloadJson,
    status: 'PENDING',
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listQueueItems(): Promise<OfflineQueueRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    idempotency_key: string;
    operation_type: OfflineOperationType;
    payload_json: string;
    status: OfflineQueueStatus;
    error_message: string | null;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM offline_operations ORDER BY created_at DESC');

  return rows.map((row) => ({
    id: row.id,
    idempotencyKey: row.idempotency_key,
    operationType: row.operation_type,
    payloadJson: row.payload_json,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function retryFailedItems(): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE offline_operations SET status = 'PENDING', error_message = NULL, updated_at = ? WHERE status = 'FAILED'`,
    [now],
  );
}

export async function clearSyncedItems(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM offline_operations WHERE status = 'SYNCED'`);
}

async function updateItemStatus(
  idempotencyKey: string,
  status: OfflineQueueStatus,
  errorMessage: string | null = null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE offline_operations SET status = ?, error_message = ?, updated_at = ? WHERE idempotency_key = ?`,
    [status, errorMessage, new Date().toISOString(), idempotencyKey],
  );
}

export interface SyncRunSummary {
  synced: number;
  duplicatesSkipped: number;
  failed: number;
}

/**
 * Sequentially flush all PENDING offline operations to `/sync/receiving`
 * and `/sync/inspections`. Updates each item's SQLite status safely.
 */
export async function syncPendingOperations(): Promise<SyncRunSummary> {
  const all = await listQueueItems();
  const pending = all
    .filter((item) => item.status === 'PENDING')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let synced = 0;
  let duplicatesSkipped = 0;
  let failed = 0;

  const receiptItems = pending.filter(
    (i) => i.operationType === 'GOODS_RECEIPT_SUBMIT',
  );
  const inspectionItems = pending.filter(
    (i) => i.operationType === 'STOCK_INSPECTION_SUBMIT',
  );

  if (receiptItems.length > 0) {
    for (const item of receiptItems) {
      await updateItemStatus(item.idempotencyKey, 'SYNCING');
    }
    try {
      const payloads = receiptItems.map(
        (i) => JSON.parse(i.payloadJson) as SubmitGoodsReceiptInput,
      );
      const res = await apiClient.post<SyncBatchResponseDto<GoodsReceiptDto>>(
        '/sync/receiving',
        { items: payloads },
      );
      for (const result of res.results) {
        if (result.status === SyncBatchItemStatus.SYNCED) {
          synced++;
          await updateItemStatus(result.idempotencyKey, 'SYNCED');
        } else if (result.status === SyncBatchItemStatus.DUPLICATE_SKIPPED) {
          duplicatesSkipped++;
          await updateItemStatus(result.idempotencyKey, 'SYNCED');
        } else {
          failed++;
          await updateItemStatus(
            result.idempotencyKey,
            'FAILED',
            result.error ?? 'Sync failed',
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      for (const item of receiptItems) {
        failed++;
        await updateItemStatus(item.idempotencyKey, 'FAILED', msg);
      }
    }
  }

  if (inspectionItems.length > 0) {
    for (const item of inspectionItems) {
      await updateItemStatus(item.idempotencyKey, 'SYNCING');
    }
    try {
      const payloads = inspectionItems.map(
        (i) => JSON.parse(i.payloadJson) as SubmitStockInspectionInput,
      );
      const res = await apiClient.post<SyncBatchResponseDto<StockInspectionDto>>(
        '/sync/inspections',
        { items: payloads },
      );
      for (const result of res.results) {
        if (result.status === SyncBatchItemStatus.SYNCED) {
          synced++;
          await updateItemStatus(result.idempotencyKey, 'SYNCED');
        } else if (result.status === SyncBatchItemStatus.DUPLICATE_SKIPPED) {
          duplicatesSkipped++;
          await updateItemStatus(result.idempotencyKey, 'SYNCED');
        } else {
          failed++;
          await updateItemStatus(
            result.idempotencyKey,
            'FAILED',
            result.error ?? 'Sync failed',
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      for (const item of inspectionItems) {
        failed++;
        await updateItemStatus(item.idempotencyKey, 'FAILED', msg);
      }
    }
  }

  return { synced, duplicatesSkipped, failed };
}
