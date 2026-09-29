import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { ErrorNote, Field, PrimaryButton } from '../components/ui';
import { trpc } from '../lib/api';
import { useAuthStore } from '../store/store';

const INDUSTRY_OPTIONS = [
  'Healthcare & Pharmaceuticals',
  'Building & Hardware',
  'Food & Grocery Retail',
  'Electronics & Appliances',
  'Agriculture & Agrochemicals',
  'Fashion & Apparel',
  'Industrial & Manufacturing',
  'Hospitality Supplies',
  'Other',
];

export default function RegisterScreen() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState(INDUSTRY_OPTIONS[0]);
  const [showIndustries, setShowIndustries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = trpc.auth.register.useMutation({
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
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError('Fill in your name, email and a password of at least 6 characters');
      return;
    }
    register.mutate({
      name: name.trim(),
      email: email.trim(),
      password,
      companyName: company.trim() || undefined,
      industry,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 70, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled">
        <Text className="text-[30px] font-extrabold text-ink">Create account</Text>
        <Text className="mt-1 text-[14px] text-muted">
          Start tracking prices and building smarter orders.
        </Text>

        <View className="mt-7 rounded-3xl border border-line bg-white p-4">
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            icon="person-outline"
            autoCapitalize="words"
          />
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            icon="mail-outline"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            value={password}
            onChangeText={setPassword}
            placeholder="Password (min 6 characters)"
            icon="lock-closed-outline"
            secureTextEntry
          />
          <Field
            value={company}
            onChangeText={setCompany}
            placeholder="Company workspace name"
            icon="business-outline"
            autoCapitalize="words"
          />

          <Text className="mb-1.5 text-[13px] font-semibold text-sub">Industry</Text>
          <Pressable
            onPress={() => setShowIndustries((s) => !s)}
            className="mb-2 min-h-[50px] flex-row items-center justify-between rounded-2xl border border-line bg-white px-3.5">
            <Text className="text-[15px] text-ink">{industry}</Text>
            <Text className="text-link">Change</Text>
          </Pressable>
          {showIndustries
            ? INDUSTRY_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setIndustry(option);
                    setShowIndustries(false);
                  }}
                  className={`rounded-xl px-3 py-2.5 ${industry === option ? 'bg-brand-light' : ''}`}>
                  <Text
                    className={`text-[14px] ${industry === option ? 'font-bold text-brand' : 'text-sub'}`}>
                    {option}
                  </Text>
                </Pressable>
              ))
            : null}
        </View>

        <ErrorNote message={error} />

        <PrimaryButton
          label="Create account"
          onPress={submit}
          loading={register.isPending}
          className="mt-5"
        />

        <Pressable onPress={() => router.back()} className="mt-6 items-center" hitSlop={8}>
          <Text className="text-[14px] font-semibold text-link">
            Already have an account? Log in
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
