import { createRootRoute, Outlet, redirect } from '@tanstack/react-router';
import { useAuth, useAuthStore, LogoutButton } from '@/modules/auth';

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const isPublicRoute =
      location.pathname === '/login' || location.pathname === '/register';

    const store = useAuthStore.getState();
    const token = localStorage.getItem('access_token');

    if (!store.isAuthenticated && token && !store.user) {
      await store.checkAuth();
    }

    const updatedIsAuthenticated = useAuthStore.getState().isAuthenticated;

    if (!isPublicRoute && !updatedIsAuthenticated) {
      throw redirect({
        to: '/login',
      });
    }

    if (isPublicRoute && updatedIsAuthenticated) {
      throw redirect({
        to: '/',
      });
    }
  },
  component: RootComponent,
});

function RootComponent() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      {isAuthenticated && (
        <header className="h-14 border-b border-c bg-card px-4 md:px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">
              Console
            </span>
            {user?.email && (
              <span className="text-xs mono text-muted border-l border-c pl-3">
                {user.email}
              </span>
            )}
          </div>
          <LogoutButton />
        </header>
      )}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
