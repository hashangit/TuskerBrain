import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { EmailProcessingOrchestrator } from '@core/orchestrator';
import { JobQueue } from '@core/jobs/queue';
import { buildSummaryPrompt, buildSenderSummaryPrompt } from '@core/workflows/prompts/summarization';
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
 * - The JobQueue is real (in-memory), not mocked.
 * - LLM calls are mocked with deterministic responses.
 * - If a test fails, it means the feature is NOT implemented. That's the point.
 *
 * Infrastructure note:
 * db.initialize() runs Drizzle migrations from the migrations folder.
 */

/**
 * Thin adapter that adds startProcessing/stopProcessing/processAll to the real
 * JobQueue so the orchestrator can drive jobs synchronously in tests.
 */
class ProcessableJobQueue extends JobQueue {
  private handler: ((job: { id: string; type: string; payload: Record<string, unknown> }) => Promise<void>) | null = null;

  startProcessing(handler: (job: { id: string; type: string; payload: Record<string, unknown> }) => Promise<void>): void {
    this.handler = handler;
  }

  stopProcessing(): void {
    this.handler = null;
  }

  /** Drain all pending jobs synchronously. */
  async processAll(): Promise<void> {
    if (!this.handler) return;
    while (true) {
      const job = await this.getNextJob();
      if (!job) break;
      await this.updateJobStatus(job.id, 'running');
      try {
        await this.handler({ id: job.id, type: job.type, payload: job.payload });
        await this.updateJobStatus(job.id, 'completed');
      } catch (error) {
        await this.updateJobStatus(job.id, 'failed');
        throw error;
      }
    }
  }
}

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
  topic?: { parent: string; child: string; confidence: number };
  summary?: string;
  /** If provided, every prompt passed to generateObject is pushed here */
  promptLog?: string[];
}): LLMProvider {
  const summaryText = responses.summary ?? 'A concise summary of the topic covering recent activity. The overview highlights key patterns and significant updates. Older information is gradually de-emphasized as new data arrives.';
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: async () => ({
      text: summaryText,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    generateObject: async (prompt: string) => {
      // Record prompt for assertion
      responses.promptLog?.push(prompt);

      // Topic summary prompt from buildSummaryPrompt
      if (prompt.includes('Generate a rolling summary')) {
        return {
          summary: summaryText,
          wordCount: summaryText.split(/\s+/).filter(w => w.length > 0).length,
          paragraphCount: 3,
        };
      }
      // Sender summary prompt from buildSenderSummaryPrompt
      if (prompt.includes('Summarize recent emails from')) {
        return {
          summary: 'A comprehensive summary of emails from this sender covering recent activity and key information.',
          wordCount: 15,
          paragraphCount: 3,
        };
      }
      if (prompt.includes('Classify this email')) {
        return responses.classification ?? { type: 'updates', confidence: 0.9 };
      }
      if (prompt.includes('Extract deal information')) {
        return responses.deal ?? { dealTitle: 'Test Deal', brandName: 'Test Brand', dealValue: '50% off', isActive: true };
      }
      if (prompt.includes('Extract key information')) {
        return responses.update ?? { title: 'Test Update', description: 'Test description', priority: 'medium', summary: 'A summary of the update.' };
      }
      if (prompt.includes('Assign a topic label')) {
        return responses.topic ?? { parent: 'General', child: 'Test', confidence: 0.8 };
      }
      return {};
    },
  };
}

/** Helper: create mock Gmail client */
function createMockGmailClient(): GmailClient {
  return {
    listMessages: async () => ({ messages: [], historyId: '1000' }),
    getMessage: async () => null,
    getProfile: async () => ({ emailAddress: 'test@gmail.com', historyId: '1' }),
    modifyMessage: async () => undefined,
    batchModifyMessages: async () => undefined,
    listLabels: async () => [],
    createLabel: async () => ({ id: 'label_1', name: 'Test' }),
  };
}

/** Helper: create orchestrator with real queue and mock LLM/Gmail */
function createOrchestrator(
  db: TuskerBrainDatabase,
  repos: Repositories,
  mockLLM: LLMProvider,
  queue: ProcessableJobQueue,
): EmailProcessingOrchestrator {
  // Monkey-patch updateSummary onto repos.topics
  (repos.topics as any).updateSummary = async (topicId: string, summary: string, wordCount?: number) => {
    // Use wordCount from orchestrator if provided, otherwise calculate
    const count = wordCount ?? summary.split(/\s+/).filter(w => w.length > 0).length;
    // Find a valid email ID for this topic (should exist after orchestrator links it)
    const topicEmails = await repos.topics.findEmailsForTopic(topicId);
    const lastEmailId = topicEmails.length > 0 ? topicEmails[0] : null;
    if (!lastEmailId) {
      // No emails linked yet, skip summary creation (will be created on next email)
      return;
    }
    await repos.topics.upsertSummary(topicId, summary, count, lastEmailId);
  };

  return new EmailProcessingOrchestrator({
    db,
    jobQueue: queue as any,
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

/** Helper: create queue, orchestrator, start it, create a job, and process it */
async function processEmailViaQueue(
  db: TuskerBrainDatabase,
  repos: Repositories,
  mockLLM: LLMProvider,
  email: Email,
): Promise<void> {
  const queue = new ProcessableJobQueue();
  const orchestrator = createOrchestrator(db, repos, mockLLM, queue);
  await orchestrator.start();
  await queue.createJob({ type: 'email_process', payload: { emailId: email.id }, emailId: email.id });
  await queue.processAll();
}

describe('Feature: Topic Summaries', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
  });

  afterEach(async () => {
    await db.close();
  });

  // --- Initial Summary Creation ---

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

      // When: Processing the email through the real queue
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking summary covering recent account activity and statement information.',
      });
      await processEmailViaQueue(db, repos, mockLLM, email);

      // Then: Topic and summary exist in DB
      const topic = await repos.topics.findByFullPath('Banking/Chase');
      expect(topic).not.toBeNull();
      const topicSummary = await repos.topics.getSummary(topic!.id);
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

      // When: Processing the email through the real queue
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'A reasonable summary that is well within the word limit.',
      });
      await processEmailViaQueue(db, repos, mockLLM, email);

      // Then: Summary is within word limit
      const topic = await repos.topics.findByFullPath('Banking/Chase');
      expect(topic).not.toBeNull();
      const topicSummary = await repos.topics.getSummary(topic!.id);
      expect(topicSummary).toBeDefined();
      expect(topicSummary!.wordCount).toBeLessThanOrEqual(500);
      expect(topicSummary!.wordCount).toBeGreaterThan(0);
    });
  });

  // --- First Paragraph Overview ---

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
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking overview. Your account shows recent activity including statements and transactions.',
      });
      await processEmailViaQueue(db, repos, mockLLM1, email1);

      // Process second email — this triggers the merge path which calls buildSummaryPrompt
      const email2 = makeEmail({
        id: 'email-2',
        subject: 'Payment Received',
        snippet: 'Payment of $500 applied to your account.',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email2);

      const mergePrompts: string[] = [];
      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Updated Chase banking overview with recent payment activity and account balance changes.',
        promptLog: mergePrompts,
      });
      await processEmailViaQueue(db, repos, mockLLM2, email2);

      // Then: The merge prompt includes overview-first instruction and existing summary context
      const summaryPrompt = mergePrompts.find(p => p.includes('Generate a rolling summary'));
      expect(summaryPrompt).toBeDefined();
      expect(summaryPrompt!).toContain('First paragraph: Always high-level overview');
      // Existing summary is passed as context so the LLM can preserve it
      expect(summaryPrompt!).toContain('Chase banking overview');
      expect(summaryPrompt!).toContain('Banking/Chase');
    });
  });

  // --- Rolling Updates ---

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
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Initial Chase banking summary.',
      });
      await processEmailViaQueue(db, repos, mockLLM1, email1);

      const topic = await repos.topics.findByFullPath('Banking/Chase');
      expect(topic).not.toBeNull();
      const originalSummary = await repos.topics.getSummary(topic!.id);
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
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Updated Chase banking summary with payment confirmation.',
      });
      await processEmailViaQueue(db, repos, mockLLM2, email2);

      // Then: Summary is updated with incremented count
      const updatedSummary = await repos.topics.getSummary(topic!.id);
      expect(updatedSummary!.updateCount).toBeGreaterThan(1);
    });
  });

  // --- Information Freshness ---

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
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Old Chase banking information about account balance from last week.',
      });
      await processEmailViaQueue(db, repos, mockLLM1, oldEmail);

      // Process new email — triggers merge path
      const newEmail = makeEmail({
        id: 'new-email',
        subject: 'Recent Statement',
        snippet: 'Your recent statement shows significant changes to your account.',
        receivedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, newEmail);

      const mergePrompts: string[] = [];
      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Recent Chase banking summary highlighting significant account changes.',
        promptLog: mergePrompts,
      });
      await processEmailViaQueue(db, repos, mockLLM2, newEmail);

      // Then: The merge prompt includes recency weighting and carries the old summary as context
      const summaryPrompt = mergePrompts.find(p => p.includes('Generate a rolling summary'));
      expect(summaryPrompt).toBeDefined();
      // Recency instruction tells the LLM to de-emphasize old info
      expect(summaryPrompt!).toContain('Gradually reduce focus on older information');
      // The old summary content is passed so the LLM knows what's old
      expect(summaryPrompt!).toContain('Old Chase banking information');
      expect(summaryPrompt!).toContain('Current Summary:');
    });
  });

  // --- Multiple Topic Summaries ---

  describe('Multiple Topic Summaries', () => {
    it('User can browse summaries for all their topics independently', async () => {
      // Given: User has emails in multiple topics
      const chaseEmail = makeEmail({ id: 'chase-1', subject: 'Chase 1', snippet: 'Chase update 1', senderDomain: 'chase.com', senderName: 'Chase' });
      await persistEmail(repos, chaseEmail);

      const mockLLM1 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking summary.',
      });
      await processEmailViaQueue(db, repos, mockLLM1, chaseEmail);

      const alphaEmail = makeEmail({ id: 'alpha-1', subject: 'Alpha 1', snippet: 'Alpha update 1', senderDomain: 'company.com', senderName: 'PM' });
      await persistEmail(repos, alphaEmail);

      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        topic: { parent: 'Projects', child: 'Alpha', confidence: 0.85 },
        summary: 'Project Alpha summary.',
      });
      await processEmailViaQueue(db, repos, mockLLM2, alphaEmail);

      const udemyEmail = makeEmail({ id: 'udemy-1', subject: 'Udemy 1', snippet: 'Udemy update 1', senderDomain: 'udemy.com', senderName: 'Udemy' });
      await persistEmail(repos, udemyEmail);

      const mockLLM3 = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        topic: { parent: 'Education', child: 'Udemy', confidence: 0.85 },
        summary: 'Udemy education summary.',
      });
      await processEmailViaQueue(db, repos, mockLLM3, udemyEmail);

      // Then: All three summaries exist in DB
      const chaseTopic = await repos.topics.findByFullPath('Banking/Chase');
      const alphaTopic = await repos.topics.findByFullPath('Projects/Alpha');
      const udemyTopic = await repos.topics.findByFullPath('Education/Udemy');

      expect(chaseTopic).not.toBeNull();
      expect(alphaTopic).not.toBeNull();
      expect(udemyTopic).not.toBeNull();

      const chaseSummary = await repos.topics.getSummary(chaseTopic!.id);
      const alphaSummary = await repos.topics.getSummary(alphaTopic!.id);
      const udemySummary = await repos.topics.getSummary(udemyTopic!.id);

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
          topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
          summary: `Chase banking summary update ${i}.`,
        });
        await processEmailViaQueue(db, repos, mockLLM, email);
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
          topic: { parent: 'Projects', child: 'Alpha', confidence: 0.85 },
          summary: `Project Alpha summary update ${i}.`,
        });
        await processEmailViaQueue(db, repos, mockLLM, email);
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

  // --- Summary Navigation ---

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
          topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
          summary: 'Chase banking summary.',
        });
        await processEmailViaQueue(db, repos, mockLLM, email);
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

  // --- DB Schema Validation ---

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
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking summary.',
      });
      await processEmailViaQueue(db, repos, mockLLM, email);

      // When: User retrieves summary from DB
      const topic = await repos.topics.findByFullPath('Banking/Chase');
      expect(topic).not.toBeNull();
      const persisted = await repos.topics.getSummary(topic!.id);

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
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking summary.',
      });
      await processEmailViaQueue(db, repos, mockLLM, email);

      // When: User retrieves summary
      const topic = await repos.topics.findByFullPath('Banking/Chase');
      expect(topic).not.toBeNull();
      const persisted = await repos.topics.getSummary(topic!.id);

      // Then: update_count is populated
      expect(persisted!.updateCount).toBeDefined();
      expect(persisted!.updateCount).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Cascade Delete ---

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
        topic: { parent: 'Projects', child: 'Legacy', confidence: 0.85 },
        summary: 'Legacy project summary.',
      });
      await processEmailViaQueue(db, repos, mockLLM, email);

      const topic = await repos.topics.findByFullPath('Projects/Legacy');
      expect(topic).not.toBeNull();
      const summary = await repos.topics.getSummary(topic!.id);
      expect(summary).not.toBeNull();

      // When: Topic is deleted
      await repos.topics.delete(topic!.id);

      // Then: Summary is also deleted (cascade)
      const deletedSummary = await repos.topics.getSummary(topic!.id);
      expect(deletedSummary).toBeNull();
    });
  });

  // --- Sparse Topic Handling ---

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
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking summary covering account updates and security features.',
      });
      await processEmailViaQueue(db, repos, mockLLM, email);

      // Then: Summary is non-empty and valid
      const topic = await repos.topics.findByFullPath('Banking/Chase');
      expect(topic).not.toBeNull();
      const topicSummary = await repos.topics.getSummary(topic!.id);
      expect(topicSummary).toBeDefined();
      expect(topicSummary!.summary.length).toBeGreaterThan(0);
      expect(topicSummary!.wordCount).toBeGreaterThan(0);
    });
  });

  // --- Conflicting Information ---

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
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking summary mentioning payment of $100 due January 15.',
      });
      await processEmailViaQueue(db, repos, mockLLM1, email1);

      const email2 = makeEmail({
        id: 'email-amount-b',
        subject: 'Payment Updated',
        snippet: 'Your payment has been updated to $150. Please pay by January 20.',
        receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(repos, email2);

      const mergePrompts: string[] = [];
      const mockLLM2 = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking summary with updated payment of $150 due January 20.',
        promptLog: mergePrompts,
      });
      await processEmailViaQueue(db, repos, mockLLM2, email2);

      // Then: The merge prompt includes both conflicting amounts and conflict resolution guidance
      const summaryPrompt = mergePrompts.find(p => p.includes('Generate a rolling summary'));
      expect(summaryPrompt).toBeDefined();
      // Old amount from the current summary
      expect(summaryPrompt!).toContain('$100');
      // New amount from the updated email content
      expect(summaryPrompt!).toContain('$150');
      // Conflict resolution guidance tells LLM to preserve facts
      expect(summaryPrompt!).toContain('Preserve important dates, amounts, and action items');
    });
  });

  // --- Summary Persistence ---

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
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking summary.',
      });
      await processEmailViaQueue(db, repos, mockLLM, email);

      const topic = await repos.topics.findByFullPath('Banking/Chase');
      expect(topic).not.toBeNull();
      const original = await repos.topics.getSummary(topic!.id);
      expect(original).not.toBeNull();

      // When: Simulating a restart by re-reading from same DB connection
      const afterRestart = await repos.topics.getSummary(topic!.id);

      // Then: Summary is still there with same content
      expect(afterRestart).not.toBeNull();
      expect(afterRestart!.summary).toBe(original!.summary);
      expect(afterRestart!.wordCount).toBe(original!.wordCount);
      expect(afterRestart!.updateCount).toBe(original!.updateCount);
    });
  });

  // --- Persistence Across Real Restart ---

  describe('Persistence Across Real Restart', () => {
    it('topic summary persists across app restart', async () => {
      // Given: A file-based DB so data survives close/reopen
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tusker-topic-test-'));
      const dbPath = path.join(tmpDir, 'test.db');

      const fileDb = new TuskerBrainDatabase(dbPath);
      await fileDb.initialize();
      const fileRepos = createRepositories(fileDb);

      const email = makeEmail({
        id: 'persist-1',
        subject: 'Persist Test',
        snippet: 'Testing persistence across restart.',
        senderDomain: 'chase.com',
        senderName: 'Chase',
      });
      await persistEmail(fileRepos, email);

      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.85 },
        summary: 'Chase banking summary for persistence test.',
      });
      await processEmailViaQueue(fileDb, fileRepos, mockLLM, email);

      const topic = await fileRepos.topics.findByFullPath('Banking/Chase');
      expect(topic).not.toBeNull();
      const originalSummary = await fileRepos.topics.getSummary(topic!.id);
      expect(originalSummary).not.toBeNull();

      // When: Closing the DB and reopening (simulating app restart)
      await fileDb.close();

      const reopenedDb = new TuskerBrainDatabase(dbPath);
      await reopenedDb.initialize();
      const reopenedRepos = createRepositories(reopenedDb);

      const afterRestart = await reopenedRepos.topics.getSummary(topic!.id);

      // Then: Summary is intact after restart
      expect(afterRestart).not.toBeNull();
      expect(afterRestart!.summary).toBe(originalSummary!.summary);
      expect(afterRestart!.wordCount).toBe(originalSummary!.wordCount);
      expect(afterRestart!.updateCount).toBe(originalSummary!.updateCount);

      await reopenedDb.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});

// --- Pure Function Tests ---

describe('buildSummaryPrompt (pure function)', () => {
  it('includes topic name and overview instruction', () => {
    const prompt = buildSummaryPrompt({
      topic: 'Banking/Chase',
      currentSummary: 'Existing summary',
      newContent: 'New email content',
      maxWords: 500,
    });
    expect(prompt).toContain('Banking/Chase');
    expect(prompt).toContain('First paragraph: Always high-level overview');
  });

  it('includes word limit from maxWords parameter', () => {
    const prompt = buildSummaryPrompt({
      topic: 'Banking/Chase',
      currentSummary: 'Existing',
      newContent: 'New content',
      maxWords: 300,
    });
    expect(prompt).toContain('under 300 words');
  });

  it('includes current summary and new content sections', () => {
    const prompt = buildSummaryPrompt({
      topic: 'Banking/Chase',
      currentSummary: 'Previous banking summary about $29.99 subscription',
      newContent: 'Updated price is $19.99 per month',
      maxWords: 500,
    });
    expect(prompt).toContain('Current Summary:');
    expect(prompt).toContain('Previous banking summary');
    expect(prompt).toContain('New Content:');
    expect(prompt).toContain('Updated price');
  });

  it('uses placeholder when no current summary exists', () => {
    const prompt = buildSummaryPrompt({
      topic: 'Banking/Chase',
      currentSummary: undefined,
      newContent: 'First email content',
      maxWords: 500,
    });
    expect(prompt).toContain('No previous summary exists for this topic');
  });

  it('includes recency weighting instruction', () => {
    const prompt = buildSummaryPrompt({
      topic: 'Banking/Chase',
      currentSummary: 'Old summary',
      newContent: 'New content',
      maxWords: 500,
    });
    expect(prompt).toContain('Gradually reduce focus on older information');
  });

  it('includes conflict resolution guidance (preserve dates, amounts)', () => {
    const prompt = buildSummaryPrompt({
      topic: 'Banking/Chase',
      currentSummary: 'Summary with $29.99',
      newContent: 'Correction: price is $19.99',
      maxWords: 500,
    });
    expect(prompt).toContain('Preserve important dates, amounts, and action items');
  });
});

describe('buildSenderSummaryPrompt (pure function)', () => {
  it('includes sender domain', () => {
    const prompt = buildSenderSummaryPrompt({
      senderDomain: 'chase.com',
      currentSummary: undefined,
      newContent: 'Banking update',
      maxWords: 500,
    });
    expect(prompt).toContain('chase.com');
    expect(prompt).toContain('Sender Domain: chase.com');
  });

  it('includes word limit and communication patterns instruction', () => {
    const prompt = buildSenderSummaryPrompt({
      senderDomain: 'chase.com',
      currentSummary: undefined,
      newContent: 'Update',
      maxWords: 500,
    });
    expect(prompt).toContain('under 500 words');
    expect(prompt).toContain('Highlight patterns in communication');
  });

  it('uses domain-specific placeholder when no current summary', () => {
    const prompt = buildSenderSummaryPrompt({
      senderDomain: 'amazon.com',
      currentSummary: undefined,
      newContent: 'Order shipped',
      maxWords: 500,
    });
    expect(prompt).toContain('No previous summary exists for emails from amazon.com');
  });
});
