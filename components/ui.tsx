import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatMoney } from '../lib/format';

/* ------------------------------------------------------------------ screen */

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  onEndReached,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  onEndReached?: () => void;
}) {
  if (!scroll) {
    return (
      <SafeAreaView edges={edges} className="flex-1 bg-canvas">
        {children}
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={
          onEndReached
            ? (event) => {
                const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
                if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 320) {
                  onEndReached();
                }
              }
            : undefined
        }
        scrollEventThrottle={onEndReached ? 200 : undefined}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 20, paddingBottom: 110, paddingTop: 8 },
});

/* ------------------------------------------------------------------- text */

export function Title({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text className={`text-[30px] font-extrabold leading-tight text-ink ${className}`}>
      {children}
    </Text>
  );
}

export function Subtitle({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <Text className={`mt-1 text-[13px] text-muted ${className}`}>{children}</Text>;
}

export function Money({
  value,
  className = '',
  short = false,
  ...rest
}: { value: number | null | undefined; className?: string; short?: boolean } & TextProps) {
  return (
    <Text
      {...rest}
      style={[rest.style, { fontVariant: ['tabular-nums'] }]}
      className={`text-ink ${className}`}>
      {short ? formatMoney(value) : formatMoney(value)}
    </Text>
  );
}

/* ------------------------------------------------------------------- card */

export function Card({ children, className = '', ...rest }: ViewProps & { className?: string }) {
  return (
    <View {...rest} className={`rounded-3xl border border-line bg-white p-4 ${className}`}>
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="mb-3 flex-row items-start justify-between">
      <View className="flex-1 pr-3">
        <Text className="text-[17px] font-bold text-ink">{title}</Text>
        {subtitle ? <Text className="mt-0.5 text-[12px] text-muted">{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8} className="flex-row items-center">
          <Text className="text-[13px] font-semibold text-link">{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color="#2F6FEB" />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------- buttons */

export function PrimaryButton({
  label,
  onPress,
  icon,
  disabled,
  loading,
  className = '',
}: {
  label: string;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      className={`h-[52px] w-full flex-row items-center justify-center rounded-2xl bg-brand px-4 active:bg-brand-dark ${off ? 'opacity-60' : ''} ${className}`}>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color="#fff" style={{ marginRight: 8 }} /> : null}
          <Text className="text-[15px] font-bold text-white">{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  icon,
  className = '',
}: {
  label: string;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-[52px] w-full flex-row items-center justify-center rounded-2xl border border-line bg-white active:bg-canvas ${className}`}>
      {icon ? <Ionicons name={icon} size={18} color="#5B7FA6" style={{ marginRight: 8 }} /> : null}
      <Text className="text-[15px] font-bold text-brand">{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`mr-2 rounded-full border px-4 py-2 ${active ? 'border-brand bg-brand' : 'border-line bg-white'}`}>
      <Text className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-sub'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({
  label,
  tone = 'info',
  icon,
}: {
  label: string;
  tone?: 'info' | 'success' | 'danger' | 'warning' | 'neutral';
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const tones: Record<string, string> = {
    info: 'bg-[#E3EDFB] text-link',
    success: 'bg-[#DCFCE7] text-success',
    danger: 'bg-[#FEE2E2] text-danger',
    warning: 'bg-[#FFEDD5] text-warning',
    neutral: 'bg-canvas text-sub',
  };
  const [bg, fg] = tones[tone].split(' ');
  return (
    <View className={`flex-row items-center self-start rounded-full px-2 py-1 ${bg}`}>
      {icon ? (
        <Ionicons
          name={icon}
          size={11}
          color={fg === 'text-link' ? '#2F6FEB' : '#64748B'}
          style={{ marginRight: 4 }}
        />
      ) : null}
      <Text className={`text-[11px] font-semibold ${fg}`}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ forms */

export function Field({
  value,
  onChangeText,
  placeholder,
  icon,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'sentences',
  multiline,
  label,
  onSubmitEditing,
  returnKeyType,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  label?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'next' | 'go' | 'search';
}) {
  const [hidden, setHidden] = useState(!!secureTextEntry);
  return (
    <View className="mb-3">
      {label ? <Text className="mb-1.5 text-[13px] font-semibold text-sub">{label}</Text> : null}
      <View className="min-h-[50px] flex-row items-center rounded-2xl border border-line bg-white px-3.5">
        {icon ? (
          <Ionicons name={icon} size={17} color="#94A3B8" style={{ marginRight: 9 }} />
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          secureTextEntry={hidden}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          multiline={multiline}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          className={`flex-1 py-3 text-[15px] text-ink ${multiline ? 'min-h-[80px] pt-2' : ''}`}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <Ionicons name={hidden ? 'eye' : 'eye-off'} size={18} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ misc */

export function IconTile({
  name,
  tint = 'bg-brand-light',
  color = '#5B7FA6',
  size = 40,
  iconSize = 19,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  tint?: string;
  color?: string;
  size?: number;
  iconSize?: number;
}) {
  return (
    <View
      className={`items-center justify-center rounded-xl ${tint}`}
      style={{ width: size, height: size }}>
      <Ionicons name={name} size={iconSize} color={color} />
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <View
      className="items-center justify-center rounded-full border border-line bg-brand-light"
      style={{ width: size, height: size }}>
      <Text className="font-bold text-brand" style={{ fontSize: size * 0.36 }}>
        {letters || '?'}
      </Text>
    </View>
  );
}

export function Divider() {
  return <View className="my-3 h-px bg-line" />;
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  subtitle,
}: {
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="items-center rounded-3xl border border-dashed border-line bg-white px-6 py-10">
      <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-brand-light">
        <Ionicons name={icon} size={24} color="#5B7FA6" />
      </View>
      <Text className="text-center text-[15px] font-bold text-ink">{title}</Text>
      {subtitle ? (
        <Text className="mt-1 text-center text-[13px] text-muted">{subtitle}</Text>
      ) : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View className="items-center py-12">
      <ActivityIndicator size="large" color="#5B7FA6" />
      <Text className="mt-3 text-[13px] text-muted">{label}</Text>
    </View>
  );
}

/** Inline spinner shown at the bottom of a paginated list while the next page loads. */
export function LoadMore({
  visible,
  label = 'Loading more…',
}: {
  visible: boolean;
  label?: string;
}) {
  if (!visible) return null;
  return (
    <View className="items-center py-4">
      <ActivityIndicator color="#5B7FA6" />
      <Text className="mt-2 text-[12px] text-muted">{label}</Text>
    </View>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View className="mb-3 flex-row items-center rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3">
      <Ionicons name="alert-circle" size={16} color="#EF4444" style={{ marginRight: 8 }} />
      <Text className="flex-1 text-[13px] text-danger">{message}</Text>
    </View>
  );
}
