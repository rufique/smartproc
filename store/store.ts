import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SessionUser = { id: string; name: string; email: string };
export type WorkspaceSummary = {
  id: string;
  name: string;
  industry: string;
  currency: string;
};

type SessionState = {
  token: string | null;
  user: SessionUser | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  notificationsEnabled: boolean;
  hydrated: boolean;

  setHydrated: () => void;
  setSession: (payload: {
    token: string;
    user: SessionUser;
    workspaces: WorkspaceSummary[];
    activeWorkspaceId: string | null;
  }) => void;
  setUser: (user: SessionUser) => void;
  setWorkspaces: (workspaces: WorkspaceSummary[]) => void;
  setActiveWorkspace: (id: string) => void;
  toggleNotifications: () => void;
  logout: () => void;
};

export const useAuthStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      workspaces: [],
      activeWorkspaceId: null,
      notificationsEnabled: true,
      hydrated: false,

      setHydrated: () => set({ hydrated: true }),
      setSession: (payload) =>
        set((state) => ({
          token: payload.token,
          user: payload.user,
          workspaces: payload.workspaces,
          // Keep the workspace the user last used when it still exists on this account.
          activeWorkspaceId:
            state.activeWorkspaceId &&
            payload.workspaces.some((w) => w.id === state.activeWorkspaceId)
              ? state.activeWorkspaceId
              : (payload.activeWorkspaceId ?? payload.workspaces[0]?.id ?? null),
        })),
      setUser: (user) => set({ user }),
      setWorkspaces: (workspaces) =>
        set((state) => ({
          workspaces,
          activeWorkspaceId:
            state.activeWorkspaceId && workspaces.some((w) => w.id === state.activeWorkspaceId)
              ? state.activeWorkspaceId
              : (workspaces[0]?.id ?? null),
        })),
      setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
      toggleNotifications: () => set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
      logout: () => set({ token: null, user: null, workspaces: [], activeWorkspaceId: null }),
    }),
    {
      name: 'smartproc-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        notificationsEnabled: state.notificationsEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);

/** Convenience selector — active workspace or null. */
export const useActiveWorkspaceId = () => useAuthStore((s) => s.activeWorkspaceId);
