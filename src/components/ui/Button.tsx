import type { ReactNode, ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

/**
 * Button component following TuskerBrain Design System.
 * Variants: primary (teal), ghost (transparent with border)
 */
export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps): ReactNode {
  const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-[10px] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-brand text-white shadow-button hover:bg-brand-600 active:bg-brand-700 border border-brand-600',
    ghost: 'bg-white/60 text-text-primary border border-border hover:bg-surface-hover active:bg-surface-muted',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-3.5 py-2.5 text-[13px] gap-2',
    lg: 'px-4 py-3 text-sm gap-2',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
