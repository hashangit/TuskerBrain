import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UtilityWorker, NotImplementedError } from '@electron/utility/worker';

describe('UtilityWorker', () => {
  let worker: UtilityWorker;

  beforeEach(() => {
    worker = new UtilityWorker();
  });

  afterEach(() => {
    worker.stop();
  });

  describe('Initialization', () => {
    it('should initialize worker with default state', () => {
      const status = worker.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.jobCount).toBe(0);
    });

    it('should start worker process', async () => {
      await worker.start();

      const status = worker.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should stop worker process gracefully', async () => {
      await worker.start();
      worker.stop();

      const status = worker.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe('Job Management', () => {
    it('should accept jobs via IPC', async () => {
      const onJob = vi.fn();
      worker.on('job:received', onJob);

      await worker.start();
      await worker.handleJob({ type: 'test', payload: { emailId: '123' } });

      expect(onJob).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'test' })
      );
    });

    it('should track active job count', async () => {
      await worker.start();

      await worker.handleJob({ type: 'test', payload: { emailId: '1' } });
      await worker.handleJob({ type: 'test', payload: { emailId: '2' } });

      const status = worker.getStatus();
      expect(status.jobCount).toBe(2);
      expect(status.completedCount).toBe(2);
    });

    it('should emit job:completed when job finishes', async () => {
      const onCompleted = vi.fn();
      worker.on('job:completed', onCompleted);

      await worker.start();
      await worker.handleJob({ type: 'test', payload: {} });

      expect(onCompleted).toHaveBeenCalled();
    });

    it('should throw NotImplementedError for email_process (deferred to v2)', async () => {
      const onError = vi.fn();
      worker.on('job:error', onError);

      await worker.start();
      await worker.handleJob({ type: 'email_process', payload: { emailId: '123' } });

      const status = worker.getStatus();
      expect(status.errorCount).toBe(1);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('not implemented'),
        })
      );
    });
  });

  describe('IPC Communication', () => {
    it('should send status updates to main process', async () => {
      const sendSpy = vi.spyOn(process, 'send');

      await worker.start();
      worker.sendStatusUpdate();

      expect(sendSpy).toHaveBeenCalled();
    });

    it('should handle pause command from main process', async () => {
      await worker.start();

      worker.handleCommand('pause');

      const status = worker.getStatus();
      expect(status.isPaused).toBe(true);
    });

    it('should handle resume command from main process', async () => {
      await worker.start();
      worker.handleCommand('pause');
      worker.handleCommand('resume');

      const status = worker.getStatus();
      expect(status.isPaused).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle job errors gracefully', async () => {
      const onError = vi.fn();
      worker.on('job:error', onError);

      await worker.start();
      await worker.handleJob({ type: 'failing_job', payload: { shouldFail: true } });

      const status = worker.getStatus();
      expect(status.errorCount).toBe(1);
    });

    it('should report errors to main process', async () => {
      const sendSpy = vi.spyOn(process, 'send');

      await worker.start();
      await worker.handleJob({ type: 'failing_job', payload: { shouldFail: true } });

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'job:error' })
      );
    });
  });
});
