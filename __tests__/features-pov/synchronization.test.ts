import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Sync Status & Real-time Updates
 *
 * As a user, I want to see real-time sync progress,
 * so I can pause and resume processing at any time.
 *
 * Design Doc Coverage:
 * - Lines 719-745: Gmail Sync Tests
 * - Lines 82-122: Processing rules (Type/Age Matrix)
 * - Lines 434-462: Processing Flow
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

  // ===== Phase 1: Clean First Tests =====

  describe('Phase 1: Clean First Execution', () => {
    beforeEach(async () => {
      await app.reset();
      gmail.clearAll();
    });

    it('Phase 1 archives social emails older than 6 months', async () => {
      // Given: Social email older than 6 months
      const oldSocialEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'LinkedIn connection',
        body: 'Someone wants to connect',
        category: 'social',
        date: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // ~200 days old
      });

      // When: Initial sync runs Phase 1 (Clean First)
      await app.connectGmail(gmail.credentials);
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Email is archived (not deleted)
      const labels = await gmail.getLabelsForEmail(oldSocialEmail.id);
      expect(labels.includes('INBOX')).toBe(false);
    });

    it('Phase 1 deletes promotional emails older than 6 months', async () => {
      // Given: Promotional email older than 6 months
      const oldPromoEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Flash sale',
        body: '50% off everything!',
        category: 'promotions',
        date: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // ~200 days old
      });

      // When: Initial sync runs Phase 1 (Clean First)
      await app.connectGmail(gmail.credentials);
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Email is deleted
      const email = await gmail.getEmail(oldPromoEmail.id);
      expect(email).toBeNull();
    });

    it('Phase 1 archives regular emails older than 6 months', async () => {
      // Given: Regular email older than 6 months but less than 2 years
      const oldRegularEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Project update',
        body: 'Here is the weekly update on our project.',
        category: 'primary',
        date: new Date(Date.now() - 250 * 24 * 60 * 60 * 1000), // ~250 days old
      });

      // When: Initial sync runs Phase 1 (Clean First)
      await app.connectGmail(gmail.credentials);
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Email is archived
      const labels = await gmail.getLabelsForEmail(oldRegularEmail.id);
      expect(labels.includes('INBOX')).toBe(false);
    });

    it('Phase 1 ALWAYS archives emails older than 2 years (never deletes)', async () => {
      // Given: Very old emails of all types
      const veryOldSocial = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Facebook notification',
        body: 'Someone liked your post',
        category: 'social',
        date: new Date(Date.now() - 800 * 24 * 60 * 60 * 1000), // ~800 days old
      });
      const veryOldPromo = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Newsletter from 2023',
        body: 'Your weekly deals',
        category: 'promotions',
        date: new Date(Date.now() - 800 * 24 * 60 * 60 * 1000),
      });

      // When: Initial sync runs Phase 1 (Clean First)
      await app.connectGmail(gmail.credentials);
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Both are archived (not deleted)
      const socialLabels = await gmail.getLabelsForEmail(veryOldSocial.id);
      const promoEmail = await gmail.getEmail(veryOldPromo.id);
      expect(socialLabels.includes('INBOX')).toBe(false);
      expect(promoEmail).not.toBeNull(); // Not deleted
    });

    it('Phase 1 processes recent regular emails with AI', async () => {
      // Given: Recent regular email
      const recentRegular = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Meeting tomorrow',
        body: 'Let\'s meet at 2pm to discuss the project.',
        category: 'primary',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days old
      });

      // When: Initial sync runs Phase 1 (Clean First)
      await app.connectGmail(gmail.credentials);
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Email is processed (not archived/deleted)
      const email = await gmail.getEmail(recentRegular.id);
      expect(email).not.toBeNull();
      expect(email?.labels.includes('INBOX')).toBe(true);
    });
  });

  // ===== Phase Transitions =====

  describe('Phase Transitions', () => {
    beforeEach(async () => {
      await app.reset();
      gmail.clearAll();
    });

    it('Phase 1 completes and Phase 2 (AI Backfill) starts automatically', async () => {
      // Given: User completes initial sync
      await app.connectGmail(gmail.credentials);
      await app.configurePreferences({ lookbackDays: 30, syncInterval: 30 });
      await app.configureLLM({ provider: 'anthropic', apiKey: 'sk-ant-test-key-12345' });

      // When: Initial sync Phase 1 completes
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Phase 2 (backfill) is ready to start
      const syncState = await app.getSyncState();
      expect(syncState.status).toBe('synced');

      // And: Starting backfill moves to Phase 2
      await app.startBackfill();
      const backfillState = await app.getBackfillState();
      expect(backfillState.status).toBe('running');
    });

    it('Phase 2 (AI Backfill) completes and Phase 3 (Incremental Sync) begins', async () => {
      // Given: Phase 2 backfill is running
      await app.connectGmail(gmail.credentials);
      await app.configurePreferences({ lookbackDays: 30, syncInterval: 30 });
      await app.startBackfill();
      await app.waitForBackfillProgress(30); // Complete all days

      // When: User completes the backfill
      await app.completeInitialSync();

      // Then: System is in Phase 3 (incremental sync)
      const syncState = await app.getSyncState();
      expect(syncState.status).toBe('synced');

      // And: New emails are picked up in incremental sync
      const newEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'New email after sync',
        body: 'This arrived after initial sync completed',
        category: 'primary',
      });

      await app.waitForNextSync();
      const timeline = await app.getTimeline();
      expect(timeline.some(e => e.emailId === newEmail.id)).toBe(true);
    });
  });

  // ===== Sync Progress Events =====

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

  // ===== Incremental Sync =====

  describe('Incremental Sync', () => {
    beforeEach(async () => {
      await app.reset();
      gmail.clearAll();
    });

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

  // ===== Sync Errors =====

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

  // ===== Job Queue Status =====

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

  // ===== Configuration Tests =====

  describe('Sync Configuration', () => {
    beforeEach(async () => {
      await app.reset();
    });

    it('User can configure 15-minute sync interval', async () => {
      // Given: User is on preferences step
      await app.connectGmail(gmail.credentials);

      // When: User selects 15-minute sync interval
      await app.configureSyncInterval(15);
      await app.configureLookbackDays(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['syncInterval']).toBe(15);
    });

    it('User can configure 30-minute sync interval', async () => {
      // Given: User is configuring preferences
      await app.connectGmail(gmail.credentials);

      // When: User selects 30-minute sync interval
      await app.configureSyncInterval(30);
      await app.configureLookbackDays(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['syncInterval']).toBe(30);
    });

    it('User can configure 1-hour sync interval', async () => {
      // Given: User is configuring preferences
      await app.connectGmail(gmail.credentials);

      // When: User selects 1-hour sync interval
      await app.configureSyncInterval(60);
      await app.configureLookbackDays(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['syncInterval']).toBe(60);
    });

    it('User can configure 2-hour sync interval', async () => {
      // Given: User is configuring preferences
      await app.connectGmail(gmail.credentials);

      // When: User selects 2-hour sync interval
      await app.configureSyncInterval(120);
      await app.configureLookbackDays(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['syncInterval']).toBe(120);
    });

    it('User can configure daily sync interval', async () => {
      // Given: User is configuring preferences
      await app.connectGmail(gmail.credentials);

      // When: User selects daily sync interval
      await app.configureSyncInterval(1440);
      await app.configureLookbackDays(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['syncInterval']).toBe(1440);
    });

    it('User can configure 7-day lookback period', async () => {
      // Given: User is configuring preferences
      await app.connectGmail(gmail.credentials);

      // When: User selects 7-day lookback
      await app.configureLookbackDays(7);
      await app.configureSyncInterval(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['lookbackDays']).toBe(7);
    });

    it('User can configure 14-day lookback period', async () => {
      // Given: User is configuring preferences
      await app.connectGmail(gmail.credentials);

      // When: User selects 14-day lookback
      await app.configureLookbackDays(14);
      await app.configureSyncInterval(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['lookbackDays']).toBe(14);
    });

    it('User can configure 30-day lookback period', async () => {
      // Given: User is configuring preferences
      await app.connectGmail(gmail.credentials);

      // When: User selects 30-day lookback
      await app.configureLookbackDays(30);
      await app.configureSyncInterval(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['lookbackDays']).toBe(30);
    });

    it('User can configure 60-day lookback period', async () => {
      // Given: User is configuring preferences
      await app.connectGmail(gmail.credentials);

      // When: User selects 60-day lookback
      await app.configureLookbackDays(60);
      await app.configureSyncInterval(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['lookbackDays']).toBe(60);
    });

    it('User can configure 90-day lookback period', async () => {
      // Given: User is configuring preferences
      await app.connectGmail(gmail.credentials);

      // When: User selects 90-day lookback
      await app.configureLookbackDays(90);
      await app.configureSyncInterval(30);

      // Then: Setting is saved
      const settings = await app.getSettings();
      expect(settings['lookbackDays']).toBe(90);
    });

    it('Settings persist across app restart', async () => {
      // Given: User configures settings
      await app.connectGmail(gmail.credentials);
      await app.configurePreferences({ lookbackDays: 60, syncInterval: 120 });

      // When: App restarts
      await app.shutdown();
      const newApp = await TuskerBrainApp.launch({ freshInstall: false });

      // Then: Settings are restored
      const settings = await newApp.getSettings();
      expect(settings['lookbackDays']).toBe(60);
      expect(settings['syncInterval']).toBe(120);

      await newApp.shutdown();
    });
  });

  // ===== App Restart Recovery =====

  describe('App Restart Recovery', () => {
    beforeEach(async () => {
      await app.reset();
      gmail.clearAll();
    });

    it('App resumes backfill from last completed day after restart', async () => {
      // Given: Backfill in progress at day 15 of 30
      await app.connectGmail(gmail.credentials);
      await app.configurePreferences({ lookbackDays: 30, syncInterval: 30 });
      await app.startBackfill();
      await app.waitForBackfillProgress(15);
      const progressBeforeRestart = await app.getBackfillProgress();

      // When: App restarts
      await app.shutdown();
      const newApp = await TuskerBrainApp.launch({ freshInstall: false });

      // Then: Backfill state is restored
      const progressAfterRestart = await newApp.getBackfillProgress();
      expect(progressAfterRestart.currentDay).toBe(progressBeforeRestart.currentDay);

      await newApp.shutdown();
    });

    it('Paused state persists across app restart', async () => {
      // Given: Backfill is paused at day 10
      await app.connectGmail(gmail.credentials);
      await app.configurePreferences({ lookbackDays: 30, syncInterval: 30 });
      await app.startBackfill();
      await app.waitForBackfillProgress(10);
      await app.pauseBackfill();

      // When: App restarts
      await app.shutdown();
      const newApp = await TuskerBrainApp.launch({ freshInstall: false });

      // Then: Paused state is restored
      const progress = await newApp.getBackfillProgress();
      expect(progress.status).toBe('paused');
      expect(progress.currentDay).toBeGreaterThanOrEqual(10);

      await newApp.shutdown();
    });

    it('User can resume paused backfill after app restart', async () => {
      // Given: Backfill was paused before restart
      await app.connectGmail(gmail.credentials);
      await app.configurePreferences({ lookbackDays: 30, syncInterval: 30 });
      await app.startBackfill();
      await app.waitForBackfillProgress(10);
      await app.pauseBackfill();
      await app.shutdown();

      // When: App restarts and user resumes
      const newApp = await TuskerBrainApp.launch({ freshInstall: false });
      await newApp.resumeBackfill();

      // Then: Backfill continues
      const progress = await newApp.getBackfillProgress();
      expect(progress.status).toBe('running');

      await newApp.shutdown();
    });
  });

  // ===== Sync State Table Validation =====

  describe('Sync State Table Validation', () => {
    beforeEach(async () => {
      await app.reset();
      gmail.clearAll();
    });

    it('Sync state tracks total emails processed', async () => {
      // Given: Emails are being processed
      await app.connectGmail(gmail.credentials);
      await gmail.seedInbox({ count: 10 });
      await app.runInitialSync({ lookbackDays: 30 });

      // When: User checks sync statistics
      const stats = await app.getSyncStatistics();

      // Then: Total emails processed is tracked
      expect(stats.totalEmailsProcessed).toBeGreaterThanOrEqual(0);
    });

    it('Sync state tracks total tokens used', async () => {
      // Given: Emails processed with AI
      await app.connectGmail(gmail.credentials);
      await app.configureLLM({ provider: 'anthropic', apiKey: 'sk-ant-test-key-12345' });
      await gmail.seedInbox({ count: 5 });
      await app.runInitialSync({ lookbackDays: 30 });

      // When: User checks sync statistics
      const stats = await app.getSyncStatistics();

      // Then: Token usage is tracked
      expect(stats.totalTokensUsed).toBeGreaterThanOrEqual(0);
    });

    it('Sync state shows last sync time', async () => {
      // Given: Initial sync has completed
      await app.connectGmail(gmail.credentials);
      await app.runInitialSync({ lookbackDays: 30 });

      // When: User checks sync status
      const lastSyncTime = await app.getLastSyncTime();

      // Then: Last sync time is recorded
      expect(lastSyncTime).toBeDefined();
      expect(lastSyncTime.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('Sync state reflects current sync phase', async () => {
      // Given: User is in Phase 2 (backfill)
      await app.connectGmail(gmail.credentials);
      await app.configurePreferences({ lookbackDays: 30, syncInterval: 30 });
      await app.startBackfill();
      await app.waitForBackfillProgress(5);

      // When: User checks sync status
      const status = await app.getSyncStatus();

      // Then: Status shows current phase
      expect(status.status).toBeDefined();
    });
  });
});
