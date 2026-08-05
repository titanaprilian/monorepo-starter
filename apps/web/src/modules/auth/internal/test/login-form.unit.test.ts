import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { loginSchema } from '../schema';
import { useAuthStore } from '../store';

describe('loginSchema validation', () => {
  it('should fail validation on empty input', () => {
    const result = loginSchema.safeParse({ email: '', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = result.error.format();
      expect(formatted.email?._errors).toContain('Email is required');
      expect(formatted.password?._errors).toContain('Password is required');
    }
  });

  it('should fail validation on invalid email format', () => {
    const result = loginSchema.safeParse({
      email: 'invalid-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = result.error.format();
      expect(formatted.email?._errors).toContain('Invalid email address');
    }
  });

  it('should pass validation on valid credentials', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        email: 'user@example.com',
        password: 'password123',
      });
    }
  });
});

describe('LoginForm integration logic', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('login action sets error on invalid credentials', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
    ) as unknown as typeof fetch;

    const success = await useAuthStore.getState().login({
      email: 'user@example.com',
      password: 'wrongpassword',
    });

    expect(success).toBe(false);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('Invalid credentials');
  });
});
