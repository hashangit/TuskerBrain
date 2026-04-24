import type { ReactNode } from 'react';
import { SearchBar } from './ui';
import { SyncPill, type SyncPillProps } from './SyncPill';

export interface TopBarProps {
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  userAvatar?: string;
  userName?: string;
  syncIndicator?: Omit<SyncPillProps, 'state'> & {
    state: 'idle' | 'syncing' | 'processing' | 'backfilling' | 'synced';
  };
  actions?: ReactNode;
}

/**
 * TopBar component with search, sync indicator, and user chip.
 */
export function TopBar({
  searchPlaceholder = 'Search...',
  onSearch,
  userAvatar,
  userName,
  syncIndicator,
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

        {/* Sync Indicator */}
        {syncIndicator && (
          <SyncPill {...syncIndicator} />
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
