import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import {
  exportOrderExcel,
  exportOrderPdf,
  saveOrderExcel,
  saveOrderPdf,
  type ExportOrder,
} from '../lib/export';
import { PrimaryButton } from './ui';

type Action = 'share-pdf' | 'share-excel' | 'save-pdf' | 'save-excel';

/** Share-sheet and save-to-device actions for a purchase order. */
export function ExportOrderActions({ order }: { order: ExportOrder }) {
  const [busy, setBusy] = useState<Action | null>(null);

  const run = async (action: Action, task: () => Promise<unknown>) => {
    setBusy(action);
    try {
      await task();
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Could not export the file'
      );
    } finally {
      setBusy(null);
    }
  };

  const save = (action: Action, task: () => Promise<unknown>, label: string) =>
    void run(action, async () => {
      await task();
      Alert.alert('Saved', `The ${label} file was saved to the folder you chose.`);
    });

  return (
    <>
      <PrimaryButton
        label="Share as PDF"
        icon="share-outline"
        onPress={() => void run('share-pdf', () => exportOrderPdf(order))}
        loading={busy === 'share-pdf'}
        className="mb-3"
      />
      <PrimaryButton
        label="Share as Excel"
        icon="share-outline"
        onPress={() => void run('share-excel', () => exportOrderExcel(order))}
        loading={busy === 'share-excel'}
        className="mb-3"
      />

      <Text className="mb-2 text-[13px] font-semibold text-sub">Export to device</Text>
      <View className="flex-row">
        <SaveButton
          label="Save PDF"
          loading={busy === 'save-pdf'}
          onPress={() => save('save-pdf', () => saveOrderPdf(order), 'PDF')}
        />
        <View className="w-3" />
        <SaveButton
          label="Save Excel"
          loading={busy === 'save-excel'}
          onPress={() => save('save-excel', () => saveOrderExcel(order), 'Excel')}
        />
      </View>
    </>
  );
}

function SaveButton({
  label,
  loading,
  onPress,
}: {
  label: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className={`h-[52px] flex-1 flex-row items-center justify-center rounded-2xl border border-brand bg-white active:bg-brand-light ${
        loading ? 'opacity-60' : ''
      }`}>
      <Ionicons name="download-outline" size={17} color="#5B7FA6" style={{ marginRight: 7 }} />
      <Text className="text-[14px] font-bold text-brand">{label}</Text>
    </Pressable>
  );
}
