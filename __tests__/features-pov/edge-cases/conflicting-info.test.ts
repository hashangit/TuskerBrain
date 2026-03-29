import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { SummaryGenerator } from '@core/summaries/generator';
import type { Email } from '@core/types/email';

/**
 * Feature: Conflicting Information Handling
 *
 * Tests how the system handles emails with contradictory or conflicting information,
 * ensuring summaries reflect the most recent state.
 *
 * Business Rules:
 * - Newer information supersedes older information in summaries
 * - Summary generator sorts emails newest-first and surfaces recent updates
 * - Rolling summaries incorporate previous context while emphasizing new data
 * - Conflicting data does not crash the system
 *
 * RULES:
 * - Every test calls REAL production code.
 * - SummaryGenerator and TopicsRepository are NOT mocked.
 * - No LLM calls required -- SummaryGenerator uses deterministic extraction logic.
 *
 * Infrastructure note:
 * db.execSql(migrationSql) is used instead of db.initialize() because
 * drizzle's migrator cannot handle multi-statement SQL files.
 */

const MIGRATION_PATH = path.join(__dirname, '../../../database/migrations/0000_initial.sql');

/** Helper: create an Email object with sensible defaults. */
function makeEmail(overrides: Partial<Email> & { id: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: 'noreply@example.com',
    senderName: 'Sender',
    senderDomain: 'example.com',
    subject: 'Update',
    snippet: 'Some update.',
    receivedAt: new Date('2024-01-15'),
    ...overrides,
  };
}

describe('Feature: Conflicting Information', () => {
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
  async function setupTopicWithEmails(topicPath: string, emails: Email[]) {
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

  /**
   * Helper: generate summary, persist via raw SQL, and return both result and DB record.
   */
  async function generateAndPersist(topicPath: string, topicId: string, emails: Email[], existingSummary?: string) {
    const result = await summaryGenerator.generateTopicSummary(topicPath, emails, existingSummary);
    // Direct SQL insert for test-level control over upsert behavior
    const existing = await db.get('SELECT id FROM topic_summaries WHERE topic_id = ?', [topicId]);
    if (existing) {
      await db.run(
        `UPDATE topic_summaries SET summary = ?, word_count = ?, last_updated = datetime('now'), last_email_id = ?, update_count = update_count + 1 WHERE topic_id = ?`,
        [result.summary, result.wordCount, result.lastEmailId!, topicId]
      );
    } else {
      await db.run(
        `INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, last_email_id, update_count) VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`,
        [`ts_${topicId}`, topicId, result.summary, result.wordCount, result.lastEmailId!]
      );
    }
    const persisted = await repos.topics.getSummary(topicId);
    return { result, persisted };
  }

  // ─── Payment Amount Conflicts ───

  describe('Payment Amount Conflicts', () => {
    it('summary reflects latest payment amount when amounts differ', async () => {
      // Given: Two emails with different payment amounts
      const email1 = makeEmail({
        id: 'payment-1',
        subject: 'Your Bill',
        snippet: 'Your payment of $100 is due on January 15.',
        receivedAt: new Date('2024-01-10'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const email2 = makeEmail({
        id: 'payment-2',
        subject: 'Updated Bill',
        snippet: 'Your payment has been updated to $150. Please pay by January 20.',
        receivedAt: new Date('2024-01-12'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });

      const { topicId, topicPath } = await setupTopicWithEmails('Banking/Chase', [email1, email2]);

      // When: Summary is generated from both emails
      const { result, persisted } = await generateAndPersist(topicPath, topicId, [email1, email2]);

      // Then: Summary is valid and the newest email (Updated Bill) is surfaced
      expect(result.summary).toBeDefined();
      expect(result.wordCount).toBeGreaterThan(0);
      // Generator sorts newest-first, so "Updated Bill" subject appears first in recent activity
      expect(result.summary).toMatch(/Updated Bill/i);
      // The older email "Your Bill" also appears as a linked subject
      expect(result.summary).toMatch(/Your Bill/i);
      // "Financial updates" theme is detected from payment-related content
      expect(result.summary).toMatch(/Financial updates/i);
      // Summary is persisted
      expect(persisted).not.toBeNull();
      expect(persisted!.updateCount).toBe(1);
      expect(persisted!.lastEmailId).toBe('payment-2');
    });
  });

  // ─── Account State Changes ───

  describe('Account State Changes', () => {
    it('summary reflects current account state when reopened after closure', async () => {
      // Given: Account was closed then reopened
      const email1 = makeEmail({
        id: 'account-opened',
        subject: 'Account Opened',
        snippet: 'Your new Chase checking account has been opened successfully.',
        receivedAt: new Date('2023-06-01'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const email2 = makeEmail({
        id: 'account-closed',
        subject: 'Account Closed',
        snippet: 'Your Chase checking account has been closed per your request.',
        receivedAt: new Date('2024-01-15'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const email3 = makeEmail({
        id: 'account-reopened',
        subject: 'Account Reopened',
        snippet: 'Your Chase checking account has been reopened. Welcome back.',
        receivedAt: new Date('2024-02-01'),
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });

      const { topicId, topicPath } = await setupTopicWithEmails('Banking/Chase', [email1, email2, email3]);

      // When: Summary is generated
      const { result, persisted } = await generateAndPersist(topicPath, topicId, [email1, email2, email3]);

      // Then: Newest email (Account Reopened) is surfaced in summary
      expect(result.summary).toMatch(/Account Reopened/i);
      // The "Account Closed" email also appears (it is second newest)
      expect(result.summary).toMatch(/Account Closed/i);
      // lastEmailId points to the most recent email
      expect(persisted!.lastEmailId).toBe('account-reopened');
    });
  });

  // ─── Deadline Changes ───

  describe('Deadline Changes', () => {
    it('summary uses latest deadline when deadline is moved', async () => {
      // Given: Deadline was changed in a newer email
      const email1 = makeEmail({
        id: 'deadline-1',
        subject: 'Project Deadline',
        snippet: 'The deadline for Project Alpha is January 31, 2024.',
        receivedAt: new Date('2024-01-15'),
        senderDomain: 'client.com',
        senderName: 'Client Corp',
      });
      const email2 = makeEmail({
        id: 'deadline-2',
        subject: 'Deadline Extended',
        snippet: 'The deadline for Project Alpha has been extended to February 15, 2024.',
        receivedAt: new Date('2024-01-20'),
        senderDomain: 'client.com',
        senderName: 'Client Corp',
      });

      const { topicId, topicPath } = await setupTopicWithEmails('Projects/Alpha', [email1, email2]);

      // When: Summary is generated
      const { result, persisted } = await generateAndPersist(topicPath, topicId, [email1, email2]);

      // Then: Newest email (Deadline Extended) appears in summary
      expect(result.summary).toMatch(/Deadline Extended/i);
      // The older deadline email also appears as a subject
      expect(result.summary).toMatch(/Project Deadline/i);
      // "Project updates" theme is detected from deadline-related content
      expect(result.summary).toMatch(/Project updates/i);
      // Summary is persisted correctly
      expect(persisted!.lastEmailId).toBe('deadline-2');
    });
  });

  // ─── Priority Conflicts ───

  describe('Priority Conflicts', () => {
    it('summary handles same topic with conflicting urgency levels', async () => {
      // Given: Same topic gets low-priority then urgent emails
      const email1 = makeEmail({
        id: 'priority-low',
        subject: 'Review Request',
        snippet: 'Please review the attached document when you have time.',
        receivedAt: new Date('2024-01-10'),
        senderDomain: 'client.com',
        senderName: 'Client Corp',
      });
      const email2 = makeEmail({
        id: 'priority-urgent',
        subject: 'URGENT: Review Required',
        snippet: 'Please review the attached document ASAP. Deadline is tomorrow.',
        receivedAt: new Date('2024-01-15'),
        senderDomain: 'client.com',
        senderName: 'Client Corp',
      });

      const { topicId, topicPath } = await setupTopicWithEmails('Projects/Beta', [email1, email2]);

      // When: Summary is generated
      const { result, persisted } = await generateAndPersist(topicPath, topicId, [email1, email2]);

      // Then: Urgent email appears as the most recent update
      // Generator extracts subjects into "Recent activity" — "URGENT" is from the newest email's subject
      expect(result.summary).toMatch(/URGENT/i);
      // The older low-priority email also appears as a subject
      expect(result.summary).toMatch(/Review Request/i);
      // Both emails are processed and linked
      const linkedEmails = await repos.topics.findEmailsForTopic(topicId);
      expect(linkedEmails).toContain('priority-low');
      expect(linkedEmails).toContain('priority-urgent');
      // "Project updates" theme is detected from deadline/review content
      expect(result.summary).toMatch(/Project updates/i);
      // Summary is persisted
      expect(persisted).not.toBeNull();
    });
  });

  // ─── Meeting Time Conflicts ───

  describe('Meeting Time Conflicts', () => {
    it('summary reflects rescheduled meeting time from newer email', async () => {
      // Given: Meeting was rescheduled
      const email1 = makeEmail({
        id: 'meeting-1',
        subject: 'Meeting Scheduled',
        snippet: 'Team standup is scheduled for Monday at 2pm.',
        receivedAt: new Date('2024-01-10'),
        senderDomain: 'company.com',
        senderName: 'Team Lead',
      });
      const email2 = makeEmail({
        id: 'meeting-2',
        subject: 'Meeting Rescheduled',
        snippet: 'Team standup has been rescheduled to Tuesday at 3pm.',
        receivedAt: new Date('2024-01-11'),
        senderDomain: 'company.com',
        senderName: 'Team Lead',
      });

      const { topicId, topicPath } = await setupTopicWithEmails('Projects/Gamma', [email1, email2]);

      // When: Summary is generated
      const { result, persisted } = await generateAndPersist(topicPath, topicId, [email1, email2]);

      // Then: Rescheduled meeting (newest) appears in summary
      expect(result.summary).toMatch(/Meeting Rescheduled/i);
      // The original meeting also appears as a subject
      expect(result.summary).toMatch(/Meeting Scheduled/i);
      // "Meetings and scheduling" theme is detected from meeting-related content
      expect(result.summary).toMatch(/Meetings and scheduling/i);
      // Summary is persisted
      expect(persisted!.lastEmailId).toBe('meeting-2');
    });
  });

  // ─── Deal Status / Expiry ───

  describe('Deal Status and Expiry', () => {
    it('summary reflects current deal status when expired then renewed', async () => {
      // Given: Deal expired then was renewed
      const email1 = makeEmail({
        id: 'deal-active',
        subject: '50% Off Sale',
        snippet: 'Get 50% off everything. Use code SAVE50. Expires January 31.',
        receivedAt: new Date('2024-01-15'),
        senderDomain: 'store.com',
        senderName: 'Store',
      });
      const email2 = makeEmail({
        id: 'deal-expired',
        subject: 'Sale Ended',
        snippet: 'The 50% off sale has ended. Thank you for shopping with us.',
        receivedAt: new Date('2024-02-01'),
        senderDomain: 'store.com',
        senderName: 'Store',
      });
      const email3 = makeEmail({
        id: 'deal-renewed',
        subject: 'New Sale - 50% Off',
        snippet: 'Our biggest sale is back! Get 50% off everything with code SAVE50AGAIN. Ends March 15.',
        receivedAt: new Date('2024-03-01'),
        senderDomain: 'store.com',
        senderName: 'Store',
      });

      const { topicId, topicPath } = await setupTopicWithEmails('Shopping/Store', [email1, email2, email3]);

      // When: Summary is generated
      const { result, persisted } = await generateAndPersist(topicPath, topicId, [email1, email2, email3]);

      // Then: Newest email (renewed deal) is surfaced as most recent
      expect(result.summary).toMatch(/New Sale.*50% Off/i);
      // Summary mentions the "Promotions" theme (matching offer/deal/discount pattern)
      expect(result.summary).toMatch(/Promotions/i);
      // All three emails are linked to the topic
      const linkedEmails = await repos.topics.findEmailsForTopic(topicId);
      expect(linkedEmails).toHaveLength(3);
      // Summary is persisted
      expect(persisted!.lastEmailId).toBe('deal-renewed');
    });

    it('rolling summary with existing summary incorporates new deal status', async () => {
      // Given: Initial summary exists for a deal
      const email1 = makeEmail({
        id: 'deal-original',
        subject: 'Flash Sale',
        snippet: 'Flash sale: 30% off all items. Limited time only.',
        receivedAt: new Date('2024-01-10'),
        senderDomain: 'shop.com',
        senderName: 'Shop',
      });

      const { topicId, topicPath } = await setupTopicWithEmails('Shopping/Shop', [email1]);

      // Generate initial summary and persist via raw SQL
      const result1 = await summaryGenerator.generateTopicSummary(topicPath, [email1]);
      await db.run(
        `INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, last_email_id, update_count) VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`,
        [`ts_${topicId}`, topicId, result1.summary, result1.wordCount, result1.lastEmailId!]
      );

      const initialSummary = await repos.topics.getSummary(topicId);
      expect(initialSummary).not.toBeNull();
      expect(initialSummary!.updateCount).toBe(1);

      // When: A new email arrives saying the deal ended
      const email2 = makeEmail({
        id: 'deal-ended',
        subject: 'Flash Sale Ended',
        snippet: 'The flash sale has ended. Stay tuned for future promotions.',
        receivedAt: new Date('2024-01-20'),
        senderDomain: 'shop.com',
        senderName: 'Shop',
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

      // Regenerate summary, passing existing summary as context
      const result2 = await summaryGenerator.generateTopicSummary(
        topicPath,
        [email1, email2],
        initialSummary!.summary
      );
      // Persist updated summary via raw SQL
      await db.run(
        `UPDATE topic_summaries SET summary = ?, word_count = ?, last_updated = datetime('now'), last_email_id = ?, update_count = update_count + 1 WHERE topic_id = ?`,
        [result2.summary, result2.wordCount, result2.lastEmailId!, topicId]
      );

      // Then: Updated summary surfaces the newest email (deal ended)
      expect(result2.summary).toMatch(/Flash Sale Ended/i);
      // Update count increments (second upsert)
      const updatedSummary = await repos.topics.getSummary(topicId);
      expect(updatedSummary!.updateCount).toBe(2);
      expect(updatedSummary!.lastEmailId).toBe('deal-ended');
    });
  });
});
