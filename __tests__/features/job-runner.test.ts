import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobQueue } from '@domain/jobs/queue';
import { JobRunner } from '@domain/jobs/runner';
import type { JobHandler, JobRunnerConfig } from '@domain/jobs/runner';

describe('Job Runner', () => {
  let jobQueue: JobQueue;
  let jobRunner: JobRunner;

  beforeEach(() => {
    jobQueue = new JobQueue();
  });

  afterEach(async () => {
    if (jobRunner) {
      await jobRunner.stop();
    }
    await jobQueue.close();
  });

  describe('Runner Initialization', () => {
    it('should create runner with default config', async () => {
      jobRunner = new JobRunner(jobQueue, {});
      expect(jobRunner.isRunning()).toBe(false);
    });

    it('should create runner with custom config', async () => {
      const config: JobRunnerConfig = {
        pollIntervalMs: 1000,
        maxConcurrentJobs: 5,
      };
      jobRunner = new JobRunner(jobQueue, config);
      expect(jobRunner.isRunning()).toBe(false);
    });
  });

  describe('Job Execution', () => {
    it('should start processing jobs when started', async () => {
      const handler: JobHandler = vi.fn().mockResolvedValue({ success: true });
      jobRunner = new JobRunner(jobQueue, { pollIntervalMs: 50 });
      jobRunner.registerHandler('email_process', handler);

      await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-1' },
      });

      await jobRunner.start();

      // Wait for job to be processed
      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalled();
      }, { timeout: 1000 });

      expect(jobRunner.isRunning()).toBe(true);
    });

    it('should execute job handler with job payload', async () => {
      const handler: JobHandler = vi.fn().mockResolvedValue({ processed: true });
      jobRunner = new JobRunner(jobQueue, { pollIntervalMs: 50 });
      jobRunner.registerHandler('email_archive', handler);

      const job = await jobQueue.createJob({
        type: 'email_archive',
        payload: { emailId: 'archive-1', reason: 'old' },
      });

      await jobRunner.start();

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({
            id: job.id,
            payload: { emailId: 'archive-1', reason: 'old' },
          })
        );
      }, { timeout: 1000 });
    });

    it('should mark job as completed after successful execution', async () => {
      const handler: JobHandler = vi.fn().mockResolvedValue({ result: 'done' });
      jobRunner = new JobRunner(jobQueue, { pollIntervalMs: 50 });
      jobRunner.registerHandler('email_process', handler);

      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-1' },
      });

      await jobRunner.start();

      await vi.waitFor(async () => {
        const updatedJob = await jobQueue.getJob(job.id);
        expect(updatedJob?.status).toBe('completed');
        expect(updatedJob?.result).toEqual({ result: 'done' });
      }, { timeout: 1000 });
    });

    it('should mark job as failed when handler throws', async () => {
      const handler: JobHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));
      jobRunner = new JobRunner(jobQueue, { pollIntervalMs: 50 });
      jobRunner.registerHandler('email_process', handler);

      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-1' },
        maxRetries: 0,
      });

      await jobRunner.start();

      await vi.waitFor(async () => {
        const updatedJob = await jobQueue.getJob(job.id);
        expect(updatedJob?.status).toBe('failed');
        expect(updatedJob?.error).toContain('Handler failed');
      }, { timeout: 1000 });
    });

    it('should schedule retry for failed jobs', async () => {
      const handler: JobHandler = vi.fn().mockRejectedValue(new Error('Temporary failure'));
      jobRunner = new JobRunner(jobQueue, { pollIntervalMs: 50 });
      jobRunner.registerHandler('email_process', handler);

      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-1' },
        maxRetries: 2,
      });

      await jobRunner.start();

      await vi.waitFor(async () => {
        const updatedJob = await jobQueue.getJob(job.id);
        // After first failure, should be pending for retry
        expect(updatedJob?.status).toBe('pending');
        expect(updatedJob?.retryCount).toBe(1);
      }, { timeout: 1000 });
    });
  });

  describe('Runner Control', () => {
    it('should stop processing when stopped', async () => {
      const handler: JobHandler = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({}), 1000))
      );
      jobRunner = new JobRunner(jobQueue, { pollIntervalMs: 50 });
      jobRunner.registerHandler('email_process', handler);

      await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-1' },
      });

      await jobRunner.start();
      await jobRunner.stop();

      expect(jobRunner.isRunning()).toBe(false);
    });

    it('should pause and resume job processing', async () => {
      const handler: JobHandler = vi.fn().mockResolvedValue({ success: true });
      jobRunner = new JobRunner(jobQueue, { pollIntervalMs: 50 });
      jobRunner.registerHandler('email_process', handler);

      await jobRunner.start();
      jobRunner.pause();

      await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-1' },
      });

      // Wait a bit to ensure no processing
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(handler).not.toHaveBeenCalled();

      jobRunner.resume();

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalled();
      }, { timeout: 1000 });
    });
  });

  describe('Multiple Job Handlers', () => {
    it('should route jobs to correct handlers by type', async () => {
      const processHandler: JobHandler = vi.fn().mockResolvedValue({ processed: true });
      const archiveHandler: JobHandler = vi.fn().mockResolvedValue({ archived: true });

      jobRunner = new JobRunner(jobQueue, { pollIntervalMs: 50 });
      jobRunner.registerHandler('email_process', processHandler);
      jobRunner.registerHandler('email_archive', archiveHandler);

      await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'process-1' },
      });
      await jobQueue.createJob({
        type: 'email_archive',
        payload: { emailId: 'archive-1' },
      });

      await jobRunner.start();

      await vi.waitFor(() => {
        expect(processHandler).toHaveBeenCalledTimes(1);
        expect(archiveHandler).toHaveBeenCalledTimes(1);
      }, { timeout: 1000 });
    });

    it('should throw error for unregistered job type', async () => {
      jobRunner = new JobRunner(jobQueue, { pollIntervalMs: 50 });

      await jobQueue.createJob({
        type: 'unknown_type' as any,
        payload: {},
      });

      await jobRunner.start();

      // Wait a moment for processing attempt
      await new Promise(resolve => setTimeout(resolve, 200));

      // Job should fail due to missing handler
      const failedJobs = await jobQueue.getJobsByStatus('failed');
      expect(failedJobs.length).toBeGreaterThan(0);
      expect(failedJobs[0].error).toContain('No handler registered');
    });
  });
});
