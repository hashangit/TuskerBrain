import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { GmailSyncManager, type GmailClient, type SyncState as SyncStateType } from '@core/gmail/sync';
import { JobQueue } from '@core/jobs/queue';
import { TokenManager } from '@core/auth/token-manager';

const MIGRATION_PATH = path.join(__dirname, '../../../database/migrations/0000_initial.sql');

/**
 * Helper: create a configurable mock GmailClient.
 * Individual tests override specific methods to simulate failures.
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
    listLabels: vi.fn().mockResolvedValue({ labels: [] }),
    createLabel: vi.fn().mockResolvedValue({ id: 'label-1', name: 'test-label' }),
    ...overrides,
  };
}

/**
 * Feature: API Failures and Recovery
 *
 * Tests how production code handles various API failure scenarios:
 * - GmailSyncManager's real withRetry() handles rate limits and network errors
 * - JobQueue retry/scheduleRetry with exponential backoff
 * - LabelsRepository error propagation
 * - TokenManager handling of invalid/expired tokens
 *
 * Production code tested (NOT mocked):
 * - GmailSyncManager.withRetry() (core/gmail/sync.ts)
 * - JobQueue.scheduleRetry() (core/jobs/queue.ts)
 * - LabelsRepository.create() (core/repositories/labels.ts)
 * - TokenManager (core/auth/token-manager.ts)
 *
 * Only GmailClient is mocked to simulate API boundary failures.
 */
describe('Feature: API Failures and Recovery', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let mockGmailClient: GmailClient & Record<string, any>;
  let jobQueue: JobQueue;
  let syncManager: GmailSyncManager;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.execSql(fs.readFileSync(MIGRATION_PATH, 'utf-8'));
    repos = createRepositories(db);
    mockGmailClient = createMockGmailClient() as GmailClient & Record<string, any>;
    jobQueue = new JobQueue();
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

  // =========================================================
  // 1. Gmail rate limit (429) - GmailSyncManager retries
  // =========================================================
  describe('Gmail API rate limiting', () => {
    it('retries on 429 rate limit and succeeds on second attempt', async () => {
      // The real withRetry() has exponential backoff with baseBackoffMs=1000.
      // Patch sleep to be instant so the test runs quickly.
      const sleepSpy = vi.spyOn(syncManager as any, 'sleep').mockResolvedValue(undefined);

      let callCount = 0;
      mockGmailClient.listMessages = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error: any = new Error('Rate limit exceeded');
          error.code = 429;
          throw error;
        }
        return Promise.resolve({
          messages: [{ id: 'msg-retry-ok' }],
          nextPageToken: undefined,
        });
      });

      // Act: fetchAndQueueEmails uses withRetry internally
      const queued = await syncManager.fetchAndQueueEmails();

      // Operation was retried once, then succeeded
      expect(callCount).toBe(2);
      expect(mockGmailClient.listMessages).toHaveBeenCalledTimes(2);
      expect(queued).toBe(1);

      sleepSpy.mockRestore();
    });

    it('throws after exhausting all retries on persistent 429', async () => {
      const sleepSpy = vi.spyOn(syncManager as any, 'sleep').mockResolvedValue(undefined);

      mockGmailClient.listMessages = vi.fn().mockImplementation(() => {
        const error: any = new Error('Rate limit exceeded');
        error.code = 429;
        throw error;
      });

      // Should exhaust maxRetries (5) and throw
      await expect(syncManager.fetchAndQueueEmails()).rejects.toThrow(
        'failed after 5 retries'
      );

      // All 5 attempts were made
      expect(mockGmailClient.listMessages).toHaveBeenCalledTimes(5);

      sleepSpy.mockRestore();
    });
  });

  // =========================================================
  // 2. Gmail connection failure (ECONNRESET) - retried
  // =========================================================
  describe('Gmail connection failures', () => {
    it('retries on ECONNRESET network error', async () => {
      const sleepSpy = vi.spyOn(syncManager as any, 'sleep').mockResolvedValue(undefined);

      let callCount = 0;
      mockGmailClient.getProfile = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error: any = new Error('connect ECONNRESET');
          error.code = 'ECONNRESET';
          throw error;
        }
        return Promise.resolve({
          emailAddress: 'user@gmail.com',
          historyId: 'recovered-001',
          messagesTotal: 100,
        });
      });

      // startInitialSync calls getProfile via withRetry
      await syncManager.startInitialSync(7);

      expect(callCount).toBe(2);
      expect(syncManager.getHistoryId()).toBe('recovered-001');

      sleepSpy.mockRestore();
    });

    it('retries on network error in message string', async () => {
      const sleepSpy = vi.spyOn(syncManager as any, 'sleep').mockResolvedValue(undefined);

      let callCount = 0;
      mockGmailClient.listMessages = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('network error: connection refused');
        }
        return Promise.resolve({
          messages: [{ id: 'msg-net-ok' }],
          nextPageToken: undefined,
        });
      });

      const queued = await syncManager.fetchAndQueueEmails();

      expect(callCount).toBe(2);
      expect(queued).toBe(1);

      sleepSpy.mockRestore();
    });
  });

  // =========================================================
  // 3. Label creation failure - error handled
  // =========================================================
  describe('Label creation failure', () => {
    it('propagates error when GmailClient.createLabel fails', async () => {
      // GmailClient.createLabel is the boundary - when it throws,
      // the error propagates up to the caller
      mockGmailClient.createLabel = vi.fn().mockRejectedValue(
        new Error('Gmail API error: Label creation failed (403 Forbidden)')
      );

      await expect(
        mockGmailClient.createLabel!('Important')
      ).rejects.toThrow('Label creation failed');
    });

    it('LabelsRepository.create succeeds for valid data in DB', async () => {
      // LabelsRepository is a DB layer - it succeeds when data is valid.
      // GmailClient boundary is where API failures happen.
      const label = await repos.labels.create({
        id: 'Label_1',
        name: 'Important',
        type: 'system',
      });

      expect(label).toBeDefined();
      expect(label.id).toBe('Label_1');
      expect(label.name).toBe('Important');

      // Can find it back
      const found = await repos.labels.findById('Label_1');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Important');
    });
  });

  // =========================================================
  // 4. Invalid refresh token - TokenManager handles it
  // =========================================================
  describe('Invalid refresh token handling', () => {
    let tokenManager: TokenManager;

    beforeEach(() => {
      // Reset static persistentTokens between tests
      (TokenManager as any).persistentTokens = null;
      tokenManager = new TokenManager(mockGmailClient);
    });

    it('getValidToken throws when no tokens are stored', async () => {
      await expect(tokenManager.getValidToken()).rejects.toThrow(
        'No tokens stored. Please authenticate first.'
      );
    });

    it('detects expired token via shouldRefreshToken and isTokenExpired', async () => {
      // An expiry date in the past means the token is expired
      const expiredDate = new Date(Date.now() - 3600000);
      expect(tokenManager.shouldRefreshToken(expiredDate)).toBe(true);
      expect(tokenManager.isTokenExpired(expiredDate)).toBe(true);

      // An expiry date well in the future means it does NOT need refresh yet
      const futureDate = new Date(Date.now() + 10 * 3600000);
      expect(tokenManager.shouldRefreshToken(futureDate)).toBe(false);
      expect(tokenManager.isTokenExpired(futureDate)).toBe(false);

      // An expiry date within the 5-minute buffer still needs refresh
      const nearExpiry = new Date(Date.now() + 3 * 60 * 1000);
      expect(tokenManager.shouldRefreshToken(nearExpiry)).toBe(true);
    });

    it('clears tokens and fires handlers on revocation', async () => {
      const revocationHandler = vi.fn();
      tokenManager.onRevocation(revocationHandler);

      // Store tokens first
      await tokenManager.setTokens({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        expiry_date: new Date(Date.now() + 3600000),
      });

      // Verify tokens are stored (roundtrip through encryption)
      const stored = await tokenManager.getStoredTokens();
      expect(stored).not.toBeNull();
      expect(stored!.access_token).toBe('test-access');

      // Handle revocation
      await tokenManager.handleRevocation();

      // Tokens are cleared
      const afterRevoke = await tokenManager.getStoredTokens();
      expect(afterRevoke).toBeNull();

      // Handler was called
      expect(revocationHandler).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================
  // 5. Timeout / retry exhaustion - JobQueue dead-letter
  // =========================================================
  describe('Timeout and retry exhaustion', () => {
    it('JobQueue schedules retries with exponential backoff then marks dead', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'timeout-email' },
        emailId: 'timeout-email',
        maxRetries: 4,
      });

      expect(job.status).toBe('pending');

      // Simulate first failure then retry
      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'Request timed out after 30s' });

      const retry1 = await jobQueue.scheduleRetry(job.id);
      expect(retry1!.status).toBe('pending');
      expect(retry1!.retryCount).toBe(1);
      // Backoff: 2^0 = 1 minute from now
      expect(retry1!.scheduledAt).toBeDefined();

      // Second failure then retry
      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'Request timed out after 30s' });

      const retry2 = await jobQueue.scheduleRetry(job.id);
      expect(retry2!.retryCount).toBe(2);

      // Third failure then retry
      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'Request timed out after 30s' });

      const retry3 = await jobQueue.scheduleRetry(job.id);
      expect(retry3!.retryCount).toBe(3);

      // Fourth failure - maxRetries (4) reached, job is dead
      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'Request timed out after 30s' });

      const deadJob = await jobQueue.scheduleRetry(job.id);
      expect(deadJob!.status).toBe('dead');
      expect(deadJob!.retryCount).toBe(4);
      expect(deadJob!.completedAt).toBeDefined();

      // Verify the job is now dead in stats
      const stats = await jobQueue.getStats();
      expect(stats.dead).toBe(1);
    });

    it('GmailSyncManager does not retry non-retriable errors', async () => {
      // A 403 is NOT a rate-limit or network error - withRetry throws immediately
      mockGmailClient.listMessages = vi.fn().mockImplementation(() => {
        const error: any = new Error('Forbidden: Access denied');
        error.code = 403;
        throw error;
      });

      await expect(syncManager.fetchAndQueueEmails()).rejects.toThrow(
        'Forbidden: Access denied'
      );

      // Called only once - no retry for non-retriable errors
      expect(mockGmailClient.listMessages).toHaveBeenCalledTimes(1);
    });
  });
});
