import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Sync Status & Real-time Updates
 *
 * As a user, I want to see real-time sync progress,
 * so I can pause and resume processing at any time.
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
});
