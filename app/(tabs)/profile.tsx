import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import {
  Avatar,
  Card,
  ErrorNote,
  Field,
  Loading,
  PrimaryButton,
  Screen,
  Subtitle,
  Title,
} from '../../components/ui';
import { trpc } from '../../lib/api';
import { INDUSTRY_ICON } from '../../lib/format';
import { useAuthStore } from '../../store/store';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId);
  const notificationsEnabled = useAuthStore((s) => s.notificationsEnabled);
  const toggleNotifications = useAuthStore((s) => s.toggleNotifications);
  const setActiveWorkspace = useAuthStore((s) => s.setActiveWorkspace);
  const setWorkspaces = useAuthStore((s) => s.setWorkspaces);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const utils = trpc.useUtils();

  const workspacesQuery = trpc.workspace.list.useQuery(undefined, { enabled: !!user });
  const industriesQuery = trpc.workspace.industries.useQuery();

  const [addOpen, setAddOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [wsName, setWsName] = useState('');
  const [industry, setIndustry] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspacesQuery.data) setWorkspaces(workspacesQuery.data);
  }, [workspacesQuery.data, setWorkspaces]);

  const createWorkspace = trpc.workspace.create.useMutation({
    onSuccess: async (workspace) => {
      await workspacesQuery.refetch();
      if (workspace) setActiveWorkspace(workspace.id);
      setAddOpen(false);
      setWsName('');
      await utils.dashboard.summary.invalidate();
      await utils.catalog.listProducts.invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: async (updated) => {
      setUser(updated);
      setNameOpen(false);
    },
    onError: (err) => setError(err.message),
  });

  const logoutMutation = trpc.auth.logout.useMutation();
  const removeWorkspace = trpc.workspace.remove.useMutation();

  const switchTo = (id: string) => {
    if (id === activeWorkspaceId) return;
    setActiveWorkspace(id);
    // Refetch every scoped query for the newly active workspace.
    void utils.invalidate();
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will need to sign in again to access your workspaces.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            // Revokes the token server-side; still drop the local session if it fails.
            await logoutMutation.mutateAsync();
          } catch {
            /* ignore */
          }
          logout();
        },
      },
    ]);
  };

  const confirmRemoveWorkspace = (id: string, name: string) => {
    Alert.alert(
      'Remove workspace?',
      `${name} and all of its catalog, vendors and orders will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setError(null);
            try {
              await removeWorkspace.mutateAsync({ workspaceId: id });
              await workspacesQuery.refetch();
              void utils.invalidate();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not remove workspace');
            }
          },
        },
      ]
    );
  };

  const industries = industriesQuery.data ?? [];
  const workspaceList = workspacesQuery.data ?? [];

  return (
    <Screen>
      <View className="mb-5">
        <Title>Profile</Title>
        <Subtitle>Manage your account and workspaces</Subtitle>
      </View>

      <ErrorNote message={error} />

      {/* user card */}
      <Pressable
        onPress={() => {
          setNewUserName(user?.name ?? '');
          setNameOpen(true);
        }}>
        <Card className="mb-5 flex-row items-center">
          <Avatar name={user?.name ?? '?'} size={48} />
          <View className="mx-3 flex-1">
            <Text className="text-[16px] font-bold text-ink">{user?.name ?? '—'}</Text>
            <Text className="text-[13px] text-muted">{user?.email ?? '—'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </Card>
      </Pressable>

      {/* workspaces */}
      <Text className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">
        Company workspaces
      </Text>
      <Card className="mb-5 p-2">
        {workspacesQuery.isLoading ? (
          <Loading label="Loading workspaces…" />
        ) : (
          workspaceList.map((workspace) => {
            const active = workspace.id === activeWorkspaceId;
            const icon = INDUSTRY_ICON[workspace.industry] ?? INDUSTRY_ICON.Other;
            return (
              <Pressable
                key={workspace.id}
                onPress={() => switchTo(workspace.id)}
                className="flex-row items-center border-b border-line px-2 py-3 last:border-b-0 active:bg-canvas">
                <View
                  className={`mr-3 h-10 w-10 items-center justify-center rounded-xl ${icon.tint}`}>
                  <Text className="text-[18px]">{icon.emoji}</Text>
                </View>
                <View className="flex-1">
                  <Text numberOfLines={1} className="text-[15px] font-bold text-ink">
                    {workspace.name}
                  </Text>
                  <Text numberOfLines={1} className="text-[12px] text-muted">
                    {workspace.industry}
                  </Text>
                </View>
                {active ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color="#2F6FEB"
                    style={{ marginRight: 6 }}
                  />
                ) : null}
                {workspaceList.length > 1 ? (
                  <Pressable
                    onPress={() => confirmRemoveWorkspace(workspace.id, workspace.name)}
                    hitSlop={8}
                    className="mr-1 h-9 w-9 items-center justify-center rounded-full bg-canvas">
                    <Ionicons name="trash-outline" size={15} color="#EF4444" />
                  </Pressable>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
              </Pressable>
            );
          })
        )}
        <Pressable
          onPress={() => setAddOpen(true)}
          className="flex-row items-center px-2 py-3.5 active:bg-canvas">
          <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-[#E3EDFB]">
            <Ionicons name="add" size={18} color="#2F6FEB" />
          </View>
          <Text className="text-[15px] font-bold text-link">Add company workspace</Text>
        </Pressable>
      </Card>

      {/* account */}
      <Text className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted">Account</Text>
      <Card className="mb-6 p-2">
        <View className="flex-row items-center border-b border-line px-2 py-3.5">
          <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-canvas">
            <Ionicons name="cash-outline" size={17} color="#64748B" />
          </View>
          <Text className="flex-1 text-[15px] font-semibold text-ink">Currency: USD</Text>
          <Text className="text-[12px] text-muted">2-decimal precision</Text>
        </View>

        <View className="flex-row items-center border-b border-line px-2 py-3">
          <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-canvas">
            <Ionicons name="notifications-outline" size={17} color="#64748B" />
          </View>
          <Text className="flex-1 text-[15px] font-semibold text-ink">Notifications</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ true: '#5B7FA6', false: '#E7ECF2' }}
            thumbColor="#fff"
          />
        </View>

        <Pressable
          onPress={confirmLogout}
          className="flex-row items-center px-2 py-3.5 active:bg-canvas">
          <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-[#FEE2E2]">
            <Ionicons name="log-out-outline" size={17} color="#EF4444" />
          </View>
          <Text className="text-[15px] font-bold text-danger">Log out</Text>
        </Pressable>
      </Card>

      {/* add workspace modal */}
      <Modal
        visible={addOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddOpen(false)}>
        <View className="flex-1 bg-canvas">
          <View className="flex-row items-center justify-between border-b border-line bg-white px-5 pb-4 pt-6">
            <Text className="text-[19px] font-extrabold text-ink">New workspace</Text>
            <Pressable onPress={() => setAddOpen(false)} hitSlop={10}>
              <Text className="text-[15px] font-semibold text-link">Cancel</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <Card className="mb-4">
              <Field
                label="Company name"
                value={wsName}
                onChangeText={setWsName}
                placeholder="e.g. Westend Pharmacy"
                icon="business-outline"
                autoCapitalize="words"
              />
              <Text className="mb-2 text-[13px] font-semibold text-sub">Industry category</Text>
              {(industries.length ? industries : [...INDUSTRY_ICON_KEYS]).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setIndustry(option)}
                  className={`rounded-xl px-3 py-2.5 ${industry === option ? 'bg-brand-light' : ''}`}>
                  <Text
                    className={`text-[14px] ${industry === option ? 'font-bold text-brand' : 'text-sub'}`}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </Card>
            <ErrorNote message={error} />
            <PrimaryButton
              label="Create workspace"
              onPress={() => {
                setError(null);
                if (!wsName.trim() || !industry) {
                  setError('Enter a name and pick an industry');
                  return;
                }
                createWorkspace.mutate({ name: wsName.trim(), industry });
              }}
              loading={createWorkspace.isPending}
            />
          </ScrollView>
        </View>
      </Modal>

      {/* edit name modal */}
      <Modal
        visible={nameOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setNameOpen(false)}>
        <View className="flex-1 justify-center bg-black/40 px-6">
          <View className="rounded-3xl bg-white p-5">
            <Text className="mb-4 text-[18px] font-extrabold text-ink">Edit your name</Text>
            <Field
              value={newUserName}
              onChangeText={setNewUserName}
              placeholder="Full name"
              icon="person-outline"
              autoCapitalize="words"
            />
            <PrimaryButton
              label="Save"
              onPress={() => {
                if (newUserName.trim()) updateProfile.mutate({ name: newUserName.trim() });
              }}
              loading={updateProfile.isPending}
            />
            <Pressable
              onPress={() => setNameOpen(false)}
              className="mt-3 h-11 items-center justify-center">
              <Text className="text-[14px] font-semibold text-link">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const INDUSTRY_ICON_KEYS = Object.keys(INDUSTRY_ICON);
