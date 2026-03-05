import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobScheduler } from '@electron/utility/scheduler';

describe('JobScheduler', () => {
  let scheduler: JobScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new JobScheduler();
  });

  afterEach(() => {
    scheduler.stopAll();
    vi.useRealTimers();
  });

  describe('Scheduling Jobs', () => {
    it('should schedule a job to run at interval', () => {
      const callback = vi.fn();

      scheduler.schedule('sync-emails', callback, { intervalMs: 60000 });

      // Fast-forward 1 minute
      vi.advanceTimersByTime(60000);
      expect(callback).toHaveBeenCalledTimes(1);

      // Fast-forward another minute
      vi.advanceTimersByTime(60000);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should schedule a one-time job', () => {
      const callback = vi.fn();

      scheduler.scheduleOnce('backfill', callback, { delayMs: 5000 });

      vi.advanceTimersByTime(5000);
      expect(callback).toHaveBeenCalledTimes(1);

      // Should not run again
      vi.advanceTimersByTime(5000);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should allow stopping a scheduled job', () => {
      const callback = vi.fn();

      scheduler.schedule('sync-emails', callback, { intervalMs: 60000 });
      vi.advanceTimersByTime(60000);
      expect(callback).toHaveBeenCalledTimes(1);

      scheduler.stop('sync-emails');

      vi.advanceTimersByTime(60000);
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it('should stop all scheduled jobs', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      scheduler.schedule('job1', callback1, { intervalMs: 1000 });
      scheduler.schedule('job2', callback2, { intervalMs: 2000 });

      vi.advanceTimersByTime(2000);
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();

      scheduler.stopAll();

      vi.advanceTimersByTime(2000);
      expect(callback1).toHaveBeenCalledTimes(2); // Was called twice before stopAll
      expect(callback2).toHaveBeenCalledTimes(1); // Was called once before stopAll
    });
  });

  describe('Job Configuration', () => {
    it('should update interval for existing job', () => {
      const callback = vi.fn();

      scheduler.schedule('sync-emails', callback, { intervalMs: 60000 });
      vi.advanceTimersByTime(60000);
      expect(callback).toHaveBeenCalledTimes(1);

      scheduler.updateInterval('sync-emails', 30000);

      vi.advanceTimersByTime(30000);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should get next run time for scheduled job', () => {
      const callback = vi.fn();
      const now = Date.now();

      scheduler.schedule('sync-emails', callback, { intervalMs: 60000 });

      const nextRun = scheduler.getNextRunTime('sync-emails');
      expect(nextRun).not.toBeNull();
      // Should be approximately 60 seconds from now
      const expectedTime = new Date(now + 60000);
      expect(Math.abs(nextRun!.getTime() - expectedTime.getTime())).toBeLessThan(100);
    });

    it('should list all scheduled jobs', () => {
      const callback = vi.fn();

      scheduler.schedule('job1', callback, { intervalMs: 1000 });
      scheduler.schedule('job2', callback, { intervalMs: 2000 });

      const jobs = scheduler.getScheduledJobs();
      expect(jobs).toContain('job1');
      expect(jobs).toContain('job2');
    });
  });

  describe('Error Handling', () => {
    it('should handle callback errors gracefully', async () => {
      const errorCallback = vi.fn().mockRejectedValue(new Error('Job failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      scheduler.schedule('failing-job', errorCallback, { intervalMs: 1000 });

      vi.advanceTimersByTime(1000);
      await Promise.resolve(); // Allow promise to settle

      expect(errorCallback).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should continue scheduling after error', async () => {
      let callCount = 0;
      const flakyCallback = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('First call fails');
        return Promise.resolve();
      });

      scheduler.schedule('flaky-job', flakyCallback, { intervalMs: 1000 });

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(flakyCallback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(flakyCallback).toHaveBeenCalledTimes(2);
    });
  });
});
