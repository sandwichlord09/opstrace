import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';

export function ProfileScreen() {
  const {
    user,
    warehouses,
    activeWarehouse,
    setActiveWarehouse,
    isOnline,
    setIsOnline,
    logout,
  } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Operator</Text>
        <Text style={styles.value}>
          {user?.firstName} {user?.lastName} ({user?.role})
        </Text>
        <Text style={styles.sub}>{user?.email}</Text>

        <Text style={[styles.label, { marginTop: 14 }]}>Organization</Text>
        <Text style={styles.value}>{user?.organizationName}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Active Warehouse</Text>
        {warehouses.length === 0 ? (
          <Text style={styles.sub}>No warehouses available</Text>
        ) : (
          warehouses.map((wh) => {
            const selected = activeWarehouse?.id === wh.id;
            return (
              <TouchableOpacity
                key={wh.id}
                style={[styles.whRow, selected && styles.whRowSelected]}
                onPress={() => setActiveWarehouse(wh)}
              >
                <Text style={styles.whText}>
                  {wh.code} — {wh.name}
                </Text>
                {selected && <Text style={styles.activeTag}>ACTIVE</Text>}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Network Mode</Text>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => setIsOnline(!isOnline)}
        >
          <Text style={styles.secondaryBtnText}>
            {isOnline
              ? 'Online (Tap to Simulate Offline)'
              : 'Offline Mode (Tap to Go Online)'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={() => void logout()}
      >
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  value: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 13, color: '#475569' },
  whRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 6,
  },
  whRowSelected: {
    borderColor: '#0f172a',
    backgroundColor: '#f1f5f9',
  },
  whText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  activeTag: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: '#b91c1c', fontSize: 15, fontWeight: '700' },
});
