import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BrandHeader } from '../../components/BrandHeader';
import { TrendChart } from '../../components/TrendChart';
import {
  Card,
  EmptyState,
  ErrorNote,
  IconTile,
  Loading,
  PrimaryButton,
  Screen,
  SectionHeader,
} from '../../components/ui';
import { trpc } from '../../lib/api';
import { relTime } from '../../lib/format';
import { useAuthStore } from '../../store/store';

type Range = '6m' | '1y' | 'all';

const RANGES: { key: Range; label: string }[] = [
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'ALL' },
];

export default function SuggestionsScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const utils = trpc.useUtils();
  const [range, setRange] = useState<Range>('6m');
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const suggestions = trpc.suggestions.list.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId, refetchOnMount: 'always' }
  );
  const trend = trpc.suggestions.trend.useQuery(
    { workspaceId: workspaceId!, range },
    { enabled: !!workspaceId }
  );
  const recentUploads = trpc.uploads.recent.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );
  const draft = trpc.procure.getDraft.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const addLines = trpc.procure.addLines.useMutation({
    onError: (err) => setError(err.message),
  });

  const draftProductIds = new Set(
    (draft.data?.lines ?? []).map((l) => l.productId).filter(Boolean)
  );

  const addOne = async (productId: string, qty: number) => {
    if (!workspaceId) return;
    setError(null);
    try {
      await addLines.mutateAsync({
        workspaceId,
        lines: [{ productId, quantity: Math.max(qty, 1) }],
      });
      setAddedIds((ids) => (ids.includes(productId) ? ids : [...ids, productId]));
      await utils.procure.getDraft.invalidate();
      await utils.suggestions.list.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to order');
    }
  };

  const addAll = async () => {
    if (!workspaceId || !suggestions.data?.length) return;
    setError(null);
    try {
      await addLines.mutateAsync({
        workspaceId,
        lines: suggestions.data.map((s) => ({
          productId: s.productId,
          quantity: Math.max(s.typicalQty, 1),
        })),
      });
      await utils.procure.getDraft.invalidate();
      await utils.suggestions.list.invalidate();
      router.push('/procure');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to order');
    }
  };

  const latestUpload = recentUploads.data?.[0];
  const items = suggestions.data ?? [];

  if (!workspaceId) {
    return (
      <Screen>
        <BrandHeader />
        <EmptyState
          icon="business-outline"
          title="No workspace selected"
          subtitle="Pick a workspace from Profile."
        />
      </Screen>
    );
  }

  if (suggestions.isLoading) {
    return (
      <Screen>
        <BrandHeader />
        <Loading label="Crunching your purchase history…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <BrandHeader />

      {latestUpload ? (
        <Pressable
          onPress={() => router.push('/upload')}
          className="mb-4 rounded-3xl border border-line bg-white p-4 active:bg-canvas">
          <View className="flex-row items-center">
            <IconTile name="document-text-outline" tint="bg-[#E6F0FB]" color="#3B82F6" size={44} />
            <View className="mx-3 flex-1">
              <Text className="text-[14px] font-bold text-ink">
                Price list updated {relTime(latestUpload.createdAt)} —
              </Text>
              <Text className="text-[12px] text-muted">here&apos;s what you may be missing</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </View>
        </Pressable>
      ) : null}

      <ErrorNote message={error} />

      <Card className="mb-4">
        <SectionHeader
          title="You usually buy these too"
          subtitle="Based on your purchase history"
        />
        {items.length ? (
          items.map((item, index) => {
            const onOrder =
              draftProductIds.has(item.productId) || addedIds.includes(item.productId);
            return (
              <View key={item.productId} className={index === 0 ? '' : 'border-t border-line'}>
                <Pressable
                  onPress={() => !onOrder && void addOne(item.productId, item.typicalQty)}
                  className="flex-row items-center py-3 active:opacity-70">
                  <IconTile
                    name={onOrder ? 'checkmark-circle' : 'cube-outline'}
                    tint={onOrder ? 'bg-[#DCFCE7]' : 'bg-brand-light'}
                    color={onOrder ? '#16A34A' : '#5B7FA6'}
                  />
                  <View className="mx-3 flex-1">
                    <Text numberOfLines={1} className="text-[14px] font-bold text-ink">
                      {item.name}
                    </Text>
                    <Text numberOfLines={2} className="text-[12px] text-muted">
                      {item.cadenceText}
                    </Text>
                  </View>
                  {onOrder ? (
                    <View className="flex-row items-center rounded-full bg-[#DCFCE7] px-2.5 py-1">
                      <Ionicons
                        name="checkmark"
                        size={11}
                        color="#16A34A"
                        style={{ marginRight: 3 }}
                      />
                      <Text className="text-[11px] font-bold text-success">On order</Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center rounded-full border border-brand bg-white px-2.5 py-1">
                      <Ionicons name="add" size={12} color="#5B7FA6" style={{ marginRight: 2 }} />
                      <Text className="text-[11px] font-bold text-brand">Add</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })
        ) : (
          <Text className="text-[13px] text-muted">
            No regular restock patterns yet — generate a couple of orders and suggestions will
            appear here.
          </Text>
        )}
      </Card>

      <Card className="mb-5">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[17px] font-bold text-ink">Monthly quantity trend</Text>
          <View className="flex-row rounded-full bg-canvas p-1">
            {RANGES.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => setRange(r.key)}
                className={`rounded-full px-2.5 py-1 ${range === r.key ? 'bg-brand' : ''}`}>
                <Text
                  className={`text-[11px] font-bold ${range === r.key ? 'text-white' : 'text-muted'}`}>
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {trend.isLoading ? (
          <Loading label="Loading trend…" />
        ) : (
          <TrendChart months={trend.data?.months ?? []} series={trend.data?.series ?? []} />
        )}
      </Card>

      <PrimaryButton
        label="Add all to order"
        icon="cart-outline"
        onPress={addAll}
        loading={addLines.isPending}
        disabled={!items.length}
      />
    </Screen>
  );
}
