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
import { formatDate, relTime } from '../lib/format';
import { useAuthStore } from '../store/store';

export default function PriceHistoryScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const query = trpc.dashboard.priceFeed.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  let lastDay = '';

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
          <Title className="text-[24px]">Price changes</Title>
          <Subtitle>Every recorded change from your uploaded price lists</Subtitle>
        </View>
      </View>

      <ErrorNote message={query.error?.message} />

      {query.isLoading ? (
        <Loading label="Loading history…" />
      ) : !query.data?.length ? (
        <EmptyState
          icon="swap-horizontal-outline"
          title="No price changes yet"
          subtitle="Upload a price list to start the feed."
        />
      ) : (
        query.data.map((change) => {
          const day = formatDate(change.recordedAt);
          const showHeader = day !== lastDay;
          lastDay = day;
          const direction = change.changePct > 0 ? 'up' : change.changePct < 0 ? 'down' : 'flat';
          const icon =
            direction === 'up' ? 'arrow-up' : direction === 'down' ? 'arrow-down' : 'remove';
          const iconBg =
            direction === 'up'
              ? 'bg-[#FEE2E2]'
              : direction === 'down'
                ? 'bg-[#DCFCE7]'
                : 'bg-canvas';
          const iconColor =
            direction === 'up' ? '#EF4444' : direction === 'down' ? '#16A34A' : '#94A3B8';
          const badgeTone =
            direction === 'up'
              ? 'bg-[#FEE2E2] text-danger'
              : direction === 'down'
                ? 'bg-[#DCFCE7] text-success'
                : 'bg-canvas text-muted';

          return (
            <View key={change.id}>
              {showHeader ? (
                <Text className="mb-2 mt-1 text-[12px] font-bold uppercase tracking-wide text-muted">
                  {day}
                </Text>
              ) : null}
              <Card className="mb-3 flex-row items-center">
                <View
                  className={`mr-3 h-10 w-10 items-center justify-center rounded-full ${iconBg}`}>
                  <Ionicons name={icon} size={18} color={iconColor} />
                </View>
                <View className="flex-1 pr-2">
                  <Text numberOfLines={1} className="text-[14px] font-bold text-ink">
                    {change.productName}
                  </Text>
                  <Text numberOfLines={1} className="text-[12px] text-muted">
                    {change.vendorName} · {relTime(change.recordedAt)}
                  </Text>
                </View>
                <View className="items-end">
                  <View className="flex-row items-center">
                    {change.previousPrice !== null ? (
                      <>
                        <Money
                          value={change.previousPrice}
                          className="text-[12px] text-muted line-through"
                        />
                        <Text className="mx-1 text-[12px] text-muted">→</Text>
                      </>
                    ) : null}
                    <Money value={change.price} className="text-[14px] font-extrabold" />
                  </View>
                  <View className={`mt-1 rounded-full px-2 py-0.5 ${badgeTone.split(' ')[0]}`}>
                    <Text className={`text-[11px] font-bold ${badgeTone.split(' ')[1]}`}>
                      {direction === 'up'
                        ? `+${change.changePct}%`
                        : direction === 'down'
                          ? `${change.changePct}%`
                          : 'No change'}
                    </Text>
                  </View>
                </View>
              </Card>
            </View>
          );
        })
      )}
    </Screen>
  );
}
