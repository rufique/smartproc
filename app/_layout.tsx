import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '../components/ui';
import { createTrpcClient, trpc } from '../lib/api';
import { useAuthStore } from '../store/store';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const AUTH_ROUTES = ['login', 'register', 'forgot-password'] as const;

function useAuthGate() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    const current = String(segments[0] ?? '');
    const onAuthScreen = AUTH_ROUTES.includes(current as (typeof AUTH_ROUTES)[number]);
    if (!token && !onAuthScreen) {
      router.replace('/login');
    } else if (token && onAuthScreen) {
      router.replace('/');
    }
  }, [hydrated, token, segments, router]);

  return hydrated;
}

function RootNavigator() {
  const hydrated = useAuthGate();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <Text className="text-[22px] font-extrabold text-ink">SmartProc</Text>
        <Loading label="Warming up…" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ animation: 'fade' }} />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen
        name="upload"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="product/new"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="product/[id]" />
      <Stack.Screen name="restock" />
      <Stack.Screen name="price-history" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="order/[id]" />
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
        },
      })
  );
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <RootNavigator />
        </trpc.Provider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
