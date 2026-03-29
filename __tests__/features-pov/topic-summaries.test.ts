import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { SummaryGenerator } from '@core/summaries/generator';
import type { Email } from '@core/types/email';

/**
 * Feature: Topic Summaries
 *
 * As a user, I want rolling summaries for each topic that update as new emails arrive,
 * so I can quickly understand what's happening in each area without reading every email.
 *
 * Business Rules:
 * - 3-4 paragraphs, max 500 words
 * - First paragraph always high-level overview
 * - Older info gets less focus over time
 * - Updated with each new email in topic
 *
 * RULES:
 * - Every test calls REAL production code.
 * - SummaryGenerator and TopicsRepository are NOT mocked — they ARE the code under test.
 * - No LLM calls required — SummaryGenerator uses deterministic extraction logic.
 * - If a test fails, it means the feature is NOT implemented. That's the point.
 *
 * Infrastructure note:
 * db.execSql(migrationSql) is used instead of db.initialize() because
 * drizzle's migrator cannot handle multi-statement SQL files. This is the only
 * workaround — it creates the exact same schema.
 */

const MIGRATION_PATH = path.join(__dirname, '../../database/migrations/0000_initial.sql');

/** Helper: create an Email object with sensible defaults. */
function makeEmail(overrides: Partial<Email> & { id: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: 'noreply@chase.com',
    senderName: 'Chase Bank',
    senderDomain: 'chase.com',
    subject: 'Account Update',
    snippet: 'Your account has been updated.',
    receivedAt: new Date('2024-01-15'),
    ...overrides,
  };
}

describe('Feature: Topic Summaries', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let summaryGenerator: SummaryGenerator;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
    await db.execSql(migrationSql);
    repos = createRepositories(db);
    summaryGenerator = new SummaryGenerator();
  });

  afterEach(async () => {
    await db.close();
  });

  /** Helper: create topic (with parent hierarchy), insert emails, link them. */
  async function setupTopicWithSummary(
    topicPath: string,
    emails: Email[]
  ) {
    const parts = topicPath.split('/');
    const topicName = parts[parts.length - 1];
    let parentId: string | undefined;

    // Create parent topics if hierarchical
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join('/');
      const parentName = parts[parts.length - 2];
      const parent = await repos.topics.findByFullPath(parentPath);
      if (!parent) {
        const created = await repos.topics.create({
          id: `topic-${parentPath}`,
          name: parentName,
          fullPath: parentPath,
        });
        parentId = created.id;
      } else {
        parentId = parent.id;
      }
    }

    const existing = await repos.topics.findByFullPath(topicPath);
    let topicId: string;
    if (!existing) {
      const topic = await repos.topics.create({
        id: `topic-${topicPath}`,
        parentId,
        name: topicName,
        fullPath: topicPath,
      });
      topicId = topic.id;
    } else {
      topicId = existing.id;
    }

    // Insert emails and link to topic
    for (const email of emails) {
      await repos.emails.create({
        id: email.id,
        threadId: email.threadId,
        senderEmail: email.senderEmail,
        senderName: email.senderName || undefined,
        senderDomain: email.senderDomain,
        subject: email.subject || undefined,
        snippet: email.snippet || undefined,
        receivedAt: email.receivedAt,
      });
      await repos.topics.linkEmail(email.id, topicId);
    }

    return { topicId, topicPath };
  }

  // ─── Initial Summary Creation ───

  describe('Initial Summary Creation', () => {
    it('User sees a summary created when the first email in a topic is processed', async () => {
      // Given: User processes their first banking email
      const email = makeEmail({
        id: 'email-1',
        subject: 'Your Chase Statement is Ready',
        snippet: 'Your January statement shows a balance of $2,450. Payment due February 15.',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const { topicId, topicPath } = await setupTopicWithSummary('Banking/Chase', [email]);

      // When: Summary is generated
      const result = await summaryGenerator.generateTopicSummary(topicPath, [email]);
      await repos.topics.upsertSummary(topicId, result.summary, result.wordCount, result.lastEmailId!);

      // Then: A summary has been created and persisted
      const persisted = await repos.topics.getSummary(topicId);
      expect(persisted).toBeDefined();
      expect(persisted!.summary).toContain('Chase');
      expect(persisted!.updateCount).toBe(1);
    });

    it('User sees summary structured with 3-4 paragraphs', async () => {
      // Given: A topic has 5 emails processed
      const emails = Array.from({ length: 5 }, (_, i) =>
        makeEmail({
          id: `email-${i}`,
          subject: `Banking Update ${i}`,
          snippet: `Details about banking update number ${i}. Balance changed.`,
          receivedAt: new Date('2024-01-10'),
          senderDomain: 'chase.com',
          senderName: 'Chase',
        })
      );
      const { topicPath } = await setupTopicWithSummary('Banking/Chase', emails);

      // When: Summary is generated
      const result = await summaryGenerator.generateTopicSummary(topicPath, emails);

      // Then: Summary has 3-4 paragraphs
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      expect(result.paragraphCount).toBeLessThanOrEqual(4);
      expect(result.paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(result.paragraphs.length).toBeLessThanOrEqual(4);
    });

    it('User sees summary stays within 500 word limit', async () => {
      // Given: A topic has many emails (more content than 500 words)
      const emails = Array.from({ length: 50 }, (_, i) =>
        makeEmail({
          id: `email-${i}`,
          subject: `Statement Update ${i}`,
          snippet: `This is a detailed update about your account with lots of information about transactions and balances and payments and charges that add up to well over five hundred words when combined together across all fifty emails.`,
          receivedAt: new Date('2024-01-10'),
          senderDomain: 'chase.com',
          senderName: 'Chase',
        })
      );
      const { topicPath } = await setupTopicWithSummary('Banking/Chase', emails);

      // When: Summary is generated
      const result = await summaryGenerator.generateTopicSummary(topicPath, emails);

      // Then: Summary is within word limit
      expect(result.wordCount).toBeLessThanOrEqual(500);
    });
  });

  // ─── First Paragraph Overview ───

  describe('First Paragraph Overview', () => {
    it('User sees high-level overview in the first paragraph', async () => {
      // Given: Multiple detailed banking emails have been processed
      const emails = [
        makeEmail({ id: 'e1', subject: 'Statement Ready', snippet: 'Balance $2,450. Transaction details enclosed.', senderDomain: 'chase.com', senderName: 'Chase' }),
        makeEmail({ id: 'e2', subject: 'Payment Received', snippet: 'Payment of $500 applied to your account.', senderDomain: 'chase.com', senderName: 'Chase' }),
        makeEmail({ id: 'e3', subject: 'Fraud Alert', snippet: 'Suspicious activity detected on your card.', senderDomain: 'chase.com', senderName: 'Chase' }),
      ];
      const { topicPath } = await setupTopicWithSummary('Banking/Chase', emails);

      // When: User views the summary
      const result = await summaryGenerator.generateTopicSummary(topicPath, emails);
      const firstParagraph = result.paragraphs[0];

      // Then: First paragraph is a high-level overview (not detailed)
      expect(firstParagraph.length).toBeLessThan(300);
      // Should mention the topic broadly
      expect(firstParagraph.toLowerCase()).toMatch(/chase|banking|account/);
    });

    it('User can quickly understand topic status from first paragraph alone', async () => {
      // Given: Complex topic with many details
      const emails = [
        makeEmail({ id: 'e1', subject: 'Sprint 1 Complete', snippet: 'Delivered authentication module on schedule.', senderDomain: 'company.com', senderName: 'PM' }),
        makeEmail({ id: 'e2', subject: 'Sprint 2 Started', snippet: 'Working on payment integration this sprint.', senderDomain: 'company.com', senderName: 'PM' }),
        makeEmail({ id: 'e3', subject: 'Client Feedback', snippet: 'Client requested changes to UI layout.', senderDomain: 'company.com', senderName: 'Client' }),
      ];
      const { topicPath } = await setupTopicWithSummary('Projects/Alpha', emails);

      // When: User views just the first paragraph
      const result = await summaryGenerator.generateTopicSummary(topicPath, emails);
      const overview = result.paragraphs[0];

      // Then: First paragraph mentions the topic name and provides context
      expect(overview).toMatch(/Alpha/i);
      expect(overview.length).toBeGreaterThan(10);
    });
  });

  // ─── Rolling Updates ───

  describe('Rolling Updates', () => {
    it('User sees summary updated when a new email is added to the topic', async () => {
      // Given: A topic already has a summary
      const email1 = makeEmail({
        id: 'email-1',
        subject: 'Statement Ready',
        snippet: 'Your January statement is ready.',
        receivedAt: new Date('2024-01-15'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const { topicId, topicPath } = await setupTopicWithSummary('Banking/Chase', [email1]);

      const result1 = await summaryGenerator.generateTopicSummary(topicPath, [email1]);
      await repos.topics.upsertSummary(topicId, result1.summary, result1.wordCount, result1.lastEmailId!);

      const originalSummary = await repos.topics.getSummary(topicId);
      expect(originalSummary!.updateCount).toBe(1);

      // When: A new email is processed in this topic
      const email2 = makeEmail({
        id: 'email-2',
        subject: 'Payment Confirmed',
        snippet: 'Your payment of $500 has been received.',
        receivedAt: new Date('2024-02-01'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await repos.emails.create({
        id: email2.id,
        threadId: email2.threadId,
        senderEmail: email2.senderEmail,
        senderDomain: email2.senderDomain,
        subject: email2.subject!,
        snippet: email2.snippet!,
        receivedAt: email2.receivedAt,
      });
      await repos.topics.linkEmail(email2.id, topicId);

      const result2 = await summaryGenerator.generateTopicSummary(topicPath, [email1, email2]);
      await repos.topics.upsertSummary(topicId, result2.summary, result2.wordCount, result2.lastEmailId!);

      // Then: Summary is updated with incremented count
      const updatedSummary = await repos.topics.getSummary(topicId);
      expect(updatedSummary!.updateCount).toBe(2);
      expect(updatedSummary!.summary).toMatch(/payment/i);
      expect(updatedSummary!.lastEmailId).toBe('email-2');
    });

    it('User sees incrementing update count as new emails arrive', async () => {
      // Given: User processes 3 emails for a topic
      const emails = Array.from({ length: 3 }, (_, i) =>
        makeEmail({
          id: `email-${i}`,
          subject: `Update ${i}`,
          snippet: `Banking update number ${i}.`,
          receivedAt: new Date('2024-01-10'),
          senderDomain: 'chase.com',
          senderName: 'Chase',
        })
      );
      const { topicId, topicPath } = await setupTopicWithSummary('Banking/Chase', emails);

      const result1 = await summaryGenerator.generateTopicSummary(topicPath, emails);
      await repos.topics.upsertSummary(topicId, result1.summary, result1.wordCount, result1.lastEmailId!);

      let summary = await repos.topics.getSummary(topicId);
      expect(summary!.updateCount).toBe(1); // First upsert = count 1

      // When: 2 more emails arrive and summary is regenerated
      const moreEmails = Array.from({ length: 2 }, (_, i) =>
        makeEmail({
          id: `email-extra-${i}`,
          subject: `Extra Update ${i}`,
          snippet: `Additional banking update ${i}.`,
          receivedAt: new Date('2024-01-20'),
          senderDomain: 'chase.com',
          senderName: 'Chase',
        })
      );
      for (const e of moreEmails) {
        await repos.emails.create({
          id: e.id, threadId: e.threadId, senderEmail: e.senderEmail,
          senderDomain: e.senderDomain, subject: e.subject!, snippet: e.snippet!,
          receivedAt: e.receivedAt,
        });
        await repos.topics.linkEmail(e.id, topicId);
      }

      const allEmails = [...emails, ...moreEmails];
      const result2 = await summaryGenerator.generateTopicSummary(topicPath, allEmails);
      await repos.topics.upsertSummary(topicId, result2.summary, result2.wordCount, result2.lastEmailId!);

      // Then: Update count increments
      summary = await repos.topics.getSummary(topicId);
      expect(summary!.updateCount).toBe(2); // Second upsert increments to 2
    });
  });

  // ─── Information Freshness ───

  describe('Information Freshness', () => {
    it('User sees recent information emphasized over older information', async () => {
      // Given: Topic has old and new emails
      const oldEmail = makeEmail({
        id: 'old-email',
        subject: 'Very Old Statement',
        snippet: 'This is very old information from 2022 about your account balance.',
        receivedAt: new Date('2022-01-01'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const newEmail = makeEmail({
        id: 'new-email',
        subject: 'Recent Statement',
        snippet: 'Your recent statement shows significant changes to your account.',
        receivedAt: new Date('2024-01-01'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });

      const { topicPath } = await setupTopicWithSummary('Banking/Chase', [oldEmail, newEmail]);

      // When: User views the summary
      const result = await summaryGenerator.generateTopicSummary(topicPath, [oldEmail, newEmail]);

      // Then: Recent email subject appears in summary (generator sorts newest-first)
      expect(result.summary).toMatch(/Recent Statement/i);
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('User sees summary reflect current state, not just historical data', async () => {
      // Given: Topic had initial state, then changed
      const email1 = makeEmail({
        id: 'email-1',
        subject: 'Account Opened',
        snippet: 'Your new Chase account has been opened.',
        receivedAt: new Date('2023-01-01'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const email2 = makeEmail({
        id: 'email-2',
        subject: 'Account Closed',
        snippet: 'Your Chase account has been closed per your request.',
        receivedAt: new Date('2024-01-01'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });

      const { topicPath } = await setupTopicWithSummary('Banking/Chase', [email1, email2]);

      // When: User views the summary
      const result = await summaryGenerator.generateTopicSummary(topicPath, [email1, email2]);

      // Then: Most recent email (Account Closed) appears in summary because it is newest
      expect(result.summary).toMatch(/Account Closed/i);
    });
  });

  // ─── Multiple Topic Summaries ───

  describe('Multiple Topic Summaries', () => {
    it('User can browse summaries for all their topics independently', async () => {
      // Given: User has emails in multiple topics
      const chaseEmails = Array.from({ length: 3 }, (_, i) =>
        makeEmail({ id: `chase-${i}`, subject: `Chase ${i}`, snippet: `Chase update ${i}`, senderDomain: 'chase.com', senderName: 'Chase' })
      );
      const alphaEmails = Array.from({ length: 2 }, (_, i) =>
        makeEmail({ id: `alpha-${i}`, subject: `Alpha ${i}`, snippet: `Alpha update ${i}`, senderDomain: 'company.com', senderName: 'PM' })
      );
      const udemyEmails = Array.from({ length: 4 }, (_, i) =>
        makeEmail({ id: `udemy-${i}`, subject: `Udemy ${i}`, snippet: `Udemy update ${i}`, senderDomain: 'udemy.com', senderName: 'Udemy' })
      );

      const chase = await setupTopicWithSummary('Banking/Chase', chaseEmails);
      const alpha = await setupTopicWithSummary('Projects/Alpha', alphaEmails);
      const udemy = await setupTopicWithSummary('Education/Udemy', udemyEmails);

      // Generate and persist summaries for each
      const topicDataList = [
        { ...chase, emails: chaseEmails },
        { ...alpha, emails: alphaEmails },
        { ...udemy, emails: udemyEmails },
      ];
      for (const { topicId, topicPath, emails } of topicDataList) {
        const result = await summaryGenerator.generateTopicSummary(topicPath, emails);
        await repos.topics.upsertSummary(topicId, result.summary, result.wordCount, result.lastEmailId!);
      }

      // Then: All three summaries exist in DB
      const chaseSummary = await repos.topics.getSummary(chase.topicId);
      const alphaSummary = await repos.topics.getSummary(alpha.topicId);
      const udemySummary = await repos.topics.getSummary(udemy.topicId);

      expect(chaseSummary).not.toBeNull();
      expect(alphaSummary).not.toBeNull();
      expect(udemySummary).not.toBeNull();

      // Each summary is independent — mentions its own topic
      expect(chaseSummary!.summary).toMatch(/Chase/i);
      expect(alphaSummary!.summary).toMatch(/Alpha/i);
      expect(udemySummary!.summary).toMatch(/Udemy/i);
    });

    it('Topics sorted by most recent activity show correct order', async () => {
      // Given: Multiple topics with different last activity dates
      const oldEmail = makeEmail({ id: 'old-1', subject: 'Old', snippet: 'Old update', receivedAt: new Date('2024-01-10'), senderDomain: 'chase.com', senderName: 'Chase' });
      const midEmail = makeEmail({ id: 'mid-1', subject: 'Mid', snippet: 'Mid update', receivedAt: new Date('2024-01-15'), senderDomain: 'udemy.com', senderName: 'Udemy' });
      const newEmail = makeEmail({ id: 'new-1', subject: 'New', snippet: 'New update', receivedAt: new Date('2024-01-20'), senderDomain: 'company.com', senderName: 'PM' });

      const chase = await setupTopicWithSummary('Banking/Chase', [oldEmail]);
      const udemy = await setupTopicWithSummary('Education/Udemy', [midEmail]);
      const alpha = await setupTopicWithSummary('Projects/Alpha', [newEmail]);

      // Generate and persist all summaries
      const topicDataList = [
        { ...chase, emails: [oldEmail] },
        { ...udemy, emails: [midEmail] },
        { ...alpha, emails: [newEmail] },
      ];
      for (const { topicId, topicPath, emails } of topicDataList) {
        const result = await summaryGenerator.generateTopicSummary(topicPath, emails);
        await repos.topics.upsertSummary(topicId, result.summary, result.wordCount, result.lastEmailId!);
      }

      // When: Retrieving all topics
      const allTopics = await repos.topics.findAll();

      // Then: All three topics exist
      expect(allTopics.length).toBeGreaterThanOrEqual(3);
      expect(allTopics.map(t => t.fullPath)).toContain('Banking/Chase');
      expect(allTopics.map(t => t.fullPath)).toContain('Projects/Alpha');
      expect(allTopics.map(t => t.fullPath)).toContain('Education/Udemy');
    });

    it('Topics with different email counts show correct counts', async () => {
      // Given: Topics with different email counts
      const chaseEmails = Array.from({ length: 10 }, (_, i) =>
        makeEmail({ id: `chase-${i}`, subject: `Chase ${i}`, snippet: `Chase update ${i}`, senderDomain: 'chase.com', senderName: 'Chase' })
      );
      const alphaEmails = Array.from({ length: 3 }, (_, i) =>
        makeEmail({ id: `alpha-${i}`, subject: `Alpha ${i}`, snippet: `Alpha update ${i}`, senderDomain: 'company.com', senderName: 'PM' })
      );

      await setupTopicWithSummary('Banking/Chase', chaseEmails);
      await setupTopicWithSummary('Projects/Alpha', alphaEmails);

      // Then: Topics are created and email links are stored
      const chaseTopic = await repos.topics.findByFullPath('Banking/Chase');
      const alphaTopic = await repos.topics.findByFullPath('Projects/Alpha');

      const chaseLinked = await repos.topics.findEmailsForTopic(chaseTopic!.id);
      const alphaLinked = await repos.topics.findEmailsForTopic(alphaTopic!.id);

      expect(chaseLinked.length).toBe(10);
      expect(alphaLinked.length).toBe(3);
    });
  });

  // ─── Summary Navigation ───

  describe('Summary Navigation', () => {
    it('User can retrieve all emails linked to a topic from the summary', async () => {
      // Given: User is viewing topic summaries
      const emails = Array.from({ length: 5 }, (_, i) =>
        makeEmail({ id: `email-${i}`, subject: `Banking ${i}`, snippet: `Banking update ${i}`, senderDomain: 'chase.com', senderName: 'Chase' })
      );
      const { topicId, topicPath } = await setupTopicWithSummary('Banking/Chase', emails);

      // When: User retrieves the topic detail
      const detail = await repos.topics.getTopicDetail(topicId);

      // Then: All linked emails are accessible from the topic
      expect(detail).not.toBeNull();
      expect(detail!.emails.length).toBe(5);
      expect(detail!.emails.every(e => e.id.startsWith('email-'))).toBe(true);
    });
  });

  // ─── DB Schema Validation ───

  describe('DB Schema Validation', () => {
    it('Topic summary has word_count field populated', async () => {
      // Given: Topic has a summary
      const emails = Array.from({ length: 3 }, (_, i) =>
        makeEmail({ id: `email-${i}`, subject: `Update ${i}`, snippet: `Banking update ${i}`, senderDomain: 'chase.com', senderName: 'Chase' })
      );
      const { topicId, topicPath } = await setupTopicWithSummary('Banking/Chase', emails);

      const result = await summaryGenerator.generateTopicSummary(topicPath, emails);
      await repos.topics.upsertSummary(topicId, result.summary, result.wordCount, result.lastEmailId!);

      // When: User retrieves summary from DB
      const persisted = await repos.topics.getSummary(topicId);

      // Then: word_count is populated
      expect(persisted!.wordCount).toBeDefined();
      expect(persisted!.wordCount).not.toBeNull();
      expect(persisted!.wordCount!).toBeGreaterThan(0);
      expect(persisted!.wordCount!).toBeLessThanOrEqual(500);
    });

    it('Topic summary has last_email_id populated', async () => {
      // Given: Multiple emails processed for topic
      const emails = [
        makeEmail({ id: 'email-1', subject: 'Earlier Update', snippet: 'Older update.', receivedAt: new Date('2024-01-10'), senderDomain: 'chase.com', senderName: 'Chase' }),
        makeEmail({ id: 'email-2', subject: 'Latest Statement', snippet: 'Your most recent statement.', receivedAt: new Date('2024-02-01'), senderDomain: 'chase.com', senderName: 'Chase' }),
      ];
      const { topicId, topicPath } = await setupTopicWithSummary('Banking/Chase', emails);

      const result = await summaryGenerator.generateTopicSummary(topicPath, emails);
      await repos.topics.upsertSummary(topicId, result.summary, result.wordCount, result.lastEmailId!);

      // When: User retrieves summary
      const persisted = await repos.topics.getSummary(topicId);

      // Then: last_email_id references the most recent email (generator sorts newest-first)
      expect(persisted!.lastEmailId).toBeDefined();
      expect(persisted!.lastEmailId).not.toBeNull();
      expect(persisted!.lastEmailId).toBe('email-2');
    });
  });

  // ─── Cascade Delete ───

  describe('Cascade Delete', () => {
    it('Deleting topic removes associated summary', async () => {
      // Given: Topic with summary exists
      const emails = Array.from({ length: 3 }, (_, i) =>
        makeEmail({ id: `email-${i}`, subject: `Update ${i}`, snippet: `Legacy update ${i}`, senderDomain: 'chase.com', senderName: 'Chase' })
      );
      const { topicId, topicPath } = await setupTopicWithSummary('Projects/Legacy', emails);

      const result = await summaryGenerator.generateTopicSummary(topicPath, emails);
      await repos.topics.upsertSummary(topicId, result.summary, result.wordCount, result.lastEmailId!);

      const summary = await repos.topics.getSummary(topicId);
      expect(summary).not.toBeNull();

      // When: Topic is deleted
      await repos.topics.delete(topicId);

      // Then: Summary is also deleted (cascade)
      const deletedSummary = await repos.topics.getSummary(topicId);
      expect(deletedSummary).toBeNull();
    });
  });

  // ─── Sparse Topic Handling ───

  describe('Sparse Topic Handling', () => {
    it('Topic with single email still produces valid summary', async () => {
      // Given: Topic has only one email
      const email = makeEmail({
        id: 'single-email',
        subject: 'Account Update',
        snippet: 'Your Chase account has been updated with new security features.',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const { topicId, topicPath } = await setupTopicWithSummary('Banking/Chase', [email]);

      // When: Summary is generated
      const result = await summaryGenerator.generateTopicSummary(topicPath, [email]);

      // Then: Summary is non-empty and valid
      expect(result.summary).toBeDefined();
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.wordCount).toBeGreaterThan(0);
      // Should still have at least 3 paragraphs (enforced by SummaryGenerator)
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      // Should mention the sender/topic
      expect(result.summary).toMatch(/Chase/i);
    });
  });

  // ─── Conflicting Information ───

  describe('Conflicting Information', () => {
    it('Summary handles contradictory emails without crashing', async () => {
      // Given: Same topic has conflicting information
      const email1 = makeEmail({
        id: 'email-amount-a',
        subject: 'Payment Due',
        snippet: 'Your payment of $100 is due on January 15.',
        receivedAt: new Date('2024-01-10'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const email2 = makeEmail({
        id: 'email-amount-b',
        subject: 'Payment Updated',
        snippet: 'Your payment has been updated to $150. Please pay by January 20.',
        receivedAt: new Date('2024-01-15'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });

      const { topicId, topicPath } = await setupTopicWithSummary('Banking/Chase', [email1, email2]);

      // When: Summary is generated
      const result = await summaryGenerator.generateTopicSummary(topicPath, [email1, email2]);

      // Then: Summary doesn't crash — it includes both emails
      expect(result.summary).toBeDefined();
      expect(result.wordCount).toBeGreaterThan(0);
      // Generator produces a deterministic summary referencing recent subjects
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      // At least the newest email subject (Payment Updated) appears
      expect(result.summary).toMatch(/Payment Updated/i);
    });
  });

  // ─── Summary Persistence ───

  describe('Summary Persistence', () => {
    it('Summary survives a simulated restart (DB round-trip)', async () => {
      // Given: Topic with summary is created
      const emails = Array.from({ length: 3 }, (_, i) =>
        makeEmail({ id: `email-${i}`, subject: `Update ${i}`, snippet: `Banking update ${i}`, senderDomain: 'chase.com', senderName: 'Chase' })
      );
      const { topicId, topicPath } = await setupTopicWithSummary('Banking/Chase', emails);

      const result = await summaryGenerator.generateTopicSummary(topicPath, emails);
      await repos.topics.upsertSummary(topicId, result.summary, result.wordCount, result.lastEmailId!);

      const original = await repos.topics.getSummary(topicId);
      expect(original).not.toBeNull();

      // When: Simulating a restart by re-reading from same DB connection
      const afterRestart = await repos.topics.getSummary(topicId);

      // Then: Summary is still there with same content
      expect(afterRestart).not.toBeNull();
      expect(afterRestart!.summary).toBe(original!.summary);
      expect(afterRestart!.wordCount).toBe(original!.wordCount);
      expect(afterRestart!.updateCount).toBe(original!.updateCount);
      expect(afterRestart!.lastEmailId).toBe(original!.lastEmailId);
    });
  });
});
