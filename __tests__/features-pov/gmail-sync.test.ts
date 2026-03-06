import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Gmail Sync
 *
 * Design Spec Reference: Lines 98-114, 686-710
 *
 * As a user, I want my Gmail inbox to be synchronized with TuskerBrain,
 * with an initial cleanup, gradual AI backfill, and ongoing incremental syncs.
 *
 * Sync Phases:
 * 1. Phase 1: Clean First (no AI) - Apply archival/deletion rules immediately
 * 2. Phase 2: AI Backfill - Gradually process with AI based on lookback period
 * 3. Phase 3: Incremental Sync - Track historyId for ongoing updates
 */
describe('Feature: Gmail Sync', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    gmail = await GmailTestAccount.connect();
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Phase 1: Initial Cleanup (No AI)', () => {
    it('User sees old promotional emails deleted immediately after connecting Gmail', async () => {
      // Given: User connects Gmail with old promotional emails
      const oldPromo = await gmail.seedEmail({
        subject: 'Old Sale',
        body: 'Sale from 2 months ago',
        category: 'promotions',
        date: '2024-11-01',
      });

      // When: User connects Gmail and initial sync runs
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialCleanup();

      // Then: Old promotional emails are deleted
      const emailInGmail = await gmail.getEmail(oldPromo.id);
      expect(emailInGmail).toBeNull();
    });

    it('User sees old social emails deleted immediately', async () => {
      // Given: Old social emails
      const oldSocial = await gmail.seedEmail({
        subject: 'Someone endorsed you',
        body: 'Old LinkedIn notification',
        category: 'social',
        date: '2024-11-15',
      });

      // When: Initial cleanup runs
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialCleanup();

      // Then: Old social emails are deleted
      const emailInGmail = await gmail.getEmail(oldSocial.id);
      expect(emailInGmail).toBeNull();
    });

    it('User sees inbox significantly reduced within minutes', async () => {
      // Given: User has 200+ emails
      await gmail.seedInbox({ count: 200, mix: true });

      const beforeCount = await gmail.getInboxCount();

      // When: Initial sync runs
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialCleanup();

      // Then: Inbox is significantly smaller
      const afterCount = await gmail.getInboxCount();
      expect(afterCount).toBeLessThan(beforeCount * 0.5); // 50%+ reduction
    });

    it('User sees Phase 1 complete quickly (no AI processing delay)', async () => {
      // Given: User connects Gmail
      await app.connectGmail(gmail.credentials);

      const startTime = Date.now();

      // When: Initial cleanup runs
      await app.waitForInitialCleanup();

      const duration = Date.now() - startTime;

      // Then: Cleanup is fast (no AI needed)
      expect(duration).toBeLessThan(2 * 60 * 1000); // Under 2 minutes
    });
  });

  describe('Phase 2: AI Backfill', () => {
    it('User sees progress indicator: "Processing day 15 of 30..."', async () => {
      // Given: User configured 30-day lookback
      await app.configureLookbackDays(30);
      await app.connectGmail(gmail.credentials);

      // When: Backfill starts
      const backfillPromise = app.runBackfill();

      // Then: User sees progress updates
      const progress = await app.captureBackfillProgress();

      expect(progress).toContainEqual(
        expect.stringMatching(/Processing day \d+ of 30/)
      );

      await backfillPromise;
    });

    it('User sees recent regular emails processed with extracted information', async () => {
      // Given: Recent regular email
      const recentEmail = await gmail.seedEmail({
        subject: 'Project Review - Action Required',
        body: 'Please review the attached proposal and provide feedback by Friday EOD.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // When: Backfill processes this email
      await app.connectGmail(gmail.credentials);
      await app.processBackfillForEmail(recentEmail.id);

      // Then: User sees extracted information
      const processed = await app.getEmailFromTimeline(recentEmail.id);

      expect(processed).toMatchObject({
        actionItem: true,
        actionItemTitle: expect.stringContaining('review'),
        priority: 'high',
        followUpDate: expect.any(String),
      });
    });

    it('User sees deals extracted from recent promotional emails', async () => {
      // Given: Recent promotional email with deal
      const promoEmail = await gmail.seedEmail({
        subject: '50% Off - Today Only!',
        body: 'Use code SAVE50 at checkout. Minimum purchase $100.',
        category: 'promotions',
        date: new Date().toISOString(),
      });

      // When: Backfill processes this email
      await app.processBackfillForEmail(promoEmail.id);

      // Then: User sees the deal
      const deal = await app.getDealFromEmail(promoEmail.id);

      expect(deal).toMatchObject({
        promoCode: 'SAVE50',
        minimumPurchase: '$100',
        isActive: true,
      });
    });

    it('User can pause backfill and resume later', async () => {
      // Given: Backfill is in progress
      await app.configureLookbackDays(30);
      await app.startBackfill();

      // Wait for some progress
      await app.waitForBackfillProgress(10); // Day 10 of 30

      // When: User pauses
      await app.pauseBackfill();
      const pausedState = await app.getBackfillState();

      // Then: Backfill is paused at day 10
      expect(pausedState.status).toBe('paused');
      expect(pausedState.currentDay).toBe(10);

      // When: User resumes
      await app.resumeBackfill();

      // Then: Backfill continues from day 10
      const resumedState = await app.getBackfillState();
      expect(resumedState.currentDay).toBeGreaterThan(10);
    });

    it('User sees estimated time remaining during backfill', async () => {
      // Given: Backfill in progress
      await app.configureLookbackDays(30);
      await app.startBackfill();

      // When: User views progress
      const progress = await app.getBackfillProgress();

      // Then: Estimated time is shown
      expect(progress.estimatedTimeRemaining).toBeDefined();
      expect(progress.estimatedTimeRemaining).toMatch(/\d+ (minutes?|hours?)/);
    });
  });

  describe('Phase 3: Incremental Sync', () => {
    it('User sees new emails appear automatically when they arrive in Gmail', async () => {
      // Given: App is running with sync enabled
      await app.configureSyncInterval(15); // 15 minutes
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      // When: New email arrives in Gmail
      const newEmail = await gmail.seedEmail({
        subject: 'New Email After Setup',
        body: 'This arrived after initial sync.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // And: Sync interval passes
      await app.waitForNextSync();

      // Then: New email appears in TuskerBrain
      const inTimeline = await app.getEmailFromTimeline(newEmail.id);
      expect(inTimeline).toBeDefined();
    });

    it('User sees only new emails processed (not all emails re-processed)', async () => {
      // Given: Initial sync completed
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      const initialProcessedCount = await app.getTotalProcessedCount();

      // When: 3 new emails arrive
      for (let i = 0; i < 3; i++) {
        await gmail.seedEmail({
          subject: `New Email ${i}`,
          body: `Content ${i}`,
          category: 'primary',
          date: new Date().toISOString(),
        });
      }

      await app.waitForNextSync();

      // Then: Only 3 new emails were processed
      const finalProcessedCount = await app.getTotalProcessedCount();
      expect(finalProcessedCount - initialProcessedCount).toBe(3);
    });

    it('User sees sync status indicator in UI', async () => {
      // Given: App is running
      await app.connectGmail(gmail.credentials);

      // When: User looks at status bar
      const syncStatus = await app.getSyncStatus();

      // Then: Status shows last sync time and next sync time
      expect(syncStatus.lastSync).toBeDefined();
      expect(syncStatus.nextSync).toBeDefined();
      expect(syncStatus.status).toMatch(/synced|syncing|idle/i);
    });

    it('User sees processing continue even after closing and reopening the app', async () => {
      // Given: Backfill is in progress
      await app.configureLookbackDays(30);
      await app.startBackfill();
      await app.waitForBackfillProgress(5);

      // When: User closes and reopens app
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: Backfill resumes from where it left off
      const backfillState = await app.getBackfillState();
      expect(backfillState.currentDay).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Sync Configuration', () => {
    it('User can set sync interval (15min, 30min, 1hr, 2hr, daily)', async () => {
      // When: User sets 30-minute interval
      await app.configureSyncInterval(30);

      // Then: Interval is saved
      const settings = await app.getSettings();
      expect(settings.syncInterval).toBe(30);

      // And: Next sync is scheduled correctly
      const syncStatus = await app.getSyncStatus();
      const expectedNextSync = new Date(Date.now() + 30 * 60 * 1000);
      expect(syncStatus.nextSync).toBeCloseTo(expectedNextSync, -3); // Within seconds
    });

    it('User can set lookback period (7, 14, 30, 60, 90 days)', async () => {
      // When: User sets 14-day lookback
      await app.configureLookbackDays(14);

      // Then: Lookback is saved
      const settings = await app.getSettings();
      expect(settings.lookbackDays).toBe(14);

      // And: Only emails within lookback are processed with AI
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      const oldestProcessedDate = await app.getOldestProcessedEmailDate();
      const lookbackLimit = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      expect(oldestProcessedDate).toBeGreaterThan(lookbackLimit);
    });

    it('User sees their configuration persisted across restarts', async () => {
      // Given: User has specific settings
      await app.configureSyncInterval(60);
      await app.configureLookbackDays(60);

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: Settings are preserved
      const settings = await app.getSettings();
      expect(settings.syncInterval).toBe(60);
      expect(settings.lookbackDays).toBe(60);
    });
  });

  describe('Sync Error Handling', () => {
    it('User sees clear error message when Gmail connection fails', async () => {
      // Given: Invalid credentials
      const invalidCredentials = { accessToken: 'invalid', refreshToken: 'invalid' };

      // When: User tries to connect
      const result = await app.connectGmail(invalidCredentials);

      // Then: Clear error is shown
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/authentication|invalid|failed/i);
    });

    it('User sees sync retry automatically when network recovers', async () => {
      // Given: Sync is configured
      await app.configureSyncInterval(15);
      await app.connectGmail(gmail.credentials);

      // When: Network temporarily fails
      await gmail.simulateNetworkFailure();
      await app.waitForNextSync();

      // Then: Sync shows error but retries
      const status = await app.getSyncStatus();
      expect(status.lastError).toBeDefined();

      // When: Network recovers
      await gmail.recoverNetwork();
      await app.waitForNextSync();

      // Then: Sync succeeds
      const recoveredStatus = await app.getSyncStatus();
      expect(recoveredStatus.lastError).toBeUndefined();
    });

    it('User can manually trigger sync', async () => {
      // Given: App is idle (not scheduled to sync yet)
      await app.connectGmail(gmail.credentials);
      await app.configureSyncInterval(1440); // Daily

      const lastSyncBefore = (await app.getSyncStatus()).lastSync;

      // When: User clicks "Sync Now"
      await app.triggerManualSync();

      // Then: Sync runs immediately
      const lastSyncAfter = (await app.getSyncStatus()).lastSync;
      expect(lastSyncAfter).toBeGreaterThan(lastSyncBefore);
    });
  });

  describe('Sync Statistics', () => {
    it('User sees total emails processed count', async () => {
      // Given: Sync has processed emails
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      // When: User views statistics
      const stats = await app.getSyncStatistics();

      // Then: Counts are shown
      expect(stats.totalEmailsProcessed).toBeGreaterThan(0);
    });

    it('User sees total tokens used across all LLM calls', async () => {
      // Given: AI processing has occurred
      await app.connectGmail(gmail.credentials);
      await app.runBackfill();

      // When: User views statistics
      const stats = await app.getSyncStatistics();

      // Then: Token usage is tracked
      expect(stats.totalTokensUsed).toBeGreaterThan(0);
    });

    it('User sees storage space used by database', async () => {
      // Given: App has stored data
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      // When: User views statistics
      const stats = await app.getSyncStatistics();

      // Then: Storage usage is shown
      expect(stats.storageUsed).toMatch(/\d+ (KB|MB|GB)/);
    });
  });
});
