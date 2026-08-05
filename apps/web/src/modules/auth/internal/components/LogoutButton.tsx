import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../store';

export interface LogoutButtonProps {
  className?: string;
  onLogoutSuccess?: () => void;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({
  className = '',
  onLogoutSuccess,
}) => {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    if (onLogoutSuccess) {
      onLogoutSuccess();
    } else {
      navigate({ to: '/login' });
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-c bg-card hover-bg text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
    >
      <LogOut className="w-3.5 h-3.5 text-muted" />
      <span>Logout</span>
    </button>
  );
};
