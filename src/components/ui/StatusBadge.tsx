import type { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info';

export interface StatusBadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

/**
 * StatusBadge component for displaying status indicators.
 * Variants: success (teal), warning (amber), error (red)
 */
export function StatusBadge({
  variant = 'success',
  children,
  className = '',
}: StatusBadgeProps): ReactNode {
  const variants = {
    success: 'bg-brand-50 text-brand-700 border-brand-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  const dotColors = {
    success: 'bg-brand',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold rounded-full border ${variants[variant]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />
      {children}
    </span>
  );
}

export interface BadgeProps {
  children: ReactNode;
  className?: string;
  color?: 'default' | 'orange' | 'purple' | 'teal';
}

/**
 * Generic Badge component for labels and categories.
 */
export function Badge({
  children,
  className = '',
  color = 'default',
}: BadgeProps): ReactNode {
  const colors = {
    default: 'bg-surface-muted text-text-secondary border-border',
    orange: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    teal: 'bg-brand-50 text-brand-700 border-brand-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-[11px] font-semibold rounded-md border ${colors[color]} ${className}`}
    >
      {children}
    </span>
  );
}
