import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LoginScreen } from '@/screens/LoginScreen';
import { ReceivingScreen } from '@/screens/ReceivingScreen';
import { InspectionScreen } from '@/screens/InspectionScreen';
import { SyncQueueScreen } from '@/screens/SyncQueueScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';

type TabKey = 'receive' | 'inspect' | 'sync' | 'profile';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'receive', label: 'Receive PO' },
  { key: 'inspect', label: 'Inspect' },
  { key: 'sync', label: 'Sync Queue' },
  { key: 'profile', label: 'Profile' },
];

function MobileShell() {
  const { user, activeWarehouse, isOnline, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('receive');

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.topBar}>
        <View>
          <Text style={styles.orgName}>{user.organizationName}</Text>
          <Text style={styles.whName}>
            {activeWarehouse ? `${activeWarehouse.code} • ${activeWarehouse.name}` : 'No warehouse selected'}
          </Text>
        </View>
        <View
          style={[
            styles.netBadge,
            { backgroundColor: isOnline ? '#065f46' : '#991b1b' },
          ]}
        >
          <Text style={styles.netText}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {activeTab === 'receive' && <ReceivingScreen />}
        {activeTab === 'inspect' && <InspectionScreen />}
        {activeTab === 'sync' && <SyncQueueScreen />}
        {activeTab === 'profile' && <ProfileScreen />}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MobileShell />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0f172a' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  topBar: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orgName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  whName: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  netBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  netText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  body: { flex: 1, backgroundColor: '#f8fafc' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#0f172a',
  },
  tabLabel: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  tabLabelActive: { color: '#0f172a', fontWeight: '700' },
});
