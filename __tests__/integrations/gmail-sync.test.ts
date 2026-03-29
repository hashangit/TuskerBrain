import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GmailSyncManager } from '@core/gmail/sync';
import type { GmailClient } from '@core/gmail/client';
import type { SyncState } from '@core/gmail/sync';

/**
 * Design Spec Reference: Lines 686-710
 *
 * Gmail Sync Tests:
 * - Initial sync fetches emails within configured lookback period
 * - Incremental sync uses historyId to fetch only new emails
 * - Tracks historyId for next incremental sync
 * - Handles Gmail API rate limits with backoff
 * - Recovers from network interruption
 */
describe('GmailSyncManager', () => {
  let mockGmailClient: GmailClient;
  let savedState: SyncState | undefined;

  const createStore = () => ({
    load: vi.fn().mockImplementation(async () => {
      if (savedState) return savedState;
      return { totalEmailsProcessed: 0, totalTokensUsed: 0 };
    }),
    save: vi.fn().mockImplementation(async (state: SyncState) => {
      savedState = state;
    }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    savedState = undefined;
    mockGmailClient = {
      listMessages: vi.fn().mockResolvedValue({
        messages: [{ id: 'msg1' }, { id: 'msg2' }],
        nextPageToken: undefined,
      }),
      getMessage: vi.fn(),
      modifyMessage: vi.fn(),
      getProfile: vi.fn().mockResolvedValue({
        emailAddress: 'test@gmail.com',
        historyId: 'initial-history-123',
        messagesTotal: 100,
      }),
      list: vi.fn(),
    } as unknown as GmailClient;
  });

  describe('Initial Sync', () => {
    it('should perform initial sync with lookback period', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      await manager.startInitialSync(30);

      expect(mockGmailClient.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ maxResults: 100 })
      );
      expect(manager.getProgress()).toMatchObject({
        isRunning: true,
        total: 2,
        processed: 0,
        failed: 0,
      });
    });

    it('should create backfill jobs for each day', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      await manager.startInitialSync(30);

      const jobs = await manager.getBackfillJobs();

      expect(jobs.length).toBe(30);
      expect(jobs[0]).toMatchObject({
        type: 'backfill_day',
        status: 'pending',
      });
    });

    it('should track sync progress', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      await manager.startInitialSync(30);

      const progress = manager.getProgress();

      expect(progress.total).toBe(2);
      expect(progress.isRunning).toBe(true);
    });

    it('should fetch profile to get initial historyId', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      await manager.startInitialSync(30);

      const state = await manager.getSyncState();

      expect(state.historyId).toBe('initial-history-123');
    });
  });

  describe('Incremental Sync with HistoryId', () => {
    it('should perform incremental sync when history ID available', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      await manager.startIncrementalSync('history-123');

      expect(mockGmailClient.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ maxResults: 100 })
      );
    });

    it('should use historyId to fetch only new emails', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      // First, do an initial sync
      await manager.startInitialSync(30);
      const initialHistoryId = (await manager.getSyncState()).historyId;

      // Mock new emails since last sync
      mockGmailClient.listMessages.mockResolvedValueOnce({
        messages: [{ id: 'msg3' }, { id: 'msg4' }],
        nextPageToken: undefined,
      });

      // Perform incremental sync
      await manager.startIncrementalSync(initialHistoryId);

      // Should have used historyId in the call
      expect(mockGmailClient.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          startHistoryId: initialHistoryId,
        })
      );
    });

    it('should track historyId for next incremental sync', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      await manager.startInitialSync(30);
      const stateBefore = await manager.getSyncState();

      // Mock response with new historyId
      mockGmailClient.listMessages.mockResolvedValueOnce({
        messages: [{ id: 'new-msg' }],
        nextPageToken: undefined,
        historyId: 'new-history-456',
      });

      await manager.startIncrementalSync(stateBefore.historyId);

      const stateAfter = await manager.getSyncState();
      expect(stateAfter.historyId).toBe('new-history-456');
    });

    it('should only fetch emails after historyId', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      // Set up a scenario where historyId is in the middle
      mockGmailClient.listMessages.mockResolvedValueOnce({
        messages: [{ id: 'new-email-1' }, { id: 'new-email-2' }],
        nextPageToken: undefined,
        historyId: 'history-789',
      });

      const newEmails = await manager.fetchNewEmailsSince('history-456');

      expect(newEmails.length).toBe(2);
      expect(mockGmailClient.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          startHistoryId: 'history-456',
        })
      );
    });

    it('should not fetch already-processed emails', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      // Mark some emails as already processed
      await manager.markEmailsAsProcessed(['msg1', 'msg2']);

      mockGmailClient.listMessages.mockResolvedValueOnce({
        messages: [{ id: 'msg1' }, { id: 'msg2' }, { id: 'msg3' }],
        nextPageToken: undefined,
      });

      const newEmails = await manager.fetchNewEmailsSince('history-123');

      // Should filter out already processed
      expect(newEmails.find((e) => e.id === 'msg1')).toBeUndefined();
      expect(newEmails.find((e) => e.id === 'msg2')).toBeUndefined();
      expect(newEmails.find((e) => e.id === 'msg3')).toBeDefined();
    });
  });

  describe('Rate Limit Handling', () => {
    it('should handle Gmail API rate limits with backoff', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      // Mock rate limit error
      mockGmailClient.listMessages
        .mockRejectedValueOnce({
          code: 429,
          message: 'Rate Limit Exceeded',
        })
        .mockResolvedValueOnce({
          messages: [{ id: 'msg1' }],
          nextPageToken: undefined,
        });

      const startTime = Date.now();
      await manager.startInitialSync(30);
      const endTime = Date.now();

      // Should have retried with backoff delay
      expect(endTime - startTime).toBeGreaterThan(50); // At least some delay for test
      expect(mockGmailClient.listMessages).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff for retries', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      const delays: number[] = [];
      let lastCallTime = 0;

      mockGmailClient.listMessages.mockImplementation(async () => {
        const now = Date.now();
        if (lastCallTime > 0) {
          delays.push(now - lastCallTime);
        }
        lastCallTime = now;

        // Fail twice, then succeed
        const callCount = mockGmailClient.listMessages?.mock?.calls?.length || 0;
        if (callCount < 3) {
          throw { code: 429, message: 'Rate Limit Exceeded' };
        }
        return {
          messages: [{ id: 'msg1' }],
          nextPageToken: undefined,
        };
      });

      await manager.startInitialSync(30);

      // Verify exponential backoff (each delay should be larger than the last)
      expect(delays.length).toBeGreaterThanOrEqual(2);
      expect(delays[1]).toBeGreaterThan(delays[0]);
    });

    it('should fail after max retries on rate limit', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      // Always fail with rate limit
      mockGmailClient.listMessages.mockRejectedValue({
        code: 429,
        message: 'Rate Limit Exceeded',
      });

      // With 1000ms base backoff and 5 retries, total time is ~15 seconds
      await expect(manager.startInitialSync(30)).rejects.toThrow(/rate limit/i);
    }, 20000); // 20 second timeout for retry tests
  });

  describe('Network Interruption Recovery', () => {
    it('should recover from network interruption', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      // First call fails with network error
      mockGmailClient.listMessages
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          messages: [{ id: 'msg1' }],
          nextPageToken: undefined,
        });

      await manager.startInitialSync(30);

      expect(mockGmailClient.listMessages).toHaveBeenCalledTimes(2);
    });

    it('should resume sync from last successful point', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      // Process first batch successfully
      mockGmailClient.listMessages.mockResolvedValueOnce({
        messages: [{ id: 'msg1' }],
        nextPageToken: 'token-1',
      });

      await manager.startInitialSync(30);

      // Simulate network interruption during second page
      mockGmailClient.listMessages.mockRejectedValueOnce(new Error('Network error'));

      // Get checkpoint before failure
      const checkpoint = manager.getCheckpoint();

      // Resume from checkpoint
      mockGmailClient.listMessages.mockResolvedValueOnce({
        messages: [{ id: 'msg2' }],
        nextPageToken: undefined,
      });

      await manager.resumeFromCheckpoint(checkpoint);

      // Should have resumed from the last known page token
      expect(mockGmailClient.listMessages).toHaveBeenLastCalledWith(
        expect.objectContaining({ pageToken: 'token-1' })
      );
    });

    it('should save progress periodically for recovery', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      mockGmailClient.listMessages.mockResolvedValue({
        messages: [{ id: 'msg1' }],
        nextPageToken: undefined,
      });

      await manager.startInitialSync(30);

      // Get saved progress
      const savedProgress = await manager.getSavedProgress();

      expect(savedProgress).toBeDefined();
      expect(savedProgress?.processed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Email Processing', () => {
    it('should process a single email and extract metadata', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'email-1',
        threadId: 'thread-1',
        snippet: 'This is a test email',
        internalDate: Date.now().toString(),
        payload: {
          headers: [
            { name: 'From', value: 'John Doe <john@example.com>' },
            { name: 'Subject', value: 'Test Subject' },
          ],
        },
      });

      const email = await manager.processEmail('email-1');

      expect(email).toEqual({
        id: 'email-1',
        threadId: 'thread-1',
        senderEmail: 'John Doe <john@example.com>',
        senderName: 'John Doe',
        senderDomain: 'example.com',
        subject: 'Test Subject',
        snippet: 'This is a test email',
        receivedAt: expect.any(Date),
      });
    });

    it('should handle emails with missing headers gracefully', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'email-2',
        threadId: 'thread-2',
        snippet: 'Minimal email',
        internalDate: Date.now().toString(),
        payload: {
          headers: [],
        },
      });

      const email = await manager.processEmail('email-2');

      expect(email).toEqual({
        id: 'email-2',
        threadId: 'thread-2',
        senderEmail: '',
        senderName: '',
        senderDomain: '',
        subject: null,
        snippet: 'Minimal email',
        receivedAt: expect.any(Date),
      });
    });

    it('should return null for non-existent email', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      (mockGmailClient.getMessage as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const email = await manager.processEmail('non-existent');

      expect(email).toBeNull();
    });
  });

  describe('Sync Control', () => {
    it('should stop sync operation', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      await manager.startInitialSync(30);
      expect(manager.getProgress().isRunning).toBe(true);

      manager.stop();
      expect(manager.getProgress().isRunning).toBe(false);
    });

    it('should pause and resume sync', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      await manager.startInitialSync(30);
      expect(manager.getProgress().isRunning).toBe(true);

      await manager.pause();
      expect(manager.getProgress().isPaused).toBe(true);

      await manager.resume();
      expect(manager.getProgress().isPaused).toBe(false);
      expect(manager.getProgress().isRunning).toBe(true);
    });
  });

  describe('Sync State Persistence', () => {
    it('should persist sync state across restart', async () => {
      const store = createStore();
      const manager = new GmailSyncManager(mockGmailClient, undefined, store as any);

      await manager.startInitialSync(30);
      const stateBefore = await manager.getSyncState();

      // Simulate restart — same store instance carries the saved data
      const newManager = new GmailSyncManager(mockGmailClient, undefined, store as any);
      // Load persisted state from store
      await newManager.initialize();
      const stateAfter = await newManager.getSyncState();

      expect(stateAfter.historyId).toBe(stateBefore.historyId);
      expect(stateAfter.lastFullSync).toEqual(stateBefore.lastFullSync);
    });

    it('should track total emails processed', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, createStore() as any);

      await manager.startInitialSync(30);

      const state = await manager.getSyncState();
      expect(state.totalEmailsProcessed).toBeGreaterThanOrEqual(0);
    });
  });
});
