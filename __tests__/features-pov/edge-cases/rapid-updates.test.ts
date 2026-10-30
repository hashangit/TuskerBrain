import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@foundations/database';
import { createRepositories, type Repositories } from '@foundations/persistence';
import { SummaryGenerator } from '@domain/summaries/generator';
import { GmailSyncManager, type GmailClient } from '@domain/sync/sync';
import { JobQueue } from '@domain/jobs/queue';
import type { Email } from '@foundations/types/email';

/**
 * Feature: Rapid Updates (Edge Cases)
 *
 * Tests handling of rapid successive email updates and the resulting
 * data consistency and performance implications.
 *
 * Business Rules:
 * - Rapid email processing should queue properly
 * - Job queue deduplicates pending/running jobs for same email+type
 * - Summary updates handle many emails for a single topic
 * - Processing 50+ emails yields correct totalEmailsProcessed
 * - Processing time scales linearly, not exponentially
 *
 * RULES:
 * - Every test calls REAL production code.
 * - JobQueue, SummaryGenerator, GmailSyncManager are NOT mocked.
 * - Only GmailClient is mocked (external API boundary).
 * - No TuskerBrainApp, no EmailFixtures.
 */

const MIGRATION_PATH = path.join(__dirname, '../../../foundations/database/migrations/0000_initial.sql');

/** Helper: create an Email object with sensible defaults. */
function makeEmail(overrides: Partial<Email> & { id: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: overrides.senderEmail ?? `noreply@${overrides.senderDomain ?? 'example.com'}`,
    senderName: overrides.senderName ?? null,
    senderDomain: overrides.senderDomain ?? 'example.com',
    subject: overrides.subject ?? null,
    snippet: overrides.snippet ?? null,
    receivedAt: overrides.receivedAt ?? new Date(),
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
    it('SummaryGenerator handles 50 emails for one topic', async () => {
      const generator = new SummaryGenerator();

      // Given: 50 emails for a single topic
      const emails: Email[] = [];
      for (let i = 0; i < 50; i++) {
        emails.push(makeEmail({
          id: `topic-email-${i}`,
          subject: `Alpha Update ${i}`,
          snippet: `Project Alpha update number ${i} with important details.`,
          senderDomain: 'client.com',
          senderName: 'Client Team',
          receivedAt: new Date(2024, 0, i + 1),
        }));
      }

      // When: Generating summary for all 50
      const result = await generator.generateTopicSummary('Projects/Alpha', emails);

      // Then: Summary is produced with correct metadata
      expect(result.summary).toBeTruthy();
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.wordCount).toBeLessThanOrEqual(500);
      expect(result.updateCount).toBe(50);
      expect(result.lastEmailId).toBeTruthy();

      // And: Summary has proper paragraph structure
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      expect(result.paragraphCount).toBeLessThanOrEqual(4);
    });

    it('SummaryGenerator accumulates updateCount as emails grow', async () => {
      const generator = new SummaryGenerator();

      // Given: 5 initial emails
      const initialEmails: Email[] = [];
      for (let i = 0; i < 5; i++) {
        initialEmails.push(makeEmail({
          id: `alpha-${i}`,
          subject: `Alpha Update ${i}`,
          snippet: `Project Alpha update ${i}.`,
          senderDomain: 'client.com',
          senderName: 'Client Team',
          receivedAt: new Date(2024, 0, i + 1),
        }));
      }

      // When: Generating summary for 5 emails
      const result1 = await generator.generateTopicSummary('Projects/Alpha', initialEmails);
      expect(result1.updateCount).toBe(5);
      expect(result1.summary).toContain('Alpha');

      // And: 45 more emails arrive (total 50)
      const allEmails = [...initialEmails];
      for (let i = 5; i < 50; i++) {
        allEmails.push(makeEmail({
          id: `alpha-${i}`,
          subject: `Alpha Update ${i}`,
          snippet: `Project Alpha update ${i}.`,
          senderDomain: 'client.com',
          senderName: 'Client Team',
          receivedAt: new Date(2024, 0, i + 1),
        }));
      }

      // When: Generating summary for all 50
      const result2 = await generator.generateTopicSummary('Projects/Alpha', allEmails);

      // Then: Summary reflects 50 total emails
      expect(result2.updateCount).toBe(50);
      expect(result2.wordCount).toBeGreaterThan(0);
      expect(result2.wordCount).toBeLessThanOrEqual(500);
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

      // When: Rapidly inserting 6 emails and linking them
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
          receivedAt: new Date(`2024-01-${10 + i}`),
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

      // And: SummaryGenerator can generate a valid summary from linked emails
      const generator = new SummaryGenerator();
      const bankingEmails: Email[] = [];
      for (let i = 0; i < 6; i++) {
        const email = await repos.emails.findById(`banking-email-${i}`);
        bankingEmails.push({
          id: email!.id,
          threadId: email!.threadId,
          senderEmail: email!.senderEmail,
          senderName: email!.senderName,
          senderDomain: email!.senderDomain,
          subject: email!.subject,
          snippet: email!.snippet,
          receivedAt: email!.receivedAt,
        });
      }
      const result = await generator.generateTopicSummary('Banking/Chase', bankingEmails);
      expect(result.summary).toBeTruthy();
      expect(result.updateCount).toBe(6);
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
