import type { ReactNode } from 'react';

export interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

/**
 * Sidebar navigation item following TuskerBrain design system.
 */
export function SidebarItem({
  icon,
  label,
  active = false,
  onClick,
}: SidebarItemProps): ReactNode {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px]
        font-semibold text-[13px] transition-all duration-200
        ${active
          ? 'bg-brand-50 text-brand-700'
          : 'text-brand-800 hover:bg-surface-hover'
        }
      `}
    >
      <span className={`w-[18px] h-[18px] ${active ? 'text-brand' : 'text-brand-600'}`}>
        {icon}
      </span>
      {label}
    </button>
  );
}

export interface SidebarProps {
  children?: ReactNode;
  navItems: Array<{
    id: string;
    icon: ReactNode;
    label: string;
    active?: boolean;
    onClick?: () => void;
  }>;
  bottomItems?: Array<{
    id: string;
    icon: ReactNode;
    label: string;
    onClick?: () => void;
  }>;
  syncStatus?: {
    isSynced: boolean;
    lastSync?: string;
  };
}

/**
 * Sidebar navigation component with logo, nav items, and sync status.
 */
export function Sidebar({
  navItems,
  bottomItems,
  syncStatus,
}: SidebarProps): ReactNode {
  return (
    <aside className="w-60 h-full bg-white rounded-2xl shadow-lg flex flex-col py-4">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
          <span className="text-white font-bold text-sm">TB</span>
        </div>
        <span className="font-display font-bold text-brand-800">TuskerBrain</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 space-y-1">
        {navItems.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={item.active}
            onClick={item.onClick}
          />
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="px-4 pt-2 space-y-1 border-t border-border mt-2">
        {bottomItems?.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            onClick={item.onClick}
          />
        ))}

        {/* Sync Status */}
        {syncStatus && (
          <div className="flex items-center gap-2 px-3.5 py-2 text-xs text-text-muted">
            <span className={`w-2 h-2 rounded-full ${syncStatus.isSynced ? 'bg-brand' : 'bg-amber-500'}`} />
            {syncStatus.lastSync || 'Not synced yet'}
          </div>
        )}
      </div>
    </aside>
  );
}
