import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

/**
 * Text input component following design system.
 */
export function Input({
  label,
  error,
  icon,
  className = '',
  ...props
}: InputProps): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text-primary">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {icon}
          </span>
        )}
        <input
          className={`
            w-full h-10 px-3 py-2 text-sm
            bg-white rounded-lg border border-border
            text-text-primary placeholder:text-text-subtle
            focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
            transition-all duration-200
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-red-300 focus:ring-red-500' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

/**
 * Select dropdown component.
 */
export function Select({
  label,
  options,
  className = '',
  ...props
}: SelectProps): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text-primary">{label}</label>
      )}
      <select
        className={`
          w-full h-10 px-3 py-2 text-sm
          bg-white rounded-lg border border-border
          text-text-primary
          focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
          transition-all duration-200
          appearance-none cursor-pointer
          ${className}
        `}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

/**
 * Textarea component.
 */
export function Textarea({
  label,
  error,
  className = '',
  ...props
}: TextareaProps): ReactNode {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text-primary">{label}</label>
      )}
      <textarea
        className={`
          w-full px-3 py-2 text-sm
          bg-white rounded-lg border border-border
          text-text-primary placeholder:text-text-subtle
          focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent
          transition-all duration-200
          resize-none
          ${error ? 'border-red-300 focus:ring-red-500' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

/**
 * Toggle switch component.
 */
export function Toggle({
  label,
  checked,
  onChange,
  description,
}: ToggleProps): ReactNode {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div>
        <span className="text-sm font-medium text-text-primary group-hover:text-brand">
          {label}
        </span>
        {description && (
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`
          relative w-11 h-6 rounded-full transition-colors duration-200
          ${checked ? 'bg-brand' : 'bg-border'}
        `}
      >
        <span
          className={`
            absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm
            transition-transform duration-200
            ${checked ? 'left-6' : 'left-1'}
          `}
        />
      </button>
    </label>
  );
}
