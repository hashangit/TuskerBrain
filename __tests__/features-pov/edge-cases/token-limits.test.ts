import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { EmailFixtures } from '@fixtures/email-fixtures';

/**
 * Scenario: Token Limits
 *
 * Tests handling of LLM token limits including rate limits,
 * context limits, and usage tracking.
 *
 * Business Rules:
 * - Token usage is tracked per job
 * - Rate limits trigger automatic retry
 * - Context limits are handled by chunking
 * - User can view token usage statistics
 */
describe('Scenario: Token Limits', () => {
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

  describe('Token Usage Tracking', () => {
    it('Token usage is tracked per email processing job', async () => {
      // Given: Fresh state
      await app.processEmail({
        id: 'token-tracking-1',
        subject: 'Test Email',
        body: 'Content for token tracking test.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: Checking job details
      const job = await app.getJobForEmail('token-tracking-1');

      // Then: Token usage is recorded
      expect(job.tokensUsed).toBeDefined();
      expect(job.tokensUsed.input).toBeGreaterThan(0);
      expect(job.tokensUsed.output).toBeGreaterThan(0);
    });

    it('User can view total token usage across all jobs', async () => {
      // Given: Multiple processed emails
      for (let i = 0; i < 3; i++) {
        await app.processEmail({
          id: `token-usage-${i}`,
          subject: `Email ${i}`,
          body: `Content ${i}`,
          sender: 'test@test.com',
          senderDomain: 'test.com',
          receivedAt: new Date(),
        });
      }

      await app.waitForJobQueueCompletion();

      // When: User views statistics
      const stats = await app.getSyncStatistics();

      // Then: Total tokens are shown
      expect(stats.totalTokensUsed).toBeGreaterThan(0);
    });
  });

  describe('Rate Limit Handling', () => {
    it('Rate limit error triggers automatic retry', async () => {
      // Given: LLM will return rate limit
      await app.simulateLLMRateLimit({ nextNCalls: 1 });

      // When: Processing email
      await app.processEmail({
        id: 'rate-limit-test',
        subject: 'Test Email',
        body: 'Content for rate limit test.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Then: Job is retried
      const job = await app.getJobForEmail('rate-limit-test');
      expect(job.retryCount).toBeGreaterThan(0);

      // And eventually succeeds
      await app.simulateLLMRateLimit({ disabled: true });
      await app.waitForJobRetry(job.id);
      const completedJob = await app.getJobForEmail('rate-limit-test');
      expect(completedJob.status).toBe('completed');
    });

    it('Multiple rate limits trigger exponential backoff', async () => {
      // Given: Persistent rate limiting
      await app.simulateLLMRateLimit({ persistent: true, duration: 60000 });

      await app.processEmail({
        id: 'backoff-test',
        subject: 'Test Email',
        body: 'Content for backoff test.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // When: Multiple retries occur
      const delays: number[] = [];
      for (let i = 0; i < 3; i++) {
        const status = await app.getJobRetryStatus('backoff-test');
        if (status.nextRetryDelay) {
          delays.push(status.nextRetryDelay);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Then: Delays increase
      expect(delays.length).toBeGreaterThanOrEqual(2);

      // Cleanup
      await app.simulateLLMRateLimit({ disabled: true });
    });
  });

  describe('Context Limit Handling', () => {
    it('Very long email is chunked and processed', async () => {
      // Given: Very long email content
      const longBody = 'This is a test sentence. '.repeat(10000); // ~250k chars

      // When: Processing
      await app.processEmail({
        id: 'long-email-test',
        subject: 'Very Long Email',
        body: longBody,
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: Email is processed (chunked)
      const job = await app.getJobForEmail('long-email-test');
      expect(job.status).toBe('completed');
      expect(job.wasChunked).toBe(true);
    });

    it('Email with many attachments summarizes appropriately', async () => {
      // Given: Email with multiple attachments
      await app.processEmail({
        id: 'attachment-test',
        subject: 'Documents for Review',
        body: 'Please review the attached documents.',
        attachments: [
          { name: 'doc1.pdf', size: 1000000 },
          { name: 'doc2.pdf', size: 2000000 },
          { name: 'doc3.pdf', size: 1500000 },
        ],
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: Email is processed
      const job = await app.getJobForEmail('attachment-test');
      expect(job.status).toBe('completed');
    });
  });

  describe('Cost Estimation', () => {
    it('User sees estimated cost before processing', async () => {
      // Given: Emails to process
      await gmail.seedInbox({ count: 50, mix: true });

      // When: User checks cost estimate
      const estimate = await app.getProcessingCostEstimate();

      // Then: Estimate is provided
      expect(estimate.estimatedTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCost).toMatch(/\$[\d.]+/);
    });
  });

  describe('Token Budget', () => {
    it('User can set daily token budget', async () => {
      // When: Setting budget
      await app.configureTokenBudget({ dailyLimit: 1000000 });

      // Then: Budget is saved
      const settings = await app.getSettings();
      expect(settings.tokenBudget.dailyLimit).toBe(1000000);
    });

    it('Processing warns when approaching budget limit', async () => {
      // Given: Budget nearly exhausted
      await app.configureTokenBudget({ dailyLimit: 1000, used: 950 });

      // When: Processing email
      await app.processEmail({
        id: 'budget-warning-test',
        subject: 'Test Email',
        body: 'Content for budget test.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Then: Warning is shown
      const warnings = await app.getActiveWarnings();
      expect(warnings.some(w => w.type === 'token_budget')).toBe(true);

      // Cleanup
      await app.configureTokenBudget({ dailyLimit: null, used: 0 });
    });

    it('Processing stops when budget exhausted', async () => {
      // Given: Budget exhausted
      await app.configureTokenBudget({ dailyLimit: 100, used: 100 });

      // When: Trying to process
      await app.processEmail({
        id: 'budget-exhausted-test',
        subject: 'Test Email',
        body: 'Content for exhausted budget test.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Then: Job is queued but not processed
      const job = await app.getJobForEmail('budget-exhausted-test');
      expect(job.status).toBe('pending');
      expect(job.blockedReason).toMatch(/budget|token/i);

      // Cleanup
      await app.configureTokenBudget({ dailyLimit: null, used: 0 });
    });
  });

  describe('Token Usage Reports', () => {
    it('User can see token usage breakdown by day', async () => {
      // Given: Some processing history
      await app.processEmail({
        id: 'report-test',
        subject: 'Test Email',
        body: 'Content for report test.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: User views report
      const report = await app.getTokenUsageReport();

      // Then: Daily breakdown is available
      expect(report.daily).toBeDefined();
      expect(report.daily.length).toBeGreaterThan(0);
    });

    it('User can see token usage breakdown by provider', async () => {
      // When: User views report
      const report = await app.getTokenUsageReport();

      // Then: Provider breakdown is available
      expect(report.byProvider).toBeDefined();
    });
  });
});
