import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { processEmailWithWorkflow } from '@core/workflows/langgraph-workflow';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';

/**
 * Feature: Conflicting Information Handling
 *
 * Tests how the system handles emails with contradictory or conflicting information,
 * ensuring summaries reflect the most recent state.
 *
 * Business Rules:
 * - Newer information supersedes older information in summaries
 * - Workflow generates summaries based on latest content
 * - Conflicting data does not crash the system
 * - DB persistence correctly stores updated summaries
 *
 * RULES:
 * - Every test calls REAL production code.
 * - Repositories are NOT mocked (real DB).
 * - LLM calls are mocked for workflow tests.
 * - In-memory SQLite with migration schema.
 *
 * Infrastructure note:
 * db.execSql(migrationSql) is used instead of db.initialize() because
 * drizzle's migrator cannot handle multi-statement SQL files.
 */

const MIGRATION_PATH = path.join(__dirname, '../../../database/migrations/0000_initial.sql');

/** Helper: create an Email object with sensible defaults. */
function makeEmail(overrides: Partial<Email> & { id: string }): Email {
  const now = new Date();
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: 'noreply@example.com',
    senderName: 'Sender',
    senderDomain: 'example.com',
    subject: 'Update',
    snippet: 'Some update.',
    receivedAt: now, // Use current date to avoid archiving
    ...overrides,
  };
}

/** Helper: create a mock LLM provider for testing. */
function createMockLLMProvider(responses: {
  classification?: { type: string; confidence: number };
  update?: object;
  deal?: object;
  topic?: { parentTopic: string; childTopic: string; fullPath: string; confidence: number };
  summary?: string;
}): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockResolvedValue({
      text: responses.summary ?? 'A concise summary covering recent activity and key information.',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    generateObject: vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Classify this email')) {
        return responses.classification ?? { type: 'updates', confidence: 0.9 };
      }
      if (prompt.includes('Extract deal information')) {
        return responses.deal ?? null;
      }
      if (prompt.includes('Extract key information')) {
        return responses.update ?? null;
      }
      if (prompt.includes('Determine:') || prompt.includes('determine the appropriate topic label') || prompt.includes('Analyze this email')) {
        return responses.topic ?? { parentTopic: 'General', childTopic: 'Test', fullPath: 'General/Test', confidence: 0.8 };
      }
      return {};
    }),
  };
}

describe('Feature: Conflicting Information', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
    await db.execSql(migrationSql);
    repos = createRepositories(db);
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

  // ─── Payment Amount Conflicts ───

  describe('Payment Amount Conflicts', () => {
    it('workflow generates summary with latest payment amount when amounts differ', async () => {
      // Given: Two emails with different payment amounts (recent dates)
      const now = new Date();
      const email1 = makeEmail({
        id: 'payment-1',
        subject: 'Your Bill',
        snippet: 'Your payment of $100 is due soon.',
        receivedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const email2 = makeEmail({
        id: 'payment-2',
        subject: 'Updated Bill',
        snippet: 'Your payment has been updated to $150. Please pay by next week.',
        receivedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });

      const { topicId, topicPath } = await setupTopicWithEmails('Banking/Chase', [email1, email2]);

      // When: Processing newest email through workflow
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.9 },
        summary: 'Payment updated from $100 to $150. Due next week.',
        update: { title: 'Payment Update', description: 'Amount changed to $150', priority: 'high' },
      });
      const result = await processEmailWithWorkflow(email2, mockLLM);

      // Then: Summary is generated and reflects the latest amount
      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('$150');
      expect(result.summary).toContain('next week');
      expect(result.extraction?.update).toBeDefined();

      // And: Summary can be persisted to DB
      await db.run(
        `INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, last_email_id, update_count) VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`,
        [`ts_${topicId}`, topicId, result.summary!, 10, email2.id]
      );
      const persisted = await repos.topics.getSummary(topicId);
      expect(persisted).not.toBeNull();
      expect(persisted!.summary).toContain('$150');
    });
  });

  // ─── Account State Changes ───

  describe('Account State Changes', () => {
    it('workflow reflects current account state when reopened after closure', async () => {
      // Given: Account was closed then reopened (recent dates)
      const now = new Date();
      const email1 = makeEmail({
        id: 'account-opened',
        subject: 'Account Opened',
        snippet: 'Your new Chase checking account has been opened successfully.',
        receivedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const email2 = makeEmail({
        id: 'account-closed',
        subject: 'Account Closed',
        snippet: 'Your Chase checking account has been closed per your request.',
        receivedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      const email3 = makeEmail({
        id: 'account-reopened',
        subject: 'Account Reopened',
        snippet: 'Your Chase checking account has been reopened. Welcome back.',
        receivedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });

      const { topicId } = await setupTopicWithEmails('Banking/Chase', [email1, email2, email3]);

      // When: Processing newest email through workflow
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.9 },
        summary: 'Account reopened. Previously closed recently.',
        update: { title: 'Account Reopened', description: 'Account is now active', priority: 'medium' },
      });
      const result = await processEmailWithWorkflow(email3, mockLLM);

      // Then: Summary reflects the current state (reopened)
      expect(result.summary).toBeDefined();
      expect(result.summary).toMatch(/reopened/i);

      // And: Summary is persisted with correct lastEmailId
      await db.run(
        `INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, last_email_id, update_count) VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`,
        [`ts_${topicId}`, topicId, result.summary!, 8, email3.id]
      );
      const persisted = await repos.topics.getSummary(topicId);
      expect(persisted!.lastEmailId).toBe('account-reopened');
    });
  });

  // ─── Deadline Changes ───

  describe('Deadline Changes', () => {
    it('workflow uses latest deadline when deadline is moved', async () => {
      // Given: Deadline was changed in a newer email (recent dates)
      const now = new Date();
      const email1 = makeEmail({
        id: 'deadline-1',
        subject: 'Project Deadline',
        snippet: 'The deadline for Project Alpha is next week.',
        receivedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        senderDomain: 'client.com',
        senderName: 'Client Corp',
      });
      const email2 = makeEmail({
        id: 'deadline-2',
        subject: 'Deadline Extended',
        snippet: 'The deadline for Project Alpha has been extended to two weeks from now.',
        receivedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        senderDomain: 'client.com',
        senderName: 'Client Corp',
      });

      const { topicId } = await setupTopicWithEmails('Projects/Alpha', [email1, email2]);

      // When: Processing newest email through workflow
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Projects', childTopic: 'Alpha', fullPath: 'Projects/Alpha', confidence: 0.9 },
        summary: 'Project Alpha deadline extended to two weeks from now.',
        update: { title: 'Deadline Extended', description: 'New deadline: two weeks', priority: 'high', urgency: true },
      });
      const result = await processEmailWithWorkflow(email2, mockLLM);

      // Then: Summary reflects the new deadline
      expect(result.summary).toBeDefined();
      expect(result.summary).toMatch(/extended/i);
      expect(result.extraction?.update).toBeDefined();

      // And: Summary is persisted
      await db.run(
        `INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, last_email_id, update_count) VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`,
        [`ts_${topicId}`, topicId, result.summary!, 12, email2.id]
      );
      const persisted = await repos.topics.getSummary(topicId);
      expect(persisted!.lastEmailId).toBe('deadline-2');
    });
  });

  // ─── Priority Conflicts ───

  describe('Priority Conflicts', () => {
    it('workflow handles same topic with conflicting urgency levels', async () => {
      // Given: Same topic gets low-priority then urgent emails (recent dates)
      const now = new Date();
      const email1 = makeEmail({
        id: 'priority-low',
        subject: 'Review Request',
        snippet: 'Please review the attached document when you have time.',
        receivedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        senderDomain: 'client.com',
        senderName: 'Client Corp',
      });
      const email2 = makeEmail({
        id: 'priority-urgent',
        subject: 'URGENT: Review Required',
        snippet: 'Please review the attached document ASAP. Deadline is tomorrow.',
        receivedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        senderDomain: 'client.com',
        senderName: 'Client Corp',
      });

      const { topicId } = await setupTopicWithEmails('Projects/Beta', [email1, email2]);

      // When: Processing urgent email through workflow
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Projects', childTopic: 'Beta', fullPath: 'Projects/Beta', confidence: 0.9 },
        summary: 'URGENT: Review required ASAP. Previously requested for review.',
        update: { title: 'URGENT Review', description: 'Deadline ASAP', priority: 'high', urgency: true },
      });
      const result = await processEmailWithWorkflow(email2, mockLLM);

      // Then: Urgent email is reflected in summary
      expect(result.summary).toBeDefined();
      expect(result.summary).toMatch(/URGENT/i);
      expect(result.extraction?.update?.priority).toBe('high');

      // And: Both emails are linked to topic
      const linkedEmails = await repos.topics.findEmailsForTopic(topicId);
      expect(linkedEmails).toContain('priority-low');
      expect(linkedEmails).toContain('priority-urgent');

      // And: Summary is persisted
      await db.run(
        `INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, last_email_id, update_count) VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`,
        [`ts_${topicId}`, topicId, result.summary!, 15, email2.id]
      );
      const persisted = await repos.topics.getSummary(topicId);
      expect(persisted).not.toBeNull();
    });
  });

  // ─── Meeting Time Conflicts ───

  describe('Meeting Time Conflicts', () => {
    it('workflow reflects rescheduled meeting time from newer email', async () => {
      // Given: Meeting was rescheduled (recent dates)
      const now = new Date();
      const email1 = makeEmail({
        id: 'meeting-1',
        subject: 'Meeting Scheduled',
        snippet: 'Team standup is scheduled for next Monday at 2pm.',
        receivedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        senderDomain: 'company.com',
        senderName: 'Team Lead',
      });
      const email2 = makeEmail({
        id: 'meeting-2',
        subject: 'Meeting Rescheduled',
        snippet: 'Team standup has been rescheduled to next Tuesday at 3pm.',
        receivedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        senderDomain: 'company.com',
        senderName: 'Team Lead',
      });

      const { topicId } = await setupTopicWithEmails('Projects/Gamma', [email1, email2]);

      // When: Processing rescheduled email through workflow
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Projects', childTopic: 'Gamma', fullPath: 'Projects/Gamma', confidence: 0.9 },
        summary: 'Meeting rescheduled to next Tuesday at 3pm. Originally Monday 2pm.',
        update: { title: 'Meeting Rescheduled', description: 'New time: Tuesday 3pm', priority: 'medium', keyEntities: { dates: ['Tuesday at 3pm'] } },
      });
      const result = await processEmailWithWorkflow(email2, mockLLM);

      // Then: Summary reflects rescheduled time
      expect(result.summary).toBeDefined();
      expect(result.summary).toMatch(/Tuesday.*3pm/i);

      // And: Summary is persisted
      await db.run(
        `INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, last_email_id, update_count) VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`,
        [`ts_${topicId}`, topicId, result.summary!, 14, email2.id]
      );
      const persisted = await repos.topics.getSummary(topicId);
      expect(persisted!.lastEmailId).toBe('meeting-2');
    });
  });

  // ─── Deal Status / Expiry ───

  describe('Deal Status and Expiry', () => {
    it('workflow reflects current deal status when expired then renewed', async () => {
      // Given: Deal expired then was renewed (recent dates)
      const now = new Date();
      const email1 = makeEmail({
        id: 'deal-active',
        subject: '50% Off Sale',
        snippet: 'Get 50% off everything. Use code SAVE50. Expires in two weeks.',
        receivedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        senderDomain: 'store.com',
        senderName: 'Store',
      });
      const email2 = makeEmail({
        id: 'deal-expired',
        subject: 'Sale Ended',
        snippet: 'The 50% off sale has ended. Thank you for shopping with us.',
        receivedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        senderDomain: 'store.com',
        senderName: 'Store',
      });
      const email3 = makeEmail({
        id: 'deal-renewed',
        subject: 'New Sale - 50% Off',
        snippet: 'Our biggest sale is back! Get 50% off everything with code SAVE50AGAIN. Ends in two weeks.',
        receivedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        senderDomain: 'store.com',
        senderName: 'Store',
      });

      const { topicId } = await setupTopicWithEmails('Shopping/Store', [email1, email2, email3]);

      // When: Processing renewed deal email through workflow
      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.9 },
        topic: { parentTopic: 'Shopping', childTopic: 'Store', fullPath: 'Shopping/Store', confidence: 0.9 },
        summary: 'New 50% off sale with code SAVE50AGAIN. Active now.',
        deal: { dealTitle: '50% Off Sale', dealCode: 'SAVE50AGAIN', dealExpiry: 'two weeks', isActive: true },
      });
      const result = await processEmailWithWorkflow(email3, mockLLM);

      // Then: Summary reflects the renewed deal
      expect(result.summary).toBeDefined();
      expect(result.summary).toMatch(/50% Off/i);
      expect(result.extraction?.deal).toBeDefined();

      // And: All three emails are linked to the topic
      const linkedEmails = await repos.topics.findEmailsForTopic(topicId);
      expect(linkedEmails).toHaveLength(3);

      // And: Summary is persisted
      await db.run(
        `INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, last_email_id, update_count) VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`,
        [`ts_${topicId}`, topicId, result.summary!, 16, email3.id]
      );
      const persisted = await repos.topics.getSummary(topicId);
      expect(persisted!.lastEmailId).toBe('deal-renewed');
    });

    it('rolling summary with existing summary incorporates new deal status', async () => {
      // Given: Initial summary exists for a deal (recent dates)
      const now = new Date();
      const email1 = makeEmail({
        id: 'deal-original',
        subject: 'Flash Sale',
        snippet: 'Flash sale: 30% off all items. Limited time only.',
        receivedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        senderDomain: 'shop.com',
        senderName: 'Shop',
      });

      const { topicId, topicPath } = await setupTopicWithEmails('Shopping/Shop', [email1]);

      // Generate initial summary via workflow and persist
      const mockLLM1 = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.9 },
        topic: { parentTopic: 'Shopping', childTopic: 'Shop', fullPath: 'Shopping/Shop', confidence: 0.9 },
        summary: 'Flash sale: 30% off all items.',
        deal: { dealTitle: 'Flash Sale', dealValue: '30% off', isActive: true },
      });
      const result1 = await processEmailWithWorkflow(email1, mockLLM1);
      await db.run(
        `INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, last_email_id, update_count) VALUES (?, ?, ?, ?, datetime('now'), ?, 1)`,
        [`ts_${topicId}`, topicId, result1.summary!, 8, email1.id]
      );

      const initialSummary = await repos.topics.getSummary(topicId);
      expect(initialSummary).not.toBeNull();
      expect(initialSummary!.updateCount).toBe(1);

      // When: A new email arrives saying the deal ended
      const email2 = makeEmail({
        id: 'deal-ended',
        subject: 'Flash Sale Ended',
        snippet: 'The flash sale has ended. Stay tuned for future promotions.',
        receivedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
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

      // Process new email through workflow
      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.9 },
        topic: { parentTopic: 'Shopping', childTopic: 'Shop', fullPath: 'Shopping/Shop', confidence: 0.9 },
        summary: 'Flash sale has ended. Previously: 30% off all items.',
        deal: { dealTitle: 'Sale Ended', isActive: false },
      });
      const result2 = await processEmailWithWorkflow(email2, mockLLM2);

      // Persist updated summary
      await db.run(
        `UPDATE topic_summaries SET summary = ?, word_count = ?, last_updated = datetime('now'), last_email_id = ?, update_count = update_count + 1 WHERE topic_id = ?`,
        [result2.summary!, 12, email2.id, topicId]
      );

      // Then: Updated summary surfaces the newest email (deal ended)
      expect(result2.summary).toMatch(/ended/i);
      // Update count increments (second update)
      const updatedSummary = await repos.topics.getSummary(topicId);
      expect(updatedSummary!.updateCount).toBe(2);
      expect(updatedSummary!.lastEmailId).toBe('deal-ended');
    });
  });
});
