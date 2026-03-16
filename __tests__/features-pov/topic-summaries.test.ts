import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';

/**
 * Feature: Topic Summaries
 *
 * Design Spec Reference: Lines 124-130, 920-950
 *
 * As a user, I want rolling summaries for each topic that update as new emails arrive,
 * so I can quickly understand what's happening in each area without reading every email.
 *
 * Business Rules:
 * - 3-4 paragraphs, max 500 words
 * - First paragraph always high-level overview
 * - Older info gets less focus over time
 * - Updated with each new email in topic
 */
describe('Feature: Topic Summaries', () => {
  let app: TuskerBrainApp;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });
  });

  afterAll(async () => {
    await app.shutdown();
  });

  describe('Initial Summary Creation', () => {
    it('User sees a summary created when the first email in a topic is processed', async () => {
      // Given: User processes their first banking email
      await app.processEmail({
        id: 'email-1',
        subject: 'Your Chase Statement is Ready',
        body: 'Your January statement shows a balance of $2,450. Payment due February 15.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-20'),
      });

      // When: User views the topic
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: A summary has been created
      expect(summary).toBeDefined();
      expect(summary.content).toContain('Chase');
      expect(summary.updateCount).toBe(1);
    });

    it('User sees summary structured with 3-4 paragraphs', async () => {
      // Given: A topic has been processed
      await app.processEmailsForTopic('Banking/Chase', { count: 5 });

      // When: User views the summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: Summary has 3-4 paragraphs
      const paragraphs = summary.content.split('\n\n').filter((p: string) => p.trim());
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(paragraphs.length).toBeLessThanOrEqual(4);
    });

    it('User sees summary stays within 500 word limit', async () => {
      // Given: A topic has many emails (more content than 500 words)
      await app.processEmailsForTopic('Banking/Chase', { count: 50 });

      // When: User views the summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: Summary is within word limit
      const wordCount = summary.content.split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(500);
    });
  });

  describe('First Paragraph Overview', () => {
    it('User sees high-level overview in the first paragraph', async () => {
      // Given: Multiple detailed banking emails have been processed
      await app.processEmailsForTopic('Banking/Chase', {
        emails: [
          { subject: 'Statement Ready', body: 'Balance $2,450...' },
          { subject: 'Payment Received', body: 'Payment of $500 applied...' },
          { subject: 'Fraud Alert', body: 'Suspicious activity detected...' },
        ]
      });

      // When: User views the summary
      const summary = await app.getTopicSummary('Banking/Chase');
      const firstParagraph = summary.paragraphs[0];

      // Then: First paragraph is a high-level overview (not detailed)
      expect(firstParagraph.length).toBeLessThan(200); // Concise
      // Should mention the topic broadly, not specific transaction details
      expect(firstParagraph.toLowerCase()).toMatch(/chase|banking|account/);
    });

    it('User can quickly understand topic status from first paragraph alone', async () => {
      // Given: Complex topic with many details
      await app.processEmailsForTopic('Projects/Alpha', {
        emails: [
          { subject: 'Sprint 1 Complete', body: 'Delivered authentication module...' },
          { subject: 'Sprint 2 Started', body: 'Working on payment integration...' },
          { subject: 'Client Feedback', body: 'Client requested changes to UI...' },
        ]
      });

      // When: User views just the first paragraph
      const summary = await app.getTopicSummary('Projects/Alpha');
      const overview = summary.paragraphs[0];

      // Then: User gets a clear picture of overall status
      expect(overview).toMatch(/project|alpha|status|progress/i);
    });
  });

  describe('Rolling Updates', () => {
    it('User sees summary updated when a new email is added to the topic', async () => {
      // Given: A topic already has a summary
      await app.processEmail({
        id: 'email-1',
        subject: 'Statement Ready',
        body: 'Your January statement is ready.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-15'),
      });

      const originalSummary = await app.getTopicSummary('Banking/Chase');
      expect(originalSummary.updateCount).toBe(1);

      // When: A new email is processed in this topic
      await app.processEmail({
        id: 'email-2',
        subject: 'Payment Confirmed',
        body: 'Your payment of $500 has been received.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-02-01'),
      });

      // Then: Summary is updated
      const updatedSummary = await app.getTopicSummary('Banking/Chase');
      expect(updatedSummary.updateCount).toBe(2);
      expect(updatedSummary.content).toMatch(/payment/i);
      expect(updatedSummary.lastUpdatedAt).not.toEqual(originalSummary.lastUpdatedAt);
    });

    it('User sees incrementing update count as new emails arrive', async () => {
      // Given: User views a topic summary
      await app.processEmailsForTopic('Banking/Chase', { count: 3 });
      let summary = await app.getTopicSummary('Banking/Chase');
      expect(summary.updateCount).toBe(3);

      // When: More emails arrive
      await app.processEmailsForTopic('Banking/Chase', { count: 2 });

      // Then: Update count increments
      summary = await app.getTopicSummary('Banking/Chase');
      expect(summary.updateCount).toBe(5);
    });
  });

  describe('Information Freshness', () => {
    it('User sees older information given less focus in the summary', async () => {
      // Given: Topic has old and new emails
      await app.processEmail({
        id: 'old-email',
        subject: 'Very Old Statement',
        body: 'This is very old information from 2022 about your account balance.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2022-01-01'),
      });

      await app.processEmail({
        id: 'new-email',
        subject: 'Recent Statement',
        body: 'Your recent statement shows significant changes to your account.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-01'),
      });

      // When: User views the summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: Recent info is more prominent
      // The recent content should appear earlier or be emphasized
      const recentIndex = summary.content.toLowerCase().indexOf('recent');
      const oldIndex = summary.content.toLowerCase().indexOf('2022');

      // Recent info should appear before or old info should not be prominent
      if (oldIndex !== -1) {
        expect(recentIndex).toBeLessThan(oldIndex);
      }
    });

    it('User sees summary reflect current state, not just historical data', async () => {
      // Given: Topic had initial state, then changed
      await app.processEmail({
        id: 'email-1',
        subject: 'Account Opened',
        body: 'Your new Chase account has been opened.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2023-01-01'),
      });

      await app.processEmail({
        id: 'email-2',
        subject: 'Account Closed',
        body: 'Your Chase account has been closed per your request.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-01'),
      });

      // When: User views the summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: Summary reflects the current state (closed), not just the opening
      expect(summary.content.toLowerCase()).toMatch(/closed|no longer active/i);
    });
  });

  describe('Multiple Topic Summaries', () => {
    it('User can browse summaries for all their topics', async () => {
      // Given: User has emails in multiple topics
      await app.processEmailsForTopic('Banking/Chase', { count: 3 });
      await app.processEmailsForTopic('Projects/Alpha', { count: 2 });
      await app.processEmailsForTopic('Education/Udemy', { count: 4 });

      // When: User views all topic summaries
      const summaries = await app.getAllTopicSummaries();

      // Then: User sees summaries for each topic
      expect(summaries.map(s => s.topic)).toContain('Banking/Chase');
      expect(summaries.map(s => s.topic)).toContain('Projects/Alpha');
      expect(summaries.map(s => s.topic)).toContain('Education/Udemy');
    });

    it('User sees topics sorted by most recent activity', async () => {
      // Given: Multiple topics with different last activity dates
      await app.processEmail({
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-15'),
      });
      await app.processEmail({
        topic: 'Projects/Alpha',
        receivedAt: new Date('2024-01-20'), // Most recent
      });
      await app.processEmail({
        topic: 'Education/Udemy',
        receivedAt: new Date('2024-01-10'),
      });

      // When: User views topic list
      const summaries = await app.getAllTopicSummaries({ sortBy: 'recentActivity' });

      // Then: Most recently active topic appears first
      expect(summaries[0].topic).toBe('Projects/Alpha');
    });

    it('User sees topic with most emails has correct count', async () => {
      // Given: Topics with different email counts
      await app.processEmailsForTopic('Banking/Chase', { count: 10 });
      await app.processEmailsForTopic('Projects/Alpha', { count: 3 });

      // When: User views topic summaries
      const bankingSummary = await app.getTopicSummary('Banking/Chase');
      const projectsSummary = await app.getTopicSummary('Projects/Alpha');

      // Then: Counts are accurate
      expect(bankingSummary.emailCount).toBe(10);
      expect(projectsSummary.emailCount).toBe(3);
    });
  });

  describe('Summary Navigation', () => {
    it('User can click on a topic summary to see all emails in that topic', async () => {
      // Given: User is viewing topic summaries
      await app.processEmailsForTopic('Banking/Chase', { count: 5 });

      // When: User clicks on "Banking/Chase" summary
      const summary = await app.getTopicSummary('Banking/Chase');
      await summary.viewAllEmails();

      // Then: User is taken to filtered timeline showing only that topic
      const currentView = await app.getCurrentView();
      expect(currentView.page).toBe('timeline');
      expect(currentView.filters.topic).toBe('Banking/Chase');
    });
  });

  describe('DB Schema Validation', () => {
    it('Topic summary has word_count field populated', async () => {
      // Given: Topic has a summary
      await app.processEmailsForTopic('Banking/Chase', { count: 3 });

      // When: User retrieves summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: word_count is populated
      expect(summary.wordCount).toBeDefined();
      expect(summary.wordCount).toBeGreaterThan(0);
      expect(summary.wordCount).toBeLessThanOrEqual(500);
    });

    it('Topic summary has last_email_id populated', async () => {
      // Given: Multiple emails processed for topic
      const lastEmail = await app.processEmail({
        topic: 'Banking/Chase',
        subject: 'Latest Statement',
        body: 'Your most recent statement.',
        receivedAt: new Date('2024-02-01'),
      });

      // When: User retrieves summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: last_email_id references the most recent email
      expect(summary.lastEmailId).toBeDefined();
      expect(summary.lastEmailId).toBe(lastEmail.id);
    });
  });

  describe('Cascade Delete', () => {
    it('Deleting topic removes associated summary', async () => {
      // Given: Topic with summary exists
      await app.processEmailsForTopic('Projects/Legacy', { count: 3 });
      const summary = await app.getTopicSummary('Projects/Legacy');
      expect(summary).toBeDefined();

      // When: Topic is deleted
      await app.deleteTopic('Projects/Legacy');

      // Then: Summary is also deleted
      const deletedSummary = await app.getTopicSummary('Projects/Legacy');
      expect(deletedSummary).toBeNull();
    });
  });

  describe('Sparse Topic Handling', () => {
    it('Topic with single email still has meaningful summary', async () => {
      // Given: Topic has only one email
      await app.processEmail({
        id: 'single-email',
        subject: 'Account Update',
        body: 'Your Chase account has been updated with new security features.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User views summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: Summary is still meaningful (not empty or error)
      expect(summary).toBeDefined();
      expect(summary.content.length).toBeGreaterThan(50);
      expect(summary.content).toContain('Chase');
    });
  });

  describe('Conflicting Information', () => {
    it('Topic summary handles contradictory emails gracefully', async () => {
      // Given: Same topic has conflicting information
      await app.processEmail({
        id: 'email-amount-a',
        subject: 'Payment Due',
        body: 'Your payment of $100 is due on January 15.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-10'),
      });

      await app.processEmail({
        id: 'email-amount-b',
        subject: 'Payment Updated',
        body: 'Your payment has been updated to $150. Please pay by January 20.',
        topic: 'Banking/Chase',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User views summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: Summary doesn't crash and reflects latest or both values
      expect(summary).toBeDefined();
      expect(summary.content).toBeDefined();
      // Either mentions latest amount or both amounts
      const hasLatest = summary.content.includes('150');
      const hasBoth = summary.content.includes('100') && summary.content.includes('150');
      expect(hasLatest || hasBoth).toBe(true);
    });
  });
});
