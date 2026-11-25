import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import {
  GoodsReceiptDto,
  PaginatedResponse,
  PresignAttachmentResponseDto,
  PurchaseOrderDto,
  PurchaseOrderStatus,
  RelatedRecordType,
} from '@opstrace/shared-types';
import { SubmitGoodsReceiptSchema } from '@opstrace/validation';
import { apiClient, ApiError, isNetworkError } from '@/lib/api-client';
import { enqueueOperation } from '@/lib/offline-queue';
import { useAuth } from '@/context/AuthContext';

interface LineDraft {
  purchaseOrderItemId: string;
  productId: string;
  sku: string;
  barcode: string | null;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: string;
  damagedQuantity: string;
  conditionNotes: string;
}

interface PendingPhoto {
  uri: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
}

export function ReceivingScreen() {
  const { isOnline, setIsOnline } = useAuth();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [orders, setOrders] = useState<PurchaseOrderDto[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPo, setSelectedPo] = useState<PurchaseOrderDto | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [receiptNumber, setReceiptNumber] = useState(
    () => `GR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    Crypto.randomUUID(),
  );
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);

  const [scannerOpen, setScannerOpen] = useState(false);
  const lastScanRef = useRef<{ value: string; timestamp: number }>({
    value: '',
    timestamp: 0,
  });

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadOpenPos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (search.trim()) params.set('search', search.trim());
      const res = await apiClient.get<PaginatedResponse<PurchaseOrderDto>>(
        `/purchase-orders?${params.toString()}`,
      );
      const open = res.data.filter(
        (po) =>
          po.status === PurchaseOrderStatus.ISSUED ||
          po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED,
      );
      setOrders(open);
      setIsOnline(true);
    } catch (err) {
      if (isNetworkError(err)) {
        setIsOnline(false);
      }
    } finally {
      setLoading(false);
    }
  }, [search, setIsOnline]);

  useEffect(() => {
    void loadOpenPos();
  }, [loadOpenPos]);

  const selectPo = async (poId: string) => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const detail = await apiClient.get<PurchaseOrderDto>(
        `/purchase-orders/${poId}`,
      );
      setSelectedPo(detail);
      setLines(
        (detail.items ?? []).map((item) => ({
          purchaseOrderItemId: item.id,
          productId: item.productId,
          sku: item.product?.sku ?? item.productId,
          barcode: item.product?.barcode ?? null,
          productName: item.product?.name ?? 'Product',
          orderedQuantity: item.orderedQuantity,
          receivedQuantity: String(item.orderedQuantity),
          damagedQuantity: '0',
          conditionNotes: '',
        })),
      );
      setReceiptNumber(
        `GR-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
      );
      setIdempotencyKey(Crypto.randomUUID());
      setPhotos([]);
    } catch (err) {
      Alert.alert(
        'Error',
        err instanceof ApiError ? err.message : 'Unable to load PO details.',
      );
    } finally {
      setLoading(false);
    }
  };

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
    // 2-second duplicate-scan debounce
    if (
      lastScanRef.current.value === data &&
      now - lastScanRef.current.timestamp < 2000
    ) {
      return;
    }
    lastScanRef.current = { value: data, timestamp: now };
    setScannerOpen(false);

    if (selectedPo) {
      const idx = lines.findIndex(
        (l) => l.barcode === data || l.sku.toLowerCase() === data.toLowerCase(),
      );
      if (idx >= 0) {
        const target = lines[idx]!;
        const nextQty = Number(target.receivedQuantity || '0') + 1;
        const next = [...lines];
        next[idx] = { ...target, receivedQuantity: String(nextQty) };
        setLines(next);
        setStatusMsg(`Scanned ${target.sku}: incremented received qty to ${nextQty}`);
      } else {
        Alert.alert('Not on PO', `Barcode "${data}" was not found on this PO.`);
      }
    } else {
      setSearch(data);
    }
  };

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotos((prev) => [
      ...prev,
      {
        uri: asset.uri,
        fileName: asset.fileName ?? `evidence-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: asset.fileSize ?? 50000,
      },
    ]);
  };

  const uploadPhotosForReceipt = async (goodsReceiptId: string) => {
    for (const photo of photos) {
      const presign = await apiClient.post<PresignAttachmentResponseDto>(
        '/attachments/presign',
        {
          relatedRecordType: RelatedRecordType.GOODS_RECEIPT,
          relatedRecordId: goodsReceiptId,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
        },
      );
      const fileResp = await fetch(photo.uri);
      const blob = await fileResp.blob();
      await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': photo.mimeType },
        body: blob,
      });
    }
  };

  const handleSubmit = async () => {
    if (!selectedPo) return;
    setStatusMsg(null);

    const payload = {
      purchaseOrderId: selectedPo.id,
      warehouseId: selectedPo.warehouseId,
      receiptNumber,
      receivedAt: new Date(),
      idempotencyKey,
      items: lines.map((line) => ({
        purchaseOrderItemId: line.purchaseOrderItemId,
        productId: line.productId,
        receivedQuantity: Number(line.receivedQuantity || '0'),
        damagedQuantity: Number(line.damagedQuantity || '0'),
        conditionNotes: line.conditionNotes.trim() || undefined,
      })),
    };

    const parsed = SubmitGoodsReceiptSchema.safeParse(payload);
    if (!parsed.success) {
      Alert.alert(
        'Validation Error',
        parsed.error.issues[0]?.message ?? 'Invalid receiving quantities.',
      );
      return;
    }

    setSubmitting(true);
    try {
      if (!isOnline) {
        await enqueueOperation('GOODS_RECEIPT_SUBMIT', parsed.data);
        setStatusMsg(
          `Offline: Receipt ${receiptNumber} queued in SQLite (${idempotencyKey.slice(0, 8)}).`,
        );
        setSelectedPo(null);
        return;
      }

      const created = await apiClient.post<GoodsReceiptDto>(
        '/goods-receipts',
        parsed.data,
      );
      if (photos.length > 0) {
        await uploadPhotosForReceipt(created.id);
      }
      setStatusMsg(`Receipt ${created.receiptNumber} reconciled successfully.`);
      setSelectedPo(null);
      await loadOpenPos();
    } catch (err) {
      if (isNetworkError(err)) {
        setIsOnline(false);
        await enqueueOperation('GOODS_RECEIPT_SUBMIT', parsed.data);
        setStatusMsg(
          `Network unreachable: Receipt ${receiptNumber} saved to Offline Sync Queue.`,
        );
        setSelectedPo(null);
      } else {
        Alert.alert(
          'Submission Failed',
          err instanceof ApiError ? err.message : 'Unable to submit receipt.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {statusMsg && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{statusMsg}</Text>
        </View>
      )}

      {!selectedPo ? (
        <View style={styles.section}>
          <Text style={styles.heading}>Select Open Purchase Order</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search PO number..."
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
          ) : orders.length === 0 ? (
            <Text style={styles.emptyText}>No open Purchase Orders found.</Text>
          ) : (
            orders.map((po) => (
              <TouchableOpacity
                key={po.id}
                style={styles.poCard}
                onPress={() => void selectPo(po.id)}
              >
                <View style={styles.poCardHeader}>
                  <Text style={styles.poNumber}>{po.poNumber}</Text>
                  <Text style={styles.poBadge}>{po.status}</Text>
                </View>
                <Text style={styles.poMeta}>
                  {po.supplier?.name ?? 'Supplier'} •{' '}
                  {po.warehouse?.code ?? 'Warehouse'}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.poCardHeader}>
            <Text style={styles.heading}>Receiving: {selectedPo.poNumber}</Text>
            <TouchableOpacity onPress={() => setSelectedPo(null)}>
              <Text style={styles.linkText}>Change PO</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Receipt Number</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={receiptNumber}
              onChangeText={setReceiptNumber}
            />
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => void handleOpenScanner()}
            >
              <Text style={styles.secondaryBtnText}>Scan SKU</Text>
            </TouchableOpacity>
          </View>

          {lines.map((line, idx) => (
            <View key={line.purchaseOrderItemId} style={styles.lineCard}>
              <Text style={styles.lineTitle}>
                {line.sku} — {line.productName}
              </Text>
              <Text style={styles.lineSub}>Expected: {line.orderedQuantity}</Text>

              <View style={styles.qtyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Received Qty</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={line.receivedQuantity}
                    onChangeText={(val) => {
                      const next = [...lines];
                      next[idx] = { ...line, receivedQuantity: val };
                      setLines(next);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smallLabel}>Damaged Qty</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={line.damagedQuantity}
                    onChangeText={(val) => {
                      const next = [...lines];
                      next[idx] = { ...line, damagedQuantity: val };
                      setLines(next);
                    }}
                  />
                </View>
              </View>

              <Text style={styles.smallLabel}>Condition Notes</Text>
              <TextInput
                style={styles.input}
                value={line.conditionNotes}
                onChangeText={(val) => {
                  const next = [...lines];
                  next[idx] = { ...line, conditionNotes: val };
                  setLines(next);
                }}
                placeholder="Optional damage/shortage notes..."
                placeholderTextColor="#94a3b8"
              />
            </View>
          ))}

          <View style={styles.photoSection}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => void handlePickPhoto()}
            >
              <Text style={styles.secondaryBtnText}>
                + Attach Evidence Photo ({photos.length})
              </Text>
            </TouchableOpacity>
            <ScrollView horizontal style={{ marginTop: 8 }}>
              {photos.map((p, i) => (
                <Image
                  key={i}
                  source={{ uri: p.uri }}
                  style={styles.thumb}
                />
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
            disabled={submitting}
            onPress={() => void handleSubmit()}
          >
            <Text style={styles.primaryBtnText}>
              {submitting
                ? 'Submitting...'
                : isOnline
                  ? 'Submit & Reconcile'
                  : 'Queue Offline Receipt'}
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
  section: { gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0f172a',
  },
  label: { fontSize: 13, fontWeight: '600', color: '#334155' },
  smallLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4 },
  poCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  poCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poNumber: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  poBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  poMeta: { fontSize: 13, color: '#64748b', marginTop: 4 },
  lineCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  lineTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  lineSub: { fontSize: 12, color: '#64748b' },
  qtyRow: { flexDirection: 'row', gap: 10 },
  photoSection: { marginTop: 4 },
  thumb: { width: 64, height: 64, borderRadius: 8, marginRight: 8 },
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
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#0f172a', fontSize: 13, fontWeight: '600' },
  linkText: { color: '#2563eb', fontSize: 13, fontWeight: '600' },
  banner: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { color: '#065f46', fontSize: 13, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#64748b', marginTop: 20 },
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
