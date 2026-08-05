import { useAuthStore } from './internal/store';
import {
  LoginForm,
  type LoginFormProps,
} from './internal/components/LoginForm';
import {
  RegisterForm,
  type RegisterFormProps,
} from './internal/components/RegisterForm';
import {
  registerSchema,
  loginSchema,
  type RegisterSchema,
  type LoginSchema,
} from './internal/schema';

export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const logout = useAuthStore((state) => state.logout);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    checkAuth,
    login,
    register,
    logout,
  };
};

export {
  useAuthStore,
  LoginForm,
  type LoginFormProps,
  RegisterForm,
  type RegisterFormProps,
  registerSchema,
  loginSchema,
  type RegisterSchema,
  type LoginSchema,
};
