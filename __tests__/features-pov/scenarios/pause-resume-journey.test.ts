import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { GmailSyncManager, type GmailClient } from '@core/gmail/sync';
import { createRepositories, type Repositories } from '@core/repositories';

/**
 * Scenario: Pause and Resume Journey
 *
 * Tests the user's ability to pause backfill processing
 * and resume from where they left off.
 *
 * RULES:
 * - Every test calls REAL production code (GmailSyncManager, SyncStateRepository).
 * - Only the Gmail API client is mocked (can't hit real Gmail in tests).
 * - NO TuskerBrainApp, NO setTimeout hacks, NO manual persistence.
 * - If a test fails, it means the feature is NOT implemented. That's the point.
 *
 * Infrastructure note:
 * db.execSql(migrationSql) is used instead of db.initialize() because
 * drizzle's migrator cannot handle multi-statement SQL files. This is the only
 * workaround — it creates the exact same schema.
 */

function createMockGmailClient(): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({
      messages: [{ id: 'msg1' }, { id: 'msg2' }],
      nextPageToken: undefined,
    }),
    getMessage: vi.fn().mockResolvedValue({
      id: 'test-email',
      threadId: 'thread-1',
      snippet: 'Test email body',
      internalDate: Date.now().toString(),
      payload: { headers: [
        { name: 'From', value: 'sender <sender@example.com>' },
        { name: 'Subject', value: 'Test Subject' },
      ]},
    }),
    modifyMessage: vi.fn().mockResolvedValue({}),
    getProfile: vi.fn().mockResolvedValue({
      emailAddress: 'user@gmail.com',
      historyId: 'profile-history-001',
      messagesTotal: 500,
    }),
  };
}

const MIGRATION_PATH = path.join(__dirname, '../../../database/migrations/0000_initial.sql');

describe('Scenario: Pause and Resume Journey', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let mockGmailClient: GmailClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
    mockGmailClient = createMockGmailClient();
  });

  afterEach(async () => {
    await db.close();
  });

  // ─── "I can pause backfill at any point" ───

  describe('Pause Backfill (User: "I can pause backfill at any point")', () => {
    it('startInitialSync then pause sets isPaused=true in progress', async () => {
      // Given: Initial sync is started
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.startInitialSync(30);

      // When: User pauses
      await manager.pause();

      // Then: Progress shows paused
      const progress = manager.getProgress();
      expect(progress.isPaused).toBe(true);
      expect(progress.isRunning).toBe(true); // still running, just paused
    });
  });

  // ─── "Paused backfill stops processing" ───

  describe('Paused State Prevents Processing (User: "Paused means it stops")', () => {
    it('paused sync reflects isPaused flag — consumer code can check before processing', async () => {
      // Given: Sync is started and paused
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.startInitialSync(14);
      await manager.pause();

      // When: Checking progress
      const progress = manager.getProgress();

      // Then: isPaused is true — processing loop should check this flag
      expect(progress.isPaused).toBe(true);
      expect(progress.isRunning).toBe(true);

      // Verify: getProgress returns a snapshot, not a reference
      const progress2 = manager.getProgress();
      expect(progress2).toEqual(progress);
      expect(progress2).not.toBe(progress); // different object reference
    });
  });

  // ─── "I can resume my paused backfill" ───

  describe('Resume Backfill (User: "I can resume my paused backfill")', () => {
    it('pause then resume sets isPaused=false', async () => {
      // Given: Sync is paused
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.startInitialSync(30);
      await manager.pause();
      expect(manager.getProgress().isPaused).toBe(true);

      // When: User resumes
      await manager.resume();

      // Then: No longer paused
      const progress = manager.getProgress();
      expect(progress.isPaused).toBe(false);
      expect(progress.isRunning).toBe(true);
    });
  });

  // ─── "Resume continues with correct day order" ───

  describe('Resume Correct Day Order (User: "It didn\'t restart from day 1")', () => {
    it('backfill jobs maintain correct day order after pause/resume', async () => {
      // Given: Initial sync creates backfill jobs
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.startInitialSync(7);

      // Capture the original order of backfill jobs
      const jobsBeforePause = await manager.getBackfillJobs();
      expect(jobsBeforePause.length).toBe(7);
      expect(jobsBeforePause.every(j => j.status === 'pending')).toBe(true);

      // Verify days are in descending order (most recent first)
      const dates = jobsBeforePause.map(j => j.date);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]! <= dates[i - 1]!).toBe(true);
      }

      // When: Pause and resume
      await manager.pause();
      await manager.resume();

      // Then: Backfill jobs are NOT reordered
      const jobsAfterResume = await manager.getBackfillJobs();
      expect(jobsAfterResume.length).toBe(7);

      const datesAfterResume = jobsAfterResume.map(j => j.date);
      expect(datesAfterResume).toEqual(dates);
    });
  });

  // ─── "Paused state survives app restart" ───

  describe('Persist Pause Across Restart (User: "It remembered I was paused")', () => {
    it('paused state persists: pause then new instance loads paused state from DB', async () => {
      // Pre-seed sync_state so the constructor's async load() returns meaningful data
      await repos.syncState.save({
        historyId: 'existing-history-001',
        totalEmailsProcessed: 42,
        totalTokensUsed: 100,
      });

      // Session 1: Start sync and pause
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.initialize();
      await session1.startInitialSync(14);
      await session1.pause();

      // Verify paused in session 1
      expect(session1.getProgress().isPaused).toBe(true);

      // Session 2: New instance — should load paused state from SyncStateStore
      // NOTE: This test will fail if isPaused is not persisted to the sync_state
      // table or SyncStateStore. That correctly indicates a missing feature:
      // isPaused only lives in memory (SyncProgress), not in persisted SyncState.
      const session2 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session2.initialize();

      const progress2 = session2.getProgress();
      expect(progress2.isPaused).toBe(true);
    });
  });

  // ─── "UI shows paused state" ───

  describe('UI Shows Paused State (User: "I can see it\'s paused")', () => {
    it('UI can query getProgress().isPaused to show paused state', async () => {
      // Given: Sync is running
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.startInitialSync(30);

      // Then: Not paused initially
      expect(manager.getProgress().isPaused).toBe(false);

      // When: User pauses
      await manager.pause();

      // Then: UI can read the paused state
      const progress = manager.getProgress();
      expect(progress.isPaused).toBe(true);

      // UI also has total/processed counts for display
      expect(typeof progress.total).toBe('number');
      expect(typeof progress.processed).toBe('number');

      // When: User resumes
      await manager.resume();

      // Then: UI reflects resumed state
      expect(manager.getProgress().isPaused).toBe(false);
    });
  });
});
