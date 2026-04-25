import { useMemo } from 'react';
import type { TopBarProps } from '../components/TopBar';
import { formatRelativeTime } from '../utils/date';
import type { useSyncProgress } from './ipc';

export type SyncProgressState = ReturnType<typeof useSyncProgress>;
export type SyncIndicator = NonNullable<TopBarProps['syncIndicator']>;

type SyncStatusLike = {
  lastSync?: string | Date | null;
} | null | undefined;

type FormatLastSync = (date: Date) => string;

export function buildSyncIndicator(
  syncProgress: SyncProgressState,
  syncStatus?: SyncStatusLike,
  formatLastSync: FormatLastSync = formatRelativeTime
): SyncIndicator {
  if (syncProgress.syncPhase === 'idle' && syncProgress.processingPhase === 'idle') {
    const lastSyncLabel = syncStatus?.lastSync
      ? formatLastSync(new Date(syncStatus.lastSync))
      : undefined;
    return {
      state: 'idle',
      label: 'Up to date',
      lastSync: lastSyncLabel,
      details: { syncComplete: true, processingComplete: true },
    };
  }

  if (syncProgress.syncPhase === 'syncing') {
    return {
      state: 'syncing',
      label: 'Syncing',
      progress: syncProgress.syncProgress,
      details: {
        syncComplete: false,
        processingComplete: false,
        syncProgress: syncProgress.syncProgress,
        processingProgress: syncProgress.processingProgress,
      },
    };
  }

  if (syncProgress.processingPhase === 'processing') {
    const failedLabel = syncProgress.processingFailed > 0
      ? ` (${syncProgress.processingFailed} failed)`
      : '';
    return {
      state: 'processing',
      label: `${syncProgress.processingProgress.processed}/${syncProgress.processingProgress.total}${failedLabel}`,
      progress: syncProgress.processingProgress,
      details: {
        syncComplete: true,
        processingComplete: false,
        syncProgress: syncProgress.syncProgress,
        processingProgress: syncProgress.processingProgress,
      },
    };
  }

  if (syncProgress.backfillDay) {
    return {
      state: 'backfilling',
      label: 'Backfilling',
      details: {
        syncComplete: true,
        processingComplete: true,
        backfillDay: syncProgress.backfillDay,
        backfillTotal: syncProgress.backfillTotal,
      },
    };
  }

  if (syncProgress.syncPhase === 'complete' && syncProgress.processingPhase === 'complete') {
    const hasFailures = syncProgress.processingFailed > 0;
    return {
      state: 'synced',
      label: hasFailures ? `${syncProgress.processingFailed} failed` : 'Synced',
      details: {
        syncComplete: true,
        processingComplete: true,
      },
    };
  }

  if (syncProgress.processingPhase === 'error') {
    return {
      state: 'synced',
      label: 'Processing error',
      details: {
        syncComplete: syncProgress.syncPhase === 'complete',
        processingComplete: false,
      },
    };
  }

  if (
    syncProgress.syncPhase === 'complete' &&
    (syncProgress.processingPhase === 'idle' || syncProgress.processingPhase === 'waiting')
  ) {
    return {
      state: 'synced',
      label: 'Synced',
      details: { syncComplete: true, processingComplete: true },
    };
  }

  return {
    state: 'idle',
    label: 'Up to date',
    details: { syncComplete: true, processingComplete: true },
  };
}

export function useSyncIndicator(
  syncProgress: SyncProgressState,
  syncStatus?: SyncStatusLike
): SyncIndicator {
  return useMemo(
    () => buildSyncIndicator(syncProgress, syncStatus),
    [syncProgress, syncStatus]
  );
}
