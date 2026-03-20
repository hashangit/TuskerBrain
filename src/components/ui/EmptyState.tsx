import type { ReactNode } from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * EmptyState component for displaying when no data is available.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      {icon && (
        <div className="w-16 h-16 rounded-full bg-surface-muted flex items-center justify-center mb-4 text-text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-text-muted text-center max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
