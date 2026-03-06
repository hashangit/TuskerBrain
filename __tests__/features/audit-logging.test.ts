import { describe, it, expect, beforeEach } from 'vitest';
import { JobQueue } from '@core/jobs/queue';
import { AuditLogger } from '@core/jobs/audit';
import type { Job } from '@core/jobs/types';

/**
 * Design Spec Reference: Lines 1001-1011
 *
 * Audit Logging:
 * - Logs audit entry for each job execution
 * - Tracks tokens used per job
 * - Tracks job duration in audit log
 */
describe('Audit Logging', () => {
  let jobQueue: JobQueue;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    jobQueue = new JobQueue();
    auditLogger = new AuditLogger();
    // Connect the job queue to the audit logger
    jobQueue.setAuditLogger(auditLogger);
  });

  describe('Job Execution Logging', () => {
    it('should log audit entry when job starts', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');

      const entries = await auditLogger.getEntriesForJob(job.id);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].action).toMatch(/started|running/i);
    });

    it('should log audit entry when job completes', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.updateJobStatus(job.id, 'completed', {
        result: { classified: 'updates' },
      });

      const entries = await auditLogger.getEntriesForJob(job.id);
      const completeEntry = entries.find((e) => e.action === 'completed');
      expect(completeEntry).toBeDefined();
    });

    it('should log audit entry when job fails', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.updateJobStatus(job.id, 'failed', {
        error: 'API error',
      });

      const entries = await auditLogger.getEntriesForJob(job.id);
      const failEntry = entries.find((e) => e.action === 'failed');
      expect(failEntry).toBeDefined();
      expect(failEntry?.details?.error).toBe('API error');
    });
  });

  describe('Token Tracking', () => {
    it('should track tokens used per job', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');

      // Simulate LLM usage
      await auditLogger.logTokenUsage(job.id, {
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
      });

      await jobQueue.updateJobStatus(job.id, 'completed');

      const entries = await auditLogger.getEntriesForJob(job.id);
      const tokenEntry = entries.find((e) => e.action === 'token_usage');
      expect(tokenEntry?.tokensUsed).toBe(700);
    });

    it('should accumulate total tokens across jobs', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });
      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-2' },
      });

      await auditLogger.logTokenUsage(job1.id, { inputTokens: 300, outputTokens: 100, totalTokens: 400 });
      await auditLogger.logTokenUsage(job2.id, { inputTokens: 500, outputTokens: 200, totalTokens: 700 });

      const totalTokens = await auditLogger.getTotalTokensUsed();
      expect(totalTokens).toBe(1100);
    });

    it('should track tokens by provider', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1', provider: 'openai' },
      });

      await auditLogger.logTokenUsage(job.id, {
        inputTokens: 300,
        outputTokens: 100,
        totalTokens: 400,
        provider: 'openai',
      });

      const tokensByProvider = await auditLogger.getTokensByProvider('openai');
      expect(tokensByProvider).toBe(400);
    });
  });

  describe('Duration Tracking', () => {
    it('should track job duration in audit log', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      const startTime = Date.now();
      await jobQueue.updateJobStatus(job.id, 'running');

      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 100));

      await jobQueue.updateJobStatus(job.id, 'completed');

      const entries = await auditLogger.getEntriesForJob(job.id);
      const completeEntry = entries.find((e) => e.action === 'completed');
      expect(completeEntry?.durationMs).toBeDefined();
      expect(completeEntry?.durationMs).toBeGreaterThan(0);
    });

    it('should calculate average job duration by type', async () => {
      // Create multiple jobs of same type
      for (let i = 0; i < 3; i++) {
        const job = await jobQueue.createJob({
          type: 'email_process',
          payload: { emailId: `email-${i}` },
        });
        await jobQueue.updateJobStatus(job.id, 'running');
        await new Promise((resolve) => setTimeout(resolve, 50));
        await jobQueue.updateJobStatus(job.id, 'completed');
      }

      const avgDuration = await auditLogger.getAverageJobDuration('email_process');
      expect(avgDuration).toBeGreaterThan(0);
    });
  });

  describe('Audit Entry Details', () => {
    it('should include entity type and ID in audit entry', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
        emailId: 'email-1',
      });

      await jobQueue.updateJobStatus(job.id, 'completed');

      const entries = await auditLogger.getEntriesForJob(job.id);
      expect(entries[0].entityType).toBe('email');
      expect(entries[0].entityId).toBe('email-1');
    });

    it('should include job result in audit entry', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'completed', {
        result: {
          classification: 'updates',
          topic: 'Banking/Chase',
        },
      });

      const entries = await auditLogger.getEntriesForJob(job.id);
      const completeEntry = entries.find((e) => e.action === 'completed');
      expect(completeEntry?.details?.result).toEqual({
        classification: 'updates',
        topic: 'Banking/Chase',
      });
    });
  });

  describe('Audit Log Querying', () => {
    it('should get audit entries by date range', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });
      await jobQueue.updateJobStatus(job.id, 'completed');

      const today = new Date();
      const entries = await auditLogger.getEntriesByDateRange(today, today);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should get audit entries by action type', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });
      await jobQueue.updateJobStatus(job.id, 'completed');

      const entries = await auditLogger.getEntriesByAction('completed');
      expect(entries.every((e) => e.action === 'completed')).toBe(true);
    });

    it('should paginate audit log entries', async () => {
      // Create multiple jobs
      for (let i = 0; i < 25; i++) {
        const job = await jobQueue.createJob({
          type: 'email_process',
          payload: { emailId: `email-${i}` },
        });
        await jobQueue.updateJobStatus(job.id, 'completed');
      }

      const page1 = await auditLogger.getEntries({ limit: 10, offset: 0 });
      const page2 = await auditLogger.getEntries({ limit: 10, offset: 10 });

      expect(page1.length).toBe(10);
      expect(page2.length).toBe(10);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('Audit Log Retention', () => {
    it('should retain audit logs for configured period', async () => {
      const retentionDays = 90;
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });
      await jobQueue.updateJobStatus(job.id, 'completed');

      const oldEntry = await auditLogger.getEntriesForJob(job.id);
      expect(oldEntry.length).toBeGreaterThan(0);

      // Check retention policy
      const oldestEntry = await auditLogger.getOldestEntry();
      const daysSinceOldest = Math.floor(
        (Date.now() - oldestEntry.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysSinceOldest).toBeLessThanOrEqual(retentionDays);
    });

    it('should purge audit logs older than retention period', async () => {
      // Set short retention for test
      await auditLogger.setRetentionDays(1);

      // Create old entry
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });
      await jobQueue.updateJobStatus(job.id, 'completed');

      // Manually age the entry (simulate time passing)
      await auditLogger.simulateAging(2); // 2 days

      await auditLogger.purgeOldEntries();

      const entries = await auditLogger.getEntriesForJob(job.id);
      expect(entries.length).toBe(0);
    });
  });
});
