import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Card, EmptyState, ErrorNote, Loading, Screen, Subtitle, Title } from '../components/ui';
import { trpc } from '../lib/api';
import { useAuthStore } from '../store/store';

function urgencyColor(daysLeft: number) {
  if (daysLeft < 5) return { bar: 'bg-danger', text: 'text-danger', label: '#EF4444' };
  if (daysLeft < 8) return { bar: 'bg-warning', text: 'text-warning', label: '#F97316' };
  return { bar: 'bg-info', text: 'text-info', label: '#3B82F6' };
}

export default function RestockScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const query = trpc.dashboard.restockAll.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
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
          <Title className="text-[24px]">Restock urgency</Title>
          <Subtitle>Consumption rate vs. your typical reorder cadence</Subtitle>
        </View>
      </View>

      <ErrorNote message={query.error?.message} />

      {query.isLoading ? (
        <Loading label="Calculating urgency…" />
      ) : !query.data?.length ? (
        <EmptyState
          icon="hourglass-outline"
          title="Nothing to restock yet"
          subtitle="Products with stock levels and purchase history show up here."
        />
      ) : (
        <Card>
          {query.data.map((item, index) => {
            const tone = urgencyColor(item.daysLeft);
            return (
              <View
                key={item.productId}
                className={`flex-row items-center ${index === 0 ? '' : 'border-t border-line'} py-3.5`}>
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-canvas">
                  <Ionicons name="cube-outline" size={17} color={tone.label} />
                </View>
                <View className="flex-1 pr-3">
                  <Text numberOfLines={1} className="text-[14px] font-bold text-ink">
                    {item.name}
                  </Text>
                  <Text className="text-[11px] text-muted">{item.stockQty} left in stock</Text>
                  <View className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
                    <View
                      className={`h-full rounded-full ${tone.bar}`}
                      style={{ width: `${Math.min(Math.max(item.urgencyPct, 8), 100)}%` }}
                    />
                  </View>
                </View>
                <Text className={`text-[13px] font-extrabold ${tone.text}`}>
                  {item.daysLeft} day{item.daysLeft === 1 ? '' : 's'}
                </Text>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}
