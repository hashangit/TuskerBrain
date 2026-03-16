import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { FixtureHelpers } from '@fixtures/fixture-helpers';

/**
 * Feature: Sync Status & Real-time Updates
 *
 * Design Spec Reference: Lines 434-462 (Processing Flow), 719-745 (Gmail Sync Tests)
 *
 * As a user, I want to see real-time sync progress,
 * so I can pause and resume processing at any time.
 *
 * Sync Phases:
 * - Phase 1: Clean First - Apply archive/delete rules based on email type/age
 * - Phase 2: AI Backfill - Process emails day-by-day with AI
 * - Phase 3: Incremental Sync - Use historyId for new emails only
 */
describe('Feature: Sync Status & Real-time Updates', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch({ freshInstall: true });
    gmail = await GmailTestAccount.connect();
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Sync Progress Events', () => {
    it('User sees sync progress updates in real-time during initial sync', async () => {
      // Given: User starts initial sync
      await app.startInitialSync({ lookbackDays: 30 });

      // When: Sync is running
      const progressEvents = await app.captureProgressEvents(5000);

      // Then: Progress events contain expected updates
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.some(e => e.action === 'progress')).toBe(true);
    });

    it('User sees "Processing day 15 of 30..." status during initial sync', async () => {
      // Given: Initial sync is running
      await app.startInitialSync({ lookbackDays: 30 });

      // When: Progress shows current day being processed
      await app.waitForBackfillProgress(15);
      const progress = await app.getSyncProgress();

      // Then: Progress shows day being processed
      expect(progress.currentDay).toBeGreaterThanOrEqual(15);
      expect(progress.totalDays).toBe(30);
    });

    it('User sees total emails processed count during sync', async () => {
      // Given: Initial sync is running
      await app.startInitialSync({ lookbackDays: 30 });

      // When: Sync progresses
      await app.waitForProcessedCount(10);

      // Then: Count is tracked
      const progress = await app.getSyncProgress();
      expect(progress.processedCount).toBeGreaterThanOrEqual(10);
    });

    it('User sees tokens used count during sync', async () => {
      // Given: Initial sync with LLM processing
      await app.startInitialSync({ lookbackDays: 30 });

      // When: Emails are processed with AI
      await app.waitForProcessedCount(5);

      // Then: Token usage is tracked
      const progress = await app.getSyncProgress();
      expect(progress.totalTokensUsed).toBeGreaterThan(0);
    });

    it('User can pause sync mid backfill', async () => {
      // Given: Backfill is running
      await app.startInitialSync({ lookbackDays: 30 });
      await app.waitForBackfillProgress(5);

      // When: User pauses
      await app.pauseBackfill();

      // Then: Sync is paused
      const progress = await app.getSyncProgress();
      expect(progress.status).toBe('paused');
    });

    it('User can resume paused backfill', async () => {
      // Given: Backfill is paused
      await app.startInitialSync({ lookbackDays: 30 });
      await app.waitForBackfillProgress(5);
      await app.pauseBackfill();
      const pausedDay = (await app.getSyncProgress()).currentDay;

      // When: User resumes
      await app.resumeBackfill();

      // Then: Sync resumes from where it left off
      const progress = await app.getSyncProgress();
      expect(progress.status).toBe('running');
      expect(progress.currentDay).toBeGreaterThanOrEqual(pausedDay);
    });
  });

  describe('Incremental Sync', () => {
    it('User sees incremental sync fetch only new emails after initial sync', async () => {
      // Given: Initial sync has completed
      await app.completeInitialSync();

      // When: New email arrives in Gmail
      const newEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'New email',
        body: 'This is a new email',
        category: 'primary',
      });

      await app.waitForNextSync();

      // Then: New email appears in timeline
      const timeline = await app.getTimeline();
      expect(timeline.some(e => e.emailId === newEmail.id)).toBe(true);
    });

    it('User sees incremental sync completes quickly', async () => {
      // Given: Initial sync completed
      await app.completeInitialSync();

      // When: Only one new email arrives
      await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Single new email',
        body: 'Content',
        category: 'primary',
      });

      const startTime = Date.now();
      await app.waitForNextSync();
      const duration = Date.now() - startTime;

      // Then: Incremental sync is fast
      expect(duration).toBeLessThan(10000); // Under 10 seconds
    });
  });

  describe('Sync Errors', () => {
    it('User sees error notification when Gmail API rate limit is hit', async () => {
      // Given: Gmail API has rate limiting
      await gmail.simulateRateLimit();

      // When: User tries to sync
      await app.startInitialSync({ lookbackDays: 30 });

      // Then: User sees error notification
      const notifications = await app.getNotifications();
      expect(notifications.some(n => n.type === 'error')).toBe(true);
    });

    it('User sees sync recover automatically from network interruption', async () => {
      // Given: Network temporarily fails
      await gmail.simulateNetworkError();

      // When: Sync runs
      await app.startInitialSync({ lookbackDays: 30 });

      // Then: Sync shows error but will retry
      const state = await app.getSyncState();
      expect(state.lastError).toBeDefined();

      // When: Network recovers
      await gmail.recoverNetwork();
      await app.waitForNextSync();

      // Then: Sync succeeds
      const recoveredState = await app.getSyncState();
      expect(recoveredState.status).toBe('synced');
    });
  });

  describe('Job Queue Status', () => {
    it('User sees pending jobs count in job queue', async () => {
      // Given: Jobs are created
      await app.seedJobs({ count: 5 });

      // When: User views queue status
      const stats = await app.getJobQueueStats();

      // Then: Pending count is shown
      expect(stats.pending).toBe(5);
    });

    it('User sees completed jobs count after backfill finishes', async () => {
      // Given: Jobs are processed
      await app.seedJobs({ count: 3 });
      await app.processAllJobs();

      // When: User views queue status
      const stats = await app.getJobQueueStats();

      // Then: Completed count is shown
      expect(stats.completed).toBe(3);
    });

    it('User sees failed job count in queue', async () => {
      // Given: Some jobs fail
      await app.seedJobs({ count: 3, failCount: 1 });
      await app.processAllJobs();

      // When: User views queue status
      const stats = await app.getJobQueueStats();

      // Then: Failed count is shown
      expect(stats.failed).toBe(1);
    });
  });

  describe('Phase 1: Clean First Execution', () => {
    it('Phase 1 archives old promotional emails immediately', async () => {
      // Given: User has promotional emails older than 1 month
      const oldPromo = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Flash Sale',
        body: 'Limited offer',
        category: 'promotions',
        date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
      });

      // When: Phase 1 Clean First runs
      await app.runPhase1CleanFirst({ lookbackDays: 90 });

      // Then: Old promotional email is deleted
      const email = await gmail.getEmail(oldPromo.id);
      expect(email).toBeNull();
    });

    it('Phase 1 archives old update emails (not deletes)', async () => {
      // Given: User has update emails older than 1 month
      const oldUpdate = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Statement Ready',
        body: 'Your statement is available',
        category: 'updates',
        date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
      });

      // When: Phase 1 Clean First runs
      await app.runPhase1CleanFirst({ lookbackDays: 90 });

      // Then: Update email is archived (still exists, not in inbox)
      const email = await gmail.getEmail(oldUpdate.id);
      expect(email).toBeDefined();
      expect(email?.labels).not.toContain('INBOX');
    });

    it('Phase 1 completes before Phase 2 begins', async () => {
      // Given: User starts full sync
      await app.startInitialSync({ lookbackDays: 30 });

      // When: Phase 1 completes
      await app.waitForPhase1Complete();

      // Then: Phase 2 starts automatically
      const state = await app.getSyncState();
      expect(state.currentPhase).toBe(2);
    });
  });

  describe('Phase Transitions', () => {
    it('Phase 1 done → Phase 2 starts automatically', async () => {
      // Given: Phase 1 is running
      await app.startInitialSync({ lookbackDays: 30 });
      await app.waitForPhase1Complete();

      // When: Phase 1 finishes

      // Then: Phase 2 starts automatically
      const state = await app.getSyncState();
      expect(state.currentPhase).toBe(2);
      expect(state.status).toBe('running');
    });

    it('Phase 2 done → Phase 3 incremental sync begins', async () => {
      // Given: Phase 2 backfill is running
      await app.startInitialSync({ lookbackDays: 7 }); // Small for faster test
      await app.waitForPhase2Complete();

      // When: Phase 2 finishes

      // Then: Phase 3 incremental sync begins
      const state = await app.getSyncState();
      expect(state.currentPhase).toBe(3);
      expect(state.status).toBe('synced');
    });
  });

  describe('Sync Interval Configuration', () => {
    it('User can set 15-minute sync interval', async () => {
      // Given: User wants frequent sync
      await app.configureSyncInterval(15);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: 15-minute interval is configured
      expect(settings.syncInterval).toBe(15);
    });

    it('User can set 30-minute sync interval', async () => {
      // Given: User wants standard sync
      await app.configureSyncInterval(30);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: 30-minute interval is configured
      expect(settings.syncInterval).toBe(30);
    });

    it('User can set 1-hour sync interval', async () => {
      // Given: User wants hourly sync
      await app.configureSyncInterval(60);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: 1-hour interval is configured
      expect(settings.syncInterval).toBe(60);
    });

    it('User can set 2-hour sync interval', async () => {
      // Given: User wants less frequent sync
      await app.configureSyncInterval(120);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: 2-hour interval is configured
      expect(settings.syncInterval).toBe(120);
    });

    it('User can set daily sync interval', async () => {
      // Given: User wants daily sync only
      await app.configureSyncInterval(1440);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: Daily interval is configured
      expect(settings.syncInterval).toBe(1440);
    });
  });

  describe('Lookback Period Configuration', () => {
    it('User can set 7-day lookback period', async () => {
      // Given: User wants minimal backfill
      await app.configureLookbackDays(7);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: 7-day lookback is configured
      expect(settings.lookbackDays).toBe(7);
    });

    it('User can set 14-day lookback period', async () => {
      // Given: User wants 2-week backfill
      await app.configureLookbackDays(14);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: 14-day lookback is configured
      expect(settings.lookbackDays).toBe(14);
    });

    it('User can set 30-day lookback period', async () => {
      // Given: User wants 1-month backfill
      await app.configureLookbackDays(30);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: 30-day lookback is configured
      expect(settings.lookbackDays).toBe(30);
    });

    it('User can set 60-day lookback period', async () => {
      // Given: User wants 2-month backfill
      await app.configureLookbackDays(60);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: 60-day lookback is configured
      expect(settings.lookbackDays).toBe(60);
    });

    it('User can set 90-day lookback period', async () => {
      // Given: User wants 3-month backfill
      await app.configureLookbackDays(90);

      // When: Setting is saved
      const settings = await app.getSettings();

      // Then: 90-day lookback is configured
      expect(settings.lookbackDays).toBe(90);
    });
  });

  describe('App Restart Recovery', () => {
    it('Restart during Phase 2 → resumes from last completed day', async () => {
      // Given: Phase 2 is at day 15 of 30
      await app.startInitialSync({ lookbackDays: 30 });
      await app.waitForBackfillProgress(15);
      const pausedDay = (await app.getSyncProgress()).currentDay;

      // When: App restarts
      await app.restart();

      // Then: Sync resumes from last checkpoint
      const state = await app.getSyncState();
      expect(state.currentPhase).toBe(2);
      expect(state.currentDay).toBeGreaterThanOrEqual(pausedDay);
    });

    it('Restart with pending jobs → jobs are recreated on startup', async () => {
      // Given: Jobs are pending when app restarts
      await app.seedJobs({ count: 5 });
      await app.restart();

      // When: App starts up

      // Then: Pending jobs are recovered
      const stats = await app.getJobQueueStats();
      expect(stats.pending + stats.running).toBeGreaterThanOrEqual(5);
    });

    it('Paused state persists across restart', async () => {
      // Given: Sync is paused
      await app.startInitialSync({ lookbackDays: 30 });
      await app.waitForBackfillProgress(10);
      await app.pauseBackfill();

      // When: App restarts
      await app.restart();

      // Then: Sync remains paused
      const progress = await app.getSyncProgress();
      expect(progress.status).toBe('paused');
    });
  });

  describe('Sync State Table Validation', () => {
    it('Sync state has history_id populated after sync', async () => {
      // Given: Initial sync completes
      await app.completeInitialSync();

      // When: User checks sync state
      const state = await app.getSyncState();

      // Then: history_id is populated
      expect(state.historyId).toBeDefined();
      expect(state.historyId).toBeGreaterThan(0);
    });

    it('Sync state has last_full_sync timestamp', async () => {
      // Given: Initial sync completes
      await app.completeInitialSync();

      // When: User checks sync state
      const state = await app.getSyncState();

      // Then: last_full_sync is populated
      expect(state.lastFullSync).toBeDefined();
      expect(new Date(state.lastFullSync!).getTime()).toBeLessThan(Date.now());
    });

    it('Sync state has current_phase tracked', async () => {
      // Given: Sync is in progress
      await app.startInitialSync({ lookbackDays: 30 });
      await app.waitForBackfillProgress(5);

      // When: User checks sync state
      const state = await app.getSyncState();

      // Then: current_phase is tracked
      expect(state.currentPhase).toBeDefined();
      expect([1, 2, 3]).toContain(state.currentPhase);
    });

    it('Sync state has emails_processed count', async () => {
      // Given: Emails are processed
      await app.startInitialSync({ lookbackDays: 30 });
      await app.waitForProcessedCount(5);

      // When: User checks sync state
      const state = await app.getSyncState();

      // Then: emails_processed is tracked
      expect(state.emailsProcessed).toBeDefined();
      expect(state.emailsProcessed).toBeGreaterThanOrEqual(5);
    });
  });
});
