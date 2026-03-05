import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JobQueue } from '@core/jobs/queue';
import type { Job, JobType, JobStatus } from '@core/jobs/types';

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
});
