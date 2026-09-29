import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { BrandHeader } from '../../components/BrandHeader';
import { ExportOrderActions } from '../../components/ExportOrderActions';
import {
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  Money,
  PrimaryButton,
  Screen,
  SectionHeader,
} from '../../components/ui';
import { trpc } from '../../lib/api';
import type { ExportOrder } from '../../lib/export';
import { formatMoney } from '../../lib/format';
import { useAuthStore } from '../../store/store';

type DraftLine = {
  lineId: string;
  productId: string | null;
  groupId: string | null;
  label: string;
  kind: 'product' | 'group';
  quantity: number;
  chosenVendorId: string | null;
  offers: { vendorId: string; vendorName: string; price: number }[];
  lowest: { vendorId: string; vendorName: string; price: number } | null;
  next: { vendorId: string; vendorName: string; price: number } | null;
  effective: { vendorId: string; vendorName: string; price: number } | null;
  lineTotalLow: number;
  lineTotalMid: number;
};

type Draft = { orderId: string | null; lines: DraftLine[]; totalLow: number; totalMid: number };

const EMPTY: Draft = { orderId: null, lines: [], totalLow: 0, totalMid: 0 };

export default function ProcureScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const utils = trpc.useUtils();

  const draftQuery = trpc.procure.getDraft.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId, refetchOnMount: 'always' }
  );
  const [productLimit, setProductLimit] = useState(100);
  const productsQuery = trpc.catalog.listProducts.useQuery(
    { workspaceId: workspaceId!, limit: productLimit },
    { enabled: !!workspaceId }
  );
  const groupsQuery = trpc.catalog.groups.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId }
  );

  const draft = (draftQuery.data ?? EMPTY) as Draft;
  const productItems = productsQuery.data?.items ?? [];
  const productTotal = productsQuery.data?.total ?? 0;

  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState<
    { key: string; kind: 'product' | 'group'; id: string; qty: number }[]
  >([]);
  const [activeLine, setActiveLine] = useState<DraftLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<ExportOrder | null>(null);

  const setLines = trpc.procure.setLines.useMutation();
  const updateLine = trpc.procure.updateLine.useMutation();
  const removeLine = trpc.procure.removeLine.useMutation();
  const generate = trpc.procure.generate.useMutation();

  const enterEdit = () => {
    setSelection(
      draft.lines.map((line) => ({
        key: `${line.kind}:${line.groupId ?? line.productId}`,
        kind: line.kind,
        id: (line.groupId ?? line.productId)!,
        qty: line.quantity,
      }))
    );
    setEditing(true);
  };

  const toggle = (kind: 'product' | 'group', id: string) =>
    setSelection((sel) => {
      const key = `${kind}:${id}`;
      const exists = sel.some((s) => s.key === key);
      if (exists) return sel.filter((s) => s.key !== key);
      return [...sel, { key, kind, id, qty: 1 }];
    });

  const saveSelection = async () => {
    if (!workspaceId) return;
    setError(null);
    try {
      await setLines.mutateAsync({
        workspaceId,
        lines: selection.map((s) => ({
          productId: s.kind === 'product' ? s.id : undefined,
          groupId: s.kind === 'group' ? s.id : undefined,
          quantity: s.qty,
        })),
      });
      await utils.procure.getDraft.invalidate();
      await utils.suggestions.list.invalidate();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save selection');
    }
  };

  const doGenerate = async () => {
    if (!workspaceId) return;
    setError(null);
    try {
      const order = await generate.mutateAsync({ workspaceId });
      const workspaceName =
        useAuthStore.getState().workspaces.find((w) => w.id === workspaceId)?.name ?? 'SmartProc';
      setGenerated({
        orderId: order.orderId,
        createdAt: order.finalizedAt,
        workspaceName,
        totalLow: order.totalLow,
        totalMid: order.totalMid,
        lines: order.lines.map((l) => ({
          label: l.label,
          quantity: l.quantity,
          vendorId: l.vendorId,
          vendorName: l.vendorName,
          unitPrice: l.unitPrice,
          lineTotalLow: l.lineTotalLow,
          lineTotalMid: l.lineTotalMid,
          nextVendorName: l.nextVendorName,
          nextPrice: l.nextPrice,
        })),
      });
      await utils.procure.getDraft.invalidate();
      await utils.dashboard.summary.invalidate();
      await utils.suggestions.trend.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the order');
    }
  };

  const savings = useMemo(
    () => Math.max(draft.totalMid - draft.totalLow, 0),
    [draft.totalLow, draft.totalMid]
  );

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

  if (draftQuery.isLoading) {
    return (
      <Screen>
        <BrandHeader />
        <Loading label="Loading your draft order…" />
      </Screen>
    );
  }

  /* ------------------------------------------------------ generated PO */
  if (generated) {
    return (
      <Screen>
        <BrandHeader />
        <Card className="mb-4 items-center py-8">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-[#DCFCE7]">
            <Ionicons name="checkmark" size={34} color="#16A34A" />
          </View>
          <Text className="text-[19px] font-extrabold text-ink">Purchase order generated</Text>
          <Text className="mt-1 text-center text-[13px] text-sub">
            {generated.lines.length} lines · lowest possible {formatMoney(generated.totalLow)} ·
            median range {formatMoney(generated.totalMid)}
          </Text>
          <View className="mt-3 rounded-full bg-[#DCFCE7] px-3 py-1">
            <Text className="text-[12px] font-bold text-success">Saved {formatMoney(savings)}</Text>
          </View>
        </Card>

        <View className="mb-3">
          <ExportOrderActions order={generated} />
        </View>
        <Pressable
          onPress={() => setGenerated(null)}
          className="h-12 items-center justify-center rounded-2xl border border-line bg-white">
          <Text className="text-[14px] font-semibold text-brand">Back to Procure</Text>
        </Pressable>
      </Screen>
    );
  }

  /* ---------------------------------------------------------- edit mode */
  if (editing) {
    return (
      <Screen>
        <BrandHeader />
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-[20px] font-extrabold text-ink">Build your order</Text>
            <Text className="mt-0.5 text-[13px] text-muted">
              Select products or substitute groups to procure.
            </Text>
          </View>
          <Pressable
            onPress={() => setEditing(false)}
            className="rounded-full border border-line bg-white px-4 py-2">
            <Text className="text-[13px] font-bold text-brand">Cancel</Text>
          </Pressable>
        </View>

        <ErrorNote message={error} />

        {groupsQuery.data?.length ? (
          <Card className="mb-4">
            <Text className="mb-2 text-[13px] font-bold text-muted">SUBSTITUTE GROUPS</Text>
            {groupsQuery.data.map((group) => {
              const key = `group:${group.id}`;
              const checked = selection.some((s) => s.key === key);
              return (
                <Pressable
                  key={group.id}
                  onPress={() => toggle('group', group.id)}
                  className="flex-row items-center py-2.5">
                  <CheckBox checked={checked} />
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-ink">{group.label}</Text>
                    <Text className="text-[11px] text-muted">
                      {group.memberCount} linked products · one need
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        ) : null}

        <Card className="mb-4">
          <Text className="mb-2 text-[13px] font-bold text-muted">PRODUCTS</Text>
          <ScrollView style={{ maxHeight: 420 }}>
            {productItems.map((product) => {
              const key = `product:${product.id}`;
              const item = selection.find((s) => s.key === key);
              return (
                <View
                  key={product.id}
                  className="flex-row items-center border-b border-line py-2 last:border-b-0">
                  <Pressable
                    onPress={() => toggle('product', product.id)}
                    className="flex-1 flex-row items-center">
                    <CheckBox checked={!!item} />
                    <View className="flex-1">
                      <Text className="text-[14px] text-ink">{product.name}</Text>
                      <Text className="text-[11px] text-muted">
                        {product.category || 'Uncategorized'}
                        {product.lowestPrice !== null
                          ? ` · from ${formatMoney(product.lowestPrice)}`
                          : ' · no price yet'}
                      </Text>
                    </View>
                  </Pressable>
                  {item ? (
                    <View className="ml-2 w-[64px]">
                      <Field
                        value={String(item.qty)}
                        onChangeText={(text) =>
                          setSelection((sel) =>
                            sel.map((s) =>
                              s.key === key
                                ? { ...s, qty: Math.max(1, Math.round(Number(text) || 1)) }
                                : s
                            )
                          )
                        }
                        keyboardType="number-pad"
                        placeholder="Qty"
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          {productItems.length < productTotal ? (
            <Pressable
              onPress={() => setProductLimit((current) => current + 100)}
              className="mt-2 h-11 items-center justify-center rounded-xl border border-line bg-white active:bg-canvas">
              <Text className="text-[13px] font-bold text-brand">
                Load more ({productItems.length} of {productTotal})
              </Text>
            </Pressable>
          ) : null}
        </Card>

        <PrimaryButton
          label={`Done — ${selection.length} selected`}
          icon="checkmark"
          onPress={saveSelection}
          loading={setLines.isPending}
        />
      </Screen>
    );
  }

  /* --------------------------------------------------------- comparison */
  return (
    <Screen>
      <BrandHeader />

      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-[20px] font-extrabold text-ink">
            {draft.lines.length} product{draft.lines.length === 1 ? '' : 's'} selected
          </Text>
          <Text className="mt-0.5 text-[13px] text-muted">
            Compare prices and generate your purchase order.
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/orders')}
          className="mr-2 flex-row items-center rounded-full border border-line bg-white px-4 py-2 active:bg-canvas">
          <Ionicons name="time-outline" size={14} color="#5B7FA6" style={{ marginRight: 5 }} />
          <Text className="text-[13px] font-bold text-brand">History</Text>
        </Pressable>
        <Pressable
          onPress={enterEdit}
          className="flex-row items-center rounded-full border border-line bg-white px-4 py-2 active:bg-canvas">
          <Ionicons name="create-outline" size={14} color="#5B7FA6" style={{ marginRight: 5 }} />
          <Text className="text-[13px] font-bold text-brand">Edit</Text>
        </Pressable>
      </View>

      <ErrorNote message={error} />

      {draft.lines.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title="Nothing selected yet"
          subtitle="Tap Edit to pick products or substitute groups — Suggestions can also fill this order for you."
        />
      ) : (
        <>
          {/* comparison table */}
          <View className="mb-4 rounded-3xl border border-line bg-white px-3 pb-2 pt-3">
            {/* header */}
            <View className="flex-row items-end border-b border-line pb-2">
              <Text className="flex-1 text-[9px] font-bold uppercase text-muted">Product</Text>
              <Text className="w-[64px] text-[9px] font-bold uppercase text-muted">
                Lowest price vendor
              </Text>
              <Text className="w-[64px] text-[9px] font-bold uppercase text-muted">
                Next option vendor
              </Text>
              <Text className="w-[52px] text-right text-[9px] font-bold uppercase text-muted">
                Line (low)
              </Text>
              <Text className="w-[52px] text-right text-[9px] font-bold uppercase text-muted">
                Line (mid)
              </Text>
            </View>

            {draft.lines.map((line) => (
              <Pressable
                key={line.lineId}
                onPress={() => setActiveLine(line)}
                className="flex-row items-center border-b border-line py-2.5 last:border-b-0 active:bg-canvas">
                <View className="flex-1 pr-2">
                  <Text numberOfLines={2} className="text-[11px] font-bold leading-4 text-ink">
                    {line.label}
                  </Text>
                  {line.kind === 'group' ? (
                    <Text className="text-[9px] text-link">substitute group</Text>
                  ) : (
                    <Text className="text-[9px] text-muted">× {line.quantity}</Text>
                  )}
                </View>

                <View className="w-[64px] pr-1">
                  <Text className="text-[11px] font-extrabold text-ink">
                    {formatMoney(line.effective?.price ?? 0)}
                  </Text>
                  <Text numberOfLines={1} className="text-[9px] text-muted">
                    {line.effective?.vendorName ?? '—'}
                  </Text>
                  {line.chosenVendorId ? (
                    <Text className="text-[8px] font-bold text-link">overridden</Text>
                  ) : null}
                </View>

                <View className="w-[64px] pr-1">
                  <Text className="text-[11px] font-extrabold text-ink">
                    {formatMoney(line.next?.price ?? 0)}
                  </Text>
                  <Text numberOfLines={1} className="text-[9px] text-muted">
                    {line.next?.vendorName ?? '—'}
                  </Text>
                </View>

                <Money
                  value={line.lineTotalLow}
                  className="w-[52px] text-right text-[11px] font-semibold"
                />
                <Money
                  value={line.lineTotalMid}
                  className="w-[52px] text-right text-[11px] text-sub"
                />
              </Pressable>
            ))}
          </View>

          {/* order summary */}
          <Card className="mb-5">
            <SectionHeader
              title="Order summary"
              subtitle={`Based on ${draft.lines.length} selected products`}
            />
            <View className="flex-row items-end">
              <View className="mr-3 h-11 w-11 items-center justify-center rounded-xl bg-brand-light">
                <Ionicons name="stats-chart" size={20} color="#5B7FA6" />
              </View>
              <View className="flex-1">
                <Text className="text-[11px] text-muted">Lowest possible total</Text>
                <Money value={draft.totalLow} className="text-[22px] font-extrabold" />
              </View>
              <View className="items-end">
                <Text className="text-[11px] text-muted">Median-range total</Text>
                <Money value={draft.totalMid} className="text-[18px] font-extrabold text-sub" />
              </View>
            </View>
            <View className="mt-3 flex-row items-center rounded-xl bg-[#DCFCE7] px-3 py-2">
              <Ionicons
                name="trending-down-outline"
                size={15}
                color="#16A34A"
                style={{ marginRight: 6 }}
              />
              <Text className="text-[12px] font-bold text-success">
                Save {formatMoney(savings)} at lowest pricing
              </Text>
            </View>
          </Card>

          <PrimaryButton
            label="Generate purchase order"
            icon="document-text-outline"
            onPress={doGenerate}
            loading={generate.isPending}
          />
        </>
      )}

      {/* line editor */}
      <Modal
        visible={!!activeLine}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveLine(null)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-3xl bg-white px-5 pb-8 pt-5">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="flex-1 pr-3 text-[18px] font-extrabold text-ink" numberOfLines={2}>
                {activeLine?.label ?? ''}
              </Text>
              <Pressable
                onPress={() => setActiveLine(null)}
                hitSlop={10}
                className="h-9 w-9 items-center justify-center rounded-full bg-canvas">
                <Ionicons name="close" size={18} color="#64748B" />
              </Pressable>
            </View>

            {activeLine ? (
              <>
                <Field
                  label={`Quantity (${activeLine.kind === 'group' ? 'whole group' : 'units'})`}
                  value={String(activeLine.quantity)}
                  onChangeText={(text) => {
                    const qty = Math.max(1, Math.round(Number(text) || 1));
                    setActiveLine({ ...activeLine, quantity: qty });
                  }}
                  keyboardType="number-pad"
                />

                <Text className="mb-2 text-[13px] font-semibold text-sub">
                  Choose vendor for this line
                </Text>
                <Pressable
                  onPress={() => setActiveLine({ ...activeLine, chosenVendorId: null })}
                  className="mb-2 flex-row items-center rounded-2xl border border-line bg-white px-3 py-3">
                  <Radio on={!activeLine.chosenVendorId} />
                  <View className="flex-1">
                    <Text className="text-[14px] font-semibold text-ink">Lowest price (auto)</Text>
                    <Text className="text-[11px] text-muted">
                      {activeLine.lowest
                        ? `${activeLine.lowest.vendorName} · ${formatMoney(activeLine.lowest.price)}`
                        : 'no offers'}
                    </Text>
                  </View>
                </Pressable>

                {activeLine.offers.map((offer) => (
                  <Pressable
                    key={`${offer.vendorId}-${offer.price}`}
                    onPress={() => setActiveLine({ ...activeLine, chosenVendorId: offer.vendorId })}
                    className="mb-2 flex-row items-center rounded-2xl border border-line bg-white px-3 py-3">
                    <Radio on={activeLine.chosenVendorId === offer.vendorId} />
                    <View className="flex-1">
                      <Text className="text-[14px] font-semibold text-ink">{offer.vendorName}</Text>
                      <Text className="text-[11px] text-muted">
                        {formatMoney(offer.price)} per unit
                      </Text>
                    </View>
                  </Pressable>
                ))}

                <PrimaryButton
                  label="Apply to line"
                  icon="checkmark"
                  className="mt-3"
                  onPress={async () => {
                    if (!workspaceId || !activeLine) return;
                    await updateLine.mutateAsync({
                      workspaceId,
                      lineId: activeLine.lineId,
                      quantity: activeLine.quantity,
                      chosenVendorId: activeLine.chosenVendorId,
                    });
                    await utils.procure.getDraft.invalidate();
                    setActiveLine(null);
                  }}
                  loading={updateLine.isPending}
                />

                <Pressable
                  onPress={async () => {
                    if (!workspaceId || !activeLine) return;
                    await removeLine.mutateAsync({ workspaceId, lineId: activeLine.lineId });
                    await utils.procure.getDraft.invalidate();
                    setActiveLine(null);
                  }}
                  className="mt-3 h-12 items-center justify-center rounded-2xl border border-[#FECACA] bg-[#FEF2F2]">
                  <Text className="text-[14px] font-bold text-danger">Remove from order</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View
      className={`mr-3 h-5 w-5 items-center justify-center rounded-md border ${checked ? 'border-brand bg-brand' : 'border-line bg-white'}`}>
      {checked ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
    </View>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <View
      className={`mr-3 h-5 w-5 items-center justify-center rounded-full border ${on ? 'border-brand' : 'border-line'}`}>
      {on ? <View className="h-2.5 w-2.5 rounded-full bg-brand" /> : null}
    </View>
  );
}
