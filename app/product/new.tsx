import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  Card,
  ErrorNote,
  Field,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../../components/ui';
import { trpc } from '../../lib/api';
import { useAuthStore } from '../../store/store';

export default function NewProductScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const utils = trpc.useUtils();

  const vendorsQuery = trpc.catalog.vendors.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [stock, setStock] = useState('');
  const [threshold, setThreshold] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createProduct = trpc.catalog.createProduct.useMutation({
    onSuccess: async () => {
      await utils.catalog.listProducts.invalidate();
      await utils.dashboard.summary.invalidate();
      router.back();
    },
    onError: (err) => setError(err.message),
  });

  const submit = () => {
    setError(null);
    if (!workspaceId) return;
    if (!name.trim()) {
      setError('Product name is required');
      return;
    }
    const parsedStock = stock.trim() === '' ? null : Number(stock);
    const parsedThreshold = threshold.trim() === '' ? null : Number(threshold);
    const parsedPrice = price.trim() === '' ? null : Number(price);
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setError('Price must be a positive number');
      return;
    }
    const chosenVendor = (vendorsQuery.data ?? []).find((v) => v.id === vendorName);
    createProduct.mutate({
      workspaceId,
      name: name.trim(),
      category: category.trim() || undefined,
      unit: unit.trim() || undefined,
      stockQty: parsedStock,
      lowStockThreshold: parsedThreshold,
      vendorId: chosenVendor?.id,
      vendorName: chosenVendor ? undefined : vendorName.trim() || undefined,
      price: parsedPrice,
    });
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
          <Title className="text-[24px]">New product</Title>
          <Subtitle>Add it manually, or upload a price list to bulk import.</Subtitle>
        </View>
      </View>

      <Card className="mb-4">
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Amoxicillin 500mg"
        />
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
              label="In stock (optional)"
              value={stock}
              onChangeText={setStock}
              placeholder="Qty"
              keyboardType="numeric"
            />
          </View>
          <View className="flex-1">
            <Field
              label="Low-stock at (optional)"
              value={threshold}
              onChangeText={setThreshold}
              placeholder="Qty"
              keyboardType="numeric"
            />
          </View>
        </View>
      </Card>

      <Card className="mb-4">
        <Text className="mb-3 text-[17px] font-bold text-ink">First offer (optional)</Text>
        <Text className="mb-2 text-[13px] font-semibold text-sub">Vendor</Text>
        <View className="mb-3 flex-row flex-wrap">
          {(vendorsQuery.data ?? []).map((vendor) => (
            <Pressable
              key={vendor.id}
              onPress={() => setVendorName(vendor.id)}
              className={`mb-2 mr-2 rounded-full border px-3 py-1.5 ${
                vendorName === vendor.id ? 'border-brand bg-brand' : 'border-line bg-white'
              }`}>
              <Text
                className={`text-[12px] font-semibold ${vendorName === vendor.id ? 'text-white' : 'text-sub'}`}>
                {vendor.name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setVendorName('')}
            className={`mb-2 mr-2 rounded-full border px-3 py-1.5 ${
              vendorName === '' && vendorsQuery.data?.length
                ? 'border-brand bg-brand'
                : 'border-line bg-white'
            }`}>
            <Text className="text-[12px] font-semibold text-sub">New / none</Text>
          </Pressable>
        </View>
        <Field
          value={
            vendorName && !(vendorsQuery.data ?? []).some((v) => v.id === vendorName)
              ? vendorName
              : ''
          }
          onChangeText={setVendorName}
          placeholder="Vendor name (or pick one above)"
          icon="storefront-outline"
          autoCapitalize="words"
        />
        <Field
          value={price}
          onChangeText={setPrice}
          placeholder="Unit price (USD)"
          icon="pricetag-outline"
          keyboardType="decimal-pad"
        />
      </Card>

      <ErrorNote message={error} />

      <PrimaryButton
        label="Add product"
        icon="add"
        onPress={submit}
        loading={createProduct.isPending}
      />
    </Screen>
  );
}
