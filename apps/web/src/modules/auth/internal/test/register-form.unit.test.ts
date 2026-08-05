import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type { User } from '@repo/contracts';
import { registerSchema } from '../schema';
import { useAuthStore } from '../store';

describe('registerSchema validation', () => {
  it('should fail validation on empty input', () => {
    const result = registerSchema.safeParse({
      name: '',
      email: '',
      password: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = result.error.format();
      expect(formatted.name?._errors).toContain('Name is required');
      expect(formatted.email?._errors).toContain('Email is required');
      expect(formatted.password?._errors).toContain(
        'Password must be at least 8 characters'
      );
    }
  });

  it('should fail validation on invalid email format', () => {
    const result = registerSchema.safeParse({
      name: 'John Doe',
      email: 'invalid-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = result.error.format();
      expect(formatted.email?._errors).toContain('Invalid email address');
    }
  });

  it('should fail validation on short password', () => {
    const result = registerSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const formatted = result.error.format();
      expect(formatted.password?._errors).toContain(
        'Password must be at least 8 characters'
      );
    }
  });

  it('should pass validation on valid registration input', () => {
    const result = registerSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      });
    }
  });
});

describe('RegisterForm integration logic', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('register action sets error on email already registered', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'EMAIL_ALREADY_REGISTERED',
              message: 'Email already registered',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
    ) as unknown as typeof fetch;

    const success = await useAuthStore.getState().register({
      name: 'John Doe',
      email: 'existing@example.com',
      password: 'password123',
    });

    expect(success).toBe(false);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe('Email already registered');
  });

  it('register action succeeds and sets user and token on valid input', async () => {
    const mockUserPayload = {
      id: 'user-456',
      email: 'newuser@example.com',
      name: 'New User',
      createdAt: '2026-08-05T12:00:00.000Z',
    };

    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              user: mockUserPayload,
              tokens: { accessToken: 'register-access-token' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    ) as unknown as typeof fetch;

    const success = await useAuthStore.getState().register({
      name: 'New User',
      email: 'newuser@example.com',
      password: 'password123',
    });

    expect(success).toBe(true);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(mockUserPayload as unknown as User);
    expect(localStorage.getItem('access_token')).toBe('register-access-token');
  });
});
