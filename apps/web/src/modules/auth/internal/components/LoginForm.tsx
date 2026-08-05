import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '../store';
import { loginSchema, type LoginSchema } from '../schema';

export interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const authError = useAuthStore((state) => state.error);
  const isLoadingState = useAuthStore((state) => state.isLoading);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginSchema) => {
    setLocalError(null);
    const success = await login(values);
    if (success) {
      if (onSuccess) {
        onSuccess();
      } else {
        navigate({ to: '/' });
      }
    }
  };

  const displayError = localError || authError;
  const isPending = isSubmitting || isLoadingState;

  return (
    <div className="w-full max-w-md rounded border border-c bg-card p-6 shadow-none">
      <div className="mb-6 space-y-1">
        <h1 className="text-xl font-semibold text-fg">Sign in to console</h1>
        <p className="text-sm text-muted">
          Enter your credentials to access your account
        </p>
      </div>

      {displayError && (
        <div
          role="alert"
          className="mb-4 rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400"
        >
          {displayError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-fg mb-1.5"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            placeholder="name@example.com"
            disabled={isPending}
            className="w-full rounded border border-c bg-transparent px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            {...register('email')}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-fg mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            disabled={isPending}
            className="w-full rounded border border-c bg-transparent px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            {...register('password')}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400">
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 transition-colors"
        >
          {isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
