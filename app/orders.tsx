import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import {
  Card,
  EmptyState,
  ErrorNote,
  Loading,
  Money,
  Screen,
  Subtitle,
  Title,
} from '../components/ui';
import { trpc } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { useAuthStore } from '../store/store';

export default function OrdersScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const query = trpc.procure.listOrders.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId, refetchOnMount: 'always' }
  );

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
          <Title className="text-[24px]">Order history</Title>
          <Subtitle>Finalized purchase orders</Subtitle>
        </View>
      </View>

      <ErrorNote message={query.error?.message} />

      {query.isLoading ? (
        <Loading label="Loading orders…" />
      ) : !query.data?.length ? (
        <EmptyState
          icon="receipt-outline"
          title="No orders yet"
          subtitle="Generate a purchase order and it will show up here — ready to export or re-order."
        />
      ) : (
        query.data.map((order) => (
          <Pressable
            key={order.id}
            onPress={() => router.push(`/order/${order.id}`)}
            className="mb-3">
            <Card className="active:bg-canvas">
              <View className="flex-row items-center">
                <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-brand-light">
                  <Ionicons name="receipt-outline" size={19} color="#5B7FA6" />
                </View>
                <View className="flex-1 pr-2">
                  <Text className="text-[15px] font-bold text-ink">
                    Order {order.id.slice(0, 8).toUpperCase()}
                  </Text>
                  <Text className="text-[12px] text-muted">
                    {formatDate(order.finalizedAt ?? order.createdAt)} · {order.lineCount} line
                    {order.lineCount === 1 ? '' : 's'}
                  </Text>
                </View>
                <View className="items-end">
                  <Money value={order.totalLow} className="text-[15px] font-extrabold" />
                  {order.totalMid > order.totalLow ? (
                    <Text className="text-[11px] text-success">
                      save {formatMoney(order.totalMid - order.totalLow)}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color="#94A3B8"
                  style={{ marginLeft: 6 }}
                />
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
