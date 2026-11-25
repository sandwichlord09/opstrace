import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import {
  PaginatedResponse,
  ProductDto,
  StockInspectionDto,
} from '@opstrace/shared-types';
import { SubmitStockInspectionSchema } from '@opstrace/validation';
import { apiClient, ApiError, isNetworkError } from '@/lib/api-client';
import { enqueueOperation } from '@/lib/offline-queue';
import { useAuth } from '@/context/AuthContext';

export function InspectionScreen() {
  const { activeWarehouse, isOnline, setIsOnline } = useAuth();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [products, setProducts] = useState<ProductDto[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ProductDto | null>(null);
  const [physicalQuantity, setPhysicalQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultBanner, setResultBanner] = useState<{
    message: string;
    isVariance: boolean;
  } | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const lastScanRef = useRef<{ value: string; timestamp: number }>({
    value: '',
    timestamp: 0,
  });

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiClient.get<PaginatedResponse<ProductDto>>(
        `/products?${params.toString()}`,
      );
      setProducts(res.data);
      setIsOnline(true);
    } catch (err) {
      if (isNetworkError(err)) setIsOnline(false);
    } finally {
      setLoading(false);
    }
  }, [search, setIsOnline]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const handleOpenScanner = async () => {
    if (!cameraPermission?.granted) {
      const perm = await requestCameraPermission();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Camera access is needed to scan barcodes.');
        return;
      }
    }
    setScannerOpen(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    const now = Date.now();
    if (
      lastScanRef.current.value === data &&
      now - lastScanRef.current.timestamp < 2000
    ) {
      return;
    }
    lastScanRef.current = { value: data, timestamp: now };
    setScannerOpen(false);
    setSearch(data);
    const match = products.find(
      (p) => p.barcode === data || p.sku.toLowerCase() === data.toLowerCase(),
    );
    if (match) setSelectedProduct(match);
  };

  const handleSubmit = async () => {
    if (!activeWarehouse) {
      Alert.alert('No Warehouse', 'Select an active warehouse in Profile.');
      return;
    }
    if (!selectedProduct) {
      Alert.alert('No Product', 'Select a product to inspect.');
      return;
    }

    setResultBanner(null);
    const payload = {
      warehouseId: activeWarehouse.id,
      productId: selectedProduct.id,
      physicalQuantity: Number(physicalQuantity),
      inspectedAt: new Date(),
      notes: notes.trim() || undefined,
      idempotencyKey: Crypto.randomUUID(),
    };

    const parsed = SubmitStockInspectionSchema.safeParse(payload);
    if (!parsed.success) {
      Alert.alert(
        'Validation Error',
        parsed.error.issues[0]?.message ?? 'Invalid inspection input.',
      );
      return;
    }

    setSubmitting(true);
    try {
      if (!isOnline) {
        await enqueueOperation('STOCK_INSPECTION_SUBMIT', parsed.data);
        setResultBanner({
          message: `Offline: Cycle count for ${selectedProduct.sku} queued in SQLite.`,
          isVariance: false,
        });
        setSelectedProduct(null);
        setPhysicalQuantity('');
        setNotes('');
        return;
      }

      const res = await apiClient.post<StockInspectionDto>(
        '/stock-inspections',
        parsed.data,
      );
      if (res.variance !== 0) {
        setResultBanner({
          message: `Variance detected (${res.variance}): Recorded ${res.recordedQuantity}, Physical ${res.physicalQuantity}. INVENTORY_VARIANCE exception raised.`,
          isVariance: true,
        });
      } else {
        setResultBanner({
          message: `Cycle count matched (${res.physicalQuantity} units). Status: ACCEPTED.`,
          isVariance: false,
        });
      }
      setSelectedProduct(null);
      setPhysicalQuantity('');
      setNotes('');
    } catch (err) {
      if (isNetworkError(err)) {
        setIsOnline(false);
        await enqueueOperation('STOCK_INSPECTION_SUBMIT', parsed.data);
        setResultBanner({
          message: `Network unreachable: Cycle count queued for offline sync.`,
          isVariance: false,
        });
      } else {
        Alert.alert(
          'Submission Failed',
          err instanceof ApiError ? err.message : 'Unable to submit inspection.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {resultBanner && (
        <View
          style={[
            styles.banner,
            resultBanner.isVariance ? styles.bannerWarn : styles.bannerOk,
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              resultBanner.isVariance ? { color: '#991b1b' } : { color: '#065f46' },
            ]}
          >
            {resultBanner.message}
          </Text>
        </View>
      )}

      <Text style={styles.heading}>Physical Stock Inspection</Text>
      <Text style={styles.subtext}>
        Warehouse: {activeWarehouse ? `${activeWarehouse.code} — ${activeWarehouse.name}` : 'None selected'}
      </Text>

      {!selectedProduct ? (
        <View style={{ gap: 10, marginTop: 10 }}>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search SKU, name, or barcode..."
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => void handleOpenScanner()}
            >
              <Text style={styles.secondaryBtnText}>Scan</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 20 }} />
          ) : (
            products.map((prod) => (
              <TouchableOpacity
                key={prod.id}
                style={styles.card}
                onPress={() => setSelectedProduct(prod)}
              >
                <Text style={styles.sku}>{prod.sku}</Text>
                <Text style={styles.prodName}>{prod.name}</Text>
                {prod.barcode && (
                  <Text style={styles.barcode}>Barcode: {prod.barcode}</Text>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : (
        <View style={styles.formCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.sku}>{selectedProduct.sku}</Text>
            <TouchableOpacity onPress={() => setSelectedProduct(null)}>
              <Text style={styles.linkText}>Change SKU</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.prodName}>{selectedProduct.name}</Text>

          <Text style={styles.label}>Physical Counted Quantity</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={physicalQuantity}
            onChangeText={setPhysicalQuantity}
            placeholder="0"
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.label}>Inspection Notes</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional bin/aisle notes..."
            placeholderTextColor="#94a3b8"
          />

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
            disabled={submitting}
            onPress={() => void handleSubmit()}
          >
            <Text style={styles.primaryBtnText}>
              {submitting
                ? 'Submitting...'
                : isOnline
                  ? 'Submit Cycle Count'
                  : 'Queue Offline Count'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={scannerOpen} animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            onBarcodeScanned={handleBarcodeScanned}
          />
          <TouchableOpacity
            style={styles.closeCamBtn}
            onPress={() => setScannerOpen(false)}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Close Scanner</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtext: { fontSize: 13, color: '#64748b', marginTop: 2 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 12,
    gap: 10,
  },
  sku: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  prodName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  barcode: { fontSize: 12, color: '#64748b', marginTop: 2 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginTop: 4 },
  primaryBtn: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryBtnText: { color: '#0f172a', fontSize: 13, fontWeight: '600' },
  linkText: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  banner: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  bannerOk: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  bannerWarn: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  bannerText: { fontSize: 13, fontWeight: '600' },
  closeCamBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 99,
  },
});
