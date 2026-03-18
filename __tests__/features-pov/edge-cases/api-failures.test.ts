import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

import { EmailFixtures } from '@fixtures/email-fixtures';

/**
 * Scenario: API Failures and Recovery
 *
 * Tests how TuskerBrain handles various API failures gracefully,
 * ensuring system stability and clear user feedback.
 *
 * Business Rules:
 * - LLM API failures are logged and job is retried
 * - Gmail API failures trigger graceful degradation
 * - Token refresh failures prompt re-authentication
 */
describe('Scenario: API Failures', () => {
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

  describe('LLM API Failures', () => {
    it('LLM rate limit is handled with retry', async () => {
      // Given: LLM will return rate limit
      await app.simulateLLMRateLimit({ nextNCalls: 1 });

      // When: Processing email that requires LLM
      await app.processEmail({
        id: 'llm-rate-test',
        subject: 'Test Email',
        body: 'Test content that needs AI processing.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Then: Job is retried
      const job = await app.getJobForEmail('llm-rate-test');
      expect(job.retryCount).toBeGreaterThan(0);

      // And: Eventually succeeds
      await app.simulateLLMRateLimit({ disabled: true });
      await app.waitForJobCompletion(job.id);
      expect(job.status).toBe('completed');
    });

  });

  describe('Gmail API Failures', () => {
    it('Gmail connection failure is handled gracefully', async () => {
      // Given: Gmail API is temporarily unavailable
      await gmail.simulateNetworkFailure();

      // When: Sync attempts to run
      await app.waitForNextSync();

      // Then: Error is logged
      const syncStatus = await app.getSyncStatus();
      expect(syncStatus.lastError).toBeDefined();

      // When: Network recovers
      await gmail.recoverNetwork();
      await app.waitForNextSync();

      // Then: Sync succeeds
      const recoveredStatus = await app.getSyncStatus();
      expect(recoveredStatus.lastError).toBeUndefined();
    });

    it('Label creation failure does not block email processing', async () => {
      // Given: Label creation will fail
      await gmail.simulateLabelCreationFailure(true);

      // When: Processing email
      await app.processEmail({
        id: 'label-fail-test',
        subject: 'Test Email',
        body: 'Test content for label creation failure.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Then: Email is still processed
      const email = await app.getEmail('label-fail-test');
      expect(email).toBeDefined();
      expect(email.topic).toBeDefined();

      // And: Error is logged for retry
      const syncErrors = await app.getSyncErrors();
      expect(syncErrors.some(e => e.type === 'label_creation_failed')).toBe(true);

      // Cleanup
      await gmail.simulateLabelCreationFailure(false);
    });
  });

  describe('Token Refresh Failures', () => {
    it('Invalid refresh token prompts re-authentication', async () => {
      // Given: Refresh token becomes invalid
      await gmail.invalidateRefreshToken();
      await gmail.setTokenExpiry(Date.now() - 1000); // Token already expired

      // When: Sync attempts to refresh token
      await app.waitForNextSync();

      // Then: User is prompted to re-authenticate
      const authStatus = await app.getAuthenticationStatus();
      expect(authStatus.requiresReauth).toBe(true);
    });
  });

  describe('Timeout Handling', () => {
    it('LLM timeout is handled with appropriate error', async () => {
      // Given: LLM will timeout
      await app.simulateLLMTimeout();

      // When: Processing email
      await app.processEmail({
        id: 'timeout-test',
        subject: 'Test Email',
        body: 'This will cause a timeout.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Then: Job is marked as failed with timeout error
      const job = await app.getJobForEmail('timeout-test');
      expect(job.status).toBe('failed');
      expect(job.error).toMatch(/timeout/i);

      // Cleanup
      await app.simulateLLMTimeout(false);
    });
  });
});
