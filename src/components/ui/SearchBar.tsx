import type { ReactNode, InputHTMLAttributes } from 'react';

export interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onSearch?: (value: string) => void;
}

/**
 * SearchBar component following TuskerBrain design system.
 */
export function SearchBar({
  placeholder = 'Search...',
  onSearch,
  className = '',
  ...props
}: SearchBarProps): ReactNode {
  return (
    <div className={`relative ${className}`}>
      <svg
        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        className="
          w-full h-10 pl-10 pr-4
          bg-white rounded-full
          border border-transparent
          text-sm text-text-primary placeholder:text-text-subtle
          shadow-sm
          focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
          transition-all duration-200
        "
        onChange={(e) => onSearch?.(e.target.value)}
        {...props}
      />
    </div>
  );
}
