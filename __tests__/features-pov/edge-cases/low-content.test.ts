import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

import { EmailFixtures } from '@fixtures/email-fixtures';

/**
 * Scenario: Low-Content Email Handling
 *
 * Tests how TuskerBrain handles emails with minimal content,
 * ensuring appropriate topic assignment and graceful degradation.
 *
 * Business Rules:
 * - One-liner emails get generic topic assignment
 * - Auto-replies are handled without creating new topics
 * - Empty emails don't crash the system
 */
describe('Scenario: Low-Content Emails', () => {
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

  describe('One-Liner Emails', () => {
    it('Simple thank-you email gets appropriate topic', async () => {
      // Given: One-liner thank-you email
      await app.processEmail({
        id: 'one-liner-1',
        subject: 'Thanks',
        body: 'Thanks!',
        sender: 'colleague@company.com',
        senderDomain: 'company.com',
        receivedAt: new Date(),
      });

      // When: User views assigned topics
      const topics = await app.getEmailTopics('one-liner-1');

      // Then: Topic is assigned
      expect(topics.length).toBeGreaterThanOrEqual(1);
    });

  });

  describe('Auto-Reply Emails', () => {
    it('Out-of-office auto-reply is handled appropriately', async () => {
      // Given: Auto-reply email
      await app.processEmail({
        id: 'autoreply-1',
        subject: 'Out of Office: Re: Your Email',
        body: 'I am currently out of the office and will return on Monday. For urgent matters, please contact support.',
        sender: 'john.doe@company.com',
        senderDomain: 'company.com',
        receivedAt: new Date(),
        isAutoReply: true,
      });

      // When: Email is processed
      const email = await app.getEmail('autoreply-1');

      // Then: Email is processed without error
      expect(email).toBeDefined();
      expect(email.isAutoReply).toBe(true);
    });

  });

  describe('Empty Body Emails', () => {
    it('Email with empty body is handled gracefully', async () => {
      // Given: Email with empty body
      await app.processEmail({
        id: 'empty-body-1',
        subject: 'FWD: Important',
        body: '',
        sender: 'sender@example.com',
        senderDomain: 'example.com',
        receivedAt: new Date(),
      });

      // When: Email is processed
      const email = await app.getEmail('empty-body-1');

      // Then: Email is processed without crash
      expect(email).toBeDefined();
      expect(email.processingError).toBeUndefined();
    });
  });

  describe('Newsletter with Minimal Content', () => {
    it('Generic newsletter gets appropriate classification', async () => {
      // Given: Generic newsletter
      await app.processEmail({
        id: 'newsletter-minimal',
        subject: 'Weekly Update',
        body: 'Here are this week\'s updates.',
        sender: 'news@aggregator.com',
        senderDomain: 'aggregator.com',
        receivedAt: new Date(),
      });

      // When: User views assigned topics
      const topics = await app.getEmailTopics('newsletter-minimal');

      // Then: Gets valid topic assignment
      expect(topics.length).toBeGreaterThanOrEqual(1);
    });
  });
});
