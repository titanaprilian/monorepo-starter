import * as React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'secondary';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  className,
  variant = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' &&
          'bg-slate-50 text-slate-950 hover:bg-slate-200',
        variant === 'secondary' &&
          'bg-slate-800 text-slate-50 hover:bg-slate-700',
        className
      )}
      {...props}
    />
  );
}
