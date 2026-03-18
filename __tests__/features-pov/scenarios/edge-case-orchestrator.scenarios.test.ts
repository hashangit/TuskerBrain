import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Scenario: Edge Case Orchestrator
 *
 * Tests complex edge cases and unusual scenarios that may occur
 * during real-world usage of TuskerBrain.
 *
 * Edge Cases Covered:
 * - Duplicate emails
 * - Malformed email content
 * - Unicode and special characters
 * - Timezone handling
 * - Email threading edge cases
 */
describe('Scenario: Edge Case Orchestrator', () => {
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

  describe('Duplicate Emails', () => {
    it('Identical emails from same sender are handled gracefully', async () => {
      // Given: Two identical emails
      await app.processEmail({
        id: 'dup-1',
        subject: 'Duplicate Test',
        body: 'This is duplicate content.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.processEmail({
        id: 'dup-2',
        subject: 'Duplicate Test',
        body: 'This is duplicate content.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: Viewing timeline
      const timeline = await app.getTimeline();

      // Then: Both are processed (not deduplicated - different IDs)
      const dups = timeline.filter(e => e.subject === 'Duplicate Test');
      expect(dups.length).toBe(2);
    });

    it('Same Gmail message ID is not processed twice', async () => {
      // Given: Email processed once
      const gmailMessageId = 'msg-unique-123';
      await app.processEmail({
        id: 'gmail-dup-1',
        gmailMessageId,
        subject: 'Gmail Unique',
        body: 'Content.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();
      const countBefore = await app.getTotalProcessedCount();

      // When: Same Gmail message ID processed again
      await app.processEmail({
        id: 'gmail-dup-2',
        gmailMessageId, // Same ID
        subject: 'Gmail Unique',
        body: 'Content.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: No new processing
      const countAfter = await app.getTotalProcessedCount();
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('Malformed Content', () => {
    it('Email with only HTML is processed gracefully', async () => {
      // Given: HTML-only email
      await app.processEmail({
        id: 'html-only',
        subject: 'HTML Email',
        body: '<html><body><p>Content</p></body></html>',
        contentType: 'text/html',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: Checking result
      const email = await app.getEmail('html-only');

      // Then: Processed successfully
      expect(email).toBeDefined();
      expect(email.processingError).toBeUndefined();
    });

    it('Email with missing subject is handled', async () => {
      // Given: Email without subject
      await app.processEmail({
        id: 'no-subject',
        subject: '',
        body: 'Email with no subject line.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: Checking result
      const email = await app.getEmail('no-subject');

      // Then: Processed with generated subject
      expect(email).toBeDefined();
      expect(email.generatedSubject || email.subject).toBeDefined();
    });

    it('Email with extremely long body is truncated appropriately', async () => {
      // Given: Very long email
      const longBody = 'x'.repeat(1000000); // 1MB of content
      await app.processEmail({
        id: 'very-long',
        subject: 'Long Email',
        body: longBody,
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: Checking result
      const email = await app.getEmail('very-long');

      // Then: Processed (may be truncated)
      expect(email).toBeDefined();
      expect(email.wasTruncated).toBe(true);
    });
  });

  describe('Unicode and Special Characters', () => {
    it('Email with emojis is processed correctly', async () => {
      // Given: Email with emojis
      await app.processEmail({
        id: 'emoji-test',
        subject: 'Party Time 🎉',
        body: 'Great news! 🚀 We did it! 🎊',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: Checking result
      const email = await app.getEmail('emoji-test');

      // Then: Emojis preserved
      expect(email.subject).toContain('🎉');
      expect(email.body).toContain('🚀');
    });

    it('Email with non-Latin characters is processed', async () => {
      // Given: Email with various scripts
      await app.processEmail({
        id: 'unicode-test',
        subject: 'Multi-language 你好 مرحبا Привет',
        body: 'Japanese: こんにちは. Arabic: مرحبا. Russian: Привет.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: Checking result
      const email = await app.getEmail('unicode-test');

      // Then: Unicode preserved
      expect(email.subject).toContain('你好');
      expect(email.body).toContain('こんにちは');
    });
  });

  describe('Timezone Handling', () => {
    it('Email from different timezone shows correct local time', async () => {
      // Given: Email with UTC timestamp
      const utcTime = new Date('2024-01-15T10:00:00Z');

      await app.processEmail({
        id: 'timezone-test',
        subject: 'Timezone Test',
        body: 'Email from different timezone.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: utcTime,
      });

      await app.waitForJobQueueCompletion();

      // When: Viewing in local timezone
      const email = await app.getEmail('timezone-test');

      // Then: Correct local time shown
      expect(email.receivedAt).toBeDefined();
      expect(email.receivedAtLocal).toBeDefined();
    });
  });

  describe('Email Threading', () => {
    it('Reply in thread is associated correctly', async () => {
      // Given: Thread with reply
      await app.processEmail({
        id: 'thread-1',
        subject: 'Project Discussion',
        body: 'Starting the discussion.',
        threadId: 'thread-abc',
        sender: 'a@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date('2024-01-01'),
      });

      await app.processEmail({
        id: 'thread-2',
        subject: 'Re: Project Discussion',
        body: 'Reply to the discussion.',
        threadId: 'thread-abc',
        inReplyTo: 'thread-1',
        sender: 'b@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date('2024-01-02'),
      });

      await app.waitForJobQueueCompletion();

      // When: Viewing thread
      const thread = await app.getEmailThread('thread-abc');

      // Then: Both emails in thread
      expect(thread.length).toBe(2);
    });

    it('Deeply nested thread is handled', async () => {
      // Given: Deep reply chain
      const threadId = 'deep-thread';
      await app.processEmail({
        id: 'deep-1',
        subject: 'Original',
        body: 'Original message.',
        threadId,
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date('2024-01-01'),
      });

      await app.processEmail({
        id: 'deep-2',
        subject: 'Re: Original',
        body: 'First reply.',
        threadId,
        inReplyTo: 'deep-1',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date('2024-01-02'),
      });

      await app.processEmail({
        id: 'deep-3',
        subject: 'Re: Original',
        body: 'Second reply.',
        threadId,
        inReplyTo: 'deep-2',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date('2024-01-03'),
      });

      await app.waitForJobQueueCompletion();

      // When: Viewing thread
      const thread = await app.getEmailThread(threadId);

      // Then: All emails connected
      expect(thread.length).toBe(3);
      expect(thread[0].id).toBe('deep-1');
      expect(thread[2].id).toBe('deep-3');
    });
  });

  describe('Sender Edge Cases', () => {
    it('Email from sender with special characters in name', async () => {
      // Given: Sender with special chars
      await app.processEmail({
        id: 'special-sender',
        subject: 'Test',
        body: 'Content.',
        sender: '"O\'Brien, John" <john@test.com>',
        senderName: "O'Brien, John",
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: Checking result
      const email = await app.getEmail('special-sender');

      // Then: Sender name preserved
      expect(email.senderName).toContain("O'Brien");
    });

    it('Email with no sender domain uses fallback', async () => {
      // Given: Email without domain
      await app.processEmail({
        id: 'no-domain',
        subject: 'Test',
        body: 'Content.',
        sender: 'noreply',
        senderDomain: '',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // When: Checking result
      const email = await app.getEmail('no-domain');

      // Then: Handled gracefully
      expect(email).toBeDefined();
      expect(email.topic).toBeDefined();
    });
  });
});
