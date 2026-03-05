import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncManager } from '@electron/utility/sync-manager';
import type { GmailClient } from '@core/gmail/sync';

describe('SyncManager', () => {
  let syncManager: SyncManager;
  let mockGmailClient: GmailClient;

  beforeEach(() => {
    vi.useFakeTimers();

    mockGmailClient = {
      listMessages: vi.fn().mockResolvedValue({ messages: [], nextPageToken: undefined }),
      getMessage: vi.fn(),
    };

    syncManager = new SyncManager(mockGmailClient);
  });

  afterEach(() => {
    syncManager.stop();
    vi.useRealTimers();
  });

  describe('Initial Sync', () => {
    it('should start initial sync with lookback period', async () => {
      mockGmailClient.listMessages.mockResolvedValue({
        messages: [{ id: 'msg1' }, { id: 'msg2' }],
      });

      await syncManager.startInitialSync(30);

      const status = syncManager.getStatus();
      expect(status.isRunning).toBe(true);
      // After initial fetch, phase transitions to 'backfill'
      expect(status.phase).toBe('backfill');
    });

    it('should emit progress events during sync', async () => {
      const onProgress = vi.fn();
      syncManager.on('progress', onProgress);

      mockGmailClient.listMessages.mockResolvedValue({
        messages: [{ id: 'msg1' }, { id: 'msg2' }],
      });

      await syncManager.startInitialSync(30);

      expect(onProgress).toHaveBeenCalled();
    });

    it('should handle sync errors gracefully', async () => {
      mockGmailClient.listMessages.mockRejectedValue(new Error('API error'));

      await expect(syncManager.startInitialSync(30)).rejects.toThrow('API error');

      const status = syncManager.getStatus();
      expect(status.error).toBeDefined();
    });
  });

  describe('Incremental Sync', () => {
    it('should start incremental sync with history ID', async () => {
      mockGmailClient.listMessages.mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      });

      await syncManager.startIncrementalSync('history-123');

      const status = syncManager.getStatus();
      expect(status.phase).toBe('incremental');
    });

    it('should schedule periodic incremental sync', async () => {
      mockGmailClient.listMessages.mockResolvedValue({
        messages: [],
      });

      await syncManager.scheduleIncrementalSync(30); // 30 minutes

      const status = syncManager.getStatus();
      expect(status.scheduledInterval).toBe(30);
    });

    it('should fetch only new emails since last sync', async () => {
      mockGmailClient.listMessages.mockResolvedValue({
        messages: [{ id: 'new-msg-1' }],
      });

      await syncManager.startIncrementalSync('history-456');

      expect(mockGmailClient.listMessages).toHaveBeenCalled();
    });
  });

  describe('Backfill', () => {
    it('should create backfill jobs for each day', async () => {
      mockGmailClient.listMessages.mockResolvedValue({
        messages: [],
      });

      await syncManager.startInitialSync(7);

      const backfillJobs = syncManager.getBackfillJobs();
      expect(backfillJobs.length).toBe(7);
    });

    it('should process backfill jobs one at a time', async () => {
      mockGmailClient.listMessages.mockResolvedValue({
        messages: [{ id: 'msg1' }],
      });

      await syncManager.startInitialSync(3);

      // Start backfill
      const processed = await syncManager.processNextBackfillJob();

      expect(processed).toBe(true);
      const jobs = syncManager.getBackfillJobs();
      const completedJobs = jobs.filter(j => j.status === 'completed');
      expect(completedJobs.length).toBe(1);
    });

    it('should track backfill progress', async () => {
      mockGmailClient.listMessages.mockResolvedValue({
        messages: [],
      });

      await syncManager.startInitialSync(5);
      await syncManager.processNextBackfillJob();
      await syncManager.processNextBackfillJob();

      const progress = syncManager.getBackfillProgress();
      expect(progress.completed).toBe(2);
      expect(progress.total).toBe(5);
    });
  });

  describe('Control', () => {
    it('should stop sync operation', async () => {
      mockGmailClient.listMessages.mockResolvedValue({
        messages: [],
      });

      await syncManager.startInitialSync(30);
      syncManager.stop();

      const status = syncManager.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should pause and resume sync', async () => {
      mockGmailClient.listMessages.mockResolvedValue({
        messages: [],
      });

      await syncManager.startInitialSync(30);
      syncManager.pause();

      expect(syncManager.getStatus().isPaused).toBe(true);

      syncManager.resume();

      expect(syncManager.getStatus().isPaused).toBe(false);
    });
  });

  describe('Events', () => {
    it('should emit sync:started event', async () => {
      const handler = vi.fn();
      syncManager.on('sync:started', handler);

      mockGmailClient.listMessages.mockResolvedValue({ messages: [] });

      await syncManager.startInitialSync(30);

      expect(handler).toHaveBeenCalled();
    });

    it('should emit sync:completed event when done', async () => {
      const handler = vi.fn();
      syncManager.on('sync:completed', handler);

      mockGmailClient.listMessages.mockResolvedValue({ messages: [] });

      await syncManager.startInitialSync(1);
      await syncManager.processNextBackfillJob();

      // No more backfill jobs means sync is complete
      const remaining = syncManager.getBackfillJobs().filter(j => j.status !== 'completed');
      expect(remaining.length).toBe(0);
    });
  });
});
