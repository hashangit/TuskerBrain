import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Scenario: Restart Recovery Journey
 *
 * Tests the complete journey of recovering from app restart,
 * ensuring all state is preserved and processing resumes correctly.
 *
 * Recovery Points:
 * - Sync state (historyId, progress)
 * - Job queue state
 * - Configuration persistence
 * - In-progress job handling
 */
describe('Scenario: Restart Recovery Journey', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    gmail = await GmailTestAccount.connect();
  });

  afterAll(async () => {
    await gmail.disconnect();
  });

  describe('Sync State Recovery', () => {
    it('Backfill progress is preserved across restart', async () => {
      // Given: Backfill in progress
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);
      await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });
      await app.configureLookbackDays(30);
      await gmail.seedInbox({ count: 200, mix: true });
      await app.startBackfill();
      await app.waitForBackfillProgress(15);

      const progressBefore = (await app.getBackfillState()).currentDay;

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: Progress is preserved
      const state = await app.getBackfillState();
      expect(state.currentDay).toBe(progressBefore);
    });

    it('historyId is preserved across restart', async () => {
      // Given: Sync completed with historyId
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      const historyIdBefore = await app.getLastHistoryId();

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: historyId is preserved
      const historyIdAfter = await app.getLastHistoryId();
      expect(historyIdAfter).toBe(historyIdBefore);
    });
  });

  describe('Job Queue Recovery', () => {
    it('Pending jobs resume after restart', async () => {
      // Given: Jobs in queue
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);
      await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });

      // Create pending jobs
      for (let i = 0; i < 5; i++) {
        await app.createJob({
          type: 'email_process',
          payload: { emailId: `pending-${i}` },
        });
      }

      const pendingBefore = (await app.getJobQueueStats()).pending;

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: Pending jobs are still there
      const pendingAfter = (await app.getJobQueueStats()).pending;
      expect(pendingAfter).toBe(pendingBefore);
    });

    it('Running jobs are marked as interrupted and retried', async () => {
      // Given: Job in running state
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);
      await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });

      const job = await app.createJob({
        type: 'email_process',
        payload: { emailId: 'running-job' },
      });
      await app.markJobAsRunning(job.id);

      // When: App restarts without completing job
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: Job is marked for retry
      const recoveredJob = await app.getJob(job.id);
      expect(recoveredJob.status).toMatch(/pending|retry/i);
    });
  });

  describe('Configuration Persistence', () => {
    it('All settings persist across restart', async () => {
      // Given: Custom settings
      app = await TuskerBrainApp.launch();
      await app.configureSyncInterval(45);
      await app.configureLookbackDays(60);
      await app.configureLLM({ provider: 'openai', apiKey: 'test-key' });
      await app.configureTokenBudget({ dailyLimit: 500000 });

      const settingsBefore = await app.getSettings();

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: All settings preserved
      const settingsAfter = await app.getSettings();
      expect(settingsAfter.syncInterval).toBe(settingsBefore.syncInterval);
      expect(settingsAfter.lookbackDays).toBe(settingsBefore.lookbackDays);
      expect(settingsAfter.llmProvider).toBe(settingsBefore.llmProvider);
    });

    it('Gmail credentials persist across restart', async () => {
      // Given: Gmail connected
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      const emailBefore = (await app.getGmailConnectionStatus()).email;

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: Still connected
      const connectionStatus = await app.getGmailConnectionStatus();
      expect(connectionStatus.connected).toBe(true);
      expect(connectionStatus.email).toBe(emailBefore);
    });
  });

  describe('Data Integrity', () => {
    it('Processed emails are preserved across restart', async () => {
      // Given: Processed emails
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);
      await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });

      await app.processEmail({
        id: 'preserve-test',
        subject: 'Preserved Email',
        body: 'This should persist.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();
      const countBefore = await app.getTotalProcessedCount();

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: Emails preserved
      const countAfter = await app.getTotalProcessedCount();
      expect(countAfter).toBe(countBefore);

      const email = await app.getEmail('preserve-test');
      expect(email).toBeDefined();
    });

    it('Topic summaries are preserved across restart', async () => {
      // Given: Topic with summary
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);
      await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });

      await app.processEmail({
        id: 'topic-preserve-1',
        subject: 'Banking Update',
        body: 'Account balance updated.',
        topic: 'Banking/Chase',
        senderDomain: 'chase.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();
      const summaryBefore = await app.getTopicSummary('Banking/Chase');

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: Summary preserved
      const summaryAfter = await app.getTopicSummary('Banking/Chase');
      expect(summaryAfter.content).toBe(summaryBefore.content);
    });
  });

  describe('Automatic Recovery', () => {
    it('App automatically resumes backfill after restart', async () => {
      // Given: Backfill was running
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);
      await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });
      await app.configureLookbackDays(30);
      await app.startBackfill();
      await app.waitForBackfillProgress(10);

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: Backfill automatically resumes
      const state = await app.getBackfillState();
      expect(state.status).toMatch(/running|resuming|in.progress/i);
    });

    it('Sync schedule resumes after restart', async () => {
      // Given: Sync scheduled
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);
      await app.configureSyncInterval(30);
      await app.waitForInitialSync();

      const nextSyncBefore = (await app.getSyncStatus()).nextSync;

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: Sync is still scheduled
      const syncStatus = await app.getSyncStatus();
      expect(syncStatus.nextSync).toBeDefined();
    });
  });

  describe('Crash Recovery', () => {
    it('Unclean shutdown is recovered gracefully', async () => {
      // Given: Processing in progress
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);
      await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });

      await app.processEmail({
        id: 'crash-test',
        subject: 'Test',
        body: 'Content.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Simulate unclean shutdown
      await app.simulateCrash();

      // When: App restarts
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: Recovery happens without error
      const status = await app.getAppStatus();
      expect(status.recoveredFromCrash).toBe(true);

      // And: Processing can continue
      const job = await app.getJobForEmail('crash-test');
      expect(job.status).toMatch(/pending|completed/);
    });
  });
});
