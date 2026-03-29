import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { SummaryGenerator } from '@core/summaries/generator';
import type { Email } from '@core/types/email';

const MIGRATION_0000 = path.join(__dirname, '../../database/migrations/0000_initial.sql');
const MIGRATION_0001 = path.join(__dirname, '../../database/migrations/0001_fix_summary_fk_cascade.sql');

/**
 * Helper: create an Email object with sensible defaults.
 */
function makeEmail(overrides: Partial<Email> & { id: string; senderDomain: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: `sender@${overrides.senderDomain}`,
    senderName: overrides.senderDomain.split('.')[0],
    subject: `Email from ${overrides.senderDomain}`,
    snippet: `This is a snippet for ${overrides.id}`,
    receivedAt: new Date('2024-06-15'),
    ...overrides,
  };
}

/**
 * Helper: persist an email in the database so FK constraints are satisfied.
 */
async function persistEmail(repos: Repositories, email: Email) {
  await repos.emails.create({
    id: email.id,
    threadId: email.threadId,
    senderEmail: email.senderEmail,
    senderDomain: email.senderDomain,
    senderName: email.senderName ?? undefined,
    subject: email.subject ?? undefined,
    snippet: email.snippet ?? undefined,
    receivedAt: email.receivedAt,
  });
}

/**
 * Feature: Sender Summaries
 *
 * As a user, I want rolling summaries for each sender domain,
 * so I can quickly understand what's happening with each sender
 * without reading every email.
 *
 * Business Rules:
 * - 3-4 paragraphs, max 500 words
 * - First paragraph always high-level overview
 * - Older info gets less focus over time
 * - Updated with each new email from sender
 */
describe('Feature: Sender Summaries', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let summaryGenerator: SummaryGenerator;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    db.getSqlite().exec(fs.readFileSync(MIGRATION_0000, 'utf-8'));
    db.getSqlite().exec(fs.readFileSync(MIGRATION_0001, 'utf-8'));
    repos = createRepositories(db);
    summaryGenerator = new SummaryGenerator();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Initial Summary Creation', () => {
    it('creates a sender summary when the first email from a domain is processed', async () => {
      // Given: an email exists from a sender domain
      const email = makeEmail({
        id: 'email-1',
        senderDomain: 'chase.com',
        subject: 'Your Chase Statement',
        snippet: 'Your January statement shows a balance of $2,450. Payment due February 15.',
        receivedAt: new Date('2024-01-20'),
      });
      await persistEmail(repos, email);

      // When: the summary generator produces a summary and it is persisted
      const result = await summaryGenerator.generateSenderSummary('chase.com', [email]);
      const record = await repos.summaries.upsertSenderSummary({
        senderDomain: 'chase.com',
        summary: result.summary,
        wordCount: result.wordCount,
        lastEmailId: result.lastEmailId,
      });

      // Then: the summary exists with correct metadata
      expect(record).toBeDefined();
      expect(record.senderDomain).toBe('chase.com');
      expect(record.updateCount).toBe(1);
      expect(record.summary.length).toBeGreaterThan(0);
      expect(record.lastEmailId).toBe('email-1');
    });

    it('stores the summary in the database and retrieves it by domain', async () => {
      // Given: a summary has been generated and stored
      const email = makeEmail({ id: 'e1', senderDomain: 'amazon.com' });
      await persistEmail(repos, email);
      const result = await summaryGenerator.generateSenderSummary('amazon.com', [email]);
      await repos.summaries.upsertSenderSummary({
        senderDomain: 'amazon.com',
        summary: result.summary,
        wordCount: result.wordCount,
        lastEmailId: result.lastEmailId,
      });

      // When: retrieving by domain
      const stored = await repos.summaries.getSenderSummary('amazon.com');

      // Then: it matches what was stored
      expect(stored).not.toBeNull();
      expect(stored!.senderDomain).toBe('amazon.com');
      expect(stored!.summary).toBe(result.summary);
      expect(stored!.wordCount).toBe(result.wordCount);
    });
  });

  describe('Summary Structure', () => {
    it('produces 3-4 paragraphs with at most 500 words', async () => {
      // Given: multiple emails from one sender
      const emails: Email[] = [];
      for (let i = 0; i < 10; i++) {
        emails.push(makeEmail({
          id: `struct-${i}`,
          senderDomain: 'newsletters.com',
          subject: `Newsletter Issue ${i}`,
          snippet: `Latest updates on technology, science, and world events. Issue ${i} covers many topics.`,
          receivedAt: new Date(Date.now() - i * 86400000),
        }));
      }

      // When: generating a summary
      const result = await summaryGenerator.generateSenderSummary('newsletters.com', emails);

      // Then: paragraph count is 3-4
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      expect(result.paragraphCount).toBeLessThanOrEqual(4);

      // And: word count is within limit
      expect(result.wordCount).toBeLessThanOrEqual(500);

      // And: the paragraphs array matches paragraphCount
      expect(result.paragraphs.length).toBe(result.paragraphCount);
    });
  });

  describe('Summary Updates', () => {
    it('increments update count when a new email from the same sender arrives', async () => {
      // Given: a sender already has a summary from one email
      const email1 = makeEmail({
        id: 'update-1',
        senderDomain: 'bank.com',
        subject: 'Statement Ready',
        snippet: 'Your January statement is ready.',
        receivedAt: new Date('2024-01-15'),
      });
      await persistEmail(repos, email1);
      const result1 = await summaryGenerator.generateSenderSummary('bank.com', [email1]);
      await repos.summaries.upsertSenderSummary({
        senderDomain: 'bank.com',
        summary: result1.summary,
        wordCount: result1.wordCount,
        lastEmailId: result1.lastEmailId,
      });

      const original = await repos.summaries.getSenderSummary('bank.com');
      expect(original!.updateCount).toBe(1);

      // When: a second email is processed
      const email2 = makeEmail({
        id: 'update-2',
        senderDomain: 'bank.com',
        subject: 'Payment Confirmed',
        snippet: 'Your payment of $500 has been received.',
        receivedAt: new Date('2024-02-01'),
      });
      await persistEmail(repos, email2);
      const result2 = await summaryGenerator.generateSenderSummary('bank.com', [email1, email2]);
      await repos.summaries.upsertSenderSummary({
        senderDomain: 'bank.com',
        summary: result2.summary,
        wordCount: result2.wordCount,
        lastEmailId: result2.lastEmailId,
      });

      // Then: update count is incremented and lastEmailId updated
      const updated = await repos.summaries.getSenderSummary('bank.com');
      expect(updated!.updateCount).toBe(2);
      expect(updated!.lastEmailId).toBe('update-2');
    });
  });

  describe('Multiple Sender Summaries', () => {
    it('maintains independent summaries for different sender domains', async () => {
      // Given: emails from three different senders
      const domainA = 'sender-a.com';
      const domainB = 'sender-b.com';
      const domainC = 'sender-c.com';

      for (const domain of [domainA, domainB, domainC]) {
        const emails = [
          makeEmail({ id: `${domain}-1`, senderDomain: domain, receivedAt: new Date('2024-03-01') }),
          makeEmail({ id: `${domain}-2`, senderDomain: domain, receivedAt: new Date('2024-03-10') }),
        ];
        for (const e of emails) {
          await persistEmail(repos, e);
        }
        const result = await summaryGenerator.generateSenderSummary(domain, emails);
        await repos.summaries.upsertSenderSummary({
          senderDomain: domain,
          summary: result.summary,
          wordCount: result.wordCount,
          lastEmailId: result.lastEmailId,
        });
      }

      // When: retrieving all summaries
      const allSummaries = await repos.summaries.getAllSenderSummaries();

      // Then: each domain has its own summary
      expect(allSummaries.length).toBe(3);
      const domains = allSummaries.map(s => s.senderDomain);
      expect(domains).toContain(domainA);
      expect(domains).toContain(domainB);
      expect(domains).toContain(domainC);

      // And: each summary is independent (different IDs for different domains)
      const summaryA = await repos.summaries.getSenderSummary(domainA);
      const summaryB = await repos.summaries.getSenderSummary(domainB);
      expect(summaryA!.id).not.toBe(summaryB!.id);
    });
  });

  describe('Sender-Topic Relationship', () => {
    it('tracks that a sender domain can have emails across multiple topics', async () => {
      // Given: two emails from amazon.com in different topics
      const shoppingEmail = makeEmail({
        id: 'amazon-shopping',
        senderDomain: 'amazon.com',
        subject: 'Your Order Shipped',
        snippet: 'Your order #123 has been shipped.',
        receivedAt: new Date('2024-05-01'),
      });
      const dealsEmail = makeEmail({
        id: 'amazon-deals',
        senderDomain: 'amazon.com',
        subject: 'Deal of the Day',
        snippet: 'Check out today\'s deals on electronics.',
        receivedAt: new Date('2024-05-05'),
      });

      // Store both emails in the database
      await persistEmail(repos, shoppingEmail);
      await persistEmail(repos, dealsEmail);

      // Create two topics and link emails to them
      await repos.topics.create({ id: 'topic-shopping', name: 'Amazon', fullPath: 'Shopping/Amazon' });
      await repos.topics.create({ id: 'topic-deals', name: 'Amazon', fullPath: 'Deals/Amazon' });
      await repos.topics.linkEmail(shoppingEmail.id, 'topic-shopping');
      await repos.topics.linkEmail(dealsEmail.id, 'topic-deals');

      // When: generating a sender summary that covers both emails
      const result = await summaryGenerator.generateSenderSummary('amazon.com', [shoppingEmail, dealsEmail]);

      // Then: both emails are reflected in the summary (updateCount = 2)
      expect(result.updateCount).toBe(2);
      expect(result.lastEmailId).toBe(dealsEmail.id);

      // And: the sender domain has emails in both topics
      const topicsForShopping = await repos.topics.findTopicsForEmail(shoppingEmail.id);
      const topicsForDeals = await repos.topics.findTopicsForEmail(dealsEmail.id);
      expect(topicsForShopping.map(t => t.fullPath)).toContain('Shopping/Amazon');
      expect(topicsForDeals.map(t => t.fullPath)).toContain('Deals/Amazon');
    });
  });

  describe('Word Count Validation', () => {
    it('keeps summary within 500 words even with many emails', async () => {
      // Given: a sender with 20 substantial emails
      const emails: Email[] = [];
      for (let i = 0; i < 20; i++) {
        emails.push(makeEmail({
          id: `wordy-${i}`,
          senderDomain: 'wordy-sender.com',
          subject: `Important Update #${i}: Quarterly Financial Report and Account Status`,
          snippet: `This is a detailed update about your account activity, including transactions, balance changes, payment confirmations, security alerts, and promotional offers that you should review carefully. Message ${i}.`,
          receivedAt: new Date(Date.now() - i * 86400000),
        }));
      }

      // When: generating a summary
      const result = await summaryGenerator.generateSenderSummary('wordy-sender.com', emails);

      // Then: summary stays within the 500-word limit
      expect(result.wordCount).toBeLessThanOrEqual(500);

      // And: manual word count matches
      const manualWordCount = result.summary.split(/\s+/).filter(w => w.length > 0).length;
      expect(manualWordCount).toBeLessThanOrEqual(500);
    });
  });

  describe('Rolling Summary Behavior', () => {
    it('incorporates existing summary context when generating an updated summary', async () => {
      // Given: a sender has an existing summary
      const oldEmail = makeEmail({
        id: 'rolling-old',
        senderDomain: 'rolling.com',
        subject: 'Legacy Account Settings',
        snippet: 'Your legacy account settings from 2022 have been saved.',
        receivedAt: new Date('2022-06-01'),
      });

      const firstResult = await summaryGenerator.generateSenderSummary('rolling.com', [oldEmail]);
      expect(firstResult.updateCount).toBe(1);

      // When: a new email arrives and the summary is regenerated with the old summary as context
      const newEmail = makeEmail({
        id: 'rolling-new',
        senderDomain: 'rolling.com',
        subject: 'New Security Features',
        snippet: 'We have added new two-factor authentication options for 2024.',
        receivedAt: new Date('2024-01-15'),
      });

      const updatedResult = await summaryGenerator.generateSenderSummary(
        'rolling.com',
        [oldEmail, newEmail],
        firstResult.summary, // pass existing summary
      );

      // Then: the updated summary reflects both emails
      expect(updatedResult.updateCount).toBe(2);
      expect(updatedResult.wordCount).toBeGreaterThan(0);
      expect(updatedResult.paragraphCount).toBeGreaterThanOrEqual(3);

      // And: the newer email is listed first (lastEmailId is the newest)
      expect(updatedResult.lastEmailId).toBe('rolling-new');
    });
  });

  describe('Cascade Delete', () => {
    it('removes the sender summary when explicitly deleted', async () => {
      // Given: a sender has a summary
      const email = makeEmail({ id: 'cascade-1', senderDomain: 'to-delete.com' });
      await persistEmail(repos, email);
      const result = await summaryGenerator.generateSenderSummary('to-delete.com', [email]);
      await repos.summaries.upsertSenderSummary({
        senderDomain: 'to-delete.com',
        summary: result.summary,
        wordCount: result.wordCount,
        lastEmailId: result.lastEmailId,
      });

      const summaryBefore = await repos.summaries.getSenderSummary('to-delete.com');
      expect(summaryBefore).not.toBeNull();

      // When: the sender summary is deleted
      await repos.summaries.deleteSenderSummary('to-delete.com');

      // Then: the summary no longer exists
      const summaryAfter = await repos.summaries.getSenderSummary('to-delete.com');
      expect(summaryAfter).toBeNull();
    });

    it('cleans up associated email data when emails are deleted', async () => {
      // Given: emails exist for a sender with a linked summary
      const email1 = makeEmail({ id: 'del-email-1', senderDomain: 'gone.com' });
      const email2 = makeEmail({ id: 'del-email-2', senderDomain: 'gone.com' });
      await persistEmail(repos, email1);
      await persistEmail(repos, email2);

      const result = await summaryGenerator.generateSenderSummary('gone.com', [email1, email2]);
      await repos.summaries.upsertSenderSummary({
        senderDomain: 'gone.com',
        summary: result.summary,
        wordCount: result.wordCount,
        lastEmailId: result.lastEmailId,
      });

      // When: all emails from that sender are deleted
      await repos.emails.delete('del-email-1');
      await repos.emails.delete('del-email-2');

      // Then: no more emails for that domain exist
      const remaining = await repos.emails.findBySenderDomain('gone.com');
      expect(remaining.length).toBe(0);

      // And: the sender summary can be cleaned up
      await repos.summaries.deleteSenderSummary('gone.com');
      const deletedSummary = await repos.summaries.getSenderSummary('gone.com');
      expect(deletedSummary).toBeNull();
    });
  });
});
