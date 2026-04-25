import { describe, expect, it } from 'vitest';
import { buildSyncIndicator, type SyncProgressState } from '../../src/hooks/useSyncIndicator';

function createSyncProgress(overrides: Partial<SyncProgressState> = {}): SyncProgressState {
  return {
    syncPhase: 'idle',
    syncProgress: { processed: 0, total: 0 },
    processingPhase: 'idle',
    processingProgress: { processed: 0, total: 0 },
    processingFailed: 0,
    processingError: null,
    ...overrides,
  };
}

describe('useSyncIndicator', () => {
  it('builds an idle indicator with the last sync label', () => {
    const indicator = buildSyncIndicator(
      createSyncProgress(),
      { lastSync: '2026-04-25T10:00:00.000Z' },
      () => '5 minutes ago'
    );

    expect(indicator).toMatchObject({
      state: 'idle',
      label: 'Up to date',
      lastSync: '5 minutes ago',
      details: { syncComplete: true, processingComplete: true },
    });
  });

  it('builds a processing indicator with failure count in the label', () => {
    const indicator = buildSyncIndicator(createSyncProgress({
      syncPhase: 'complete',
      syncProgress: { processed: 10, total: 10 },
      processingPhase: 'processing',
      processingProgress: { processed: 4, total: 10 },
      processingFailed: 2,
    }));

    expect(indicator).toMatchObject({
      state: 'processing',
      label: '4/10 (2 failed)',
      progress: { processed: 4, total: 10 },
    });
  });

  it('builds a backfill indicator before complete states', () => {
    const indicator = buildSyncIndicator(createSyncProgress({
      syncPhase: 'complete',
      processingPhase: 'complete',
      backfillDay: 2,
      backfillTotal: 7,
    }));

    expect(indicator).toMatchObject({
      state: 'backfilling',
      label: 'Backfilling',
      details: {
        backfillDay: 2,
        backfillTotal: 7,
      },
    });
  });
});
