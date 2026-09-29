import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Platform, Pressable, Text, View } from 'react-native';

import { Card, ErrorNote, Field, PrimaryButton, Screen } from '../components/ui';
import { trpc } from '../lib/api';
import { useAuthStore } from '../store/store';

type Phase = 'choose' | 'processing' | 'review' | 'done';

type ReviewRow = {
  rowId: string;
  name: string;
  price: string;
  vendorName: string;
  quantity: string;
  skipped: boolean;
  matchedProductName: string | null;
};

const STEPS = ['Uploading file…', 'Extracting product rows…', 'Matching against your catalog…'];

/**
 * Read a picked/captured file as base64.
 *
 * The legacy `readAsStringAsync` fails on Android under Expo Go with
 * "Location ... isn't readable": its Java permission check rejects file paths
 * inside Expo Go's own data directory, where pickers copy picked files
 * (expo/expo#18760, expo/expo#21792). The new File API (SDK 54+) is not
 * affected — it reads file:// paths it owns and content:// URIs via
 * ContentResolver, bypassing the broken legacy check. It also accepts
 * DocumentPicker's `content://` URI directly on Android.
 *
 * Strategy: prefer the new File API; fall back to the legacy call when it is
 * unavailable or fails (web, older runtimes, unexpected edge cases).
 */
async function readFileAsBase64(uri: string): Promise<string> {
  try {
    const file = new File(uri);
    return await file.base64();
  } catch {
    return readAsStringAsync(uri, { encoding: 'base64' });
  }
}

function detectFileType(name: string, mime?: string | null): 'image' | 'pdf' | 'excel' {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) return 'excel';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'heic', 'webp'].includes(ext) || mime?.startsWith('image/'))
    return 'image';
  return 'excel';
}

export default function UploadScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const utils = trpc.useUtils();

  const [phase, setPhase] = useState<Phase>('choose');
  const [fileTag, setFileTag] = useState('');
  const [fileName, setFileName] = useState('');
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [demoPreview, setDemoPreview] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<{ created: number; updated: number; total: number } | null>(
    null
  );
  const [progress] = useState(() => new Animated.Value(0));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const createUpload = trpc.uploads.create.useMutation();
  const updateRow = trpc.uploads.updateRow.useMutation();
  const commitUpload = trpc.uploads.commit.useMutation();
  const discardUpload = trpc.uploads.discard.useMutation();

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
    },
    []
  );

  const animateProgress = (to: number, duration = 650) => {
    Animated.timing(progress, { toValue: to, duration, useNativeDriver: false }).start();
  };

  const beginProcessing = async (payload: {
    name: string;
    type: 'image' | 'pdf' | 'excel';
    base64: string;
  }) => {
    if (!workspaceId) return;
    setError(null);
    setFileName(payload.name);
    setPhase('processing');
    setStep(0);
    progress.setValue(0);
    animateProgress(0.33, 500);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setStep((s) => {
        const next = Math.min(s + 1, STEPS.length - 1);
        animateProgress((next + 1) / STEPS.length);
        return next;
      });
    }, 850);

    try {
      const response = await createUpload.mutateAsync({
        workspaceId,
        fileName: payload.name,
        fileType: payload.type,
        base64: payload.base64,
        taggedVendorName: fileTag.trim() || undefined,
      });
      if (timerRef.current) clearInterval(timerRef.current);
      animateProgress(1, 300);
      setUploadId(response.uploadId);
      setDemoPreview(response.demoPreview);
      setRows(
        response.rows.map((r) => ({
          rowId: r.rowId ?? '',
          name: r.name,
          price: r.price === null ? '' : String(r.price),
          vendorName: r.vendorName ?? '',
          quantity: r.quantity ?? '',
          skipped: false,
          matchedProductName: r.matchedProductName,
        }))
      );
      setTimeout(() => setPhase('review'), 350);
    } catch (err) {
      if (timerRef.current) clearInterval(timerRef.current);
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPhase('choose');
    }
  };

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is needed to scan price lists');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    const base64 = asset.base64 ?? (await readFileAsBase64(asset.uri));
    await beginProcessing({ name: asset.fileName ?? 'scan.jpg', type: 'image', base64 });
  };

  const openLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    const base64 = asset.base64 ?? (await readFileAsBase64(asset.uri));
    await beginProcessing({ name: asset.fileName ?? 'price-list.jpg', type: 'image', base64 });
  };

  const startScan = () => {
    Alert.alert(
      'Scan price list',
      'Capture a supplier price sheet with the camera, or pick an existing photo.',
      [
        { text: 'Take photo', onPress: () => void openCamera() },
        { text: 'Choose photo', onPress: () => void openLibrary() },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/png',
        'image/jpeg',
      ],
      // Android/Expo Go: the legacy FS permission service rejects files copied
      // into Expo Go's data dir ("Location ... isn't readable"), so keep the
      // picked document's content:// URI instead of a cache copy. The new File
      // API reads content:// URIs via ContentResolver without that check.
      copyToCacheDirectory: Platform.OS !== 'android',
      multiple: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    // Web populates asset.base64 directly; native goes through readFileAsBase64.
    const base64 = asset.base64 ?? (await readFileAsBase64(asset.uri));
    await beginProcessing({
      name: asset.name ?? 'price-list',
      type: detectFileType(asset.name ?? '', asset.mimeType),
      base64,
    });
  };

  const patchRow = (index: number, patch: Partial<ReviewRow>) =>
    setRows((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const commit = async () => {
    if (!workspaceId || !uploadId) return;
    setError(null);
    const included = rows.filter((r) => !r.skipped);
    if (!included.length) {
      setError('Keep at least one row to commit');
      return;
    }
    try {
      // Persist edits first — commit applies whatever is stored server-side.
      await Promise.all(
        rows
          .filter((r) => r.rowId)
          .map((r) =>
            updateRow.mutateAsync({
              workspaceId,
              rowId: r.rowId,
              name: r.name.trim() || 'Unnamed product',
              price: r.price.trim() === '' ? null : Number(r.price),
              vendorName: r.vendorName.trim() || null,
              quantity: r.quantity.trim() || null,
              status: r.skipped ? 'skipped' : 'confirmed',
            })
          )
      );
      const res = await commitUpload.mutateAsync({ workspaceId, uploadId });
      setResult({ created: res.created, updated: res.updated, total: res.total });
      await utils.dashboard.summary.invalidate();
      await utils.catalog.listProducts.invalidate();
      await utils.uploads.recent.invalidate();
      await utils.suggestions.list.invalidate();
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not commit rows');
    }
  };

  const discard = async () => {
    if (workspaceId && uploadId) {
      try {
        await discardUpload.mutateAsync({ workspaceId, uploadId });
      } catch {
        /* best effort */
      }
    }
    router.back();
  };

  const includedCount = rows.filter((r) => !r.skipped).length;

  /* ------------------------------------------------------------- choose */
  if (phase === 'choose') {
    return (
      <Screen>
        <Header
          onBack={() => router.back()}
          title="Upload price list"
          subtitle="Scan-style capture or a plain file pick."
        />

        <Card className="mb-4">
          <Field
            label="Tag a vendor (optional)"
            value={fileTag}
            onChangeText={setFileTag}
            placeholder="e.g. MedSup Ltd — used if rows omit the vendor"
            icon="storefront-outline"
            autoCapitalize="words"
          />
        </Card>

        <ErrorNote message={error} />

        <Pressable
          onPress={startScan}
          className="mb-4 overflow-hidden rounded-3xl border border-brand bg-brand p-5 active:bg-brand-dark">
          <View className="flex-row items-center">
            <View className="mr-4 h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
              <Ionicons name="scan-outline" size={26} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-[17px] font-extrabold text-white">Scan price list</Text>
              <Text className="mt-0.5 text-[13px] text-white/80">
                Point the camera at a price sheet — live progress as we extract.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </View>
          <View className="mt-4 flex-row items-center rounded-xl bg-white/15 px-3 py-2">
            <Ionicons name="camera-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
            <Text className="text-[12px] text-white/90">
              JPEG · PNG · works best on flat, well-lit sheets
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={pickFile}
          className="mb-4 rounded-3xl border border-line bg-white p-5 active:bg-canvas">
          <View className="flex-row items-center">
            <View className="mr-4 h-12 w-12 items-center justify-center rounded-2xl bg-brand-light">
              <Ionicons name="document-attach-outline" size={24} color="#5B7FA6" />
            </View>
            <View className="flex-1">
              <Text className="text-[17px] font-extrabold text-ink">Choose file</Text>
              <Text className="mt-0.5 text-[13px] text-muted">
                PDF, Excel (.xlsx) or CSV — rows are parsed for real.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </View>
        </Pressable>

        <View className="rounded-2xl border border-dashed border-line bg-white px-4 py-3">
          <Text className="text-[12px] leading-5 text-muted">
            Every extraction lands in review first — nothing touches your catalog until you confirm
            the rows.
          </Text>
        </View>
      </Screen>
    );
  }

  /* --------------------------------------------------------- processing */
  if (phase === 'processing') {
    const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
      <Screen>
        <Header onBack={() => {}} title="Extracting…" subtitle={fileName} />
        <Card className="mb-4">
          <View className="mb-4 h-40 items-center justify-center rounded-2xl border border-line bg-canvas">
            <Ionicons name="document-text-outline" size={44} color="#5B7FA6" />
            <Text numberOfLines={1} className="mt-2 px-6 text-[13px] text-sub">
              {fileName}
            </Text>
            {/* scan beam */}
            <Animated.View
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                height: 2,
                backgroundColor: '#5B7FA6',
                opacity: 0.7,
                transform: [
                  {
                    translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 150] }),
                  },
                ],
              }}
            />
          </View>

          <View className="mb-4 h-2.5 w-full overflow-hidden rounded-full bg-line">
            <Animated.View
              style={{ width, height: '100%', backgroundColor: '#5B7FA6', borderRadius: 999 }}
            />
          </View>

          {STEPS.map((label, i) => (
            <View key={label} className="flex-row items-center py-1.5">
              {i < step ? (
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color="#16A34A"
                  style={{ marginRight: 10 }}
                />
              ) : i === step ? (
                <Ionicons
                  name="ellipse"
                  size={12}
                  color="#5B7FA6"
                  style={{ marginLeft: 3, marginRight: 13 }}
                />
              ) : (
                <View style={{ width: 18, marginRight: 10 }} />
              )}
              <Text
                className={`text-[14px] ${i <= step ? 'font-semibold text-ink' : 'text-muted'}`}>
                {label}
              </Text>
            </View>
          ))}
        </Card>
        <Text className="text-center text-[12px] text-muted">
          Keep the app open while we read your file.
        </Text>
      </Screen>
    );
  }

  /* ------------------------------------------------------------- commit */
  if (phase === 'done' && result) {
    return (
      <Screen>
        <Header onBack={() => router.back()} title="Committed" subtitle={fileName} />
        <Card className="mb-4 items-center py-8">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-[#DCFCE7]">
            <Ionicons name="checkmark" size={34} color="#16A34A" />
          </View>
          <Text className="text-[18px] font-extrabold text-ink">{result.total} rows committed</Text>
          <Text className="mt-1 text-center text-[13px] text-sub">
            {result.created} new product{result.created === 1 ? '' : 's'} created · {result.updated}{' '}
            price
            {result.updated === 1 ? '' : 's'} updated
          </Text>
        </Card>

        <PrimaryButton
          label="View catalog"
          icon="list-outline"
          onPress={() => router.replace('/catalog')}
        />
        <Pressable
          onPress={() => {
            setPhase('choose');
            setRows([]);
            setResult(null);
            setUploadId(null);
          }}
          className="mt-4 h-12 items-center justify-center rounded-2xl border border-line bg-white">
          <Text className="text-[14px] font-semibold text-brand">Upload another list</Text>
        </Pressable>
      </Screen>
    );
  }

  /* ------------------------------------------------------------- review */
  return (
    <Screen>
      <Header
        onBack={discard}
        title="Review extracted rows"
        subtitle={`${rows.length} rows from ${fileName}`}
      />

      {demoPreview ? (
        <View className="mb-4 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5">
          <View className="flex-row items-center">
            <Ionicons name="flask-outline" size={16} color="#B45309" style={{ marginRight: 8 }} />
            <Text className="flex-1 text-[13px] font-bold text-[#B45309]">
              Demo extraction preview
            </Text>
          </View>
          <Text className="mt-1 text-[12px] leading-4 text-[#92400E]">
            AI OCR is not connected in this build, so image/PDF scans return a labeled preview based
            on your catalog. Excel and CSV files are parsed for real. Review and correct every row
            below before committing.
          </Text>
        </View>
      ) : null}

      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[13px] text-sub">
          <Text className="font-bold text-ink">{includedCount}</Text> of {rows.length} rows included
        </Text>
        <Pressable
          onPress={() => setRows((list) => list.map((r) => ({ ...r, skipped: false })))}
          hitSlop={8}>
          <Text className="text-[13px] font-semibold text-link">Include all</Text>
        </Pressable>
      </View>

      <ErrorNote message={error} />

      {rows.map((row, index) => (
        <Card
          key={row.rowId || String(index)}
          className={`mb-3 ${row.skipped ? 'opacity-55' : ''}`}>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-[12px] font-bold text-muted">ROW {index + 1}</Text>
            <Pressable
              onPress={() => patchRow(index, { skipped: !row.skipped })}
              className={`flex-row items-center rounded-full px-3 py-1 ${row.skipped ? 'bg-canvas' : 'bg-[#DCFCE7]'}`}>
              <Ionicons
                name={row.skipped ? 'close-circle-outline' : 'checkmark-circle'}
                size={13}
                color={row.skipped ? '#94A3B8' : '#16A34A'}
                style={{ marginRight: 4 }}
              />
              <Text
                className={`text-[11px] font-bold ${row.skipped ? 'text-muted' : 'text-success'}`}>
                {row.skipped ? 'Skipped' : 'Will commit'}
              </Text>
            </Pressable>
          </View>

          <Field
            value={row.name}
            onChangeText={(text) => patchRow(index, { name: text })}
            placeholder="Product name"
          />
          <View className="flex-row">
            <View className="mr-3 flex-1">
              <Field
                value={row.price}
                onChangeText={(text) => patchRow(index, { price: text })}
                placeholder="Unit price"
                keyboardType="decimal-pad"
              />
            </View>
            <View className="flex-1">
              <Field
                value={row.quantity}
                onChangeText={(text) => patchRow(index, { quantity: text })}
                placeholder="Qty / pack"
                autoCapitalize="none"
              />
            </View>
          </View>
          <Field
            value={row.vendorName}
            onChangeText={(text) => patchRow(index, { vendorName: text })}
            placeholder="Vendor"
            icon="storefront-outline"
            autoCapitalize="words"
          />

          {row.matchedProductName && row.matchedProductName !== row.name ? (
            <View className="flex-row items-center">
              <Ionicons
                name="git-merge-outline"
                size={13}
                color="#5B7FA6"
                style={{ marginRight: 6 }}
              />
              <Text className="flex-1 text-[11px] text-brand">
                Looks like existing product “{row.matchedProductName}”
              </Text>
            </View>
          ) : row.matchedProductName ? (
            <View className="flex-row items-center">
              <Ionicons
                name="checkmark-circle-outline"
                size={13}
                color="#16A34A"
                style={{ marginRight: 6 }}
              />
              <Text className="flex-1 text-[11px] text-success">
                Matches catalog — price will be updated
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center">
              <Ionicons
                name="add-circle-outline"
                size={13}
                color="#94A3B8"
                style={{ marginRight: 6 }}
              />
              <Text className="flex-1 text-[11px] text-muted">
                New product — will be added to your catalog
              </Text>
            </View>
          )}
        </Card>
      ))}

      <PrimaryButton
        label={`Commit ${includedCount} product${includedCount === 1 ? '' : 's'}`}
        icon="cloud-upload-outline"
        onPress={commit}
        loading={commitUpload.isPending}
        className="mt-2"
      />
      <Pressable
        onPress={discard}
        className="mt-4 h-12 items-center justify-center rounded-2xl border border-line bg-white">
        <Text className="text-[14px] font-semibold text-danger">Discard upload</Text>
      </Pressable>
    </Screen>
  );
}

function Header({
  onBack,
  title,
  subtitle,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="mb-5 flex-row items-center">
      <Pressable
        onPress={onBack}
        hitSlop={10}
        className="mr-3 h-10 w-10 items-center justify-center rounded-full border border-line bg-white">
        <Ionicons name="chevron-back" size={20} color="#0F172B" />
      </Pressable>
      <View className="flex-1">
        <Text className="text-[24px] font-extrabold text-ink">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-[13px] text-muted">{subtitle}</Text> : null}
      </View>
    </View>
  );
}
