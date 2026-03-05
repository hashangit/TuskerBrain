import { randomUUID } from 'crypto';

export interface ScheduleOptions {
  intervalMs: number;
  runImmediately?: boolean;
  maxRuns?: number;
}

export interface ScheduleOnceOptions {
  delayMs: number;
}

export interface ScheduledJob {
  id: string;
  name: string;
  intervalMs: number;
  maxRuns?: number;
  runsCompleted: number;
  nextRunAt: number;
  isActive: boolean;
}

type JobCallback = () => void | Promise<void>;

/**
 * JobScheduler handles periodic job execution in the utility process.
 */
export class JobScheduler {
  private jobs: Map<string, { job: ScheduledJob; callback: JobCallback; timer?: NodeJS.Timeout }> = new Map();
  private oneTimeJobs: Map<string, { name: string; callback: JobCallback; timer?: NodeJS.Timeout }> = new Map();
  private now = Date.now();

  /**
   * Set the current time (for testing).
   */
  setCurrentTime(time: number): void {
    this.now = time;
  }

  /**
   * Get the current time.
   */
  private getCurrentTime(): number {
    return this.now === Date.now() ? Date.now() : this.now;
  }

  /**
   * Schedule a job to run at specified interval.
   */
  schedule(name: string, callback: JobCallback, options: ScheduleOptions): string {
    const id = `schedule-${name}-${randomUUID().slice(0, 8)}`;

    const job: ScheduledJob = {
      id,
      name,
      intervalMs: options.intervalMs,
      maxRuns: options.maxRuns,
      runsCompleted: 0,
      nextRunAt: this.getCurrentTime() + options.intervalMs,
      isActive: true,
    };

    const timer = setInterval(async () => {
      await this.runJob(id);
    }, options.intervalMs);

    this.jobs.set(id, { job, callback, timer });

    // Run immediately if requested
    if (options.runImmediately) {
      this.runJob(id);
    }

    return id;
  }

  /**
   * Schedule a one-time job to run after delay.
   */
  scheduleOnce(name: string, callback: JobCallback, options: ScheduleOnceOptions): string {
    const id = `onetime-${name}-${randomUUID().slice(0, 8)}`;

    const timer = setTimeout(async () => {
      try {
        await callback();
      } catch (error) {
        console.error(`[JobScheduler] One-time job ${name} failed:`, error);
      } finally {
        this.oneTimeJobs.delete(id);
      }
    }, options.delayMs);

    this.oneTimeJobs.set(id, { name, callback, timer });
    return id;
  }

  /**
   * Run a specific job.
   */
  private async runJob(id: string): Promise<void> {
    const entry = this.jobs.get(id);
    if (!entry || !entry.job.isActive) return;

    const { job, callback } = entry;

    try {
      await callback();
    } catch (error) {
      console.error(`[JobScheduler] Job ${job.name} failed:`, error);
    } finally {
      job.runsCompleted++;
      job.nextRunAt = this.getCurrentTime() + job.intervalMs;

      // Check if max runs reached
      if (job.maxRuns !== undefined && job.runsCompleted >= job.maxRuns) {
        this.cancel(id);
      }
    }
  }

  /**
   * Cancel a scheduled job.
   */
  cancel(id: string): boolean {
    const entry = this.jobs.get(id);
    if (!entry) return false;

    if (entry.timer) {
      clearInterval(entry.timer);
    }
    entry.job.isActive = false;
    this.jobs.delete(id);
    return true;
  }

  /**
   * Stop a scheduled job (alias for cancel).
   */
  stop(name: string): boolean {
    // Find job by name
    for (const [id, entry] of this.jobs) {
      if (entry.job.name === name) {
        return this.cancel(id);
      }
    }
    return false;
  }

  /**
   * Pause a scheduled job.
   */
  pause(id: string): boolean {
    const entry = this.jobs.get(id);
    if (!entry) return false;

    if (entry.timer) {
      clearInterval(entry.timer);
      entry.timer = undefined;
    }
    entry.job.isActive = false;
    return true;
  }

  /**
   * Resume a paused job.
   */
  resume(id: string): boolean {
    const entry = this.jobs.get(id);
    if (!entry) return false;

    entry.timer = setInterval(async () => {
      await this.runJob(id);
    }, entry.job.intervalMs);
    entry.job.isActive = true;
    entry.job.nextRunAt = this.getCurrentTime() + entry.job.intervalMs;
    return true;
  }

  /**
   * Update interval for an existing job.
   */
  updateInterval(name: string, newIntervalMs: number): boolean {
    // Find job by name
    for (const [id, entry] of this.jobs) {
      if (entry.job.name === name) {
        // Clear existing timer
        if (entry.timer) {
          clearInterval(entry.timer);
        }

        // Update interval
        entry.job.intervalMs = newIntervalMs;
        entry.job.nextRunAt = this.getCurrentTime() + newIntervalMs;

        // Create new timer
        entry.timer = setInterval(async () => {
          await this.runJob(id);
        }, newIntervalMs);

        return true;
      }
    }
    return false;
  }

  /**
   * Get next run time for a scheduled job.
   */
  getNextRunTime(name: string): Date | null {
    for (const entry of this.jobs.values()) {
      if (entry.job.name === name) {
        return new Date(entry.job.nextRunAt);
      }
    }
    return null;
  }

  /**
   * Get all scheduled jobs.
   */
  getScheduledJobs(): string[] {
    return Array.from(this.jobs.values()).map(entry => entry.job.name);
  }

  /**
   * Get job status.
   */
  getJobStatus(id: string): ScheduledJob | null {
    const entry = this.jobs.get(id);
    return entry ? { ...entry.job } : null;
  }

  /**
   * Stop all scheduled jobs.
   */
  stopAll(): void {
    for (const id of this.jobs.keys()) {
      this.cancel(id);
    }
    for (const [id, entry] of this.oneTimeJobs) {
      if (entry.timer) {
        clearTimeout(entry.timer);
      }
      this.oneTimeJobs.delete(id);
    }
  }
}
