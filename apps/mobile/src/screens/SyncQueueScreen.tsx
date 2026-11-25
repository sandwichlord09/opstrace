import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  clearSyncedItems,
  listQueueItems,
  OfflineQueueRecord,
  retryFailedItems,
  syncPendingOperations,
  SyncRunSummary,
} from '@/lib/offline-queue';

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: '#fef3c7', fg: '#92400e' },
  SYNCING: { bg: '#dbeafe', fg: '#1e40af' },
  SYNCED: { bg: '#d1fae5', fg: '#065f46' },
  FAILED: { bg: '#fee2e2', fg: '#991b1b' },
};

export function SyncQueueScreen() {
  const [items, setItems] = useState<OfflineQueueRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncRunSummary | null>(null);

  const refresh = useCallback(async () => {
    const rows = await listQueueItems();
    setItems(rows);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await syncPendingOperations();
      setSummary(res);
      await refresh();
    } finally {
      setSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    await retryFailedItems();
    await refresh();
  };

  const handleClearSynced = async () => {
    await clearSyncedItems();
    await refresh();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Offline SQLite Sync Queue</Text>
      <Text style={styles.subtext}>
        Queued receipts and cycle counts are stamped with unique UUID
        idempotency keys for safe retries.
      </Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.primaryBtn, syncing && { opacity: 0.6 }]}
          disabled={syncing}
          onPress={() => void handleSyncNow()}
        >
          {syncing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryBtnText}>Sync Now</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => void handleRetryFailed()}
        >
          <Text style={styles.secondaryBtnText}>Retry Failed</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => void handleClearSynced()}
        >
          <Text style={styles.secondaryBtnText}>Clear Synced</Text>
        </TouchableOpacity>
      </View>

      {summary && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>
            Sync Run: {summary.synced} synced, {summary.duplicatesSkipped}{' '}
            duplicates skipped, {summary.failed} failed.
          </Text>
        </View>
      )}

      {items.length === 0 ? (
        <Text style={styles.emptyText}>No offline operations in queue.</Text>
      ) : (
        items.map((item) => {
          const colors = STATUS_COLORS[item.status] ?? {
            bg: '#f1f5f9',
            fg: '#334155',
          };
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.opType}>{item.operationType}</Text>
                <View
                  style={[styles.badge, { backgroundColor: colors.bg }]}
                >
                  <Text style={[styles.badgeText, { color: colors.fg }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.keyText}>
                Key: {item.idempotencyKey}
              </Text>
              <Text style={styles.timeText}>
                Created: {new Date(item.createdAt).toLocaleString()}
              </Text>
              {item.errorMessage && (
                <Text style={styles.errText}>Error: {item.errorMessage}</Text>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtext: { fontSize: 13, color: '#64748b' },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  primaryBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryBtnText: { color: '#0f172a', fontSize: 13, fontWeight: '600' },
  summaryBox: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  summaryText: { fontSize: 13, fontWeight: '600', color: '#1e40af' },
  emptyText: { textAlign: 'center', color: '#64748b', marginTop: 24 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  opType: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  keyText: { fontSize: 11, color: '#475569' },
  timeText: { fontSize: 11, color: '#64748b' },
  errText: { fontSize: 12, color: '#b91c1c', fontWeight: '600', marginTop: 4 },
});
