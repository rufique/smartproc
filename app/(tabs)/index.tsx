import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { BrandHeader } from '../../components/BrandHeader';
import {
  Card,
  EmptyState,
  ErrorNote,
  IconTile,
  Loading,
  Money,
  PrimaryButton,
  Screen,
  SectionHeader,
  Subtitle,
  Title,
} from '../../components/ui';
import { trpc } from '../../lib/api';
import { relTime } from '../../lib/format';
import { useAuthStore } from '../../store/store';

function RestockBar({ pct, daysLeft }: { pct: number; daysLeft: number }) {
  const color = daysLeft < 5 ? 'bg-danger' : daysLeft < 8 ? 'bg-warning' : 'bg-info';
  return (
    <View className="flex-1 px-3">
      <View className="h-2.5 w-full overflow-hidden rounded-full bg-line">
        <View
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(Math.max(pct, 8), 100)}%` }}
        />
      </View>
    </View>
  );
}

function daysLabel(daysLeft: number) {
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}

function daysColor(daysLeft: number) {
  if (daysLeft < 5) return 'text-danger';
  if (daysLeft < 8) return 'text-warning';
  return 'text-info';
}

function PriceChangeRow({
  name,
  vendorName,
  price,
  previousPrice,
  changePct,
}: {
  name: string;
  vendorName: string;
  price: number;
  previousPrice: number | null;
  changePct: number;
}) {
  const direction = changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat';
  const icon = direction === 'up' ? 'arrow-up' : direction === 'down' ? 'arrow-down' : 'remove';
  const iconTint =
    direction === 'up'
      ? 'bg-[#FEE2E2] text-danger'
      : direction === 'down'
        ? 'bg-[#DCFCE7] text-success'
        : 'bg-canvas text-muted';
  const badge =
    direction === 'up'
      ? { tone: 'danger' as const, label: `+${changePct}%` }
      : direction === 'down'
        ? { tone: 'success' as const, label: `${changePct}%` }
        : { tone: 'neutral' as const, label: 'No change' };
  const [iconBg, iconFg] = iconTint.split(' ');

  return (
    <View className="flex-row items-center py-2.5">
      <View className={`mr-3 h-9 w-9 items-center justify-center rounded-full ${iconBg}`}>
        <Ionicons
          name={icon}
          size={17}
          color={
            iconFg === 'text-danger' ? '#EF4444' : iconFg === 'text-success' ? '#16A34A' : '#94A3B8'
          }
        />
      </View>
      <View className="flex-1 pr-2">
        <Text numberOfLines={1} className="text-[14px] font-bold text-ink">
          {name}
        </Text>
        <Text numberOfLines={1} className="text-[12px] text-muted">
          {vendorName}
        </Text>
      </View>
      <View className="items-end">
        <View className="flex-row items-center">
          {previousPrice !== null ? (
            <>
              <Money value={previousPrice} className="text-[12px] text-muted line-through" />
              <Text className="mx-1 text-[12px] text-muted">→</Text>
            </>
          ) : null}
          <Money value={price} className="text-[13px] font-bold" />
        </View>
        <View
          className={`mt-1 rounded-full px-2 py-0.5 ${badge.tone === 'danger' ? 'bg-[#FEE2E2]' : badge.tone === 'success' ? 'bg-[#DCFCE7]' : 'bg-canvas'}`}>
          <Text
            className={`text-[11px] font-bold ${
              badge.tone === 'danger'
                ? 'text-danger'
                : badge.tone === 'success'
                  ? 'text-success'
                  : 'text-muted'
            }`}>
            {badge.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const workspaceId = useAuthStore((s) => s.activeWorkspaceId);

  const summary = trpc.dashboard.summary.useQuery(
    { workspaceId: workspaceId! },
    { enabled: !!workspaceId, refetchOnMount: 'always' }
  );

  if (!workspaceId) {
    return (
      <Screen>
        <Title>Dashboard</Title>
        <View className="mt-6">
          <EmptyState
            icon="business-outline"
            title="No workspace selected"
            subtitle="Create or switch to a company workspace from the Profile tab."
          />
        </View>
      </Screen>
    );
  }

  if (summary.isLoading)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (summary.error) {
    return (
      <Screen>
        <BrandHeader />
        <ErrorNote message={summary.error.message} />
      </Screen>
    );
  }

  const data = summary.data;
  const restock = data?.restock ?? [];
  const changes = data?.priceChanges ?? [];

  return (
    <Screen>
      <BrandHeader />

      {/* quick stats */}
      <View className="mb-4 flex-row">
        <View className="mr-3 flex-1 flex-row items-center rounded-3xl border border-line bg-white p-4">
          <IconTile name="cube-outline" />
          <View className="ml-3">
            <Text className="text-[24px] font-extrabold leading-none text-ink">
              {data?.skuCount ?? 0}
            </Text>
            <Text className="mt-1 text-[12px] text-muted">SKUs tracked</Text>
          </View>
        </View>
        <View className="flex-1 flex-row items-center rounded-3xl border border-line bg-white p-4">
          <IconTile name="people-outline" tint="bg-[#E6F0FB]" color="#3B82F6" />
          <View className="ml-3">
            <Text className="text-[24px] font-extrabold leading-none text-ink">
              {data?.vendorCount ?? 0}
            </Text>
            <Text className="mt-1 text-[12px] text-muted">vendors</Text>
          </View>
        </View>
      </View>

      {/* restock urgency */}
      <Card className="mb-4">
        <SectionHeader
          title="Restock urgency"
          subtitle="Products running low"
          actionLabel="See all"
          onAction={() => router.push('/restock')}
        />
        {restock.length ? (
          restock.map((item, index) => (
            <View key={item.productId} className={index === 0 ? 'mt-1' : 'mt-3.5'}>
              <View className="flex-row items-center">
                <Text numberOfLines={1} className="w-[110px] text-[13px] font-semibold text-ink">
                  {item.name}
                </Text>
                <RestockBar pct={item.urgencyPct} daysLeft={item.daysLeft} />
                <Text
                  className={`w-[76px] text-right text-[12px] font-bold ${daysColor(item.daysLeft)}`}>
                  {daysLabel(item.daysLeft)}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text className="text-[13px] text-muted">Nothing is close to running out. 🎉</Text>
        )}
      </Card>

      {/* recent price changes */}
      <Card className="mb-5">
        <SectionHeader
          title="Recent price changes"
          subtitle="From your uploaded price lists"
          actionLabel="See all"
          onAction={() => router.push('/price-history')}
        />
        {changes.length ? (
          changes.map((change, index) => (
            <View key={change.id} className={index === 0 ? '' : 'border-t border-line'}>
              <PriceChangeRow
                name={change.productName}
                vendorName={change.vendorName}
                price={change.price}
                previousPrice={change.previousPrice}
                changePct={change.changePct}
              />
            </View>
          ))
        ) : (
          <Text className="text-[13px] text-muted">
            {data?.latestUpload
              ? `Last upload ${relTime(data.latestUpload.createdAt)} — no price changes yet.`
              : 'Upload a price list to start tracking changes.'}
          </Text>
        )}
      </Card>

      <PrimaryButton
        label="Upload price list"
        icon="cloud-upload-outline"
        onPress={() => router.push('/upload')}
      />
      <Subtitle className="mt-3 text-center leading-5">
        Upload an image, PDF or Excel file. We&apos;ll extract products and prices automatically.
      </Subtitle>
    </Screen>
  );
}
