import type { ReactNode, HTMLAttributes } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

/**
 * Card component with design system shadow and border.
 */
export function Card({
  children,
  className = '',
  padding = 'md',
  hover = false,
  ...props
}: CardProps): ReactNode {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
  };

  return (
    <div
      className={`
        bg-white rounded-[14px] border border-border
        shadow-card ${hover ? 'hover:shadow-card-hover hover:border-border-muted' : ''}
        transition-all duration-200
        ${paddings[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

/**
 * Card header with title and optional action.
 */
export function CardHeader({ title, subtitle, action }: CardHeaderProps): ReactNode {
  return (
    <div className="flex items-start justify-between mb-3">
      <div>
        <h3 className="font-display font-semibold text-text-primary">{title}</h3>
        {subtitle && (
          <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
