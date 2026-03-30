import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { GmailSyncManager, type GmailClient } from '@core/gmail/sync';
import { JobQueue } from '@core/jobs/queue';
import { processEmailWithWorkflow } from '@core/workflows/langgraph-workflow';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';

/**
 * Feature: Rapid Updates (Edge Cases)
 *
 * Tests handling of rapid successive email updates and the resulting
 * data consistency and performance implications.
 *
 * Business Rules:
 * - Rapid email processing should queue properly
 * - Job queue deduplicates pending/running jobs for same email+type
 * - Processing 50+ emails yields correct totalEmailsProcessed
 * - Processing time scales linearly, not exponentially
 *
 * RULES:
 * - Every test calls REAL production code.
 * - JobQueue, GmailSyncManager are NOT mocked.
 * - Only GmailClient is mocked (external API boundary).
 * - No TuskerBrainApp, no EmailFixtures.
 * - LLM calls are mocked for workflow tests.
 */

const MIGRATION_PATH = path.join(__dirname, '../../../database/migrations/0000_initial.sql');

/** Helper: create an Email object with sensible defaults. */
function makeEmail(overrides: Partial<Email> & { id: string }): Email {
  const now = new Date();
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: overrides.senderEmail ?? `noreply@${overrides.senderDomain ?? 'example.com'}`,
    senderName: overrides.senderName ?? null,
    senderDomain: overrides.senderDomain ?? 'example.com',
    subject: overrides.subject ?? null,
    snippet: overrides.snippet ?? null,
    receivedAt: overrides.receivedAt ?? now, // Use current date by default
    ...overrides,
  };
}

/** Helper: create a mock GmailClient that returns canned messages. */
function createMockGmailClient(messages: Array<{ id: string; threadId?: string; snippet?: string; payload?: any; internalDate?: string }>): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({
      messages: messages.map(m => ({ id: m.id })),
      historyId: '1000',
    }),
    getMessage: vi.fn().mockImplementation((id: string) => {
      const msg = messages.find(m => m.id === id);
      if (!msg) return null;
      return {
        id: msg.id,
        threadId: msg.threadId ?? `thread-${msg.id}`,
        snippet: msg.snippet ?? 'Test snippet',
        internalDate: msg.internalDate ?? Date.now().toString(),
        payload: msg.payload ?? {
          headers: [
            { name: 'From', value: `sender@example.com` },
            { name: 'Subject', value: `Test Subject ${id}` },
          ],
        },
      };
    }),
    getProfile: vi.fn().mockResolvedValue({ emailAddress: 'test@gmail.com', historyId: '1' }),
    modifyMessage: vi.fn().mockResolvedValue(undefined),
    batchModifyMessages: vi.fn().mockResolvedValue(undefined),
    listLabels: vi.fn().mockResolvedValue([]),
    createLabel: vi.fn().mockResolvedValue({ id: 'label_1', name: 'Test' }),
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

describe('Feature: Rapid Updates', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let jobQueue: JobQueue;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
    await db.execSql(migrationSql);
    repos = createRepositories(db);
    jobQueue = new JobQueue();
  });

  afterEach(async () => {
    await jobQueue.close();
    await db.close();
  });

  describe('Rapid Email Queuing', () => {
    it('50 emails queued rapidly: JobQueue handles batch creation without errors', async () => {
      // When: Creating 50 jobs rapidly (concurrent)
      const createPromises = [];
      for (let i = 0; i < 50; i++) {
        createPromises.push(
          jobQueue.createJob({
            type: 'email_process',
            payload: { emailId: `rapid-email-${i}` },
            emailId: `rapid-email-${i}`,
          })
        );
      }
      const results = await Promise.all(createPromises);

      // Then: All 50 jobs created successfully
      expect(results).toHaveLength(50);
      expect(results.every(r => r.id)).toBe(true);
      expect(results.every(r => r.status === 'pending')).toBe(true);

      // And: Stats reflect all 50 pending jobs
      const stats = await jobQueue.getStats();
      expect(stats.pending).toBe(50);
      expect(stats.total).toBe(50);
    });
  });

  describe('Job Deduplication', () => {
    it('creating same job twice for same email and type returns existing job', async () => {
      // When: Creating the same job twice for same emailId + type
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'dup-email-1' },
        emailId: 'dup-email-1',
      });

      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'dup-email-1' },
        emailId: 'dup-email-1',
      });

      // Then: Same job returned (deduplication)
      expect(job2.id).toBe(job1.id);

      // And: Only one job in queue
      const pending = await jobQueue.getJobsByStatus('pending');
      expect(pending).toHaveLength(1);
    });

    it('allows different job types for the same email', async () => {
      // When: Creating two different job types for same email
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'multi-email-1' },
        emailId: 'multi-email-1',
      });

      const job2 = await jobQueue.createJob({
        type: 'email_archive',
        payload: { emailId: 'multi-email-1' },
        emailId: 'multi-email-1',
      });

      // Then: Both jobs created (different types)
      expect(job1.id).not.toBe(job2.id);

      const pending = await jobQueue.getJobsByStatus('pending');
      expect(pending).toHaveLength(2);
    });

    it('allows duplicate job after first one completes', async () => {
      // Given: A completed job
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'completed-email' },
        emailId: 'completed-email',
      });
      await jobQueue.updateJobStatus(job.id, 'completed');

      // When: Creating same job again
      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'completed-email' },
        emailId: 'completed-email',
      });

      // Then: New job created (old one is completed, not pending/running)
      expect(job2.id).not.toBe(job.id);
      expect(job2.status).toBe('pending');
    });
  });

  describe('Topic Summary Batching', () => {
    it('workflow processes single email and generates summary', async () => {
      // Given: A single email for a topic
      const email = makeEmail({
        id: 'topic-email-1',
        subject: 'Alpha Update 1',
        snippet: 'Project Alpha update with important details.',
        senderDomain: 'client.com',
        senderName: 'Client Team',
        receivedAt: new Date(),
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Projects', childTopic: 'Alpha', fullPath: 'Projects/Alpha', confidence: 0.9 },
        summary: 'Project Alpha update with important details.',
        update: { title: 'Alpha Update', description: 'Project update details', priority: 'medium' },
      });

      // When: Processing email through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: Summary is produced
      expect(result.summary).toBeDefined();
      expect(result.summary).toBeTruthy();
      expect(result.extraction?.update).toBeDefined();
    });

    it('workflow processes multiple emails sequentially', async () => {
      // Given: 5 emails for a single topic
      const emails: Email[] = [];
      for (let i = 0; i < 5; i++) {
        emails.push(makeEmail({
          id: `alpha-${i}`,
          subject: `Alpha Update ${i}`,
          snippet: `Project Alpha update ${i}.`,
          senderDomain: 'client.com',
          senderName: 'Client Team',
          receivedAt: new Date(),
        }));
      }

      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Projects', childTopic: 'Alpha', fullPath: 'Projects/Alpha', confidence: 0.9 },
        summary: 'Multiple Project Alpha updates received.',
        update: { title: 'Alpha Update', description: 'Project update', priority: 'medium' },
      });

      // When: Processing emails sequentially through workflow
      const results = [];
      for (const email of emails) {
        const result = await processEmailWithWorkflow(email, mockLLM);
        results.push(result);
      }

      // Then: All emails processed successfully
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.summary).toBeDefined();
        expect(result.currentStep).toBe('summarize');
      });
    });
  });

  describe('Data Consistency', () => {
    it('all 50 emails processed via GmailSyncManager: totalEmailsProcessed=50', async () => {
      // Given: 50 messages from Gmail
      const messages = Array.from({ length: 50 }, (_, i) => ({
        id: `gmail-msg-${i}`,
        threadId: `thread-${i}`,
        snippet: `Email content ${i}`,
        internalDate: new Date(2024, 0, i + 1).getTime().toString(),
        payload: {
          headers: [
            { name: 'From', value: `sender${i}@example.com` },
            { name: 'Subject', value: `Subject ${i}` },
          ],
        },
      }));
      const client = createMockGmailClient(messages);
      const syncManager = new GmailSyncManager(client);

      // When: Processing all 50 emails
      for (const msg of messages) {
        await syncManager.processEmail(msg.id);
      }

      // Then: totalEmailsProcessed counter is exactly 50
      const syncState = await syncManager.getSyncState();
      expect(syncState.totalEmailsProcessed).toBe(50);
    });

    it('topic and emails remain consistent after rapid inserts', async () => {
      // Given: A topic
      const topic = await repos.topics.create({
        id: 'topic-banking',
        name: 'Chase',
        fullPath: 'Banking/Chase',
        emailCount: 0,
      });

      // When: Rapidly inserting 6 emails and linking them (recent dates)
      const now = new Date();
      for (let i = 0; i < 6; i++) {
        const emailId = `banking-email-${i}`;
        await repos.emails.create({
          id: emailId,
          threadId: `thread-banking-${i}`,
          senderEmail: 'alerts@chase.com',
          senderName: 'Chase Bank',
          senderDomain: 'chase.com',
          subject: i === 0 ? 'Banking Email' : `Balance Update ${i}`,
          snippet: i === 0 ? 'Account balance is $1000.' : `Account balance is now $${1000 + (i - 1) * 100}.`,
          receivedAt: new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000), // Recent dates
        });
        await repos.topics.linkEmail(emailId, 'topic-banking');
        await repos.topics.incrementEmailCount('topic-banking');
      }

      // Then: Topic emailCount is accurate
      const updatedTopic = await repos.topics.findById('topic-banking');
      expect(updatedTopic!.emailCount).toBe(6);

      // And: All 6 emails are linked
      const linkedEmailIds = await repos.topics.findEmailsForTopic('topic-banking');
      expect(linkedEmailIds).toHaveLength(6);
      for (let i = 0; i < 6; i++) {
        expect(linkedEmailIds).toContain(`banking-email-${i}`);
      }

      // And: Each email can be retrieved individually
      for (let i = 0; i < 6; i++) {
        const email = await repos.emails.findById(`banking-email-${i}`);
        expect(email).not.toBeNull();
        expect(email!.senderDomain).toBe('chase.com');
      }

      // And: Workflow can process one of the linked emails
      const email = await repos.emails.findById('banking-email-0');
      const workflowEmail = makeEmail({
        id: email!.id,
        threadId: email!.threadId,
        senderEmail: email!.senderEmail,
        senderName: email!.senderName ?? undefined,
        senderDomain: email!.senderDomain,
        subject: email!.subject ?? undefined,
        snippet: email!.snippet ?? undefined,
        receivedAt: email!.receivedAt,
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.9 },
        summary: 'Banking updates: Account balance is $1000.',
        update: { title: 'Balance Update', description: 'Account balance $1000', priority: 'medium' },
      });

      const result = await processEmailWithWorkflow(workflowEmail, mockLLM);
      expect(result.summary).toBeDefined();
      expect(result.extraction?.update).toBeDefined();
    });
  });

  describe('Linear Scaling', () => {
    it('processing 100 emails does not take exponentially longer than 10', async () => {
      // Given: GmailSyncManager with mock client
      const messages = Array.from({ length: 100 }, (_, i) => ({
        id: `perf-msg-${i}`,
        threadId: `thread-perf-${i}`,
        snippet: `Performance test email ${i}`,
        internalDate: new Date(2024, 0, i + 1).getTime().toString(),
        payload: {
          headers: [
            { name: 'From', value: `sender${i}@perf.com` },
            { name: 'Subject', value: `Perf Test ${i}` },
          ],
        },
      }));
      const client = createMockGmailClient(messages);
      const syncManager = new GmailSyncManager(client);

      // When: Processing first 10 emails
      const start10 = performance.now();
      for (let i = 0; i < 10; i++) {
        await syncManager.processEmail(messages[i].id);
      }
      const time10 = performance.now() - start10;

      // Reset for full run
      const syncManager2 = new GmailSyncManager(client);

      // When: Processing all 100 emails
      const start100 = performance.now();
      for (let i = 0; i < 100; i++) {
        await syncManager2.processEmail(messages[i].id);
      }
      const time100 = performance.now() - start100;

      // Then: 100 emails should take at most ~15x (10x linear + overhead), not exponential
      // A quadratic algorithm would be 100x; we allow generous headroom
      const ratio = time100 / time10;
      expect(ratio).toBeLessThan(20);

      // And: Counter is exact
      const state = await syncManager2.getSyncState();
      expect(state.totalEmailsProcessed).toBe(100);
    });
  });
});
