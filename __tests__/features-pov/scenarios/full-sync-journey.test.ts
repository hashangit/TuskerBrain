import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@foundations/database';
import { GmailSyncManager, type GmailClient } from '@domain/sync/sync';
import { createRepositories, type Repositories } from '@foundations/persistence';

/**
 * Scenario: Full Sync Journey
 *
 * Tests the complete synchronization journey from initial connection
 * through all three phases to completion.
 *
 * Sync Phases:
 * 1. Phase 1: Clean First (no AI) - Apply archival/deletion rules
 * 2. Phase 2: AI Backfill - Gradually process with AI
 * 3. Phase 3: Incremental Sync - Track historyId for updates
 *
 * RULES:
 * - Every test calls REAL production code (GmailSyncManager, Repositories, DB).
 * - Only the Gmail API client is mocked (can't hit real Gmail in tests).
 * - NO TuskerBrainApp import.
 * - If a test fails, it means the feature is NOT implemented. That's the point.
 *
 * Infrastructure note:
 * db.execSql(migrationSql) is used instead of db.initialize() because
 * drizzle's migrator cannot handle multi-statement SQL files.
 */

function createMockGmailClient(): GmailClient & {
  listMessages: ReturnType<typeof vi.fn>;
  getMessage: ReturnType<typeof vi.fn>;
  getProfile: ReturnType<typeof vi.fn>;
  modifyMessage: ReturnType<typeof vi.fn>;
} {
  return {
    listMessages: vi.fn().mockResolvedValue({
      messages: [{ id: 'msg1' }, { id: 'msg2' }, { id: 'msg3' }],
      nextPageToken: undefined,
      historyId: 'initial-history-100',
    }),
    getMessage: vi.fn().mockResolvedValue({
      id: 'test-email',
      threadId: 'thread-1',
      snippet: 'Test email body',
      internalDate: Date.now().toString(),
      payload: {
        headers: [
          { name: 'From', value: 'sender <sender@example.com>' },
          { name: 'Subject', value: 'Test Subject' },
        ],
      },
    }),
    modifyMessage: vi.fn().mockResolvedValue({}),
    getProfile: vi.fn().mockResolvedValue({
      emailAddress: 'user@gmail.com',
      historyId: 'profile-history-001',
      messagesTotal: 500,
    }),
  };
}

const MIGRATION_PATH = path.join(__dirname, '../../../foundations/database/migrations/0000_initial.sql');

describe('Scenario: Full Sync Journey', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let mockGmailClient: ReturnType<typeof createMockGmailClient>;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = new TuskerBrainDatabase(':memory:');
    await db.execSql(fs.readFileSync(MIGRATION_PATH, 'utf-8'));
    repos = createRepositories(db);
    mockGmailClient = createMockGmailClient();
  });

  afterEach(async () => {
    await db.close();
  });

  // ─── "Full 3-Phase Sync Journey" ───

  describe('Complete Journey (User: "My whole inbox gets synced end to end")', () => {
    it('User completes full sync journey: initial sync -> backfill jobs -> incremental sync', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);

      // Phase 1+2: startInitialSync fetches profile, creates backfill jobs, persists state
      await manager.startInitialSync(7);

      // Verify profile was fetched and historyId captured
      expect(mockGmailClient.getProfile).toHaveBeenCalled();

      // Verify backfill jobs were created for the lookback period
      const backfillJobs = await manager.getBackfillJobs();
      expect(backfillJobs.length).toBe(7);
      expect(backfillJobs.every((j) => j.status === 'pending')).toBe(true);

      // Verify sync state was persisted with historyId
      // Note: startInitialSync calls getProfile first (profile-history-001),
      // then listMessages which returns initial-history-100 — the latter overwrites.
      const state = await manager.getSyncState();
      expect(state.historyId).toBe('initial-history-100');
      expect(state.lastFullSync).toBeDefined();

      // Verify persisted to DB (not just in-memory)
      const persistedState = await repos.syncState.load();
      expect(persistedState.historyId).toBe('initial-history-100');

      // Phase 3: Incremental sync using the historyId from Phase 1
      mockGmailClient.listMessages.mockResolvedValueOnce({
        messages: [{ id: 'new-msg-1' }, { id: 'new-msg-2' }],
        nextPageToken: undefined,
        historyId: 'incremental-history-200',
      });

      await manager.startIncrementalSync(state.historyId!);

      // Verify incremental sync used the persisted historyId
      expect(mockGmailClient.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ startHistoryId: 'initial-history-100' })
      );

      // Verify incremental sync updated the historyId
      const stateAfterIncremental = await manager.getSyncState();
      expect(stateAfterIncremental.historyId).toBe('incremental-history-200');
      expect(stateAfterIncremental.lastIncrementalSync).toBeDefined();
    });
  });

  // ─── "Phase 1 -> Phase 2 transition" ───

  describe('Phase 1->2 Transition (User: "After initial sync, backfill jobs exist")', () => {
    it('After initial sync completes, backfill jobs exist with correct dates spanning lookback', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);

      const LOOKBACK_DAYS = 14;
      await manager.startInitialSync(LOOKBACK_DAYS);

      // Verify backfill jobs were created
      const jobs = await manager.getBackfillJobs();
      expect(jobs.length).toBe(LOOKBACK_DAYS);

      // Verify all jobs are pending (not yet processed)
      const allPending = jobs.every((j) => j.status === 'pending');
      expect(allPending).toBe(true);

      // Verify all jobs are backfill_day type
      const allCorrectType = jobs.every((j) => j.type === 'backfill_day');
      expect(allCorrectType).toBe(true);

      // Verify dates span the lookback period (today going back)
      const today = new Date().toISOString().split('T')[0];
      const firstDate = jobs[0].date;
      expect(firstDate).toBe(today);

      // Verify dates are ordered newest first
      for (let i = 1; i < jobs.length; i++) {
        const prevDate = new Date(jobs[i - 1].date);
        const currDate = new Date(jobs[i].date);
        expect(currDate.getTime()).toBeLessThan(prevDate.getTime());
      }

      // Verify the last job covers LOOKBACK_DAYS ago
      const earliestDate = new Date();
      earliestDate.setDate(earliestDate.getDate() - (LOOKBACK_DAYS - 1));
      const earliestStr = earliestDate.toISOString().split('T')[0];
      expect(jobs[jobs.length - 1].date).toBe(earliestStr);

      // Verify progress tracking started
      const progress = manager.getProgress();
      expect(progress.total).toBeGreaterThan(0);
    });
  });

  // ─── "Phase 2 -> Phase 3 transition" ───

  describe('Phase 2->3 Transition (User: "After processing, incremental sync works")', () => {
    it('After processing emails, state transitions allow incremental sync to pick up new mail', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);

      // Phase 1: Initial sync
      await manager.startInitialSync(7);

      // Phase 2: Process some emails
      mockGmailClient.getMessage.mockResolvedValueOnce({
        id: 'msg1',
        threadId: 'thread-1',
        snippet: 'First email',
        internalDate: Date.now().toString(),
        payload: {
          headers: [
            { name: 'From', value: 'alice <alice@example.com>' },
            { name: 'Subject', value: 'Hello World' },
          ],
        },
      });
      mockGmailClient.getMessage.mockResolvedValueOnce({
        id: 'msg2',
        threadId: 'thread-2',
        snippet: 'Second email',
        internalDate: Date.now().toString(),
        payload: {
          headers: [
            { name: 'From', value: 'bob <bob@example.com>' },
            { name: 'Subject', value: 'Re: Hello' },
          ],
        },
      });

      const email1 = await manager.processEmail('msg1');
      const email2 = await manager.processEmail('msg2');

      expect(email1).not.toBeNull();
      expect(email1!.id).toBe('msg1');
      expect(email2).not.toBeNull();
      expect(email2!.id).toBe('msg2');

      // Verify processing incremented the counter
      const stateAfterProcessing = await manager.getSyncState();
      expect(stateAfterProcessing.totalEmailsProcessed).toBe(2);

      // Verify progress is tracked
      const progressAfterProcessing = manager.getProgress();
      expect(progressAfterProcessing.processed).toBe(2);

      // Phase 3: Incremental sync — simulates new mail arriving
      const savedState = await repos.syncState.load();
      expect(savedState.historyId).toBeDefined();

      mockGmailClient.listMessages.mockResolvedValueOnce({
        messages: [{ id: 'new-after-processing' }],
        nextPageToken: undefined,
        historyId: 'history-after-phase2',
      });

      await manager.startIncrementalSync(savedState.historyId!);

      // Incremental sync should have been called with the saved historyId
      expect(mockGmailClient.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ startHistoryId: savedState.historyId })
      );

      // New historyId should be persisted
      const finalState = await repos.syncState.load();
      expect(finalState.historyId).toBe('history-after-phase2');
      expect(finalState.lastIncrementalSync).toBeDefined();

      // Counter should still reflect Phase 2 processing
      expect(finalState.totalEmailsProcessed).toBe(2);
    });
  });

  // ─── "Progress is monotonically increasing" ───

  describe('Progress Visibility (User: "Progress never goes backwards")', () => {
    it('Processed count is monotonically increasing throughout the sync journey', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);

      await manager.startInitialSync(5);

      // Capture progress snapshots as we process emails
      const processedSnapshots: number[] = [];

      // Initial progress after startInitialSync
      const progress0 = manager.getProgress();
      processedSnapshots.push(progress0.processed);

      // Process multiple emails, capturing progress after each
      for (let i = 1; i <= 3; i++) {
        mockGmailClient.getMessage.mockResolvedValueOnce({
          id: `email-${i}`,
          threadId: `thread-${i}`,
          snippet: `Email ${i}`,
          internalDate: Date.now().toString(),
          payload: {
            headers: [
              { name: 'From', value: `sender${i} <sender${i}@example.com>` },
              { name: 'Subject', value: `Subject ${i}` },
            ],
          },
        });

        await manager.processEmail(`email-${i}`);
        const progress = manager.getProgress();
        processedSnapshots.push(progress.processed);
      }

      // Verify: progress is monotonically non-decreasing
      for (let i = 1; i < processedSnapshots.length; i++) {
        expect(processedSnapshots[i]).toBeGreaterThanOrEqual(processedSnapshots[i - 1]);
      }

      // Final processed count should equal number of emails processed
      const finalProgress = manager.getProgress();
      expect(finalProgress.processed).toBe(3);
    });
  });

  // ─── "Transient error recovery" ───

  describe('Error Recovery (User: "A temporary glitch does not kill my sync")', () => {
    it('Journey recovers after a transient network error during listMessages', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);

      // Configure mock: first call to listMessages fails with network error, then succeeds
      mockGmailClient.listMessages
        .mockRejectedValueOnce(new Error('Network error: ECONNRESET'))
        .mockResolvedValueOnce({
          messages: [{ id: 'recovered-msg-1' }, { id: 'recovered-msg-2' }],
          nextPageToken: undefined,
          historyId: 'recovered-history-300',
        });

      // startInitialSync calls getProfile (succeeds) then listMessages (fails once, retries)
      // The withRetry logic will catch the network error and retry
      await manager.startInitialSync(7);

      // Verify listMessages was called twice (fail + retry)
      expect(mockGmailClient.listMessages).toHaveBeenCalledTimes(2);

      // Verify sync completed successfully despite the transient error
      const state = await manager.getSyncState();
      expect(state.historyId).toBeDefined();
      expect(state.lastFullSync).toBeDefined();

      // Verify backfill jobs were created after recovery
      const jobs = await manager.getBackfillJobs();
      expect(jobs.length).toBe(7);

      // Verify persisted state reflects the successful retry
      const persistedState = await repos.syncState.load();
      expect(persistedState.historyId).toBe('recovered-history-300');

      // Verify we can proceed to incremental sync after recovery
      mockGmailClient.listMessages.mockResolvedValueOnce({
        messages: [{ id: 'post-recovery-msg' }],
        nextPageToken: undefined,
        historyId: 'post-recovery-400',
      });

      await manager.startIncrementalSync(state.historyId!);

      const finalState = await manager.getSyncState();
      expect(finalState.historyId).toBe('post-recovery-400');
      expect(finalState.lastIncrementalSync).toBeDefined();
    });
  });
});
