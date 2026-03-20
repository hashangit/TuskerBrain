import type { ReactNode } from 'react';
import { SearchBar } from './ui';

export interface TopBarProps {
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  userAvatar?: string;
  userName?: string;
  processingStatus?: {
    isProcessing: boolean;
    count?: number;
    total?: number;
  };
  actions?: ReactNode;
}

/**
 * TopBar component with search, processing status, and user chip.
 */
export function TopBar({
  searchPlaceholder = 'Search...',
  onSearch,
  userAvatar,
  userName,
  processingStatus,
  actions,
}: TopBarProps): ReactNode {
  return (
    <header className="h-[60px] flex items-center justify-between px-2">
      {/* Left Section - Search */}
      <div className="flex items-center gap-3">
        <SearchBar
          placeholder={searchPlaceholder}
          onSearch={onSearch}
          className="w-[300px]"
        />

        {/* Processing Status */}
        {processingStatus?.isProcessing && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-50 rounded-lg">
            <svg
              className="w-4 h-4 text-brand animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm text-brand-700">
              Processing {processingStatus.count || 0} emails...
            </span>
          </div>
        )}
      </div>

      {/* Right Section - Actions & User */}
      <div className="flex items-center gap-3">
        {actions}

        {/* User Chip */}
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-100 cursor-pointer hover:ring-2 hover:ring-brand transition-all">
          {userAvatar ? (
            <img src={userAvatar} alt={userName || 'User'} className="w-full h-full rounded-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-brand-700">
              {userName?.charAt(0).toUpperCase() || 'U'}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
