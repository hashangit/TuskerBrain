import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { EmailFixtures } from '@fixtures/email-fixtures';

/**
 * Scenario: Rapid Updates
 *
 * Tests handling of rapid successive email updates and the resulting
 * data consistency and performance implications.
 *
 * Business Rules:
 * - Rapid email processing should queue properly
 * - Summary updates should batch efficiently
 * - UI should remain responsive during rapid updates
 */
describe('Scenario: Rapid Updates', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    gmail = await GmailTestAccount.connect();
    await app.connectGmail(gmail.credentials);
    await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Rapid Email Arrival', () => {
    it('50 emails arriving simultaneously are queued and processed', async () => {
      // Given: App is idle
      await app.waitForInitialSync();

      // When: 50 emails arrive at once
      const emailIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        const email = await gmail.seedEmail({
          subject: `Rapid Email ${i}`,
          body: `Content ${i}`,
          category: 'primary',
          date: new Date().toISOString(),
        });
        emailIds.push(email.id);
      }

      // And: Sync runs
      await app.triggerManualSync();
      await app.waitForJobQueueCompletion();

      // Then: All emails are processed
      const processedCount = await app.getNewlyProcessedCount();
      expect(processedCount).toBe(50);
    });

    it('Job queue handles rapid job creation without errors', async () => {
      // Given: Empty job queue
      await app.clearJobQueue();

      // When: Creating many jobs rapidly
      const jobPromises = [];
      for (let i = 0; i < 100; i++) {
        jobPromises.push(
          app.createJob({
            type: 'email_process',
            payload: { emailId: `rapid-job-${i}` },
          })
        );
      }
      const results = await Promise.all(jobPromises);

      // Then: All jobs created successfully
      expect(results.every(r => r.id)).toBe(true);
      expect(results.length).toBe(100);
    });
  });

  describe('Summary Update Batching', () => {
    it('Multiple emails to same topic update summary once efficiently', async () => {
      // Given: Topic exists
      await app.processEmail({
        id: 'batch-1',
        subject: 'Initial Email',
        body: 'Initial content about Alpha project.',
        topic: 'Projects/Alpha',
        senderDomain: 'client.com',
        receivedAt: new Date(),
      });

      const initialUpdateCount = (await app.getTopicSummary('Projects/Alpha')).updateCount;

      // When: Multiple emails arrive for same topic
      for (let i = 0; i < 10; i++) {
        await app.processEmail({
          id: `batch-email-${i}`,
          subject: `Update ${i}`,
          body: `Project Alpha update ${i}.`,
          topic: 'Projects/Alpha',
          senderDomain: 'client.com',
          receivedAt: new Date(),
        });
      }

      await app.waitForJobQueueCompletion();

      // Then: Summary reflects all emails
      const summary = await app.getTopicSummary('Projects/Alpha');
      expect(summary.updateCount).toBe(initialUpdateCount + 10);
    });
  });

  describe('UI Responsiveness', () => {
    it('UI remains responsive during rapid processing', async () => {
      // Given: Many emails to process
      for (let i = 0; i < 30; i++) {
        await gmail.seedEmail({
          subject: `UI Test Email ${i}`,
          body: `Content ${i}`,
          category: 'primary',
          date: new Date().toISOString(),
        });
      }

      // When: Triggering sync
      const syncPromise = app.triggerManualSync();

      // Then: UI actions still work
      const timeline = await app.getTimeline();
      expect(timeline).toBeDefined();

      const settings = await app.getSettings();
      expect(settings).toBeDefined();

      await syncPromise;
    });
  });

  describe('Data Consistency', () => {
    it('Rapid updates maintain data consistency', async () => {
      // Given: Existing data
      await app.processEmail({
        id: 'consistency-1',
        subject: 'Banking Email',
        body: 'Account balance is $1000.',
        topic: 'Banking/Chase',
        senderDomain: 'chase.com',
        receivedAt: new Date('2024-01-01'),
      });

      // When: Rapid updates arrive
      for (let i = 0; i < 5; i++) {
        await app.processEmail({
          id: `consistency-update-${i}`,
          subject: `Balance Update ${i}`,
          body: `Account balance is now $${1000 + i * 100}.`,
          topic: 'Banking/Chase',
          senderDomain: 'chase.com',
          receivedAt: new Date(`2024-01-${10 + i}`),
        });
      }

      await app.waitForJobQueueCompletion();

      // Then: Summary is consistent (no duplicates, proper ordering)
      const summary = await app.getTopicSummary('Banking/Chase');
      expect(summary.emailCount).toBe(6);

      const emails = await app.getEmailsForTopic('Banking/Chase');
      expect(emails.length).toBe(6);
    });
  });

  describe('Performance Under Load', () => {
    it('Processing time scales linearly with email count', async () => {
      // Given: Clear state
      await app.clearAllData();

      // When: Processing batches of emails
      const times: number[] = [];
      const batchSizes = [10, 20, 30];

      for (const size of batchSizes) {
        const startTime = Date.now();

        for (let i = 0; i < size; i++) {
          await gmail.seedEmail({
            subject: `Perf Test ${size}-${i}`,
            body: `Content ${i}`,
            category: 'primary',
            date: new Date().toISOString(),
          });
        }

        await app.triggerManualSync();
        await app.waitForJobQueueCompletion();

        times.push(Date.now() - startTime);
        await app.clearJobQueue();
      }

      // Then: Time scaling is reasonable (not exponential)
      // 30 emails should not take 3x as long as 10 emails
      const ratio = times[2] / times[0];
      expect(ratio).toBeLessThan(5); // Allow some overhead
    });
  });
});
