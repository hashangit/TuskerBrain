import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JobQueue } from '@core/jobs/queue';
import { AuditLogger } from '@core/jobs/audit';

describe('Job Queue', () => {
  let jobQueue: JobQueue;

  beforeEach(() => {
    jobQueue = new JobQueue();
  });

  afterEach(async () => {
    await jobQueue.close();
  });

  describe('Job Creation', () => {
    it('should create a job with pending status', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-email-123' },
      });

      expect(job.id).toBeDefined();
      expect(job.type).toBe('email_process');
      expect(job.status).toBe('pending');
      expect(job.payload).toEqual({ emailId: 'test-email-123' });
    });

    it('should create job with email reference', async () => {
      const job = await jobQueue.createJob({
        type: 'email_archive',
        payload: { emailId: 'test-email-456' },
        emailId: 'test-email-456',
      });

      expect(job.emailId).toBe('test-email-456');
    });

    it('should set default max retries to 3', async () => {
      const job = await jobQueue.createJob({
        type: 'email_delete',
        payload: { emailId: 'test-email-789' },
      });

      expect(job.maxRetries).toBe(3);
    });
  });

  describe('Job Retrieval', () => {
    it('should get next pending job', async () => {
      await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });
      await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-2' },
      });

      const nextJob = await jobQueue.getNextJob();

      expect(nextJob).toBeDefined();
      expect(nextJob?.status).toBe('pending');
    });

    it('should return null when no pending jobs', async () => {
      const nextJob = await jobQueue.getNextJob();
      expect(nextJob).toBeNull();
    });

    it('should get job by id', async () => {
      const created = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      const retrieved = await jobQueue.getJob(created.id);

      expect(retrieved).toEqual(created);
    });
  });

  describe('Job Status Updates', () => {
    it('should mark job as running', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');

      const updated = await jobQueue.getJob(job.id);
      expect(updated?.status).toBe('running');
      expect(updated?.startedAt).toBeDefined();
    });

    it('should mark job as completed with result', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'completed', {
        result: { classified: 'updates' },
      });

      const updated = await jobQueue.getJob(job.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.result).toEqual({ classified: 'updates' });
      expect(updated?.completedAt).toBeDefined();
    });

    it('should mark job as failed with error', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'failed', {
        error: 'API rate limit exceeded',
        errorStack: 'Error: API rate limit...',
      });

      const updated = await jobQueue.getJob(job.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toBe('API rate limit exceeded');
    });

    it('should increment retry count and mark as retrying', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'failed', {
        error: 'Temporary error',
      });
      await jobQueue.scheduleRetry(job.id);

      const updated = await jobQueue.getJob(job.id);
      expect(updated?.status).toBe('pending');
      expect(updated?.retryCount).toBe(1);
    });

    it('should mark job as dead after max retries', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
        maxRetries: 2,
      });

      // First failure
      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'Error 1' });
      await jobQueue.scheduleRetry(job.id);

      // Second failure
      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'Error 2' });
      await jobQueue.scheduleRetry(job.id);

      const updated = await jobQueue.getJob(job.id);
      expect(updated?.status).toBe('dead');
      expect(updated?.retryCount).toBe(2);
    });
  });

  describe('Job Statistics', () => {
    it('should get queue stats', async () => {
      await jobQueue.createJob({ type: 'email_process', payload: {} });
      await jobQueue.createJob({ type: 'email_archive', payload: {} });
      const job3 = await jobQueue.createJob({ type: 'email_process', payload: {} });

      await jobQueue.updateJobStatus(job3.id, 'running');

      const stats = await jobQueue.getStats();

      expect(stats.pending).toBe(2);
      expect(stats.running).toBe(1);
      expect(stats.total).toBe(3);
    });
  });

  describe('Job Control (Pause/Resume)', () => {
    it('should start with processing not paused', () => {
      expect(jobQueue.isPaused()).toBe(false);
    });

    it('should pause job processing', async () => {
      await jobQueue.pauseProcessing();

      expect(jobQueue.isPaused()).toBe(true);
    });

    it('should resume job processing', async () => {
      await jobQueue.pauseProcessing();
      await jobQueue.resumeProcessing();

      expect(jobQueue.isPaused()).toBe(false);
    });

    it('should handle multiple pause calls', async () => {
      await jobQueue.pauseProcessing();
      await jobQueue.pauseProcessing();

      expect(jobQueue.isPaused()).toBe(true);

      await jobQueue.resumeProcessing();
      expect(jobQueue.isPaused()).toBe(false);
    });

    it('should return null from getNextJob when processing is paused', async () => {
      // Create a pending job
      await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      // Verify job is available when not paused
      const jobBeforePause = await jobQueue.getNextJob();
      expect(jobBeforePause).toBeDefined();
      expect(jobBeforePause?.status).toBe('pending');

      // Pause processing
      await jobQueue.pauseProcessing();

      // getNextJob should return null when paused
      const jobWhilePaused = await jobQueue.getNextJob();
      expect(jobWhilePaused).toBeNull();

      // Resume processing
      await jobQueue.resumeProcessing();

      // getNextJob should return the job again after resume
      const jobAfterResume = await jobQueue.getNextJob();
      expect(jobAfterResume).toBeDefined();
      expect(jobAfterResume?.status).toBe('pending');
    });
  });

  describe('Audit Logging', () => {
    it('should return empty array when no audit logger is set', async () => {
      const entries = await jobQueue.getAuditLogForJob('job-123');

      expect(entries).toEqual([]);
    });

    it('should return audit entries for a job when audit logger is set', async () => {
      const auditLogger = new AuditLogger();
      jobQueue.setAuditLogger(auditLogger);

      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-email' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.updateJobStatus(job.id, 'completed');

      const entries = await jobQueue.getAuditLogForJob(job.id);

      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.jobId === job.id)).toBe(true);
    });

    it('should log token usage for a job', async () => {
      const auditLogger = new AuditLogger();
      jobQueue.setAuditLogger(auditLogger);

      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-email' },
      });

      await jobQueue.logTokenUsage(job.id, { inputTokens: 500, outputTokens: 200 });

      const entries = await jobQueue.getAuditLogForJob(job.id);
      const tokenEntry = entries.find((e) => e.action === 'token_usage');

      expect(tokenEntry).toBeDefined();
      expect(tokenEntry?.tokensUsed).toBe(700);
      expect(tokenEntry?.details?.inputTokens).toBe(500);
      expect(tokenEntry?.details?.outputTokens).toBe(200);
    });

    it('should handle logTokenUsage when no audit logger is set', async () => {
      // Should not throw
      await jobQueue.logTokenUsage('job-123', { inputTokens: 100, outputTokens: 50 });
    });
  });

  describe('Job Deduplication', () => {
    it('should not create duplicate jobs for same email and type', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      // Should return the same job, not create a duplicate
      expect(job2.id).toBe(job1.id);

      const stats = await jobQueue.getStats();
      expect(stats.total).toBe(1);
    });

    it('should create jobs for different emails', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
        emailId: 'email-1',
      });

      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-2' },
        emailId: 'email-2',
      });

      expect(job1.id).not.toBe(job2.id);

      const stats = await jobQueue.getStats();
      expect(stats.total).toBe(2);
    });

    it('should create jobs for same email but different types', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      const job2 = await jobQueue.createJob({
        type: 'email_archive',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      expect(job1.id).not.toBe(job2.id);
      expect(job1.type).toBe('email_process');
      expect(job2.type).toBe('email_archive');

      const stats = await jobQueue.getStats();
      expect(stats.total).toBe(2);
    });

    it('should allow new job after existing one is completed', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      // Mark the first job as completed
      await jobQueue.updateJobStatus(job1.id, 'completed');

      // Now a new job for the same email should be allowed
      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      expect(job2.id).not.toBe(job1.id);
      expect(job2.status).toBe('pending');
    });

    it('should allow new job after existing one is dead', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      // Mark the first job as dead
      await jobQueue.updateJobStatus(job1.id, 'dead');

      // Now a new job for the same email should be allowed
      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      expect(job2.id).not.toBe(job1.id);
      expect(job2.status).toBe('pending');
    });

    it('should deduplicate against running jobs', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      // Mark as running
      await jobQueue.updateJobStatus(job1.id, 'running');

      // Should still deduplicate against running jobs
      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-123' },
        emailId: 'email-123',
      });

      expect(job2.id).toBe(job1.id);
    });

    it('should not deduplicate jobs without emailId', async () => {
      const job1 = await jobQueue.createJob({
        type: 'email_process',
        payload: { data: 'test' },
      });

      const job2 = await jobQueue.createJob({
        type: 'email_process',
        payload: { data: 'test' },
      });

      // Without emailId, no deduplication happens
      expect(job1.id).not.toBe(job2.id);
    });
  });

  describe('Job Cleanup', () => {
    it('should delete completed jobs older than retention period', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'completed');

      // Manually set completedAt to 8 days ago (past 7-day retention)
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const jobWithOldDate = await jobQueue.getJob(job.id);
      if (jobWithOldDate) {
        // Access internal jobs map to modify completedAt
        (jobQueue as unknown as { jobs: Map<string, typeof jobWithOldDate> }).jobs.set(job.id, {
          ...jobWithOldDate,
          completedAt: oldDate,
        });
      }

      const deletedCount = await jobQueue.cleanupOldJobs();

      expect(deletedCount).toBe(1);
      const retrieved = await jobQueue.getJob(job.id);
      expect(retrieved).toBeNull();
    });

    it('should not delete jobs within retention period', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'completed');

      const deletedCount = await jobQueue.cleanupOldJobs();

      expect(deletedCount).toBe(0);
      const retrieved = await jobQueue.getJob(job.id);
      expect(retrieved).not.toBeNull();
    });

    it('should delete dead jobs older than retention period', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'dead');

      // Manually set completedAt to 10 days ago
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const jobWithOldDate = await jobQueue.getJob(job.id);
      if (jobWithOldDate) {
        (jobQueue as unknown as { jobs: Map<string, typeof jobWithOldDate> }).jobs.set(job.id, {
          ...jobWithOldDate,
          completedAt: oldDate,
        });
      }

      const deletedCount = await jobQueue.cleanupOldJobs();

      expect(deletedCount).toBe(1);
    });

    it('should not delete pending jobs even if old', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      // Even with an old createdAt, pending jobs should not be deleted
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const jobWithOldDate = await jobQueue.getJob(job.id);
      if (jobWithOldDate) {
        (jobQueue as unknown as { jobs: Map<string, typeof jobWithOldDate> }).jobs.set(job.id, {
          ...jobWithOldDate,
          createdAt: oldDate,
        });
      }

      const deletedCount = await jobQueue.cleanupOldJobs();

      expect(deletedCount).toBe(0);
      const retrieved = await jobQueue.getJob(job.id);
      expect(retrieved).not.toBeNull();
    });

    it('should not delete running jobs even if old', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');

      // Set startedAt to old date
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const jobWithOldDate = await jobQueue.getJob(job.id);
      if (jobWithOldDate) {
        (jobQueue as unknown as { jobs: Map<string, typeof jobWithOldDate> }).jobs.set(job.id, {
          ...jobWithOldDate,
          startedAt: oldDate,
        });
      }

      const deletedCount = await jobQueue.cleanupOldJobs();

      expect(deletedCount).toBe(0);
    });

    it('should delete multiple old jobs and return correct count', async () => {
      // Create and complete 3 old jobs
      for (let i = 0; i < 3; i++) {
        const job = await jobQueue.createJob({
          type: 'email_process',
          payload: { emailId: `email-${i}` },
          emailId: `email-${i}`,
        });
        await jobQueue.updateJobStatus(job.id, 'completed');

        const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        const jobWithOldDate = await jobQueue.getJob(job.id);
        if (jobWithOldDate) {
          (jobQueue as unknown as { jobs: Map<string, typeof jobWithOldDate> }).jobs.set(job.id, {
            ...jobWithOldDate,
            completedAt: oldDate,
          });
        }
      }

      // Create 2 recent completed jobs (should not be deleted)
      for (let i = 3; i < 5; i++) {
        const job = await jobQueue.createJob({
          type: 'email_process',
          payload: { emailId: `email-${i}` },
          emailId: `email-${i}`,
        });
        await jobQueue.updateJobStatus(job.id, 'completed');
      }

      const deletedCount = await jobQueue.cleanupOldJobs();

      expect(deletedCount).toBe(3);
      const stats = await jobQueue.getStats();
      expect(stats.completed).toBe(2); // Only recent jobs remain
    });
  });
});
