import type { ReactNode } from 'react';
import { Sidebar } from './AppShell';
import { TopBar, type TopBarProps } from './TopBar';

// Icon components for navigation
const Icons = {
  Timeline: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Topics: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  Senders: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Deals: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  Settings: () => (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-full h-full">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export interface AppLayoutProps {
  children: ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
  topBarProps?: Omit<TopBarProps, 'processingStatus'> & {
    processingStatus?: TopBarProps['processingStatus'];
  };
  syncStatus?: {
    isSynced: boolean;
    lastSync?: string;
  };
}

/**
 * Main application layout with sidebar and top bar.
 */
export function AppLayout({
  children,
  currentPath,
  onNavigate,
  topBarProps,
  syncStatus,
}: AppLayoutProps): ReactNode {
  const navItems = [
    { id: '/timeline', icon: <Icons.Timeline />, label: 'Timeline' },
    { id: '/topics', icon: <Icons.Topics />, label: 'Topics' },
    { id: '/senders', icon: <Icons.Senders />, label: 'Senders' },
    { id: '/deals', icon: <Icons.Deals />, label: 'Deals' },
  ];

  const bottomItems = [
    { id: '/settings', icon: <Icons.Settings />, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-surface-muted p-4 flex gap-4">
      {/* Sidebar */}
      <Sidebar
        navItems={navItems.map((item) => ({
          ...item,
          active: currentPath === item.id,
          onClick: () => onNavigate(item.id),
        }))}
        bottomItems={bottomItems.map((item) => ({
          ...item,
          onClick: () => onNavigate(item.id),
        }))}
        syncStatus={syncStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Top Bar */}
        <TopBar {...topBarProps} />

        {/* Content Area */}
        <div className="flex-1 bg-white rounded-2xl shadow-lg p-4 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
