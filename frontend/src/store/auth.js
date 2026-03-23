import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';

function normalizeUser(user) {
  if (!user) return null;
  if (user.org) return user;

  return {
    ...user,
    org: user.orgId ? {
      id: user.orgId,
      name: user.orgName,
      slug: user.orgSlug,
      plan: user.orgPlan,
    } : undefined,
  };
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (email, password, orgSlug) => {
        const { data } = await api.post('/auth/login', { email, password, orgSlug });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        set({
          user: normalizeUser(data.user),
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        });
        return data;
      },

      logout: async () => {
        try {
          await api.post('/auth/logout', { refreshToken: get().refreshToken });
        } catch {}
        localStorage.clear();
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
        window.location.href = '/auth/login';
      },

      fetchMe: async () => {
        const { data } = await api.get('/auth/me');
        set({ user: normalizeUser(data), isAuthenticated: true });
        return data;
      },
    }),
    {
      name: 'provideriq-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          state.isAuthenticated = true;
        }
        state.user = normalizeUser(state?.user);
      },
    }
  )
);
