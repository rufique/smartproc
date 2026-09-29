import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { ErrorNote, Field, PrimaryButton } from '../components/ui';
import { trpc } from '../lib/api';
import { useAuthStore } from '../store/store';

export default function LoginScreen() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const login = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      setSession({
        token: data.token,
        user: data.user,
        workspaces: data.workspaces,
        activeWorkspaceId: data.activeWorkspaceId,
      });
      router.replace('/');
    },
    onError: (err) => setError(err.message),
  });

  const submit = () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password');
      return;
    }
    login.mutate({ email: email.trim(), password });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 26,
          paddingTop: 90,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled">
        {/* decorative circles */}
        <View
          pointerEvents="none"
          className="absolute -right-16 top-0 h-64 w-64 rounded-full bg-[#EFF4FA]"
        />
        <View
          pointerEvents="none"
          className="absolute -left-24 bottom-10 h-72 w-72 rounded-full bg-[#EFF4FA]"
        />

        <View className="mb-8">
          <View className="mb-5 h-[76px] w-[76px] items-center justify-center rounded-[24px] bg-brand">
            <Ionicons name="cart" size={38} color="#fff" />
          </View>
          <Text className="text-[40px] font-extrabold leading-none text-ink">SmartProc</Text>
          <Text className="mt-2 text-[17px] text-muted">Procurement, simplified</Text>
        </View>

        <View
          className="rounded-3xl border border-line bg-white p-4 shadow-sm"
          style={{
            shadowColor: '#0F172B',
            shadowOpacity: 0.05,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 2,
          }}>
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            icon="mail-outline"
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
          />
          <Field
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            icon="lock-closed-outline"
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </View>

        <ErrorNote message={error} />

        <PrimaryButton label="Log In" onPress={submit} loading={login.isPending} className="mt-4" />

        <View className="mt-6 flex-row items-center justify-between">
          <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8}>
            <Text className="text-[14px] font-semibold text-link">Forgot password?</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/register')} hitSlop={8}>
            <Text className="text-[14px] font-semibold text-link">Create an account</Text>
          </Pressable>
        </View>

        <View className="mt-auto items-center pt-10">
          <Text className="text-[12px] text-muted">
            Demo account: amara@westendpharm.com / password123
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
