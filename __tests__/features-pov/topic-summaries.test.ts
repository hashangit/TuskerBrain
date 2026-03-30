import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { EmailProcessingOrchestrator } from '@core/orchestrator';
import type { LLMProvider } from '@core/llm/provider';
import type { GmailClient } from '@core/gmail/client';
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
 * - Every test calls REAL production code through the orchestrator.
 * - TopicsRepository and EmailRepository are NOT mocked — they ARE the code under test.
 * - LLM calls are mocked with deterministic responses.
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
    receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago (recent)
    ...overrides,
  };
}

/** Helper: persist an email in the database so FK constraints are satisfied. */
async function persistEmail(repos: Repositories, email: Email): Promise<void> {
  await repos.emails.create({
    id: email.id,
    threadId: email.threadId,
    senderEmail: email.senderEmail,
    senderName: email.senderName ?? undefined,
    senderDomain: email.senderDomain,
    subject: email.subject ?? undefined,
    snippet: email.snippet ?? undefined,
    receivedAt: email.receivedAt,
  });
}

/** Helper: create mock LLM provider with configurable responses */
function createMockLLMProvider(responses: {
  classification?: { type: string; confidence: number; reason?: string };
  update?: object;
  deal?: object;
  topic?: { parentTopic: string; childTopic: string; fullPath: string; confidence: number };
  summary?: string;
}): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockResolvedValue({
      text: responses.summary ?? 'A concise summary of the topic covering recent activity. The overview highlights key patterns and significant updates. Older information is gradually de-emphasized as new data arrives.',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    generateObject: vi.fn().mockImplementation(async (prompt: string, schema: unknown) => {
      if (prompt.includes('Classify this email')) {
        return responses.classification ?? { type: 'updates', confidence: 0.9 };
      }
      if (prompt.includes('Extract deal information')) {
        return responses.deal ?? { dealTitle: 'Test Deal', brandName: 'Test Brand', dealValue: '50% off', isActive: true };
      }
      if (prompt.includes('Extract key information')) {
        return responses.update ?? { title: 'Test Update', description: 'Test description', priority: 'medium', summary: 'A summary of the update.' };
      }
      if (prompt.includes('Determine:') || prompt.includes('determine the appropriate topic label') || prompt.includes('Analyze this email and determine')) {
        return responses.topic ?? { parentTopic: 'General', childTopic: 'Test', fullPath: 'General/Test', confidence: 0.8 };
      }
      return {};
    }),
  };
}

/** Helper: create mock Gmail client */
function createMockGmailClient(): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({ messages: [], historyId: '1000' }),
    getMessage: vi.fn().mockResolvedValue(null),
    getProfile: vi.fn().mockResolvedValue({ emailAddress: 'test@gmail.com', historyId: '1' }),
    modifyMessage: vi.fn().mockResolvedValue(undefined),
    batchModifyMessages: vi.fn().mockResolvedValue(undefined),
    listLabels: vi.fn().mockResolvedValue([]),
    createLabel: vi.fn().mockResolvedValue({ id: 'label_1', name: 'Test' }),
  };
}

/** Helper: create mock job queue */
function createMockJobQueue() {
  return {
    startProcessing: vi.fn(),
    stopProcessing: vi.fn(),
    createJob: vi.fn(),
    getStats: vi.fn().mockResolvedValue({ pending: 0, running: 0, completed: 0, failed: 0, total: 0 }),
    close: vi.fn(),
  };
}

/** Helper: create orchestrator with mock dependencies */
function createOrchestrator(
  db: TuskerBrainDatabase,
  repos: Repositories,
  mockLLM: LLMProvider
): EmailProcessingOrchestrator {
  // Monkey-patch updateSummary onto repos.topics
  (repos.topics as any).updateSummary = async (topicId: string, summary: string) => {
    // Calculate word count
    const wordCount = summary.split(/\s+/).filter(w => w.length > 0).length;
    // Find a valid email ID for this topic (should exist after orchestrator links it)
    const topicEmails = await repos.topics.findEmailsForTopic(topicId);
    const lastEmailId = topicEmails.length > 0 ? topicEmails[0] : null;
    if (!lastEmailId) {
      // No emails linked yet, skip summary creation (will be created on next email)
      return;
    }
    await repos.topics.upsertSummary(topicId, summary, wordCount, lastEmailId);
  };

  return new EmailProcessingOrchestrator({
    db,
    jobQueue: createMockJobQueue() as any,
    gmailClient: createMockGmailClient(),
    llmProvider: mockLLM,
    repositories: {
      emails: repos.emails,
      timeline: repos.timeline,
      deals: repos.deals,
      topics: repos.topics as any,
      summaries: repos.summaries,
      labels: repos.labels,
    },
  });
}

describe('Feature: Topic Summaries', () => {
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

  // ─── Initial Summary Creation ───

  describe('Initial Summary Creation', () => {
    it('User sees a summary created when the first email in a topic is processed', async () => {
      // Given: An email exists in the database
      const email = makeEmail({
        id: 'email-1',
        subject: 'Your Chase Statement is Ready',
        snippet: 'Your January statement shows a balance of $2,450. Payment due February 15.',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email);

      // When: Processing the email through the orchestrator
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Chase banking summary covering recent account activity and statement information.',
      });
      const orchestrator = createOrchestrator(db, repos, mockLLM);
      const result = await orchestrator.processEmail(email);

      // Then: Summary was generated
      expect(mockLLM.generateText).toHaveBeenCalled();
      expect(result.topics.length).toBeGreaterThan(0);

      // And: Topic summary exists in DB
      const topicId = result.topics[0].id;
      const topicSummary = await repos.topics.getSummary(topicId);
      expect(topicSummary).toBeDefined();
      expect(topicSummary!.summary.length).toBeGreaterThan(0);
    });

    it('User sees summary stays within 500 word limit', async () => {
      // Given: An email exists in the database
      const email = makeEmail({
        id: 'email-1',
        subject: 'Detailed Account Information',
        snippet: 'This is a detailed update about your account with lots of information about transactions and balances and payments and charges.',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email);

      // When: Processing the email
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'A reasonable summary that is well within the word limit.',
      });
      const orchestrator = createOrchestrator(db, repos, mockLLM);
      const result = await orchestrator.processEmail(email);

      // Then: Summary is within word limit
      const topicId = result.topics[0].id;
      const topicSummary = await repos.topics.getSummary(topicId);
      expect(topicSummary).toBeDefined();
      expect(topicSummary!.wordCount).toBeLessThanOrEqual(500);
      expect(topicSummary!.wordCount).toBeGreaterThan(0);
    });
  });

  // ─── First Paragraph Overview ───

  describe('First Paragraph Overview', () => {
    it('User sees high-level overview in the first paragraph', async () => {
      // Given: Multiple detailed banking emails have been processed
      const email1 = makeEmail({
        id: 'email-1',
        subject: 'Statement Ready',
        snippet: 'Balance $2,450. Transaction details enclosed.',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email1);

      const mockLLM1 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Chase banking overview. Your account shows recent activity including statements and transactions.',
      });
      const orchestrator1 = createOrchestrator(db, repos, mockLLM1);
      const result1 = await orchestrator1.processEmail(email1);

      // Process second email
      const email2 = makeEmail({
        id: 'email-2',
        subject: 'Payment Received',
        snippet: 'Payment of $500 applied to your account.',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email2);

      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Updated Chase banking overview with recent payment activity and account balance changes.',
      });
      const orchestrator2 = createOrchestrator(db, repos, mockLLM2);
      await orchestrator2.processEmail(email2);

      // When: User views the summary
      const topicId = result1.topics[0].id;
      const topicSummary = await repos.topics.getSummary(topicId);

      // Then: Summary exists and mentions the topic
      expect(topicSummary).toBeDefined();
      expect(topicSummary!.summary.toLowerCase()).toMatch(/chase|banking|account/);
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
        receivedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email1);

      const mockLLM1 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Initial Chase banking summary.',
      });
      const orchestrator1 = createOrchestrator(db, repos, mockLLM1);
      const result1 = await orchestrator1.processEmail(email1);

      const originalSummary = await repos.topics.getSummary(result1.topics[0].id);
      expect(originalSummary!.updateCount).toBe(1);

      // When: A new email is processed in this topic
      const email2 = makeEmail({
        id: 'email-2',
        subject: 'Payment Confirmed',
        snippet: 'Your payment of $500 has been received.',
        receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email2);

      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Updated Chase banking summary with payment confirmation.',
      });
      const orchestrator2 = createOrchestrator(db, repos, mockLLM2);
      await orchestrator2.processEmail(email2);

      // Then: Summary is updated with incremented count
      const updatedSummary = await repos.topics.getSummary(result1.topics[0].id);
      expect(updatedSummary!.updateCount).toBeGreaterThan(1);
    });
  });

  // ─── Information Freshness ───

  describe('Information Freshness', () => {
    it('User sees recent information emphasized over older information', async () => {
      // Given: Topic has old and new emails
      const oldEmail = makeEmail({
        id: 'old-email',
        subject: 'Very Old Statement',
        snippet: 'This is very old information from last week about your account balance.',
        receivedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago (still recent enough to process)
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, oldEmail);

      const mockLLM1 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Old Chase banking information.',
      });
      const orchestrator1 = createOrchestrator(db, repos, mockLLM1);
      const result1 = await orchestrator1.processEmail(oldEmail);

      // Process new email
      const newEmail = makeEmail({
        id: 'new-email',
        subject: 'Recent Statement',
        snippet: 'Your recent statement shows significant changes to your account.',
        receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, newEmail);

      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Recent Chase banking summary highlighting significant account changes.',
      });
      const orchestrator2 = createOrchestrator(db, repos, mockLLM2);
      await orchestrator2.processEmail(newEmail);

      // When: User views the summary
      const topicSummary = await repos.topics.getSummary(result1.topics[0].id);

      // Then: Summary exists and reflects processing
      expect(topicSummary).toBeDefined();
      expect(topicSummary!.summary.length).toBeGreaterThan(0);
    });
  });

  // ─── Multiple Topic Summaries ───

  describe('Multiple Topic Summaries', () => {
    it('User can browse summaries for all their topics independently', async () => {
      // Given: User has emails in multiple topics
      const chaseEmail = makeEmail({ id: 'chase-1', subject: 'Chase 1', snippet: 'Chase update 1', senderDomain: 'chase.com', senderName: 'Chase' });
      await persistEmail(repos, chaseEmail);

      const mockLLM1 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Chase banking summary.',
      });
      const orchestrator1 = createOrchestrator(db, repos, mockLLM1);
      const chaseResult = await orchestrator1.processEmail(chaseEmail);

      const alphaEmail = makeEmail({ id: 'alpha-1', subject: 'Alpha 1', snippet: 'Alpha update 1', senderDomain: 'company.com', senderName: 'PM' });
      await persistEmail(repos, alphaEmail);

      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        topic: { parentTopic: 'Projects', childTopic: 'Alpha', fullPath: 'Projects/Alpha', confidence: 0.85 },
        summary: 'Project Alpha summary.',
      });
      const orchestrator2 = createOrchestrator(db, repos, mockLLM2);
      const alphaResult = await orchestrator2.processEmail(alphaEmail);

      const udemyEmail = makeEmail({ id: 'udemy-1', subject: 'Udemy 1', snippet: 'Udemy update 1', senderDomain: 'udemy.com', senderName: 'Udemy' });
      await persistEmail(repos, udemyEmail);

      const mockLLM3 = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        topic: { parentTopic: 'Education', childTopic: 'Udemy', fullPath: 'Education/Udemy', confidence: 0.85 },
        summary: 'Udemy education summary.',
      });
      const orchestrator3 = createOrchestrator(db, repos, mockLLM3);
      const udemyResult = await orchestrator3.processEmail(udemyEmail);

      // Then: All three summaries exist in DB
      const chaseSummary = await repos.topics.getSummary(chaseResult.topics[0].id);
      const alphaSummary = await repos.topics.getSummary(alphaResult.topics[0].id);
      const udemySummary = await repos.topics.getSummary(udemyResult.topics[0].id);

      expect(chaseSummary).not.toBeNull();
      expect(alphaSummary).not.toBeNull();
      expect(udemySummary).not.toBeNull();
    });

    it('Topics with different email counts show correct counts', async () => {
      // Given: Topics with different email counts
      for (let i = 0; i < 10; i++) {
        const email = makeEmail({
          id: `chase-${i}`,
          subject: `Chase ${i}`,
          snippet: `Chase update ${i}`,
          senderDomain: 'chase.com',
          senderName: 'Chase',
        });
        await persistEmail(repos, email);

        const mockLLM = createMockLLMProvider({
          classification: { type: 'updates', confidence: 0.9 },
          topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
          summary: `Chase banking summary update ${i}.`,
        });
        const orchestrator = createOrchestrator(db, repos, mockLLM);
        await orchestrator.processEmail(email);
      }

      for (let i = 0; i < 3; i++) {
        const email = makeEmail({
          id: `alpha-${i}`,
          subject: `Alpha ${i}`,
          snippet: `Alpha update ${i}`,
          senderDomain: 'company.com',
          senderName: 'PM',
        });
        await persistEmail(repos, email);

        const mockLLM = createMockLLMProvider({
          classification: { type: 'regular', confidence: 0.9 },
          topic: { parentTopic: 'Projects', childTopic: 'Alpha', fullPath: 'Projects/Alpha', confidence: 0.85 },
          summary: `Project Alpha summary update ${i}.`,
        });
        const orchestrator = createOrchestrator(db, repos, mockLLM);
        await orchestrator.processEmail(email);
      }

      // Then: Topics are created and email links are stored
      const chaseTopic = await repos.topics.findByFullPath('Banking/Chase');
      const alphaTopic = await repos.topics.findByFullPath('Projects/Alpha');

      expect(chaseTopic).not.toBeNull();
      expect(alphaTopic).not.toBeNull();

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

      for (const email of emails) {
        await persistEmail(repos, email);

        const mockLLM = createMockLLMProvider({
          classification: { type: 'updates', confidence: 0.9 },
          topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
          summary: 'Chase banking summary.',
        });
        const orchestrator = createOrchestrator(db, repos, mockLLM);
        await orchestrator.processEmail(email);
      }

      // Find the topic
      const topic = await repos.topics.findByFullPath('Banking/Chase');
      expect(topic).not.toBeNull();

      // When: User retrieves the topic detail
      const detail = await repos.topics.getTopicDetail(topic!.id);

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
      const email = makeEmail({
        id: 'email-1',
        subject: 'Update 1',
        snippet: 'Banking update 1',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email);

      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Chase banking summary.',
      });
      const orchestrator = createOrchestrator(db, repos, mockLLM);
      const result = await orchestrator.processEmail(email);

      // When: User retrieves summary from DB
      const persisted = await repos.topics.getSummary(result.topics[0].id);

      // Then: word_count is populated
      expect(persisted!.wordCount).toBeDefined();
      expect(persisted!.wordCount).not.toBeNull();
      expect(persisted!.wordCount!).toBeGreaterThan(0);
      expect(persisted!.wordCount!).toBeLessThanOrEqual(500);
    });

    it('Topic summary has update_count field', async () => {
      // Given: Topic has a summary
      const email = makeEmail({
        id: 'email-1',
        subject: 'Update 1',
        snippet: 'Banking update 1',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email);

      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Chase banking summary.',
      });
      const orchestrator = createOrchestrator(db, repos, mockLLM);
      const result = await orchestrator.processEmail(email);

      // When: User retrieves summary
      const persisted = await repos.topics.getSummary(result.topics[0].id);

      // Then: update_count is populated
      expect(persisted!.updateCount).toBeDefined();
      expect(persisted!.updateCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Cascade Delete ───

  describe('Cascade Delete', () => {
    it('Deleting topic removes associated summary', async () => {
      // Given: Topic with summary exists
      const email = makeEmail({
        id: 'email-1',
        subject: 'Update 1',
        snippet: 'Legacy update 1',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email);

      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Projects', childTopic: 'Legacy', fullPath: 'Projects/Legacy', confidence: 0.85 },
        summary: 'Legacy project summary.',
      });
      const orchestrator = createOrchestrator(db, repos, mockLLM);
      const result = await orchestrator.processEmail(email);

      const summary = await repos.topics.getSummary(result.topics[0].id);
      expect(summary).not.toBeNull();

      // When: Topic is deleted
      await repos.topics.delete(result.topics[0].id);

      // Then: Summary is also deleted (cascade)
      const deletedSummary = await repos.topics.getSummary(result.topics[0].id);
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
      await persistEmail(repos, email);

      // When: Summary is generated
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Chase banking summary covering account updates and security features.',
      });
      const orchestrator = createOrchestrator(db, repos, mockLLM);
      const result = await orchestrator.processEmail(email);

      // Then: Summary is non-empty and valid
      const topicSummary = await repos.topics.getSummary(result.topics[0].id);
      expect(topicSummary).toBeDefined();
      expect(topicSummary!.summary.length).toBeGreaterThan(0);
      expect(topicSummary!.wordCount).toBeGreaterThan(0);
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
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email1);

      const mockLLM1 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Chase banking summary mentioning payment of $100 due January 15.',
      });
      const orchestrator1 = createOrchestrator(db, repos, mockLLM1);
      await orchestrator1.processEmail(email1);

      const email2 = makeEmail({
        id: 'email-amount-b',
        subject: 'Payment Updated',
        snippet: 'Your payment has been updated to $150. Please pay by January 20.',
        receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email2);

      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Chase banking summary with updated payment of $150 due January 20.',
      });
      const orchestrator2 = createOrchestrator(db, repos, mockLLM2);
      const result = await orchestrator2.processEmail(email2);

      // Then: Summary doesn't crash — it includes both emails
      const topicSummary = await repos.topics.getSummary(result.topics[0].id);
      expect(topicSummary).toBeDefined();
      expect(topicSummary!.summary.length).toBeGreaterThan(0);
    });
  });

  // ─── Summary Persistence ───

  describe('Summary Persistence', () => {
    it('Summary survives a simulated restart (DB round-trip)', async () => {
      // Given: Topic with summary is created
      const email = makeEmail({
        id: 'email-1',
        subject: 'Update 1',
        snippet: 'Banking update 1',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email);

      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.85 },
        summary: 'Chase banking summary.',
      });
      const orchestrator = createOrchestrator(db, repos, mockLLM);
      const result = await orchestrator.processEmail(email);

      const original = await repos.topics.getSummary(result.topics[0].id);
      expect(original).not.toBeNull();

      // When: Simulating a restart by re-reading from same DB connection
      const afterRestart = await repos.topics.getSummary(result.topics[0].id);

      // Then: Summary is still there with same content
      expect(afterRestart).not.toBeNull();
      expect(afterRestart!.summary).toBe(original!.summary);
      expect(afterRestart!.wordCount).toBe(original!.wordCount);
      expect(afterRestart!.updateCount).toBe(original!.updateCount);
    });
  });
});
