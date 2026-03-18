import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { EmailFixtures } from '@fixtures/email-fixtures';

/**
 * Scenario: Network Interruptions
 *
 * Tests how TuskerBrain handles network interruptions gracefully,
 * ensuring data integrity and automatic recovery.
 *
 * Business Rules:
 * - Network failures are logged and retried
 * - Partial data is preserved during interruptions
 * - Automatic recovery when network returns
 */
describe('Scenario: Network Interruptions', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    gmail = await GmailTestAccount.connect();
    await app.connectGmail(gmail.credentials);
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Sync Interruption', () => {
    it('Sync resumes after network interruption', async () => {
      // Given: Sync is running
      await app.configureSyncInterval(15);
      await app.waitForInitialSync();

      // When: Network fails
      await gmail.simulateNetworkFailure();
      await app.waitForNextSync();
      const errorStatus = await app.getSyncStatus();
      expect(errorStatus.lastError).toBeDefined();

      // And: Network recovers
      await gmail.recoverNetwork();
      await app.waitForNextSync();

      // Then: Sync succeeds
      const recoveredStatus = await app.getSyncStatus();
      expect(recoveredStatus.lastError).toBeUndefined();
    });

    it('Partial sync data is preserved during interruption', async () => {
      // Given: Processing in progress
      await app.configureLookbackDays(30);
      await app.startBackfill();
      await app.waitForBackfillProgress(15);

      const progressBeforeInterruption = (await app.getBackfillState()).currentDay;

      // When: Network fails
      await gmail.simulateNetworkFailure();

      // Then: Progress is preserved
      const state = await app.getBackfillState();
      expect(state.currentDay).toBe(progressBeforeInterruption);

      // Cleanup
      await gmail.recoverNetwork();
    });
  });

  describe('Email Processing Interruption', () => {
    it('Failed email processing job is retried', async () => {
      // Given: Network will fail for next call
      await gmail.simulateNetworkFailure({ nextNCalls: 1 });

      // When: Processing email
      await app.processEmail({
        id: 'network-retry-test',
        subject: 'Test Email',
        body: 'Content for retry test.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Then: Job fails but is scheduled for retry
      const job = await app.getJobForEmail('network-retry-test');
      expect(job.status).toBe('failed');
      expect(job.retryScheduled).toBe(true);

      // When: Network recovers and retry runs
      await gmail.recoverNetwork();
      await app.waitForJobRetry(job.id);

      // Then: Job succeeds
      const retriedJob = await app.getJobForEmail('network-retry-test');
      expect(retriedJob.status).toBe('completed');
    });
  });

  describe('LLM API Interruption', () => {
    it('LLM timeout is handled gracefully', async () => {
      // Given: LLM will timeout
      await app.simulateLLMTimeout();

      // When: Processing email
      await app.processEmail({
        id: 'llm-timeout-test',
        subject: 'Test Email',
        body: 'Content that will cause timeout.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Then: Job fails with timeout error
      const job = await app.getJobForEmail('llm-timeout-test');
      expect(job.status).toBe('failed');
      expect(job.error).toMatch(/timeout/i);

      // Cleanup
      await app.simulateLLMTimeout(false);
    });
  });

  describe('Extended Outage', () => {
    it('Multiple failures trigger exponential backoff', async () => {
      // Given: Persistent network failure
      await gmail.simulateNetworkFailure({ persistent: true });

      await app.waitForNextSync();
      const delays: number[] = [];

      // When: Multiple sync attempts fail
      for (let i = 0; i < 3; i++) {
        await app.waitForNextSync();
        const status = await app.getSyncStatus();
        if (status.nextRetryDelay) {
          delays.push(status.nextRetryDelay);
        }
      }

      // Then: Delays increase
      expect(delays.length).toBeGreaterThanOrEqual(2);
      expect(delays[1]).toBeGreaterThan(delays[0]);

      // Cleanup
      await gmail.recoverNetwork();
    });
  });

  describe('Recovery Validation', () => {
    it('After recovery, missed emails are processed', async () => {
      // Given: Network is down
      await gmail.simulateNetworkFailure();

      // And: Emails arrive during outage
      const missedEmail = await gmail.seedEmail({
        subject: 'Missed During Outage',
        body: 'This email arrived during network outage.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      await app.waitForNextSync();

      // When: Network recovers
      await gmail.recoverNetwork();
      await app.waitForNextSync();

      // Then: Missed email is processed
      const processed = await app.getEmailFromTimeline(missedEmail.id);
      expect(processed).toBeDefined();
    });
  });

  describe('User Notification', () => {
    it('User sees notification when network is down', async () => {
      // Given: Network fails
      await gmail.simulateNetworkFailure();
      await app.waitForNextSync();

      // When: User checks app status
      const status = await app.getAppStatus();

      // Then: Network issue is visible
      expect(status.networkStatus).toMatch(/error|disconnected|failed/i);

      // Cleanup
      await gmail.recoverNetwork();
    });

    it('User sees notification when network recovers', async () => {
      // Given: Network was down, now recovered
      await gmail.simulateNetworkFailure();
      await app.waitForNextSync();
      await gmail.recoverNetwork();
      await app.waitForNextSync();

      // When: User checks app status
      const status = await app.getAppStatus();

      // Then: Recovery is visible
      expect(status.networkStatus).toMatch(/connected|ok|healthy/i);
    });
  });
});
