import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Sender Summaries
 *
 * Design Spec Reference: Lines 140-143, 952-963
 *
 * As a user, I want rolling summaries for each sender domain,
 * so I can quickly understand what's happening with each sender without reading every email.
 *
 * Business Rules:
 * - 3-4 paragraphs, max 500 words
 * - First paragraph always high-level overview
 * - Older info gets less focus over time
 * - Updated with each new email from sender
 */
describe('Feature: Sender Summaries', () => {
  let app: TuskerBrainApp;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
  });

  beforeEach(async () => {
    // Clear sender summaries and emails before each test for isolation
    await app.clearSenderSummaries();
    await app.clearEmails();
  });

  afterAll(async () => {
    await app.shutdown();
  });

  describe('Initial Summary Creation', () => {
    it('User sees a summary created when the first email from a sender is processed', async () => {
      // Given: User processes their first email from a sender
      await app.processEmail({
        id: 'email-1',
        subject: 'Your Chase Statement',
        body: 'Your January statement shows a balance of $2,450. Payment due February 15.',
        senderDomain: 'chase.com',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-20'),
      });

      // When: User views the sender summary
      const summary = await app.getSenderSummary('chase.com');

      // Then: A summary has been created
      expect(summary).toBeDefined();
      expect(summary.content).toContain('chase');
      expect(summary.updateCount).toBe(1);
    });

    it('User sees sender summary with 3-4 paragraphs', async () => {
      // Given: A sender has been processed
      await app.processEmailsForSender('structured-sender.com', { count: 5 });

      // When: User views the summary
      const summary = await app.getSenderSummary('structured-sender.com');

      // Then: Summary has 3-4 paragraphs
      const paragraphs = summary.content.split('\n\n').filter((p: string) => p.trim());
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(paragraphs.length).toBeLessThanOrEqual(4);
    });
  });

  describe('Summary Structure', () => {
    it('User sees first paragraph as high-level overview', async () => {
      // Given: Multiple detailed emails have been processed
      await app.processEmailsForSender('service.com', {
        emails: [
          { subject: 'Account Update', body: 'Your account settings have been updated. Balance: $1,234.56.' },
          { subject: 'Security Alert', body: 'New login detected from IP 192.168.1.1 at 3:45 PM.' },
          { subject: 'Promotional Offer', body: 'Check out this week\'s deals! Use code SAVE20 for 20% off.' },
        ]
      });

      // When: User views the summary
      const summary = await app.getSenderSummary('service.com');
      const firstParagraph = summary.paragraphs[0];

      // Then: First paragraph is concise overview
      expect(firstParagraph.length).toBeLessThan(200);
      // Should mention the topic broadly, not specific transaction details
      expect(firstParagraph.toLowerCase()).toMatch(/service|account/);
    });
  });

  describe('Summary Updates', () => {
    it('User sees summary updated when a new email is added to the sender', async () => {
      // Given: A sender already has a summary
      await app.processEmail({
        id: 'email-update-1',
        subject: 'Statement Ready',
        body: 'Your January statement is ready.',
        senderDomain: 'update-sender.com',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-15'),
      });

      const originalSummary = await app.getSenderSummary('update-sender.com');
      expect(originalSummary.updateCount).toBe(1);

      // When: A new email is processed from this sender
      await app.processEmail({
        id: 'email-update-2',
        subject: 'Payment Confirmed',
        body: 'Your payment of $500 has been received.',
        senderDomain: 'update-sender.com',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-02-01'),
      });

      // Then: Summary is updated
      const updatedSummary = await app.getSenderSummary('update-sender.com');
      expect(updatedSummary.updateCount).toBe(2);
      expect(updatedSummary.emailCount).toBe(2);
    });
  });

  describe('Multiple Sender Summaries', () => {
    it('User can browse summaries for all their senders', async () => {
      // Given: User has emails in multiple sender domains
      await app.processEmailsForSender('sender-a.com', { count: 2 });
      await app.processEmailsForSender('sender-b.com', { count: 3 });
      await app.processEmailsForSender('sender-c.com', { count: 4 });

      // When: User views all sender summaries
      const summaries = await app.getAllSenderSummaries();

      // Then: User sees summary for each sender
      expect(summaries.map(s => s.senderDomain)).toContain('sender-a.com');
      expect(summaries.map(s => s.senderDomain)).toContain('sender-b.com');
      expect(summaries.map(s => s.senderDomain)).toContain('sender-c.com');
    });
  });

  describe('Sender vs Topic Relationship', () => {
    it('User sees same sender can have emails in multiple topics', async () => {
      // Given: Amazon sends both shopping and promotional emails
      await app.processEmail({
        id: 'amazon-shopping',
        subject: 'Your Order Shipped',
        body: 'Your order has been shipped.',
        sender: 'ship@amazon.com',
        senderDomain: 'amazon.com',
        topic: 'Shopping/Amazon',
        receivedAt: new Date(),
      });

      await app.processEmail({
        id: 'amazon-promo',
        subject: 'Deal of the Day',
        body: 'Check out today\'s deals.',
        sender: 'deals@amazon.com',
        senderDomain: 'amazon.com',
        topic: 'Deals/Amazon',
        receivedAt: new Date(),
      });

      // When: User views sender summary
      const summary = await app.getSenderSummary('amazon.com');

      // Then: Summary covers all emails regardless of topic
      expect(summary.emailCount).toBe(2);
      expect(summary.topics).toContain('Shopping/Amazon');
      expect(summary.topics).toContain('Deals/Amazon');
    });
  });

  describe('Word Count Validation', () => {
    it('Sender summary stays within 500 word limit', async () => {
      // Given: Sender has many emails with substantial content
      await app.processEmailsForSender('wordy-sender.com', { count: 20 });

      // When: User views summary
      const summary = await app.getSenderSummary('wordy-sender.com');

      // Then: Summary is within word limit
      const wordCount = summary.content.split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(500);
    });
  });

  describe('Rolling Summary Behavior', () => {
    it('Newer emails are weighted more heavily in summary', async () => {
      // Given: Sender has old and new emails
      await app.processEmail({
        id: 'old-sender-email',
        subject: 'Old Update',
        body: 'This is very old information from 2022 about legacy account settings.',
        senderDomain: 'weighted-sender.com',
        receivedAt: new Date('2022-06-01'),
      });

      await app.processEmail({
        id: 'new-sender-email',
        subject: 'New Update',
        body: 'This is recent information from 2024 about new security features.',
        senderDomain: 'weighted-sender.com',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User views summary
      const summary = await app.getSenderSummary('weighted-sender.com');

      // Then: Recent content appears earlier or more prominent
      const recentIndex = summary.content.toLowerCase().indexOf('2024');
      const oldIndex = summary.content.toLowerCase().indexOf('2022');

      // Recent info should appear before old info if both exist
      if (oldIndex !== -1 && recentIndex !== -1) {
        expect(recentIndex).toBeLessThan(oldIndex);
      }
    });
  });

  describe('Cascade Delete', () => {
    it('Deleting all emails from sender removes summary', async () => {
      // Given: Sender has summary
      await app.processEmailsForSender('to-delete.com', { count: 3 });
      const summary = await app.getSenderSummary('to-delete.com');
      expect(summary).toBeDefined();

      // When: All emails from sender are deleted
      await app.deleteAllEmailsFromSender('to-delete.com');

      // Then: Summary is removed
      const deletedSummary = await app.getSenderSummary('to-delete.com');
      expect(deletedSummary).toBeNull();
    });
  });
});
