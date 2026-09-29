import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import {
  Badge,
  Card,
  Divider,
  ErrorNote,
  Field,
  Loading,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../../components/ui';
import { trpc } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAuthStore } from '../../store/store';

type ProductDetail = {
  id: string;
  name: string;
  unit: string;
  category: string;
  stockQty: number | null;
  lowStockThreshold: number | null;
  updatedAt: string;
  groupId: string | null;
  group: { id: string; label: string } | null;
  groupMembers: { id: string; name: string }[];
  offers: { vendorId: string; vendorName: string; price: number }[];
};

type VendorOption = { id: string; name: string };
type ProductOption = { id: string; name: string; category: string };
type OfferState = {
  vendorId: string;
  vendorName: string;
  price: string;
  original: string;
  removed?: boolean;
};

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const utils = trpc.useUtils();

  const productQuery = trpc.catalog.getProduct.useQuery(
    { workspaceId: workspaceId!, productId: id! },
    { enabled: !!workspaceId && !!id }
  );
  const vendorsQuery = trpc.catalog.vendors.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );
  const [productLimit, setProductLimit] = useState(100);
  const productsQuery = trpc.catalog.listProducts.useQuery(
    { workspaceId: workspaceId!, limit: productLimit },
    { enabled: !!workspaceId }
  );
  const productItems = productsQuery.data?.items ?? [];
  const productTotal = productsQuery.data?.total ?? 0;
  const removeProduct = trpc.catalog.removeProduct.useMutation();

  const invalidate = async () => {
    await utils.catalog.getProduct.invalidate();
    await utils.catalog.listProducts.invalidate();
    await utils.catalog.vendors.invalidate();
    await utils.dashboard.summary.invalidate();
    await utils.procure.getDraft.invalidate();
    await utils.suggestions.list.invalidate();
  };

  const confirmDelete = (productName: string) => {
    if (!workspaceId || !id) return;
    Alert.alert('Delete product?', `${productName} will be removed from this workspace.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await removeProduct.mutateAsync({ workspaceId, productId: id });
          await invalidate();
          router.back();
        },
      },
    ]);
  };

  if (productQuery.isLoading) {
    return (
      <Screen>
        <Loading label="Loading product…" />
      </Screen>
    );
  }

  if (productQuery.error || !productQuery.data) {
    return (
      <Screen>
        <ErrorNote message={productQuery.error?.message ?? 'Product not found'} />
        <PrimaryButton label="Go back" onPress={() => router.back()} />
      </Screen>
    );
  }

  const loaded = productQuery.data;

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
          <Title className="text-[24px]">Product</Title>
          <Subtitle>Updated {formatDate(loaded.updatedAt)}</Subtitle>
        </View>
      </View>

      <ProductEditor
        key={loaded.id}
        product={loaded}
        workspaceId={workspaceId!}
        vendors={vendorsQuery.data ?? []}
        products={productItems}
        hasMore={productItems.length < productTotal}
        onLoadMore={() => setProductLimit((current) => current + 100)}
        onSaved={async () => {
          await invalidate();
          router.back();
        }}
      />

      <Pressable
        onPress={() => confirmDelete(loaded.name)}
        className="mt-4 h-12 items-center justify-center rounded-2xl border border-[#FECACA] bg-[#FEF2F2]">
        <Text className="text-[14px] font-bold text-danger">Delete product</Text>
      </Pressable>
    </Screen>
  );
}

function ProductEditor({
  product,
  workspaceId,
  vendors,
  products,
  hasMore,
  onLoadMore,
  onSaved,
}: {
  product: ProductDetail;
  workspaceId: string;
  vendors: VendorOption[];
  products: ProductOption[];
  hasMore: boolean;
  onLoadMore: () => void;
  onSaved: () => Promise<void>;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(product.name);
  const [category, setCategory] = useState(product.category);
  const [unit, setUnit] = useState(product.unit);
  const [stock, setStock] = useState(product.stockQty === null ? '' : String(product.stockQty));
  const [threshold, setThreshold] = useState(
    product.lowStockThreshold === null ? '' : String(product.lowStockThreshold)
  );
  const [offers, setOffers] = useState<OfferState[]>(
    product.offers.map((o) => ({
      vendorId: o.vendorId,
      vendorName: o.vendorName,
      price: o.price.toFixed(2),
      original: o.price.toFixed(2),
    }))
  );
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorPrice, setNewVendorPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupLabel, setGroupLabel] = useState(product.group?.label ?? '');
  const [groupSelection, setGroupSelection] = useState<string[]>(
    product.group ? [product.id, ...product.groupMembers.map((m) => m.id)] : []
  );
  const [groupError, setGroupError] = useState<string | null>(null);

  const updateProduct = trpc.catalog.updateProduct.useMutation();
  const setPrice = trpc.catalog.setPrice.useMutation();
  const removeOffer = trpc.catalog.removeOffer.useMutation();
  const saveGroup = trpc.catalog.saveGroup.useMutation();
  const removeGroup = trpc.catalog.removeGroup.useMutation();

  const updateOffer = (vendorId: string, patch: Partial<OfferState>) =>
    setOffers((list) => list.map((o) => (o.vendorId === vendorId ? { ...o, ...patch } : o)));

  const activeOffers = offers.filter((o) => !o.removed);
  const availableVendors = useMemo(() => {
    const existing = new Set(activeOffers.map((o) => o.vendorId));
    return vendors.filter((v) => !existing.has(v.id));
  }, [vendors, activeOffers]);

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Product name is required');
      return;
    }
    setSaving(true);
    try {
      const parsedStock = stock.trim() === '' ? null : Number(stock);
      const parsedThreshold = threshold.trim() === '' ? null : Number(threshold);
      if (
        (parsedStock !== null && !Number.isFinite(parsedStock)) ||
        (parsedThreshold !== null && !Number.isFinite(parsedThreshold))
      ) {
        throw new Error('Stock values must be numbers');
      }

      await updateProduct.mutateAsync({
        workspaceId,
        productId: product.id,
        name: name.trim(),
        category: category.trim(),
        unit: unit.trim(),
        stockQty: parsedStock,
        lowStockThreshold: parsedThreshold,
      });

      for (const offer of offers) {
        const next = Number(offer.price);
        if (offer.removed) {
          await removeOffer.mutateAsync({
            workspaceId,
            productId: product.id,
            vendorId: offer.vendorId,
          });
          continue;
        }
        if (!Number.isFinite(next)) continue;
        if (Math.abs(next - Number(offer.original)) > 0.001) {
          await setPrice.mutateAsync({
            workspaceId,
            productId: product.id,
            vendorId: offer.vendorId,
            price: next,
          });
        }
      }

      const addedPrice = Number(newVendorPrice);
      if (newVendorName.trim() && Number.isFinite(addedPrice) && addedPrice >= 0) {
        await setPrice.mutateAsync({
          workspaceId,
          productId: product.id,
          vendorName: newVendorName.trim(),
          price: addedPrice,
        });
      }

      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  const commitGroup = async () => {
    if (groupSelection.length < 2 || !groupLabel.trim()) {
      setGroupError('Pick at least two products and give the group a label');
      return;
    }
    setGroupError(null);
    await saveGroup.mutateAsync({
      workspaceId,
      groupId: product.groupId ?? undefined,
      label: groupLabel.trim(),
      productIds: groupSelection,
    });
    await utils.catalog.getProduct.invalidate();
    await utils.catalog.listProducts.invalidate();
    setGroupOpen(false);
  };

  const unlinkGroup = async () => {
    if (!product.groupId) return;
    await removeGroup.mutateAsync({ workspaceId, groupId: product.groupId });
    await utils.catalog.getProduct.invalidate();
    await utils.catalog.listProducts.invalidate();
    setGroupOpen(false);
  };

  return (
    <>
      <Card className="mb-4">
        <Field label="Name" value={name} onChangeText={setName} placeholder="Product name" />
        <Field
          label="Category"
          value={category}
          onChangeText={setCategory}
          placeholder="e.g. Antibiotic"
        />
        <Field label="Unit" value={unit} onChangeText={setUnit} placeholder="e.g. box, pack" />
        <View className="flex-row">
          <View className="mr-3 flex-1">
            <Field
              label="In stock"
              value={stock}
              onChangeText={setStock}
              placeholder="Qty"
              keyboardType="numeric"
            />
          </View>
          <View className="flex-1">
            <Field
              label="Low-stock at"
              value={threshold}
              onChangeText={setThreshold}
              placeholder="Qty"
              keyboardType="numeric"
            />
          </View>
        </View>
      </Card>

      <Card className="mb-4">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-[17px] font-bold text-ink">Vendors & prices</Text>
          <Badge
            label={`${activeOffers.length} offer${activeOffers.length === 1 ? '' : 's'}`}
            tone="neutral"
          />
        </View>

        {offers.map((offer) => (
          <View
            key={offer.vendorId}
            className={`flex-row items-center py-2 ${offer.removed ? 'opacity-40' : ''}`}>
            <View className="flex-1 pr-2">
              <Text numberOfLines={1} className="text-[14px] font-semibold text-ink">
                {offer.vendorName}
              </Text>
              <Text className="text-[11px] text-muted">was ${offer.original}</Text>
            </View>
            <View className="w-[104px]">
              <Field
                value={offer.price}
                onChangeText={(text) => updateOffer(offer.vendorId, { price: text })}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
            <Pressable
              onPress={() => updateOffer(offer.vendorId, { removed: !offer.removed })}
              hitSlop={8}
              className="ml-1 h-10 w-10 items-center justify-center rounded-xl bg-canvas">
              <Ionicons
                name={offer.removed ? 'refresh' : 'trash-outline'}
                size={16}
                color={offer.removed ? '#5B7FA6' : '#EF4444'}
              />
            </Pressable>
          </View>
        ))}

        <Divider />

        <Text className="mb-2 text-[13px] font-bold text-sub">Add a vendor</Text>
        {availableVendors.length ? (
          <View className="mb-2 flex-row flex-wrap">
            {availableVendors.map((v) => (
              <Pressable
                key={v.id}
                onPress={() => setNewVendorName(v.name)}
                className={`mb-2 mr-2 rounded-full border px-3 py-1.5 ${
                  newVendorName === v.name ? 'border-brand bg-brand' : 'border-line bg-white'
                }`}>
                <Text
                  className={`text-[12px] font-semibold ${newVendorName === v.name ? 'text-white' : 'text-sub'}`}>
                  {v.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Field
          value={newVendorName}
          onChangeText={setNewVendorName}
          placeholder="Vendor name"
          icon="storefront-outline"
          autoCapitalize="words"
        />
        <Field
          value={newVendorPrice}
          onChangeText={setNewVendorPrice}
          placeholder="Price (USD)"
          icon="pricetag-outline"
          keyboardType="decimal-pad"
        />
      </Card>

      <Card className="mb-4">
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-[17px] font-bold text-ink">Substitutes</Text>
          {product.group ? (
            <Badge label={`${product.groupMembers.length + 1} linked`} icon="link-outline" />
          ) : null}
        </View>
        <Text className="mb-3 text-[12px] leading-4 text-muted">
          Link differently-named products as functional substitutes — they count as one need when
          procuring.
        </Text>
        {product.group ? (
          <View className="mb-3">
            <Text className="text-[13px] font-bold text-ink">{product.group.label}</Text>
            {[{ id: product.id, name: product.name }, ...product.groupMembers].map((m) => (
              <Text key={m.id} className="mt-1 text-[13px] text-sub">
                • {m.name}
              </Text>
            ))}
          </View>
        ) : null}
        <Pressable
          onPress={() => setGroupOpen(true)}
          className="h-11 flex-row items-center justify-center rounded-xl border border-brand bg-brand-light">
          <Ionicons name="people-outline" size={16} color="#5B7FA6" style={{ marginRight: 6 }} />
          <Text className="text-[14px] font-bold text-brand">
            {product.group ? 'Edit substitutes' : 'Link substitutes'}
          </Text>
        </Pressable>
      </Card>

      <ErrorNote message={error} />

      <PrimaryButton label="Save changes" icon="checkmark" onPress={save} loading={saving} />

      {/* substitute group picker */}
      <Modal
        visible={groupOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setGroupOpen(false)}>
        <View className="flex-1 bg-canvas">
          <View className="flex-row items-center justify-between border-b border-line bg-white px-5 pb-4 pt-6">
            <Text className="text-[19px] font-extrabold text-ink">Link substitutes</Text>
            <Pressable onPress={() => setGroupOpen(false)} hitSlop={10}>
              <Text className="text-[15px] font-semibold text-link">Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <Card className="mb-4">
              <Field
                label="Group label"
                value={groupLabel}
                onChangeText={setGroupLabel}
                placeholder="e.g. Amoxicillin 500mg"
              />
              <Text className="mb-2 text-[13px] font-semibold text-sub">
                Select products ({groupSelection.length} selected)
              </Text>
              {products.map((row) => {
                const checked = groupSelection.includes(row.id);
                return (
                  <Pressable
                    key={row.id}
                    onPress={() =>
                      setGroupSelection((sel) =>
                        sel.includes(row.id) ? sel.filter((x) => x !== row.id) : [...sel, row.id]
                      )
                    }
                    className="flex-row items-center py-2.5">
                    <View
                      className={`mr-3 h-5 w-5 items-center justify-center rounded-md border ${
                        checked ? 'border-brand bg-brand' : 'border-line bg-white'
                      }`}>
                      {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                    </View>
                    <View className="flex-1">
                      <Text className="text-[14px] text-ink">{row.name}</Text>
                      <Text className="text-[11px] text-muted">
                        {row.category || 'Uncategorized'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              {hasMore ? (
                <Pressable
                  onPress={onLoadMore}
                  className="mt-2 h-11 items-center justify-center rounded-xl border border-line bg-white active:bg-canvas">
                  <Text className="text-[13px] font-bold text-brand">Load more products</Text>
                </Pressable>
              ) : null}
            </Card>

            <ErrorNote message={groupError} />

            <PrimaryButton label="Save group" onPress={commitGroup} loading={saveGroup.isPending} />

            {product.group ? (
              <Pressable
                onPress={unlinkGroup}
                className="mt-4 h-12 items-center justify-center rounded-2xl border border-line bg-white">
                <Text className="text-[14px] font-semibold text-danger">Unlink this group</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
