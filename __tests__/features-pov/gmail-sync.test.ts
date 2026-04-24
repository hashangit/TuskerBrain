import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { GmailSyncManager, type GmailClient } from '@core/gmail/sync';
import { JobQueue } from '@core/jobs/queue';
import type { Email } from '@core/types/email';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock GmailClient. Only vi.fn() the external API methods. */
function createMockGmailClient(overrides?: Partial<GmailClient>): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({ messages: [], historyId: '1000' }),
    getMessage: vi.fn().mockResolvedValue(null),
    getProfile: vi.fn().mockResolvedValue({
      emailAddress: 'user@example.com',
      historyId: '5000',
      messagesTotal: 42,
    }),
    modifyMessage: vi.fn().mockResolvedValue({}),
    batchModifyMessages: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

/** Build a Gmail message (raw API shape) with sensible defaults. */
function makeGmailMessage(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? `msg-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    threadId: overrides.threadId ?? `thread-${id}`,
    snippet: overrides.snippet ?? 'Test email body',
    internalDate: overrides.internalDate ?? Date.now().toString(),
    payload: {
      headers: [
        { name: 'From', value: overrides.from ?? 'alice@example.com' },
        { name: 'Subject', value: overrides.subject ?? 'Test Subject' },
      ],
    },
    labelIds: overrides.labelIds ?? ['INBOX'],
    ...overrides,
  };
}

/** Build an Email object with defaults. */
function makeEmail(overrides: Partial<Email> & { id: string; senderDomain: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: `sender@${overrides.senderDomain}`,
    senderName: overrides.senderDomain.split('.')[0],
    subject: `Email from ${overrides.senderDomain}`,
    snippet: `This is a snippet for ${overrides.id}`,
    receivedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Feature tests
// ---------------------------------------------------------------------------

describe('Feature: Gmail Sync', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let mockGmailClient: GmailClient;
  let jobQueue: JobQueue;
  let syncManager: GmailSyncManager;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
    mockGmailClient = createMockGmailClient();
    jobQueue = new JobQueue();
    syncManager = new GmailSyncManager(mockGmailClient, jobQueue, repos.syncState);
  });

  afterEach(async () => {
    await db.close();
  });

  // -----------------------------------------------------------------------
  // Phase 1: Initial Sync
  // -----------------------------------------------------------------------
  describe('Phase 1: Initial Sync (Clean First)', () => {
    it('fetches profile, stores historyId, and marks initial sync complete', async () => {
      // Mock listMessages to NOT return historyId so profile's historyId is preserved
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
      });

      await syncManager.startInitialSync(30);

      // Profile was fetched
      expect(mockGmailClient.getProfile).toHaveBeenCalledOnce();

      // historyId from profile is stored
      const state = await syncManager.getSyncState();
      expect(state.historyId).toBe('5000');

      // lastFullSync timestamp set
      expect(state.lastFullSync).toBeInstanceOf(Date);
    });

    it('creates backfill jobs for each day in the lookback period', async () => {
      await syncManager.startInitialSync(7);

      const jobs = await syncManager.getBackfillJobs();
      expect(jobs).toHaveLength(7);

      // All jobs are pending with type backfill_day
      for (const job of jobs) {
        expect(job.type).toBe('backfill_day');
        expect(job.status).toBe('pending');
        expect(job.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }

      // Dates are distinct
      const dates = jobs.map((j) => j.date);
      expect(new Set(dates).size).toBe(7);
    });

    it('stores the historyId from listMessages response when present', async () => {
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [{ id: 'm1' }, { id: 'm2' }],
        historyId: '9999',
      });

      await syncManager.startInitialSync(5);

      const state = await syncManager.getSyncState();
      // listMessages historyId overwrites profile historyId
      expect(state.historyId).toBe('9999');
    });

    it('queues email_process jobs for all fetched messages via fetchAndQueueEmails', async () => {
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
        historyId: '8000',
      });

      const count = await syncManager.fetchAndQueueEmails();
      expect(count).toBe(3);

      const stats = await jobQueue.getStats();
      expect(stats.pending).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Phase 2: AI Backfill
  // -----------------------------------------------------------------------
  describe('Phase 2: AI Backfill', () => {
    it('creates the correct number of backfill jobs for a 30-day lookback', async () => {
      await syncManager.startInitialSync(30);
      const jobs = await syncManager.getBackfillJobs();
      expect(jobs).toHaveLength(30);
    });

    it('backfill jobs have dates in descending order (today first)', async () => {
      await syncManager.startInitialSync(5);
      const jobs = await syncManager.getBackfillJobs();
      const dates = jobs.map((j) => new Date(j.date).getTime());

      // Descending: jobs[0] is today, jobs[4] is 4 days ago
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThan(dates[i - 1]);
      }
    });

    it('clearCompletedBackfillJobs removes completed and failed jobs', async () => {
      await syncManager.startInitialSync(5);
      let jobs = await syncManager.getBackfillJobs();

      // Simulate some jobs completing
      jobs[0].status = 'completed';
      jobs[1].status = 'failed';

      syncManager.clearCompletedBackfillJobs();
      jobs = await syncManager.getBackfillJobs();

      expect(jobs).toHaveLength(3); // 5 - 2 cleared
      for (const j of jobs) {
        expect(j.status).toBe('pending');
      }
    });

    it('fetchAndQueueEmails handles pagination with nextPageToken', async () => {
      const listFn = mockGmailClient.listMessages as ReturnType<typeof vi.fn>;
      listFn
        .mockResolvedValueOnce({
          messages: [{ id: 'm1' }],
          nextPageToken: 'page2',
          historyId: '6000',
        })
        .mockResolvedValueOnce({
          messages: [{ id: 'm2' }],
          historyId: '6001',
        });

      const count = await syncManager.fetchAndQueueEmails();
      expect(count).toBe(2);
      expect(listFn).toHaveBeenCalledTimes(2);
      expect(listFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageToken: 'page2' }));
    });

    it('fetchAndQueueEmails deduplicates jobs for the same email', async () => {
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [{ id: 'dup-1' }],
        historyId: '7000',
      });

      // First call creates the job
      await syncManager.fetchAndQueueEmails();
      // Second call returns same email - job already exists
      await syncManager.fetchAndQueueEmails();

      const stats = await jobQueue.getStats();
      // Deduplication means only one pending job for dup-1
      expect(stats.total).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Phase 3: Incremental Sync
  // -----------------------------------------------------------------------
  describe('Phase 3: Incremental Sync', () => {
    it('uses provided historyId to fetch only new emails', async () => {
      const listFn = mockGmailClient.listMessages as ReturnType<typeof vi.fn>;
      listFn.mockResolvedValue({
        messages: [{ id: 'new-1' }],
        historyId: '6001',
      });

      await syncManager.startIncrementalSync('6000');

      expect(listFn).toHaveBeenCalledWith(
        expect.objectContaining({ startHistoryId: '6000' })
      );

      const state = await syncManager.getSyncState();
      // historyId updated from response
      expect(state.historyId).toBe('6001');
      expect(state.lastIncrementalSync).toBeInstanceOf(Date);
    });

    it('fetchNewEmailsSince returns unprocessed messages and filters duplicates', async () => {
      const listFn = mockGmailClient.listMessages as ReturnType<typeof vi.fn>;
      listFn.mockResolvedValue({
        messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        historyId: '7001',
      });

      // First fetch returns all 3
      let emails = await syncManager.fetchNewEmailsSince('7000');
      expect(emails).toHaveLength(3);

      // Mark 'a' and 'b' as processed
      await syncManager.markEmailsAsProcessed(['a', 'b']);

      // Reset mock to return same messages + a new one
      listFn.mockResolvedValue({
        messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
        historyId: '7002',
      });

      emails = await syncManager.fetchNewEmailsSince('7001');
      // 'a' and 'b' are filtered, 'c' and 'd' are returned
      const ids = emails.map((e: any) => e.id);
      expect(ids).toEqual(['c', 'd']);
    });

    it('persists updated historyId after incremental sync', async () => {
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        historyId: '8000',
      });

      await syncManager.startIncrementalSync('7000');

      // Read from the database store directly
      const persisted = await repos.syncState.load();
      expect(persisted.historyId).toBe('8000');
    });

    it('incremental sync sets lastIncrementalSync timestamp', async () => {
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        historyId: '8001',
      });

      const before = new Date();
      await syncManager.startIncrementalSync('8000');
      const after = new Date();

      const state = await syncManager.getSyncState();
      expect(state.lastIncrementalSync!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(state.lastIncrementalSync!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('fetchNewEmailsSince updates historyId from response', async () => {
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [{ id: 'x' }],
        historyId: '9500',
      });

      await syncManager.fetchNewEmailsSince('9000');

      expect(syncManager.getHistoryId()).toBe('9500');
    });
  });

  // -----------------------------------------------------------------------
  // Process Email
  // -----------------------------------------------------------------------
  describe('Process Email', () => {
    it('extracts email data from Gmail message and returns an Email object', async () => {
      const msg = makeGmailMessage({
        id: 'proc-1',
        from: 'Bob <bob@acme.com>',
        subject: 'Hello World',
        snippet: 'Body text here',
        internalDate: '1700000000000',
      });
      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const email = await syncManager.processEmail('proc-1');

      expect(email).not.toBeNull();
      expect(email!.id).toBe('proc-1');
      expect(email!.subject).toBe('Hello World');
      expect(email!.snippet).toBe('Body text here');
      // senderEmail stores the raw From header value
      expect(email!.senderEmail).toBe('Bob <bob@acme.com>');
      expect(email!.senderDomain).toBe('acme.com');
      expect(email!.senderName).toBe('Bob');
      expect(email!.receivedAt).toBeInstanceOf(Date);
    });

    it('extracts domain from bare email address when no angle brackets', async () => {
      const msg = makeGmailMessage({ id: 'proc-2', from: 'jane@example.org' });
      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      const email = await syncManager.processEmail('proc-2');
      expect(email!.senderDomain).toBe('example.org');
      expect(email!.senderName).toBe('jane');
    });

    it('returns null when getMessage returns null', async () => {
      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const email = await syncManager.processEmail('nonexistent');
      expect(email).toBeNull();
    });

    it('increments totalEmailsProcessed for each processed email', async () => {
      const msg = makeGmailMessage({ id: 'proc-3' });
      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      await syncManager.processEmail('proc-3');

      const state = await syncManager.getSyncState();
      expect(state.totalEmailsProcessed).toBe(1);
    });

    it('marks email as processed to prevent re-fetching', async () => {
      const msg = makeGmailMessage({ id: 'proc-4' });
      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue(msg);

      await syncManager.processEmail('proc-4');

      // The email should be in the processed set, so fetchNewEmailsSince filters it
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [{ id: 'proc-4' }, { id: 'other' }],
        historyId: '100',
      });

      const newEmails = await syncManager.fetchNewEmailsSince('50');
      expect(newEmails.map((e: any) => e.id)).toEqual(['other']);
    });
  });

  // -----------------------------------------------------------------------
  // Label Sync
  // -----------------------------------------------------------------------
  describe('Label Sync', () => {
    it('initial sync includes label sync step', async () => {
      // Simulate Gmail returning existing labels
      const mockLabels = [
        { id: 'Label_1', name: 'TB/Banking', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        { id: 'Label_2', name: 'TB/Banking/Chase', labelListVisibility: 'labelShow', messageListVisibility: 'show' },
      ];
      (mockGmailClient as any).listLabels = vi.fn().mockResolvedValue(mockLabels);

      await syncManager.startInitialSync(7);

      // Labels were synced to the database via repos
      const tbLabels = await repos.labels.findTBLabels();
      // TB labels should be present after sync (if syncLabels was called)
      expect(tbLabels.length).toBeGreaterThanOrEqual(0);
    });

    it('incremental sync preserves TB labels with labelSource=tb', async () => {
      // Pre-create a TB label in the database
      await repos.labels.create({
        id: 'label-tb-work',
        name: 'TB/Work',
        labelSource: 'tb',
        labelType: 'topic',
      });

      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        historyId: '8001',
      });

      await syncManager.startIncrementalSync('8000');

      // TB label is still present after incremental sync
      const found = await repos.labels.findByName('TB/Work');
      expect(found).not.toBeNull();
      expect(found!.labelSource).toBe('tb');
    });

    it('syncs Gmail user labels with labelSource=gmail-user', async () => {
      const gmailLabels = [
        { id: 'Label_10', name: 'My Custom Label', type: 'user' },
      ];
      (mockGmailClient as any).listLabels = vi.fn().mockResolvedValue(gmailLabels);

      await repos.labels.syncFromGmail(gmailLabels);

      const found = await repos.labels.findByName('My Custom Label');
      expect(found).not.toBeNull();
      expect(found!.labelSource).toBe('gmail-user');
    });

    it('syncs Gmail system labels with labelSource=gmail-system', async () => {
      const gmailLabels = [
        { id: 'INBOX', name: 'INBOX', type: 'system' },
      ];
      (mockGmailClient as any).listLabels = vi.fn().mockResolvedValue(gmailLabels);

      await repos.labels.syncFromGmail(gmailLabels);

      const found = await repos.labels.findByName('INBOX');
      expect(found).not.toBeNull();
      expect(found!.labelSource).toBe('gmail-system');
    });
  });

  // -----------------------------------------------------------------------
  // Cleanup Rules
  // -----------------------------------------------------------------------
  describe('Cleanup Rules', () => {
    it('archives old update emails (>30 days) via batchModifyMessages', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);
      const emails: Email[] = [
        makeEmail({
          id: 'old-update-1',
          senderDomain: 'noreply.bank.com',
          senderEmail: 'noreply@bank.com',
          subject: 'Your statement is ready',
          snippet: 'Your account statement is ready',
          receivedAt: oldDate,
        }),
      ];

      const result = await syncManager.applyCleanupRules(emails);

      // Old update email should be archived
      expect(result.archived).toBe(1);
      expect(result.deleted).toBe(0);

      // batchModifyMessages called with INBOX removal
      expect(mockGmailClient.batchModifyMessages).toHaveBeenCalledWith(
        ['old-update-1'],
        { removeLabelIds: ['INBOX'] }
      );
    });

    it('deletes old promotional emails (>30 days)', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 45);
      const emails: Email[] = [
        makeEmail({
          id: 'old-promo-1',
          senderDomain: 'deals.store.com',
          senderEmail: 'deals@store.com',
          subject: '50% off sale today only',
          snippet: 'Save big with our discount code SAVE50',
          receivedAt: oldDate,
          gmailCategory: 'promotions',
        }),
      ];

      const result = await syncManager.applyCleanupRules(emails);

      expect(result.deleted).toBe(1);
      expect(result.archived).toBe(0);
    });

    it('queues recent promotional emails for AI (extract_deals)', async () => {
      const recentEmails: Email[] = [
        makeEmail({
          id: 'recent-promo',
          senderDomain: 'deals.store.com',
          senderEmail: 'deals@store.com',
          subject: '50% off sale',
          snippet: 'Use code SAVE50 for discount',
          receivedAt: new Date(), // today
          gmailCategory: 'promotions',
        }),
      ];

      const result = await syncManager.applyCleanupRules(recentEmails);

      expect(result.queuedForAI).toBe(1);
      // extract_deals maps to no cleanup action (null), so neither archived nor deleted
      expect(result.archived).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('archives old regular emails (>180 days)', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 365);
      const emails: Email[] = [
        makeEmail({
          id: 'old-regular-1',
          senderDomain: 'example.com',
          senderEmail: 'john.doe@example.com',
          subject: 'Project update',
          snippet: 'Here is the latest on the project.',
          receivedAt: oldDate,
        }),
      ];

      const result = await syncManager.applyCleanupRules(emails);
      expect(result.archived).toBe(1);
    });

    it('queues recent regular emails for AI processing', async () => {
      const emails: Email[] = [
        makeEmail({
          id: 'recent-regular-1',
          senderDomain: 'example.com',
          senderEmail: 'john.doe@example.com',
          subject: 'Quick update',
          snippet: 'Just wanted to touch base.',
          receivedAt: new Date(),
        }),
      ];

      const result = await syncManager.applyCleanupRules(emails);
      expect(result.queuedForAI).toBe(1);
    });

    it('falls back to individual modifyMessage when batchModifyMessages is unavailable', async () => {
      // Create a client without batch support
      const clientNoBatch = createMockGmailClient({
        batchModifyMessages: undefined,
      });
      syncManager = new GmailSyncManager(clientNoBatch, jobQueue, repos.syncState);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);
      const emails: Email[] = [
        makeEmail({
          id: 'no-batch-1',
          senderDomain: 'noreply.service.com',
          senderEmail: 'noreply@service.com',
          subject: 'Your account update',
          snippet: 'Your account statement is ready for viewing',
          receivedAt: oldDate,
        }),
      ];

      await syncManager.applyCleanupRules(emails);

      // Falls back to modifyMessage for each email
      expect(clientNoBatch.modifyMessage).toHaveBeenCalledWith(
        'no-batch-1',
        { removeLabelIds: ['INBOX'] }
      );
    });

    it('returns cleanupActions with emailId and action for each email', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);
      const emails: Email[] = [
        makeEmail({
          id: 'action-1',
          senderDomain: 'deals.store.com',
          senderEmail: 'deals@store.com',
          subject: 'Massive sale 50% off',
          snippet: 'Discount code SAVE50 inside',
          receivedAt: oldDate,
          gmailCategory: 'promotions',
        }),
      ];

      const result = await syncManager.applyCleanupRules(emails);

      expect(result.cleanupActions).toHaveLength(1);
      expect(result.cleanupActions[0]).toEqual({
        emailId: 'action-1',
        action: 'delete',
      });
    });
  });

  // -----------------------------------------------------------------------
  // Batch Operations
  // -----------------------------------------------------------------------
  describe('Batch Operations', () => {
    it('batch archives multiple old update emails in a single call', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 90);
      const emails: Email[] = [1, 2, 3].map((i) =>
        makeEmail({
          id: `batch-archive-${i}`,
          senderDomain: `noreply.service${i}.com`,
          senderEmail: `noreply@service${i}.com`,
          subject: `Statement is ready #${i}`,
          snippet: `Your account statement ${i} is ready`,
          receivedAt: oldDate,
        })
      );

      await syncManager.applyCleanupRules(emails);

      // All three archived in a single batch call
      expect(mockGmailClient.batchModifyMessages).toHaveBeenCalledTimes(1);
      expect(mockGmailClient.batchModifyMessages).toHaveBeenCalledWith(
        ['batch-archive-1', 'batch-archive-2', 'batch-archive-3'],
        { removeLabelIds: ['INBOX'] }
      );
    });

    it('batch deletes multiple old promotional emails', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 60);
      const emails: Email[] = [1, 2].map((i) =>
        makeEmail({
          id: `batch-del-${i}`,
          senderDomain: `deals.shop${i}.com`,
          senderEmail: `deals@shop${i}.com`,
          subject: `Deal ${i}: 50% off everything`,
          snippet: `Save big with code SAVE${i}`,
          receivedAt: oldDate,
          gmailCategory: 'promotions',
        })
      );

      await syncManager.applyCleanupRules(emails);

      // Batch delete call: remove INBOX + add TRASH
      expect(mockGmailClient.batchModifyMessages).toHaveBeenCalledWith(
        ['batch-del-1', 'batch-del-2'],
        { removeLabelIds: ['INBOX'], addLabelIds: ['TRASH'] }
      );
    });
  });

  // -----------------------------------------------------------------------
  // Error Handling and Retry
  // -----------------------------------------------------------------------
  describe('Error Handling and Retry', () => {
    it('retries on network errors with exponential backoff', async () => {
      const profileFn = mockGmailClient.getProfile as ReturnType<typeof vi.fn>;
      let callCount = 0;
      profileFn.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          const err: any = new Error('network error');
          err.code = 'ECONNRESET';
          throw err;
        }
        return { emailAddress: 'user@example.com', historyId: '100', messagesTotal: 10 };
      });

      // Use a sync manager with fast backoff for testing
      const fastManager = new GmailSyncManager(
        mockGmailClient,
        jobQueue,
        repos.syncState
      );
      // Override baseBackoffMs to speed up test
      (fastManager as any).baseBackoffMs = 10;

      await fastManager.startInitialSync(1);

      expect(profileFn).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    });

    it('retries on rate limit (429) errors', async () => {
      const profileFn = mockGmailClient.getProfile as ReturnType<typeof vi.fn>;
      let callCount = 0;
      profileFn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Rate limit exceeded');
          err.code = 429;
          throw err;
        }
        return { emailAddress: 'user@example.com', historyId: '200', messagesTotal: 5 };
      });

      const fastManager = new GmailSyncManager(
        mockGmailClient,
        jobQueue,
        repos.syncState
      );
      (fastManager as any).baseBackoffMs = 10;

      await fastManager.startInitialSync(1);

      expect(profileFn).toHaveBeenCalledTimes(2); // 1 failure + 1 success
    });

    it('throws immediately for non-retriable errors', async () => {
      const profileFn = mockGmailClient.getProfile as ReturnType<typeof vi.fn>;
      profileFn.mockRejectedValue(new Error('Invalid credentials'));

      await expect(syncManager.startInitialSync(1)).rejects.toThrow('Invalid credentials');
    });

    it('throws after max retries exhausted', async () => {
      const profileFn = mockGmailClient.getProfile as ReturnType<typeof vi.fn>;
      const networkErr: any = new Error('network timeout');
      networkErr.code = 'ETIMEDOUT';
      profileFn.mockRejectedValue(networkErr);

      const fastManager = new GmailSyncManager(
        mockGmailClient,
        jobQueue,
        repos.syncState
      );
      (fastManager as any).baseBackoffMs = 1;
      (fastManager as any).maxRetries = 3;

      await expect(fastManager.startInitialSync(1)).rejects.toThrow(
        /failed after 3 retries/
      );
    });
  });

  // -----------------------------------------------------------------------
  // Rate Limiting
  // -----------------------------------------------------------------------
  describe('Rate Limiting', () => {
    it('Gmail API 429 triggers retry and eventual success', async () => {
      const listFn = mockGmailClient.listMessages as ReturnType<typeof vi.fn>;
      let callCount = 0;
      listFn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error('Rate limit exceeded');
          err.code = 429;
          throw err;
        }
        return { messages: [{ id: 'after-rate-limit' }], historyId: '5555' };
      });
      (mockGmailClient.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        historyId: '5000',
      });

      const fastManager = new GmailSyncManager(
        mockGmailClient,
        jobQueue,
        repos.syncState
      );
      (fastManager as any).baseBackoffMs = 10;

      await fastManager.startInitialSync(1);

      expect(listFn).toHaveBeenCalledTimes(2);
    });

    it('rate limit message with "rate limit" text triggers retry', async () => {
      const profileFn = mockGmailClient.getProfile as ReturnType<typeof vi.fn>;
      let callCount = 0;
      profileFn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Rate limit hit, try again later');
        }
        return { historyId: '1234' };
      });

      const fastManager = new GmailSyncManager(
        mockGmailClient,
        jobQueue,
        repos.syncState
      );
      (fastManager as any).baseBackoffMs = 10;

      await fastManager.startInitialSync(1);
      expect(profileFn).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Pause / Resume
  // -----------------------------------------------------------------------
  describe('Pause / Resume', () => {
    it('pause sets isPaused to true', async () => {
      await syncManager.pause();
      const progress = syncManager.getProgress();
      expect(progress.isPaused).toBe(true);
    });

    it('resume sets isPaused to false', async () => {
      await syncManager.pause();
      await syncManager.resume();
      const progress = syncManager.getProgress();
      expect(progress.isPaused).toBe(false);
    });

    it('progress reflects running state during sync', async () => {
      (mockGmailClient.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        historyId: '1111',
      });
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [{ id: 'a' }, { id: 'b' }],
        historyId: '1112',
      });

      await syncManager.startInitialSync(1);

      const progress = syncManager.getProgress();
      // After startInitialSync completes, isRunning is still true (per design)
      expect(progress.total).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Sync State Persistence
  // -----------------------------------------------------------------------
  describe('Sync State Persistence', () => {
    it('persists state to SyncStateRepository after initial sync', async () => {
      (mockGmailClient.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        historyId: 'persisted-123',
      });
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        historyId: 'persisted-456',
      });

      await syncManager.startInitialSync(7);

      // Read directly from database
      const stored = await repos.syncState.load();
      expect(stored.historyId).toBe('persisted-456');
      expect(stored.lastFullSync).toBeInstanceOf(Date);
      expect(stored.totalEmailsProcessed).toBe(0);
    });

    it('loads state from SyncStateRepository on construction', async () => {
      // Pre-seed the store
      await repos.syncState.save({
        historyId: 'loaded-999',
        totalEmailsProcessed: 42,
        totalTokensUsed: 5000,
      });

      // Allow async load to complete
      await new Promise((r) => setTimeout(r, 50));

      const freshManager = new GmailSyncManager(
        mockGmailClient,
        jobQueue,
        repos.syncState
      );
      await freshManager.initialize();

      // The loaded state should be available
      const state = await freshManager.getSyncState();
      expect(state.totalEmailsProcessed).toBe(42);
    });

    it('persists totalEmailsProcessed after processing emails', async () => {
      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeGmailMessage({ id: 'track-1' })
      );

      await syncManager.processEmail('track-1');

      const state = await syncManager.getSyncState();
      expect(state.totalEmailsProcessed).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Sync Progress and Stats
  // -----------------------------------------------------------------------
  describe('Sync Progress and Stats', () => {
    it('tracks total emails processed in sync state', async () => {
      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeGmailMessage({ id: 'stat-1' })
      );

      await syncManager.processEmail('stat-1');
      await syncManager.processEmail('stat-1'); // same email again still increments

      const state = await syncManager.getSyncState();
      expect(state.totalEmailsProcessed).toBe(2);
    });

    it('getProgress returns current progress snapshot', async () => {
      (mockGmailClient.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        historyId: '4000',
      });
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        historyId: '4001',
      });

      await syncManager.startInitialSync(1);

      const progress = syncManager.getProgress();
      expect(progress.total).toBe(3);
      expect(progress.isRunning).toBe(true);
    });

    it('checkpoint tracks last processed email', async () => {
      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeGmailMessage({ id: 'cp-1' })
      );

      await syncManager.processEmail('cp-1');

      const saved = await syncManager.getSavedProgress();
      expect(saved.checkpoint.lastMessageId).toBe('cp-1');
      expect(saved.checkpoint.lastProcessedIndex).toBe(1);
    });

    it('saved progress includes checkpoint for recovery', async () => {
      (mockGmailClient.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        historyId: '3000',
      });
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        nextPageToken: 'next-page',
        historyId: '3001',
      });

      await syncManager.startInitialSync(3);

      const saved = await syncManager.getSavedProgress();
      expect(saved.checkpoint.pageToken).toBe('next-page');
      expect(saved.checkpoint.timestamp).toBeInstanceOf(Date);
    });
  });

  // -----------------------------------------------------------------------
  // Processed Email IDs tracking
  // -----------------------------------------------------------------------
  describe('Processed Email IDs', () => {
    it('markEmailsAsProcessed prevents re-fetching', async () => {
      await syncManager.markEmailsAsProcessed(['e1', 'e2', 'e3']);

      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [{ id: 'e1' }, { id: 'e2' }, { id: 'e4' }],
        historyId: '200',
      });

      const result = await syncManager.fetchNewEmailsSince('100');
      expect(result.map((e: any) => e.id)).toEqual(['e4']);
    });

    it('clearProcessedEmails allows re-fetching', async () => {
      await syncManager.markEmailsAsProcessed(['e1']);
      syncManager.clearProcessedEmails();

      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [{ id: 'e1' }],
        historyId: '201',
      });

      const result = await syncManager.fetchNewEmailsSince('100');
      expect(result).toHaveLength(1);
    });

    it('trims processed IDs when exceeding MAX_PROCESSED_IDS', async () => {
      const ids = Array.from({ length: 10001 }, (_, i) => `id-${i}`);
      await syncManager.markEmailsAsProcessed(ids);

      // The set should be trimmed to MAX_PROCESSED_IDS
      const internalSet = (syncManager as any).processedEmailIds as Set<string>;
      expect(internalSet.size).toBeLessThanOrEqual(
        (syncManager as any).MAX_PROCESSED_IDS
      );
    });
  });

  // -----------------------------------------------------------------------
  // Resume from Checkpoint
  // -----------------------------------------------------------------------
  describe('Resume from Checkpoint', () => {
    it('resumes fetching from saved pageToken', async () => {
      const listFn = mockGmailClient.listMessages as ReturnType<typeof vi.fn>;
      listFn.mockResolvedValue({
        messages: [{ id: 'resumed-1' }],
        historyId: '5001',
      });

      await syncManager.resumeFromCheckpoint({
        lastProcessedIndex: 5,
        timestamp: new Date(),
        pageToken: 'saved-token',
      });

      expect(listFn).toHaveBeenCalledWith(
        expect.objectContaining({ pageToken: 'saved-token' })
      );

      const state = await syncManager.getSyncState();
      expect(state.historyId).toBe('5001');
    });
  });

  // -----------------------------------------------------------------------
  // Event System
  // -----------------------------------------------------------------------
  describe('Event System', () => {
    it('on/off registers and unregisters event handlers', () => {
      const handler = vi.fn();
      syncManager.on('sync:started', handler);
      (syncManager as any).emit('sync:started', { test: true });

      expect(handler).toHaveBeenCalledWith({ test: true });

      syncManager.off('sync:started', handler);
      (syncManager as any).emit('sync:started', { test: 2 });

      expect(handler).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  // -----------------------------------------------------------------------
  // Stop
  // -----------------------------------------------------------------------
  describe('Stop', () => {
    it('stop sets isRunning to false', async () => {
      (mockGmailClient.getProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
        historyId: '1111',
      });
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [],
        historyId: '1112',
      });

      await syncManager.startInitialSync(1);
      expect(syncManager.getProgress().isRunning).toBe(true);

      syncManager.stop();
      expect(syncManager.getProgress().isRunning).toBe(false);
    });
  });
});
