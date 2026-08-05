import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { useAuthStore } from '../store';

describe('LogoutButton logic & store interaction', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: {
        id: 'user-123',
        email: 'test@example.com',
        createdAt: new Date(),
      },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('logout action clears store and localStorage access token', async () => {
    localStorage.setItem('access_token', 'sample-token');

    let fetchCalled = false;
    globalThis.fetch = mock(async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ data: { success: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(fetchCalled).toBe(true);
  });
});
