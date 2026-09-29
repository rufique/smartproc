import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';

import type { AppRouter } from '../server/trpc/router';
import { useAuthStore } from '../store/store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_URL}/api/trpc`,
        headers() {
          const token = useAuthStore.getState().token;
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
