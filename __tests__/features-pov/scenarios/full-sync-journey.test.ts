import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { EmailFixtures } from '@fixtures/email-fixtures';

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
 */
describe('Scenario: Full Sync Journey', () => {
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

  describe('Complete Journey', () => {
    it('User completes full sync journey from connection to completion', async () => {
      // Given: User has varied inbox
      await gmail.seedInbox({ count: 500, mix: true });

      // Phase 1: Connect and Clean
      await app.connectGmail(gmail.credentials);
      await app.configureLookbackDays(30);

      const inboxBefore = await gmail.getInboxCount();
      await app.waitForInitialCleanup();
      const inboxAfterCleanup = await gmail.getInboxCount();

      // Then: Inbox reduced significantly
      expect(inboxAfterCleanup).toBeLessThan(inboxBefore * 0.6);

      // Phase 2: AI Backfill
      await app.startBackfill();

      // Track progress
      let progress = await app.captureBackfillProgress();
      expect(progress.length).toBeGreaterThan(0);

      // Wait for completion
      await app.waitForBackfillCompletion();

      const backfillState = await app.getBackfillState();
      expect(backfillState.status).toBe('completed');

      // Phase 3: Incremental sync
      await app.configureSyncInterval(15);
      const syncStatus = await app.getSyncStatus();
      expect(syncStatus.nextSync).toBeDefined();

      // Verify all data is accessible
      const timeline = await app.getTimeline();
      expect(timeline.length).toBeGreaterThan(0);

      const topics = await app.getAllTopics();
      expect(topics.length).toBeGreaterThan(0);
    });
  });

  describe('Phase Transitions', () => {
    it('User sees clear transition from Phase 1 to Phase 2', async () => {
      // Given: Fresh start
      await gmail.seedInbox({ count: 100, mix: true });
      await app.connectGmail(gmail.credentials);

      // When: Phase 1 completes
      await app.waitForInitialCleanup();
      const phase1Status = await app.getSyncStatus();

      // Then: Phase 1 is marked complete
      expect(phase1Status.phase1Complete).toBe(true);

      // When: Phase 2 starts
      await app.startBackfill();
      const phase2Status = await app.getSyncStatus();

      // Then: Phase 2 is running
      expect(phase2Status.phase2Status).toMatch(/running|in.progress/i);
    });

    it('User sees clear transition from Phase 2 to Phase 3', async () => {
      // Given: Phase 2 completes
      await app.connectGmail(gmail.credentials);
      await app.configureLookbackDays(7);
      await app.startBackfill();
      await app.waitForBackfillCompletion();

      // When: Checking status
      const status = await app.getSyncStatus();

      // Then: Phase 2 is complete, Phase 3 is active
      expect(status.phase2Complete).toBe(true);
      expect(status.phase3Status).toMatch(/active|idle|ready/i);
    });
  });

  describe('Progress Visibility', () => {
    it('User sees accurate progress percentage throughout journey', async () => {
      // Given: 30-day lookback
      await app.configureLookbackDays(30);
      await gmail.seedInbox({ count: 300, mix: true });
      await app.connectGmail(gmail.credentials);
      await app.startBackfill();

      // When: Capturing progress snapshots
      const progressSnapshots: number[] = [];

      for (let i = 0; i < 5; i++) {
        const progress = await app.getBackfillProgress();
        progressSnapshots.push(progress.percentage);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Then: Progress increases over time
      for (let i = 1; i < progressSnapshots.length; i++) {
        expect(progressSnapshots[i]).toBeGreaterThanOrEqual(progressSnapshots[i - 1]);
      }
    });
  });

  describe('Error Recovery in Journey', () => {
    it('Journey continues after transient error', async () => {
      // Given: Journey in progress
      await app.connectGmail(gmail.credentials);
      await app.configureLookbackDays(30);
      await app.startBackfill();
      await app.waitForBackfillProgress(10);

      // When: Error occurs
      await gmail.simulateNetworkFailure();
      await app.waitForNextSync();
      const errorStatus = await app.getSyncStatus();
      expect(errorStatus.lastError).toBeDefined();

      // And: Error clears
      await gmail.recoverNetwork();
      await app.waitForNextSync();

      // Then: Journey continues
      const recoveredStatus = await app.getSyncStatus();
      expect(recoveredStatus.lastError).toBeUndefined();

      // And can complete
      await app.waitForBackfillCompletion();
      const finalState = await app.getBackfillState();
      expect(finalState.status).toBe('completed');
    });
  });
});
