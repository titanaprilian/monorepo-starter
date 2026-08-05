import { useAuthStore } from "./internal/store";

export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    checkAuth,
    login,
    logout,
  };
};

export { useAuthStore };
