import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';

import {
  Chip,
  EmptyState,
  ErrorNote,
  Loading,
  LoadMore,
  Money,
  Screen,
  Subtitle,
  Title,
} from '../../components/ui';
import { trpc } from '../../lib/api';
import { useAuthStore } from '../../store/store';

type ProductRow = {
  id: string;
  name: string;
  category: string;
  groupId: string | null;
  linkedCount: number;
  isLowStock: boolean;
  lowestPrice: number | null;
  offers: { vendorId: string; vendorName: string; price: number }[];
};

type Filter = 'all' | 'grouped' | 'ungrouped' | 'low';

const PAGE_SIZE = 50;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'grouped', label: 'Grouped' },
  { key: 'ungrouped', label: 'Ungrouped' },
  { key: 'low', label: 'Low stock' },
];

function categoryIcon(category: string): {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  color: string;
} {
  const c = category.toLowerCase();
  if (c.includes('antibiotic') || c.includes('analgesic'))
    return { icon: 'medkit-outline', tint: 'bg-[#E7EEF7]', color: '#5B7FA6' };
  if (c.includes('medical') || c.includes('glove'))
    return { icon: 'hand-left-outline', tint: 'bg-[#F1EAFB]', color: '#8B5CF6' };
  if (c.includes('iv') || c.includes('fluid') || c.includes('antiseptic'))
    return { icon: 'water-outline', tint: 'bg-[#E6F3FB]', color: '#0EA5E9' };
  if (c.includes('consumable'))
    return { icon: 'layers-outline', tint: 'bg-[#E9F4E4]', color: '#16A34A' };
  return { icon: 'cube-outline', tint: 'bg-canvas', color: '#64748B' };
}

function ProductItem({ product, onPress }: { product: ProductRow; onPress: () => void }) {
  const icon = categoryIcon(product.category);
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center border-b border-line py-3 last:border-b-0 active:bg-canvas">
      <View
        className={`mr-3 h-10 w-10 items-center justify-center rounded-xl ${product.groupId ? 'bg-brand-light' : icon.tint}`}>
        <Ionicons
          name={product.groupId ? 'link-outline' : icon.icon}
          size={19}
          color={product.groupId ? '#5B7FA6' : icon.color}
        />
      </View>
      <View className="flex-1 pr-2">
        <Text numberOfLines={1} className="text-[14px] font-bold text-ink">
          {product.name}
        </Text>
        <Text numberOfLines={1} className="text-[12px] text-muted">
          {product.category || 'Uncategorized'}
          {product.isLowStock ? <Text className="text-danger"> • Low stock</Text> : '  •  In stock'}
        </Text>
        {product.linkedCount > 0 ? (
          <View className="mt-1 flex-row items-center self-start rounded-full bg-[#E3EDFB] px-2 py-0.5">
            <Ionicons name="people-outline" size={10} color="#2F6FEB" style={{ marginRight: 3 }} />
            <Text className="text-[10px] font-semibold text-link">
              {product.linkedCount} linked substitute{product.linkedCount === 1 ? '' : 's'}
            </Text>
          </View>
        ) : null}
      </View>
      <Money value={product.lowestPrice} className="text-[15px] font-extrabold" />
      <Ionicons name="chevron-forward" size={16} color="#94A3B8" style={{ marginLeft: 6 }} />
    </Pressable>
  );
}

export default function CatalogScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [limit, setLimit] = useState(PAGE_SIZE);

  // A changed query starts a fresh page window.
  const updateSearch = (text: string) => {
    setSearch(text);
    setLimit(PAGE_SIZE);
  };
  const updateFilter = (next: Filter) => {
    setFilter(next);
    setLimit(PAGE_SIZE);
  };

  const products = trpc.catalog.listProducts.useQuery(
    { workspaceId: workspaceId!, search: search || undefined, filter, limit },
    { enabled: !!workspaceId, refetchOnMount: 'always' }
  );

  const items = products.data?.items ?? [];
  const hasMore = items.length < (products.data?.total ?? 0);
  const loadMore = () => {
    if (hasMore && !products.isFetching) setLimit((current) => current + PAGE_SIZE);
  };

  const vendors = trpc.catalog.vendors.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const sections = useMemo(() => {
    const rows = (products.data?.items ?? []) as ProductRow[];
    const vendorList = vendors.data ?? [];
    const byVendor = new Map<string, { vendorId: string; name: string; items: ProductRow[] }>();
    for (const vendor of vendorList)
      byVendor.set(vendor.id, { vendorId: vendor.id, name: vendor.name, items: [] });

    for (const row of rows) {
      // Each product is listed under its cheapest vendor (that vendor shows its price).
      const primary = row.offers[0];
      const vendorId = primary?.vendorId ?? '__unassigned__';
      if (!byVendor.has(vendorId)) {
        byVendor.set(vendorId, { vendorId, name: primary?.vendorName ?? 'Unassigned', items: [] });
      }
      byVendor.get(vendorId)!.items.push(row);
    }

    const unassigned = byVendor.get('__unassigned__');
    const list = [...byVendor.values()].filter((s) => s.items.length);
    if (unassigned && unassigned.items.length) unassigned.name = 'No vendor yet';
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [products.data, vendors.data]);

  if (!workspaceId) {
    return (
      <Screen>
        <Title>Catalog</Title>
        <Subtitle>Products, prices and suppliers.</Subtitle>
        <View className="mt-6">
          <EmptyState
            icon="business-outline"
            title="No workspace selected"
            subtitle="Pick a workspace from Profile."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen onEndReached={loadMore}>
      <View className="mb-4">
        <Title>Catalog</Title>
        <Subtitle>Products, prices and suppliers.</Subtitle>
      </View>

      {/* search */}
      <View className="mb-3 flex-row items-center rounded-2xl border border-line bg-white px-3.5">
        <Ionicons name="search" size={17} color="#94A3B8" />
        <TextInput
          value={search}
          onChangeText={updateSearch}
          placeholder="Search products"
          placeholderTextColor="#94A3B8"
          returnKeyType="search"
          className="ml-2 flex-1 py-3 text-[15px] text-ink"
        />
        {search ? (
          <Pressable onPress={() => updateSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

      {/* filters */}
      <View className="mb-4 flex-row">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            onPress={() => updateFilter(f.key)}
          />
        ))}
      </View>

      <ErrorNote message={products.error?.message ?? vendors.error?.message} />

      {products.isLoading ? (
        <Loading label="Loading catalog…" />
      ) : sections.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title={search ? 'No products match your search' : 'Your catalog is empty'}
          subtitle={
            search
              ? 'Try a different name or clear the filters.'
              : 'Tap + to add a product, or upload a price list.'
          }
        />
      ) : (
        sections.map((section) => {
          const isCollapsed = collapsed[section.vendorId];
          return (
            <View key={section.vendorId} className="mb-4">
              <Pressable
                onPress={() =>
                  setCollapsed((c) => ({ ...c, [section.vendorId]: !c[section.vendorId] }))
                }
                className="mb-2 flex-row items-center justify-between">
                <Text className="text-[15px] font-bold text-ink">{section.name}</Text>
                <View className="flex-row items-center">
                  <Text className="mr-1.5 text-[12px] text-muted">
                    {section.items.length} product{section.items.length === 1 ? '' : 's'}
                  </Text>
                  <Ionicons
                    name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                    size={15}
                    color="#94A3B8"
                  />
                </View>
              </Pressable>
              {!isCollapsed ? (
                <View className="rounded-3xl border border-line bg-white px-4">
                  {section.items.map((product) => (
                    <ProductItem
                      key={product.id}
                      product={product}
                      onPress={() => router.push(`/product/${product.id}`)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })
      )}

      <LoadMore visible={hasMore && products.isFetching} label="Loading more products…" />

      {/* FAB */}
      <Pressable
        onPress={() => router.push('/product/new')}
        className="absolute bottom-16 right-2 h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg active:bg-brand-dark"
        style={{
          shadowColor: '#0F172B',
          shadowOpacity: 0.2,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },
          elevation: 6,
        }}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </Screen>
  );
}
