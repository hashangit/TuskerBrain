import type { ReactNode } from 'react';
import { useState, useRef, useEffect } from 'react';

export interface SyncPillProps {
  state: 'idle' | 'syncing' | 'processing' | 'backfilling' | 'synced' | 'uptodate';
  label: string;
  lastSync?: string;
  progress?: { processed: number; total: number };
  details?: {
    syncComplete: boolean;
    processingComplete: boolean;
    syncProgress?: { processed: number; total: number };
    processingProgress?: { processed: number; total: number };
    backfillDay?: number;
    backfillTotal?: number;
  };
}

// Spinner component for syncing state
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
  );
}

// Checkmark icon for synced state
function Checkmark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

// Popover content
function SyncPopover({ details }: { details?: SyncPillProps['details'] }) {
  if (!details) return null;

  const syncPercent = details.syncProgress
    ? Math.round((details.syncProgress.processed / details.syncProgress.total) * 100)
    : details.syncComplete ? 100 : 0;

  const processingPercent = details.processingProgress
    ? Math.round((details.processingProgress.processed / details.processingProgress.total) * 100)
    : details.processingComplete ? 100 : 0;

  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white border border-border rounded-xl shadow-lg p-3 z-50">
      {/* Gmail Sync Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {details.syncComplete ? (
            <div className="w-4 h-4 text-green-600">
              <Checkmark />
            </div>
          ) : (
            <div className="w-4 h-4 text-brand animate-spin">
              <Spinner />
            </div>
          )}
          <span className="text-sm text-text-primary">Gmail Sync</span>
        </div>
        <span className="text-xs text-text-subtle">
          {details.syncComplete
            ? 'Complete'
            : details.syncProgress
              ? `${details.syncProgress.processed}/${details.syncProgress.total}`
              : 'Starting...'}
        </span>
      </div>

      {/* AI Processing Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {details.processingComplete ? (
            <div className="w-4 h-4 text-green-600">
              <Checkmark />
            </div>
          ) : (
            <div className="w-4 h-4 text-brand animate-spin">
              <Spinner />
            </div>
          )}
          <span className="text-sm text-text-primary">AI Processing</span>
        </div>
        <span className="text-xs text-text-subtle">
          {details.processingComplete
            ? 'Complete'
            : details.processingProgress
              ? `${details.processingProgress.processed}/${details.processingProgress.total}`
              : 'Waiting...'}
        </span>
      </div>

      {/* Backfill Row (if active) */}
      {details.backfillDay && details.backfillTotal && (
        <div className="flex items-center justify-between mb-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 text-brand animate-spin">
              <Spinner />
            </div>
            <span className="text-sm text-text-primary">Backfilling</span>
          </div>
          <span className="text-xs text-text-subtle">
            Day {details.backfillDay} of {details.backfillTotal}
          </span>
        </div>
      )}

      {/* Progress Bar */}
      {!details.syncComplete || !details.processingComplete ? (
        <div className="mt-2 h-1.5 bg-surface-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-brand transition-all duration-300 ease-out"
            style={{ width: `${Math.max(syncPercent, processingPercent)}%` }}
          />
        </div>
      ) : (
        <div className="mt-2 h-1.5 bg-green-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 w-full" />
        </div>
      )}
    </div>
  );
}

/**
 * SyncPill component - displays sync status in the top bar
 * Always visible. Shows: syncing, processing, backfilling, synced, or uptodate.
 * On hover, shows a popover with detailed progress.
 */
export function SyncPill({ state, label, lastSync, progress, details }: SyncPillProps): ReactNode {
  const [isHovered, setIsHovered] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsHovered(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pillRef.current &&
        !pillRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setIsHovered(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Map idle to uptodate for display
  const displayState = state === 'idle' ? 'uptodate' : state;

  const getStateClasses = () => {
    switch (displayState) {
      case 'syncing':
        return 'bg-brand-50 text-brand-700 border-brand-200';
      case 'processing':
      case 'backfilling':
        return 'bg-brand-50 text-brand-700 border-brand-200';
      case 'synced':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'uptodate':
        return 'bg-surface text-text-muted border-border';
      default:
        return 'bg-surface text-text-muted border-border';
    }
  };

  return (
    <div
      ref={pillRef}
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Pill */}
      <div
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${getStateClasses()} cursor-pointer hover:ring-2 hover:ring-brand/20 transition-all`}
      >
        {displayState === 'syncing' || displayState === 'processing' || displayState === 'backfilling' ? (
          <div className="w-3 h-3">
            <Spinner />
          </div>
        ) : (
          <div className="w-3 h-3">
            <Checkmark />
          </div>
        )}
        <span>{label}</span>
        {lastSync && <span className="text-text-subtle ml-0.5">• {lastSync}</span>}
      </div>

      {/* Popover */}
      {isHovered && details && (
        <div ref={popoverRef}>
          <SyncPopover details={details} />
        </div>
      )}
    </div>
  );
}
