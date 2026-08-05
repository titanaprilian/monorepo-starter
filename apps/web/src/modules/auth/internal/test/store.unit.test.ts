import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type { User } from '@repo/contracts';

const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value.toString();
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
  },
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
}

let fetchHandler: (url: string, init?: RequestInit) => Promise<Response> = () =>
  Promise.resolve(new Response(JSON.stringify({}), { status: 404 }));

globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) =>
  fetchHandler(url.toString(), init)
) as unknown as typeof fetch;

import { useAuthStore } from '../store';

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('should have initial unauthenticated state', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('checkAuth should do nothing if no access token in localStorage', async () => {
    await useAuthStore.getState().checkAuth();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('checkAuth should fetch /auth/me and set user state on valid token', async () => {
    localStorage.setItem('access_token', 'valid-token');

    const mockUserPayload = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: '2026-08-05T12:00:00.000Z',
    };

    let fetchCalledWithHeader = '';
    fetchHandler = async (_url: string, init?: RequestInit) => {
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          fetchCalledWithHeader = init.headers.get('authorization') || '';
        } else if (Array.isArray(init.headers)) {
          const entry = init.headers.find(
            ([k]) => k.toLowerCase() === 'authorization'
          );
          fetchCalledWithHeader = entry ? entry[1] : '';
        } else {
          const headersObj = init.headers as Record<string, string>;
          fetchCalledWithHeader =
            headersObj['authorization'] || headersObj['Authorization'] || '';
        }
      }
      return new Response(JSON.stringify({ data: mockUserPayload }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await useAuthStore.getState().checkAuth();

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUserPayload as unknown as User);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(fetchCalledWithHeader).toBe('Bearer valid-token');
  });

  it('checkAuth should clear state and token on invalid or expired token', async () => {
    localStorage.setItem('access_token', 'invalid-token');

    fetchHandler = async () =>
      new Response(
        JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'unauthorized' },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    await useAuthStore.getState().checkAuth();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('login should set user, token and isAuthenticated state on success', async () => {
    const mockUserPayload = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: '2026-08-05T12:00:00.000Z',
    };

    fetchHandler = async () =>
      new Response(
        JSON.stringify({
          data: {
            user: mockUserPayload,
            tokens: { accessToken: 'new-access-token' },
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    const success = await useAuthStore.getState().login({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(success).toBe(true);
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUserPayload as unknown as User);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(localStorage.getItem('access_token')).toBe('new-access-token');
  });

  it('register should set user, token and isAuthenticated state on success', async () => {
    const mockUserPayload = {
      id: 'user-789',
      email: 'registered@example.com',
      name: 'Registered User',
      createdAt: '2026-08-05T12:00:00.000Z',
    };

    fetchHandler = async () =>
      new Response(
        JSON.stringify({
          data: {
            user: mockUserPayload,
            tokens: { accessToken: 'reg-access-token' },
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    const success = await useAuthStore.getState().register({
      name: 'Registered User',
      email: 'registered@example.com',
      password: 'password123',
    });

    expect(success).toBe(true);
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUserPayload as unknown as User);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(localStorage.getItem('access_token')).toBe('reg-access-token');
  });

  it('logout should clear token and reset auth state', async () => {
    localStorage.setItem('access_token', 'token-to-logout');
    useAuthStore.setState({
      user: { id: '1', email: 'a@b.com', createdAt: new Date() },
      isAuthenticated: true,
    });

    fetchHandler = async () =>
      new Response(JSON.stringify({ data: { success: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(localStorage.getItem('access_token')).toBeNull();
  });
});
