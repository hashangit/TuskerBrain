import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { EmailFixtures } from '@fixtures/email-fixtures';

/**
 * Scenario: Conflicting Information Handling
 *
 * Tests how TuskerBrain handles emails with contradictory or conflicting information,
 * ensuring summaries reflect the most recent and accurate state.
 *
 * Business Rules:
 * - Newer information supersedes older information in summaries
 * - Conflicting payment amounts show latest value
 * - Status changes reflect current state, not historical
 */
describe('Scenario: Conflicting Information', () => {
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

  describe('Payment Amount Conflicts', () => {
    it('Summary reflects latest payment amount when amounts differ', async () => {
      // Given: Series of emails with different payment amounts
      await app.processEmail({
        id: 'payment-1',
        subject: 'Your Bill',
        body: 'Your payment of $100 is due on January 15.',
        topic: 'Banking/Chase',
        senderDomain: 'chase.com',
        receivedAt: new Date('2024-01-10'),
      });

      await app.processEmail({
        id: 'payment-2',
        subject: 'Updated Bill',
        body: 'Your payment has been updated to $150. Please pay by January 20.',
        topic: 'Banking/Chase',
        senderDomain: 'chase.com',
        receivedAt: new Date('2024-01-12'),
      });

      // When: User views the topic summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: Summary reflects the latest amount ($150)
      expect(summary.content).toMatch(/150/);
      expect(summary.content).not.toMatch(/100/);
    });

    it('Summary reflects current account state, not just opening', async () => {
      // Given: Account was opened then closed
      await app.processEmail({
        id: 'account-opened',
        subject: 'Account Opened',
        body: 'Your new Chase checking account has been opened successfully.',
        topic: 'Banking/Chase',
        senderDomain: 'chase.com',
        receivedAt: new Date('2023-06-01'),
      });

      await app.processEmail({
        id: 'account-closed',
        subject: 'Account Closed',
        body: 'Your Chase checking account has been closed per your request.',
        topic: 'Banking/Chase',
        senderDomain: 'chase.com',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User views the topic summary
      const summary = await app.getTopicSummary('Banking/Chase');

      // Then: Summary reflects closed state
      expect(summary.content.toLowerCase()).toMatch(/closed|no longer active/i);
    });

    it('Summary handles deadline changes correctly', async () => {
      // Given: Email with deadline change
      await app.processEmail({
        id: 'deadline-1',
        subject: 'Project Deadline',
        body: 'The deadline for Project Alpha is January 31, 2024.',
        topic: 'Projects/Alpha',
        senderDomain: 'client.com',
        receivedAt: new Date('2024-01-15'),
      });

      await app.processEmail({
        id: 'deadline-2',
        subject: 'Deadline Extended',
        body: 'The deadline for Project Alpha has been extended to February 15, 2024.',
        topic: 'Projects/Alpha',
        senderDomain: 'client.com',
        receivedAt: new Date('2024-01-20'),
      });

      // When: User views the topic summary
      const summary = await app.getTopicSummary('Projects/Alpha');

      // Then: Summary reflects the extended deadline
      expect(summary.content).toMatch(/February 15|extended/i);
    });
  });

  describe('Priority Conflicts', () => {
    it('Latest priority level supersedes earlier classification', async () => {
      // Given: Priority changes in email thread
      await app.processEmail({
        id: 'priority-1',
        subject: 'Review Request',
        body: 'Please review the attached document when you have time.',
        topic: 'Projects/Beta',
        senderDomain: 'client.com',
        receivedAt: new Date('2024-01-10'),
      });

      await app.processEmail({
        id: 'priority-2',
        subject: 'URGENT: Review Required',
        body: 'Please review the attached document ASAP. Deadline is tomorrow.',
        topic: 'Projects/Beta',
        senderDomain: 'client.com',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User views the email
      const email = await app.getEmail('priority-2');

      // Then: Priority is updated to high
      expect(email.priority).toBe('high');
    });
  });

  describe('Meeting Time Conflicts', () => {
    it('Rescheduled meeting shows both times in summary', async () => {
      // Given: Meeting rescheduled
      await app.processEmail({
        id: 'meeting-1',
        subject: 'Meeting Scheduled',
        body: 'Team standup is scheduled for Monday at 2pm.',
        topic: 'Projects/Gamma',
        senderDomain: 'company.com',
        receivedAt: new Date('2024-01-10'),
      });

      await app.processEmail({
        id: 'meeting-2',
        subject: 'Meeting Rescheduled',
        body: 'Team standup has been rescheduled to Tuesday at 3pm.',
        topic: 'Projects/Gamma',
        senderDomain: 'company.com',
        receivedAt: new Date('2024-01-11'),
      });

      // When: User views the topic summary
      const summary = await app.getTopicSummary('Projects/Gamma');

      // Then: Summary reflects the rescheduled time
      expect(summary.content).toMatch(/Tuesday|3pm|rescheduled/i);
      // Original time may also be mentioned
      expect(summary.content).toMatch(/Monday|2pm/i);
    });
  });

  describe('Deal Status Conflicts', () => {
    it('Expired deal is removed from active deals', async () => {
      // Given: Deal that expires
      await app.processEmail({
        id: 'deal-active',
        subject: '50% Off Sale',
        body: 'Get 50% off everything. Use code SAVE50. Expires January 31.',
        category: 'promotions',
        senderDomain: 'store.com',
        receivedAt: new Date('2024-01-15'),
        simulatedExpiry: new Date('2024-01-31'),
      });

      // When: Expiry date passes
      await app.simulateTimePassage(new Date('2024-02-01'));

      // Then: Deal is marked as expired
      const activeDeals = await app.getActiveDeals();
      const expiredDeals = await app.getExpiredDeals();

      expect(activeDeals.find(d => d.id === 'deal-active')).toBeUndefined();
      expect(expiredDeals.find(d => d.id === 'deal-active')).toBeDefined();
    });

  });
});
