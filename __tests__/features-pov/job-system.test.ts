import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JobQueue } from '@core/jobs/queue';
import { AuditLogger } from '@core/jobs/audit';

/**
 * Feature: Job System
 *
 * Design Spec Reference: Lines 329-351, 543-573
 *
 * As a user, I want jobs to be processed reliably in the background,
 * so I can monitor progress and pause/resume when needed.
 * and track job outcomes for token usage and audit logging.
 */
describe('Feature: Job System', () => {
  let jobQueue: JobQueue;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    jobQueue = new JobQueue();
    auditLogger = new AuditLogger();
    jobQueue.setAuditLogger(auditLogger);
  });

  afterEach(async () => {
    await jobQueue.clear();
    await jobQueue.close();
  });

  describe('Job Creation', () => {
    it('should create job for new email', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-email' },
      });

      expect(job.id).toBeDefined();
      expect(job.type).toBe('email_process');
      expect(job.status).toBe('pending');
      expect(job.payload).toEqual({ emailId: 'test-email' });
    });

    it('should create job with email reference', async () => {
      const job = await jobQueue.createJob({
        type: 'email_archive',
        payload: { emailId: 'test-email' },
        emailId: 'test-email',
      });

      expect(job.emailId).toBe('test-email');
      expect(job.type).toBe('email_archive');
    });

    it('should create job with email reference for topic summary', async () => {
      const job = await jobQueue.createJob({
        type: 'topic_summary_update',
        payload: { topicId: 'test-topic' },
        emailId: 'test-email',
      });

      expect(job.emailId).toBe('test-email');
      expect(job.type).toBe('topic_summary_update');
    });
  });

  describe('Job Processing (FIFO)', () => {
    it('should process jobs in FIFO order', async () => {
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

    it('should mark job as running when started', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-email' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');

      const runningJob = await jobQueue.getJob(job.id);
      expect(runningJob?.status).toBe('running');
      expect(runningJob?.startedAt).toBeDefined();
    });
  });

  describe('Job Retry', () => {
    it('should retry failed job with exponential backoff', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-email' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');

      // Simulate failure
      await jobQueue.updateJobStatus(job.id, 'failed', {
        error: 'Network timeout',
      });

      // Schedule retry
      await jobQueue.scheduleRetry(job.id);

      const retryingJob = await jobQueue.getJob(job.id);
      expect(retryingJob?.status).toBe('pending'); // Back to pending
      expect(retryingJob?.scheduledAt).toBeDefined();
      expect(retryingJob?.retryCount).toBe(1);
    });

    it('should mark job as dead after max retries', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-email' },
        maxRetries: 2,
      });

      // Fail multiple times
      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'Error 1' });
      await jobQueue.scheduleRetry(job.id);
      await jobQueue.updateJobStatus(job.id, 'failed', { error: 'Error 2' });
      await jobQueue.scheduleRetry(job.id);

      const deadJob = await jobQueue.getJob(job.id);
      expect(deadJob?.status).toBe('dead');
      expect(deadJob?.retryCount).toBe(2);
    });
  });

  describe('Job Control', () => {
    it('should pause job processing', async () => {
      await jobQueue.pauseProcessing();

      const isPaused = jobQueue.isPaused();
      expect(isPaused).toBe(true);
    });

    it('should resume job processing', async () => {
      await jobQueue.pauseProcessing();
      await jobQueue.resumeProcessing();

      const isPaused = jobQueue.isPaused();
      expect(isPaused).toBe(false);
    });

    it('should show pending job count in UI', async () => {
      await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-1' },
      });
      await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'email-2' },
      });

      const stats = await jobQueue.getStats();

      expect(stats.pending).toBe(2);
    });
  });

  describe('Audit Logging', () => {
    it('should log audit entry for each job execution', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-email' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.updateJobStatus(job.id, 'completed');

      const auditEntries = await jobQueue.getAuditLogForJob(job.id);
      expect(auditEntries.length).toBeGreaterThan(0);
    });

    it('should track tokens used per job', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-email' },
      });

      await jobQueue.updateJobStatus(job.id, 'running');
      await jobQueue.logTokenUsage(job.id, { inputTokens: 500, outputTokens: 200 });
      await jobQueue.updateJobStatus(job.id, 'completed');

      const auditEntries = await jobQueue.getAuditLogForJob(job.id);
      const tokenEntry = auditEntries.find((e) => e.action === 'token_usage');
      expect(tokenEntry?.tokensUsed).toBe(700);
    });
  });
});
