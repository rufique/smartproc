import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { ExportOrderActions } from '../../components/ExportOrderActions';
import { Card, ErrorNote, Loading, Money, Screen, Subtitle, Title } from '../../components/ui';
import { trpc } from '../../lib/api';
import type { ExportOrder } from '../../lib/export';
import { formatDate, formatMoney } from '../../lib/format';
import { useAuthStore } from '../../store/store';

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const workspaceName =
    useAuthStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.name) ??
    'SmartProc';
  const utils = trpc.useUtils();

  const [reordering, setReordering] = useState(false);

  const orderQuery = trpc.procure.getOrder.useQuery(
    { workspaceId: workspaceId!, orderId: id! },
    { enabled: !!workspaceId && !!id }
  );
  const draftQuery = trpc.procure.getDraft.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );
  const setLines = trpc.procure.setLines.useMutation();

  if (orderQuery.isLoading) {
    return (
      <Screen>
        <Loading label="Loading order…" />
      </Screen>
    );
  }

  if (orderQuery.error || !orderQuery.data) {
    return (
      <Screen>
        <ErrorNote message={orderQuery.error?.message ?? 'Order not found'} />
        <Pressable
          onPress={() => router.back()}
          className="h-12 items-center justify-center rounded-2xl border border-line bg-white">
          <Text className="text-[14px] font-semibold text-brand">Go back</Text>
        </Pressable>
      </Screen>
    );
  }

  const order = orderQuery.data;
  const savings = Math.max(order.totalMid - order.totalLow, 0);
  const reorderable = order.lines.filter((line) => line.productId || line.groupId);

  const exportOrder: ExportOrder = {
    orderId: order.id,
    createdAt: order.finalizedAt ?? order.createdAt,
    workspaceName,
    totalLow: order.totalLow,
    totalMid: order.totalMid,
    lines: order.lines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      vendorId: line.vendorId,
      vendorName: line.vendorName,
      unitPrice: line.unitPrice,
      lineTotalLow: line.lineTotal,
      lineTotalMid: line.lineTotal,
      nextVendorName: null,
      nextPrice: null,
    })),
  };

  const runReorder = async () => {
    if (!workspaceId) return;
    setReordering(true);
    try {
      await setLines.mutateAsync({
        workspaceId,
        lines: reorderable.map((line) => ({
          productId: line.productId ?? undefined,
          groupId: line.groupId ?? undefined,
          quantity: Math.max(line.quantity, 1),
          chosenVendorId: line.vendorId ?? null,
        })),
      });
      await utils.procure.getDraft.invalidate();
      router.push('/procure');
    } catch (error) {
      Alert.alert(
        'Could not re-order',
        error instanceof Error ? error.message : 'Please try again'
      );
    } finally {
      setReordering(false);
    }
  };

  const confirmReorder = () => {
    if (!reorderable.length) {
      Alert.alert('Nothing to re-order', 'This order has no product lines to re-order.');
      return;
    }
    if ((draftQuery.data?.lines.length ?? 0) > 0) {
      Alert.alert(
        'Replace current order?',
        'Your draft already has items. Re-ordering will replace them.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: () => void runReorder() },
        ]
      );
      return;
    }
    void runReorder();
  };

  return (
    <Screen>
      <View className="mb-5 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          className="mr-3 h-10 w-10 items-center justify-center rounded-full border border-line bg-white">
          <Ionicons name="chevron-back" size={20} color="#0F172B" />
        </Pressable>
        <View className="flex-1">
          <Title className="text-[24px]">Order {order.id.slice(0, 8).toUpperCase()}</Title>
          <Subtitle>{formatDate(order.finalizedAt ?? order.createdAt)}</Subtitle>
        </View>
      </View>

      {/* summary */}
      <Card className="mb-4">
        <View className="flex-row items-end">
          <View className="mr-3 h-11 w-11 items-center justify-center rounded-xl bg-brand-light">
            <Ionicons name="stats-chart" size={20} color="#5B7FA6" />
          </View>
          <View className="flex-1">
            <Text className="text-[11px] text-muted">Lowest possible total</Text>
            <Money value={order.totalLow} className="text-[22px] font-extrabold" />
          </View>
          <View className="items-end">
            <Text className="text-[11px] text-muted">Median-range total</Text>
            <Money value={order.totalMid} className="text-[18px] font-extrabold text-sub" />
          </View>
        </View>
        {savings > 0 ? (
          <View className="mt-3 flex-row items-center rounded-xl bg-[#DCFCE7] px-3 py-2">
            <Ionicons
              name="trending-down-outline"
              size={15}
              color="#16A34A"
              style={{ marginRight: 6 }}
            />
            <Text className="text-[12px] font-bold text-success">
              Saved {formatMoney(savings)} at lowest pricing
            </Text>
          </View>
        ) : null}
      </Card>

      {/* lines */}
      <Card className="mb-4">
        <Text className="mb-2 text-[13px] font-bold text-muted">
          {order.lines.length} LINE{order.lines.length === 1 ? '' : 'S'}
        </Text>
        {order.lines.map((line, index) => (
          <View
            key={line.lineId}
            className={`flex-row items-center py-2.5 ${index === 0 ? '' : 'border-t border-line'}`}>
            <View className="flex-1 pr-3">
              <Text numberOfLines={2} className="text-[14px] font-semibold text-ink">
                {line.label}
              </Text>
              <Text numberOfLines={1} className="text-[11px] text-muted">
                {line.vendorName}
                {line.kind === 'group' ? ' · substitute group' : ''}
              </Text>
              <Text className="text-[11px] text-muted">
                {line.quantity} × {formatMoney(line.unitPrice)}
              </Text>
            </View>
            <Money value={line.lineTotal} className="text-[14px] font-bold" />
          </View>
        ))}
      </Card>

      {/* export */}
      <Text className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Export</Text>
      <View className="mb-4">
        <ExportOrderActions order={exportOrder} />
      </View>

      <Pressable
        onPress={confirmReorder}
        disabled={reordering}
        className={`h-[52px] flex-row items-center justify-center rounded-2xl border border-line bg-white active:bg-canvas ${
          reordering ? 'opacity-60' : ''
        }`}>
        <Ionicons name="refresh" size={17} color="#5B7FA6" style={{ marginRight: 8 }} />
        <Text className="text-[15px] font-bold text-brand">Re-order these items</Text>
      </Pressable>
    </Screen>
  );
}
