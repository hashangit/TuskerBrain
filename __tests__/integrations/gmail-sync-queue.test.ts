import { describe, it, expect, beforeEach } from 'vitest';
import { GmailSyncManager } from '@core/gmail/sync';
import { JobQueue } from '@core/jobs/queue';
import { MockGmailClient } from '../mocks/gmail-client';

describe('GmailSyncManager → JobQueue Integration', () => {
  let syncManager: GmailSyncManager;
  let jobQueue: JobQueue;
  let mockClient: MockGmailClient;

  beforeEach(() => {
    mockClient = new MockGmailClient();
    jobQueue = new JobQueue();
    // GmailSyncManager should accept JobQueue as second parameter
    syncManager = new GmailSyncManager(mockClient as any, jobQueue);
  });

  it('should create jobs for fetched emails', async () => {
    mockClient.seedEmails([
      { id: 'email-1', subject: 'Test 1' },
      { id: 'email-2', subject: 'Test 2' },
    ]);

    await syncManager.fetchAndQueueEmails();

    const stats = await jobQueue.getStats();
    expect(stats.pending).toBe(2);
  });

  it('should not create duplicate jobs for same email', async () => {
    mockClient.seedEmails([{ id: 'email-1', subject: 'Test' }]);

    await syncManager.fetchAndQueueEmails();
    await syncManager.fetchAndQueueEmails(); // Call twice

    const stats = await jobQueue.getStats();
    expect(stats.pending).toBe(1); // Still only 1 job due to deduplication
  });

  it('should create email_process type jobs with correct emailId', async () => {
    mockClient.seedEmails([{ id: 'email-xyz', subject: 'Test' }]);

    await syncManager.fetchAndQueueEmails();

    const jobs = await jobQueue.getJobsByEmailId('email-xyz');
    expect(jobs.length).toBe(1);
    expect(jobs[0].type).toBe('email_process');
    expect(jobs[0].emailId).toBe('email-xyz');
  });

  it('should return count of queued emails', async () => {
    mockClient.seedEmails([
      { id: 'email-1', subject: 'Test 1' },
      { id: 'email-2', subject: 'Test 2' },
      { id: 'email-3', subject: 'Test 3' },
    ]);

    const count = await syncManager.fetchAndQueueEmails();

    expect(count).toBe(3);
  });
});
