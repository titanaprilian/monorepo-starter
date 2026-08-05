import { create } from 'zustand';
import type {
  User,
  VerifyCredentialsInput,
  RegisterInput,
} from '@repo/contracts';
import { api } from '@/lib/api';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  login: (credentials: VerifyCredentialsInput) => Promise<boolean>;
  register: (credentials: RegisterInput) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  checkAuth: async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const authHeader = token.startsWith('Bearer ')
        ? token
        : `Bearer ${token}`;
      const res = await api.auth.me.get({
        $headers: { authorization: authHeader },
      });

      if (res.data && 'data' in res.data && res.data.data) {
        const user = res.data.data as User;
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        localStorage.removeItem('access_token');
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      }
    } catch {
      localStorage.removeItem('access_token');
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
  },

  login: async (credentials: VerifyCredentialsInput) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.login.post(credentials);

      if (res.data && 'data' in res.data && res.data.data) {
        const responseData = res.data.data;
        const user = responseData.user as User;
        const accessToken = responseData.tokens?.accessToken;

        if (accessToken) {
          localStorage.setItem('access_token', accessToken);
        }

        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return true;
      } else {
        let errorMessage = 'Login failed';
        if (res.error) {
          const errValue = res.error.value;
          if (typeof errValue === 'string') {
            errorMessage = errValue;
          } else if (typeof errValue === 'object' && errValue !== null) {
            const errObj = errValue as Record<string, unknown>;
            if (
              errObj.error &&
              typeof errObj.error === 'object' &&
              errObj.error !== null &&
              'message' in errObj.error &&
              typeof (errObj.error as Record<string, unknown>).message ===
                'string'
            ) {
              errorMessage = (errObj.error as Record<string, unknown>)
                .message as string;
            } else if (
              'message' in errObj &&
              typeof errObj.message === 'string'
            ) {
              errorMessage = errObj.message;
            }
          }
        }

        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: errorMessage,
        });
        return false;
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
      return false;
    }
  },

  register: async (credentials: RegisterInput) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.register.post(credentials);

      if (res.data && 'data' in res.data && res.data.data) {
        const responseData = res.data.data;
        const user = (responseData.user || responseData) as User;
        const accessToken = responseData.tokens?.accessToken;

        if (accessToken) {
          localStorage.setItem('access_token', accessToken);
        }

        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return true;
      } else {
        let errorMessage = 'Registration failed';
        if (res.error) {
          const errValue = res.error.value;
          if (typeof errValue === 'string') {
            errorMessage = errValue;
          } else if (typeof errValue === 'object' && errValue !== null) {
            const errObj = errValue as Record<string, unknown>;
            if (
              errObj.error &&
              typeof errObj.error === 'object' &&
              errObj.error !== null &&
              'message' in errObj.error &&
              typeof (errObj.error as Record<string, unknown>).message ===
                'string'
            ) {
              errorMessage = (errObj.error as Record<string, unknown>)
                .message as string;
            } else if (
              'message' in errObj &&
              typeof errObj.message === 'string'
            ) {
              errorMessage = errObj.message;
            }
          }
        }

        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: errorMessage,
        });
        return false;
      }
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
      return false;
    }
  },

  logout: async () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        await api.auth.logout.post({});
      } catch {
        // Ignore logout network errors
      }
    }
    localStorage.removeItem('access_token');
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },
}));
