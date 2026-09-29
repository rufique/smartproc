import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { ErrorNote, Field, PrimaryButton } from '../components/ui';
import { trpc } from '../lib/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'request' | 'reset'>('request');
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const request = trpc.auth.forgotPassword.useMutation({
    onSuccess: (data) => {
      if (data.devToken) {
        setDevToken(data.devToken);
        setStage('reset');
      } else {
        // Same message either way — never leak which emails exist.
        setDevToken(null);
        setStage('reset');
      }
    },
    onError: (err) => setError(err.message),
  });

  const reset = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setDone(true),
    onError: (err) => setError(err.message),
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 70, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled">
        <Text className="text-[30px] font-extrabold text-ink">Reset password</Text>
        <Text className="mt-1 text-[14px] text-muted">
          {stage === 'request'
            ? 'Enter your account email and we will generate a reset token.'
            : 'Enter the reset token and choose a new password.'}
        </Text>

        <View className="mt-7 rounded-3xl border border-line bg-white p-4">
          {stage === 'request' ? (
            <Field
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={() => request.mutate({ email: email.trim() })}
            />
          ) : (
            <>
              {devToken ? (
                <View className="mb-3 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-3">
                  <Text className="text-[12px] font-bold text-link">
                    Dev mode (no email service yet)
                  </Text>
                  <Text className="mt-1 text-[13px] text-sub">
                    Reset token: <Text className="font-bold text-ink">{devToken}</Text>
                  </Text>
                </View>
              ) : null}
              <Field
                value={token}
                onChangeText={setToken}
                placeholder="Reset token"
                icon="key-outline"
                autoCapitalize="none"
              />
              <Field
                value={password}
                onChangeText={setPassword}
                placeholder="New password (min 6 characters)"
                icon="lock-closed-outline"
                secureTextEntry
              />
            </>
          )}
        </View>

        <ErrorNote message={error} />

        {done ? (
          <View className="mt-5 rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4">
            <Text className="text-[14px] font-bold text-success">Password updated</Text>
            <Text className="mt-1 text-[13px] text-sub">
              You can now log in with your new password.
            </Text>
          </View>
        ) : stage === 'request' ? (
          <PrimaryButton
            label="Send reset token"
            onPress={() => request.mutate({ email: email.trim() })}
            loading={request.isPending}
            className="mt-5"
          />
        ) : (
          <PrimaryButton
            label="Update password"
            onPress={() => reset.mutate({ token: token.trim(), password })}
            loading={reset.isPending}
            className="mt-5"
          />
        )}

        <Pressable
          onPress={() => (stage === 'reset' ? setStage('request') : router.back())}
          className="mt-6 items-center"
          hitSlop={8}>
          <Text className="text-[14px] font-semibold text-link">Back to login</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
