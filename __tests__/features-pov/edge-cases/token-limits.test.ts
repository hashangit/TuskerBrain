import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { AuditLogger } from '@core/jobs/audit';
import { JobQueue } from '@core/jobs/queue';
import { GmailSyncManager, type GmailClient, type SyncState as SyncStateType } from '@core/gmail/sync';

const MIGRATION_PATH = path.join(__dirname, '../../../database/migrations/0000_initial.sql');

/**
 * Helper: create a mock GmailClient.
 * Only the Gmail API boundary is mocked; all other production code is real.
 */
function createMockGmailClient(overrides?: Partial<GmailClient>): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({
      messages: [{ id: 'msg-1' }],
      nextPageToken: undefined,
    }),
    getMessage: vi.fn().mockResolvedValue({
      id: 'test-email',
      threadId: 'thread-1',
      snippet: 'Test email body',
      internalDate: Date.now().toString(),
      payload: {
        headers: [
          { name: 'From', value: 'sender@example.com' },
          { name: 'Subject', value: 'Test Subject' },
        ],
      },
    }),
    modifyMessage: vi.fn().mockResolvedValue({}),
    batchModifyMessages: vi.fn().mockResolvedValue({}),
    getProfile: vi.fn().mockResolvedValue({
      emailAddress: 'user@gmail.com',
      historyId: 'profile-001',
      messagesTotal: 500,
    }),
    ...overrides,
  };
}

/**
 * Feature: Token Limits
 *
 * Tests handling of LLM token limits including rate limits,
 * token usage tracking, and usage reporting.
 *
 * Production code tested:
 * - AuditLogger (core/jobs/audit.ts) -- token tracking, date range queries, provider queries
 * - GmailSyncManager (core/gmail/sync.ts) -- withRetry, exponential backoff, getSyncState
 * - SyncStateRepository (core/repositories/sync-state.ts) -- persisting totalTokensUsed
 * - JobQueue (core/jobs/queue.ts) -- logTokenUsage, audit integration
 */
describe('Feature: Token Limits', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let auditLogger: AuditLogger;
  let jobQueue: JobQueue;
  let mockGmailClient: GmailClient;
  let syncManager: GmailSyncManager;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.execSql(fs.readFileSync(MIGRATION_PATH, 'utf-8'));
    repos = createRepositories(db);

    auditLogger = new AuditLogger();
    jobQueue = new JobQueue();
    jobQueue.setAuditLogger(auditLogger);

    mockGmailClient = createMockGmailClient();
    syncManager = new GmailSyncManager(mockGmailClient, jobQueue, {
      load: () => repos.syncState.load(),
      save: (state: SyncStateType) => repos.syncState.save(state),
    });
  });

  afterEach(async () => {
    syncManager.stop();
    await jobQueue.close();
    await db.close();
  });

  // ===== Token Usage Tracking =====

  describe('Token Usage Tracking', () => {
    it('tracks token usage per job via AuditLogger', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'token-email-1' },
        emailId: 'token-email-1',
      });

      await jobQueue.logTokenUsage(job.id, {
        inputTokens: 150,
        outputTokens: 50,
      });

      const entries = await auditLogger.getEntriesForJob(job.id);
      const tokenEntry = entries.find((e) => e.action === 'token_usage');
      expect(tokenEntry).toBeDefined();
      expect(tokenEntry!.tokensUsed).toBe(200);
      expect(tokenEntry!.details?.inputTokens).toBe(150);
      expect(tokenEntry!.details?.outputTokens).toBe(50);
    });

    it('persists total token usage via SyncStateRepository', async () => {
      await repos.syncState.save({
        historyId: 'hist-001',
        totalEmailsProcessed: 10,
        totalTokensUsed: 5000,
      });

      const loaded = await repos.syncState.load();
      expect(loaded.totalTokensUsed).toBe(5000);
      expect(loaded.totalEmailsProcessed).toBe(10);
      expect(loaded.historyId).toBe('hist-001');
    });

    it('accumulates token usage across multiple saves', async () => {
      await repos.syncState.save({
        totalEmailsProcessed: 5,
        totalTokensUsed: 1000,
      });

      const first = await repos.syncState.load();
      expect(first.totalTokensUsed).toBe(1000);

      await repos.syncState.save({
        totalEmailsProcessed: 12,
        totalTokensUsed: 3500,
      });

      const second = await repos.syncState.load();
      expect(second.totalTokensUsed).toBe(3500);
      expect(second.totalEmailsProcessed).toBe(12);
    });
  });

  // ===== Rate Limit Handling =====

  describe('Rate Limit Handling', () => {
    it('retries on 429 rate limit errors via withRetry', async () => {
      let callCount = 0;
      const failingListMessages = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Rate limit exceeded');
          err.code = 429;
          throw err;
        }
        return {
          messages: [{ id: 'retried-msg-1' }],
          nextPageToken: undefined,
        };
      });

      const client = createMockGmailClient({
        listMessages: failingListMessages,
      });
      const manager = new GmailSyncManager(client, jobQueue);

      const queued = await manager.fetchAndQueueEmails();
      expect(callCount).toBe(2);
      expect(queued).toBe(1);
    });

    it('retries on network errors', async () => {
      let callCount = 0;
      const failingListMessages = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Network timeout');
          err.code = 'ETIMEDOUT';
          throw err;
        }
        return {
          messages: [{ id: 'network-msg-1' }],
          nextPageToken: undefined,
        };
      });

      const client = createMockGmailClient({
        listMessages: failingListMessages,
      });
      const manager = new GmailSyncManager(client, jobQueue);

      const queued = await manager.fetchAndQueueEmails();
      expect(callCount).toBe(2);
      expect(queued).toBe(1);
    });

    it('does not retry non-retriable errors', async () => {
      const failingListMessages = vi.fn().mockImplementation(() => {
        throw new Error('Authentication failed: invalid credentials');
      });

      const client = createMockGmailClient({
        listMessages: failingListMessages,
      });
      const manager = new GmailSyncManager(client, jobQueue);

      await expect(manager.fetchAndQueueEmails()).rejects.toThrow('Authentication failed');
      expect(failingListMessages).toHaveBeenCalledTimes(1);
    });
  });

  // ===== Exponential Backoff =====

  describe('Exponential Backoff', () => {
    it('retry delays increase exponentially', async () => {
      const delays: number[] = [];

      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
        if (ms && ms > 0) {
          delays.push(ms);
        }
        fn();
        return {} as any;
      });

      let callCount = 0;
      const failingListMessages = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          const err: any = new Error('Rate limit exceeded');
          err.code = 429;
          throw err;
        }
        return {
          messages: [{ id: 'backoff-msg-1' }],
          nextPageToken: undefined,
        };
      });

      const client = createMockGmailClient({
        listMessages: failingListMessages,
      });
      const manager = new GmailSyncManager(client, jobQueue);

      await manager.fetchAndQueueEmails();

      // 3 retry delays: baseBackoffMs * 2^attempt = 1000, 2000, 4000
      expect(delays.length).toBe(3);
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);

      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThan(delays[i - 1]);
      }

      vi.restoreAllMocks();
    });

    it('throws after max retries exhausted', async () => {
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn();
        return {} as any;
      });

      const failingListMessages = vi.fn().mockImplementation(() => {
        const err: any = new Error('Rate limit exceeded');
        err.code = 429;
        throw err;
      });

      const client = createMockGmailClient({
        listMessages: failingListMessages,
      });
      const manager = new GmailSyncManager(client, jobQueue);

      await expect(manager.fetchAndQueueEmails()).rejects.toThrow(
        'failed after 5 retries'
      );
      expect(failingListMessages).toHaveBeenCalledTimes(5);

      vi.restoreAllMocks();
    });
  });

  // ===== Long Email Chunking =====
  // processEmail does NOT implement chunking; tests validate real behavior
  // and signal the feature gap.

  describe('Long Email Chunking', () => {
    it('processes very long email content', async () => {
      const longSnippet = 'This is a test sentence. '.repeat(10000);
      const mockGetMessage = vi.fn().mockResolvedValue({
        id: 'long-email-1',
        threadId: 'thread-long',
        snippet: longSnippet,
        internalDate: Date.now().toString(),
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Very Long Email' },
          ],
        },
      });

      const client = createMockGmailClient({
        getMessage: mockGetMessage,
      });
      const manager = new GmailSyncManager(client, jobQueue);

      const result = await manager.processEmail('long-email-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('long-email-1');
      expect(result!.snippet).toBe(longSnippet);

      const state = await manager.getSyncState();
      expect(state.totalEmailsProcessed).toBe(1);
    });

    it('email with attachments processes without error', async () => {
      const mockGetMessage = vi.fn().mockResolvedValue({
        id: 'attachment-email-1',
        threadId: 'thread-attach',
        snippet: 'Please review the attached documents.',
        internalDate: Date.now().toString(),
        payload: {
          headers: [
            { name: 'From', value: 'colleague@company.com' },
            { name: 'Subject', value: 'Documents for Review' },
          ],
          parts: [
            { mimeType: 'text/plain', body: { data: 'Base64 content' } },
            { mimeType: 'application/pdf', filename: 'doc1.pdf', body: { size: 1000000 } },
            { mimeType: 'application/pdf', filename: 'doc2.pdf', body: { size: 2000000 } },
            { mimeType: 'application/pdf', filename: 'doc3.pdf', body: { size: 1500000 } },
          ],
        },
      });

      const client = createMockGmailClient({
        getMessage: mockGetMessage,
      });
      const manager = new GmailSyncManager(client, jobQueue);

      const result = await manager.processEmail('attachment-email-1');
      expect(result).toBeDefined();
      expect(result!.id).toBe('attachment-email-1');
    });
  });

  // ===== Cost Estimation =====
  // No cost estimation feature exists in production. Tests call
  // real code and validate the data foundation exists.

  describe('Cost Estimation', () => {
    it('provides token usage data for cost calculation', async () => {
      // Log token usage for a job
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'cost-email-1' },
        emailId: 'cost-email-1',
      });
      await jobQueue.logTokenUsage(job.id, { inputTokens: 5000, outputTokens: 1000 });

      const totalTokens = await auditLogger.getTotalTokensUsed();
      expect(totalTokens).toBe(6000);

      // Cost conversion (tokens -> dollars) is NOT implemented.
      // A real cost estimation module would use: estimatedCost = totalTokens * pricePerToken
    });
  });

  // ===== Daily Token Budget =====
  // No budget enforcement exists in production. Tests validate
  // the data layer and signal the missing feature.

  describe('Daily Token Budget', () => {
    it('sync state tracks total tokens for budget comparison', async () => {
      await repos.syncState.save({
        totalEmailsProcessed: 100,
        totalTokensUsed: 95000,
      });

      const state = await repos.syncState.load();
      expect(state.totalTokensUsed).toBe(95000);

      // Budget checking would compare against a configured daily limit.
      // This enforcement does NOT exist in production code.
      const dailyLimit = 100000;
      const approachingBudget = state.totalTokensUsed >= dailyLimit * 0.9;
      expect(approachingBudget).toBe(true);
    });

    it('audit logger provides usage data for budget warnings', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'budget-warn-email' },
        emailId: 'budget-warn-email',
      });
      await jobQueue.logTokenUsage(job.id, { inputTokens: 9000, outputTokens: 500 });

      const totalTokens = await auditLogger.getTotalTokensUsed();
      expect(totalTokens).toBe(9500);

      // Budget warning system does NOT exist in production.
    });

    it('high token usage signals budget exhaustion', async () => {
      await repos.syncState.save({
        totalEmailsProcessed: 500,
        totalTokensUsed: 100000,
      });

      const state = await repos.syncState.load();
      expect(state.totalTokensUsed).toBe(100000);

      // Budget enforcement would block new jobs when limit is reached.
      // This feature does NOT exist in production code.
    });
  });

  // ===== Token Usage Reports =====

  describe('Token Usage Reports', () => {
    it('reports daily token usage via date range query', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'report-email-1' },
        emailId: 'report-email-1',
      });
      await jobQueue.logTokenUsage(job1.id, { inputTokens: 2000, outputTokens: 500 });

      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'report-email-2' },
        emailId: 'report-email-2',
      });
      await jobQueue.logTokenUsage(job2.id, { inputTokens: 3000, outputTokens: 800 });

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

      const entries = await auditLogger.getEntriesByDateRange(start, end);
      const tokenEntries = entries.filter((e) => e.action === 'token_usage');

      expect(tokenEntries.length).toBe(2);
      const totalFromEntries = tokenEntries.reduce((sum, e) => sum + (e.tokensUsed || 0), 0);
      expect(totalFromEntries).toBe(6300);
    });

    it('reports token usage breakdown by provider', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'provider-email-1' },
        emailId: 'provider-email-1',
      });
      await auditLogger.logTokenUsage(job1.id, {
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        provider: 'anthropic',
      });

      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'provider-email-2' },
        emailId: 'provider-email-2',
      });
      await auditLogger.logTokenUsage(job2.id, {
        inputTokens: 800,
        outputTokens: 300,
        totalTokens: 1100,
        provider: 'openai',
      });

      const anthropicTokens = await auditLogger.getTokensByProvider('anthropic');
      expect(anthropicTokens).toBe(1200);

      const openaiTokens = await auditLogger.getTokensByProvider('openai');
      expect(openaiTokens).toBe(1100);

      const totalTokens = await auditLogger.getTotalTokensUsed();
      expect(totalTokens).toBe(2300);
    });
  });
});
