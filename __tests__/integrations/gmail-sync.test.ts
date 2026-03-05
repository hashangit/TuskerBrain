import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Email } from '@core/types/email';
import { GmailSyncManager } from '@core/gmail/sync';

describe('GmailSyncManager', () => {
  const mockGmailClient = {
    listMessages: vi.fn(),
    getMessage: vi.fn(),
    modifyMessage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default mock return values
    mockGmailClient.listMessages.mockResolvedValue({
      messages: [{ id: 'msg1' }, { id: 'msg2' }],
      nextPageToken: undefined,
    });
  });

  describe('Initial Sync', () => {
    it('should perform initial sync with lookback period', async () => {
      const manager = new GmailSyncManager(mockGmailClient as any);

      // Start initial sync
      await manager.startInitialSync(30);

      expect(mockGmailClient.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ maxResults: 100 })
      );
      expect(manager.getProgress()).toEqual({
        isRunning: true,
        total: 2,
        processed: 0,
        failed: 0,
      });
    });

    it('should create backfill jobs for each day', async () => {
      const manager = new GmailSyncManager(mockGmailClient as any);

      // Start with 30 days lookback
      await manager.startInitialSync(30);

      // Check that backfill jobs were created
      const jobs = await manager.getBackfillJobs();

      expect(jobs.length).toBe(30);
      expect(jobs[0]).toMatchObject({
        type: 'backfill_day',
        status: 'pending',
      });
    });

    it('should track sync progress', async () => {
      const manager = new GmailSyncManager(mockGmailClient as any);

      await manager.startInitialSync(30);

      const progress = manager.getProgress();

      expect(progress.total).toBe(2);
      expect(progress.isRunning).toBe(true);
    });
  });

  describe('Incremental Sync', () => {
    it('should perform incremental sync when history ID available', async () => {
      const manager = new GmailSyncManager(mockGmailClient as any);

      mockGmailClient.listMessages.mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      });

      await manager.startIncrementalSync('history-123');

      expect(mockGmailClient.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ maxResults: 100 })
      );
    });
  });

  describe('Email Processing', () => {
    it('should process a single email and extract metadata', async () => {
      const manager = new GmailSyncManager(mockGmailClient as any);

      mockGmailClient.getMessage.mockResolvedValue({
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
      const manager = new GmailSyncManager(mockGmailClient as any);

      mockGmailClient.getMessage.mockResolvedValue({
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
      const manager = new GmailSyncManager(mockGmailClient as any);

      mockGmailClient.getMessage.mockResolvedValue(null);

      const email = await manager.processEmail('non-existent');

      expect(email).toBeNull();
    });
  });

  describe('Sync Control', () => {
    it('should stop sync operation', async () => {
      const manager = new GmailSyncManager(mockGmailClient as any);

      await manager.startInitialSync(30);
      expect(manager.getProgress().isRunning).toBe(true);

      manager.stop();
      expect(manager.getProgress().isRunning).toBe(false);
    });
  });
});
