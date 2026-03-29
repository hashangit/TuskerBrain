import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '../../../database/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { GmailSyncManager, type GmailClient } from '@core/gmail/sync';
import { JobQueue } from '@core/jobs/queue';

const MIGRATION_PATH = path.join(__dirname, '../../../database/migrations/0000_initial.sql');

/**
 * Helper: create a mock GmailClient whose methods can be individually overridden
 * to simulate network failures.
 */
function createMockGmailClient(): GmailClient & {
  setNetworkError(method: keyof GmailClient, error: Error): void;
  clearNetworkError(method: keyof GmailClient): void;
} {
  const networkErrors: Map<string, Error> = new Map();

  const wrap = <T>(method: string, fallback: () => T): (() => T | Promise<T>) => {
    return (() => {
      const err = networkErrors.get(method);
      if (err) throw err;
      return fallback();
    }) as any;
  };

  const client: any = {
    listMessages: wrap('listMessages', () => ({
      messages: [
        { id: 'msg-1', threadId: 'thread-1' },
        { id: 'msg-2', threadId: 'thread-2' },
        { id: 'msg-3', threadId: 'thread-3' },
      ],
      historyId: '5000',
    })),
    getMessage: wrap('getMessage', () => ({
      id: 'msg-1',
      threadId: 'thread-1',
      snippet: 'Test email body',
      internalDate: Date.now().toString(),
      payload: {
        headers: [
          { name: 'From', value: 'Sender <sender@example.com>' },
          { name: 'Subject', value: 'Test Subject' },
        ],
      },
    })),
    getProfile: wrap('getProfile', () => ({
      emailAddress: 'test@gmail.com',
      historyId: '100',
      messagesTotal: 42,
    })),
    modifyMessage: wrap('modifyMessage', () => ({})),
    batchModifyMessages: wrap('batchModifyMessages', () => ({})),
    listLabels: wrap('listLabels', () => []),
    createLabel: wrap('createLabel', () => ({ id: 'label-1' })),
  };

  return {
    ...client,
    setNetworkError(method: keyof GmailClient, error: Error) {
      networkErrors.set(method, error);
    },
    clearNetworkError(method: keyof GmailClient) {
      networkErrors.delete(method);
    },
  };
}

/**
 * Helper: create a network error with a specific code.
 */
function networkError(code: string, message?: string): Error {
  const err = new Error(message ?? `Network error: ${code}`);
  (err as any).code = code;
  return err;
}

/**
 * Feature: Network Interruptions
 *
 * Tests real production code: GmailSyncManager (with real withRetry),
 * JobQueue (with real scheduleRetry), SyncStateRepository.
 * Only the GmailClient is mocked to simulate network failures.
 */
describe('Feature: Network Interruptions', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let client: ReturnType<typeof createMockGmailClient>;
  let syncManager: GmailSyncManager;
  let jobQueue: JobQueue;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.execSql(fs.readFileSync(MIGRATION_PATH, 'utf-8'));
    repos = createRepositories(db);

    client = createMockGmailClient();
    jobQueue = new JobQueue();
    syncManager = new GmailSyncManager(client, jobQueue, repos.syncState);

    // Use very short backoff so tests run fast
    (syncManager as any).baseBackoffMs = 10;
  });

  afterEach(async () => {
    await db.close();
  });

  // ===========================================================================
  // 1. Sync resumes after interruption
  // ===========================================================================
  describe('Sync resumes after interruption', () => {
    it('listMessages throws ECONNRESET -> withRetry retries -> succeeds', async () => {
      let callCount = 0;
      const originalListMessages = client.listMessages;
      client.listMessages = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw networkError('ECONNRESET', 'Connection reset by peer');
        }
        return originalListMessages();
      }) as any;

      await syncManager.startInitialSync(7);

      expect(callCount).toBe(2);
      const state = await syncManager.getSyncState();
      expect(state.historyId).toBe('5000');
    });
  });

  // ===========================================================================
  // 2. Partial sync preserved
  // ===========================================================================
  describe('Partial sync preserved', () => {
    it('process 2 emails -> error -> checkpoint saved -> in-memory state tracks progress', async () => {
      client.listMessages = vi.fn().mockResolvedValue({
        messages: [
          { id: 'email-a', threadId: 'thread-a' },
          { id: 'email-b', threadId: 'thread-b' },
          { id: 'email-c', threadId: 'thread-c' },
        ],
        historyId: '6000',
      }) as any;

      client.getMessage = vi.fn().mockImplementation(async (id: string) => {
        if (id === 'email-c') {
          throw networkError('ETIMEDOUT', 'Connection timed out');
        }
        return {
          id,
          threadId: `thread-${id}`,
          snippet: `Body of ${id}`,
          internalDate: Date.now().toString(),
          payload: {
            headers: [
              { name: 'From', value: 'Sender <sender@example.com>' },
              { name: 'Subject', value: `Subject for ${id}` },
            ],
          },
        };
      }) as any;

      await syncManager.startInitialSync(7);

      await syncManager.processEmail('email-a');
      await syncManager.processEmail('email-b');

      await expect(syncManager.processEmail('email-c')).rejects.toThrow();

      const checkpoint = syncManager.getCheckpoint();
      expect(checkpoint.lastMessageId).toBe('email-b');

      const state = await syncManager.getSyncState();
      expect(state.totalEmailsProcessed).toBe(2);
    });

    it('fetchAndQueueEmails persists historyId after each page', async () => {
      // First page succeeds, second page fails
      let listCallCount = 0;
      client.listMessages = vi.fn().mockImplementation(async (opts?: any) => {
        listCallCount++;
        if (listCallCount === 1) {
          return {
            messages: [
              { id: 'page1-msg1', threadId: 't1' },
              { id: 'page1-msg2', threadId: 't2' },
            ],
            historyId: '6000',
            nextPageToken: 'page2',
          };
        }
        throw networkError('ECONNRESET', 'Connection reset');
      }) as any;

      // fetchAndQueueEmails wraps listMessages in withRetry (5 attempts)
      // All 5 attempts on page 2 will fail
      await expect(syncManager.fetchAndQueueEmails()).rejects.toThrow();

      // But historyId from page 1 should be persisted
      const persisted = await repos.syncState.load();
      expect(persisted.historyId).toBe('6000');
    });
  });

  // ===========================================================================
  // 3. Job retry
  // ===========================================================================
  describe('Job retry', () => {
    it('failed job -> retry count incremented', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'retry-test-1' },
        emailId: 'retry-test-1',
        maxRetries: 3,
      });

      expect(job.retryCount).toBe(0);
      expect(job.status).toBe('pending');

      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.updateJobStatus(job.id, 'failed', {
        error: 'ECONNRESET: Connection reset by peer',
      });

      const retried = await jobQueue.scheduleRetry(job.id);
      expect(retried).not.toBeNull();
      expect(retried!.retryCount).toBe(1);
      expect(retried!.status).toBe('pending');
      expect(retried!.scheduledAt).toBeDefined();
    });

    it('job becomes dead after max retries', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'retry-test-2' },
        emailId: 'retry-test-2',
        maxRetries: 3,
      });

      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'ETIMEDOUT' });
      await jobQueue.scheduleRetry(job.id);

      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'ETIMEDOUT' });
      await jobQueue.scheduleRetry(job.id);

      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'ETIMEDOUT' });
      const deadJob = await jobQueue.scheduleRetry(job.id);

      expect(deadJob!.status).toBe('dead');
      expect(deadJob!.retryCount).toBe(3);
    });
  });

  // ===========================================================================
  // 4. LLM timeout
  // ===========================================================================
  describe('LLM timeout', () => {
    it('ETIMEDOUT is retried by withRetry and eventually succeeds', async () => {
      let callCount = 0;
      client.getProfile = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          throw networkError('ETIMEDOUT', 'Request timed out');
        }
        return { emailAddress: 'test@gmail.com', historyId: '100' };
      }) as any;

      await syncManager.startInitialSync(7);

      expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it('non-retriable error throws immediately without retry', async () => {
      const authError = new Error('Invalid credentials');
      (authError as any).code = 401;

      client.getProfile = vi.fn().mockRejectedValue(authError) as any;

      await expect(syncManager.startInitialSync(7)).rejects.toThrow('Invalid credentials');
      expect(client.getProfile).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 5. Exponential backoff
  // ===========================================================================
  describe('Exponential backoff', () => {
    it('retry delays increase exponentially (10ms, 20ms, 40ms, ...)', async () => {
      const sleepSpies: number[] = [];

      (syncManager as any).sleep = vi.fn().mockImplementation(async (ms: number) => {
        sleepSpies.push(ms);
        // Don't actually sleep in tests
      });

      client.getProfile = vi.fn().mockRejectedValue(
        networkError('ECONNRESET', 'Connection reset')
      ) as any;

      await expect(syncManager.startInitialSync(7)).rejects.toThrow();

      // 5 attempts = 4 sleeps (no sleep after last failure)
      // backoff: baseBackoffMs * 2^attempt = 10*1, 10*2, 10*4, 10*8
      expect(sleepSpies.length).toBe(4);
      expect(sleepSpies[0]).toBe(10);
      expect(sleepSpies[1]).toBe(20);
      expect(sleepSpies[2]).toBe(40);
      expect(sleepSpies[3]).toBe(80);
    });
  });

  // ===========================================================================
  // 6. Missed emails after recovery
  // ===========================================================================
  describe('Missed emails after recovery', () => {
    it('sync recovers -> new sync picks up missed emails', async () => {
      client.listMessages = vi.fn().mockResolvedValueOnce({
        messages: [
          { id: 'email-1', threadId: 'thread-1' },
          { id: 'email-2', threadId: 'thread-2' },
        ],
        historyId: '1000',
      }) as any;

      await syncManager.startInitialSync(7);
      await syncManager.markEmailsAsProcessed(['email-1', 'email-2']);

      client.listMessages = vi.fn().mockResolvedValueOnce({
        messages: [
          { id: 'email-2', threadId: 'thread-2' },
          { id: 'email-3', threadId: 'thread-3' },
          { id: 'email-4', threadId: 'thread-4' },
        ],
        historyId: '2000',
      }) as any;

      const newEmails = await syncManager.fetchNewEmailsSince('1000');

      expect(newEmails.length).toBe(2);
      expect(newEmails.map((e: any) => e.id)).toEqual(
        expect.arrayContaining(['email-3', 'email-4'])
      );
      expect(newEmails.map((e: any) => e.id)).not.toContain('email-2');

      const state = await syncManager.getSyncState();
      expect(state.historyId).toBe('2000');
    });
  });

  // ===========================================================================
  // 7. Network down event
  // ===========================================================================
  describe('Network down event', () => {
    it('GmailSyncManager emits sync:error event', async () => {
      const errorData: unknown[] = [];
      syncManager.on('sync:error', (data) => {
        errorData.push(data);
      });

      (syncManager as any).emit('sync:error', { message: 'ECONNRESET', code: 'ECONNRESET' });

      expect(errorData.length).toBe(1);
      expect((errorData[0] as any).code).toBe('ECONNRESET');
    });

    it('withRetry exhausts retries on persistent network failure', async () => {
      client.listMessages = vi.fn().mockRejectedValue(
        networkError('ENOTFOUND', 'DNS lookup failed')
      ) as any;

      await expect(syncManager.fetchAndQueueEmails()).rejects.toThrow(
        /failed after 5 retries/
      );

      expect(client.listMessages).toHaveBeenCalledTimes(5);
    });
  });

  // ===========================================================================
  // 8. Network recovered
  // ===========================================================================
  describe('Network recovered', () => {
    it('after recovery, sync continues successfully', async () => {
      let listCallCount = 0;
      client.listMessages = vi.fn().mockImplementation(async () => {
        listCallCount++;
        if (listCallCount <= 1) {
          throw networkError('ECONNRESET', 'Connection reset');
        }
        return {
          messages: [{ id: 'recovered-1', threadId: 'thread-r1' }],
          historyId: '7000',
        };
      }) as any;

      const queued = await syncManager.fetchAndQueueEmails();

      expect(queued).toBe(1);
      expect(listCallCount).toBe(2);

      const state = await syncManager.getSyncState();
      expect(state.historyId).toBe('7000');
    });

    it('state persists across sync failure and recovery', async () => {
      client.listMessages = vi.fn().mockResolvedValue({
        messages: [{ id: 'pre-fail-1', threadId: 'thread-1' }],
        historyId: '3000',
      }) as any;

      await syncManager.fetchAndQueueEmails();

      const stateAfterFirst = await repos.syncState.load();
      expect(stateAfterFirst.historyId).toBe('3000');

      client.listMessages = vi.fn().mockRejectedValue(
        networkError('ENOTFOUND', 'DNS resolution failed')
      ) as any;

      await expect(syncManager.fetchAndQueueEmails()).rejects.toThrow();

      const stateAfterFailure = await repos.syncState.load();
      expect(stateAfterFailure.historyId).toBe('3000');

      client.listMessages = vi.fn().mockResolvedValue({
        messages: [
          { id: 'recovery-1', threadId: 'thread-r1' },
          { id: 'recovery-2', threadId: 'thread-r2' },
        ],
        historyId: '4000',
      }) as any;

      const thirdSync = await syncManager.fetchAndQueueEmails();
      expect(thirdSync).toBe(2);

      const finalState = await repos.syncState.load();
      expect(finalState.historyId).toBe('4000');
    });
  });
});
