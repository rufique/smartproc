import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from './ui';
import { useAuthStore } from '../store/store';

/** Shared header on Dashboard / Procure / Suggestions (design screens 341, 343, 344). */
export function BrandHeader() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  return (
    <View className="mb-5 flex-row items-start justify-between">
      <View className="flex-1 pr-4">
        <Text className="text-[30px] font-extrabold leading-none text-ink">SmartProc</Text>
        <Text className="mt-1.5 text-[13px] text-muted">
          Smarter purchasing. Healthier tomorrows.
        </Text>
      </View>
      <Pressable
        onPress={() => router.push('/profile')}
        hitSlop={8}
        className="h-11 w-11 items-center justify-center rounded-full border border-line bg-brand-light active:opacity-70">
        {user ? (
          <Avatar name={user.name} size={36} />
        ) : (
          <Ionicons name="person" size={20} color="#5B7FA6" />
        )}
      </Pressable>
    </View>
  );
}
