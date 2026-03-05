import type { JobQueue } from './queue';
import type { Job, JobType } from './types';

export interface JobHandler {
  (job: Job): Promise<Record<string, unknown>>;
}

export interface JobRunnerConfig {
  pollIntervalMs?: number;
  maxConcurrentJobs?: number;
}

export class JobRunner {
  private queue: JobQueue;
  private handlers: Map<JobType, JobHandler> = new Map();
  private running = false;
  private paused = false;
  private pollIntervalMs: number;
  private maxConcurrentJobs: number;
  private activeJobs = 0;
  private pollTimeout?: ReturnType<typeof setTimeout>;

  constructor(queue: JobQueue, config: JobRunnerConfig = {}) {
    this.queue = queue;
    this.pollIntervalMs = config.pollIntervalMs ?? 100;
    this.maxConcurrentJobs = config.maxConcurrentJobs ?? 3;
  }

  registerHandler(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = undefined;
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  private poll(): void {
    if (!this.running) return;

    this.pollTimeout = setTimeout(async () => {
      if (!this.paused && this.activeJobs < this.maxConcurrentJobs) {
        await this.processNextJob();
      }
      this.poll();
    }, this.pollIntervalMs);
  }

  private async processNextJob(): Promise<void> {
    const job = await this.queue.getNextJob();
    if (!job) return;

    this.activeJobs++;

    try {
      // Mark as running
      await this.queue.updateJobStatus(job.id, 'running');

      // Get handler
      const handler = this.handlers.get(job.type);
      if (!handler) {
        await this.queue.updateJobStatus(job.id, 'failed', {
          error: `No handler registered for job type: ${job.type}`,
        });
        return;
      }

      // Execute handler
      const result = await handler(job);

      // Mark as completed
      await this.queue.updateJobStatus(job.id, 'completed', { result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Mark as failed
      await this.queue.updateJobStatus(job.id, 'failed', {
        error: errorMessage,
        errorStack,
      });

      // Only schedule retry if retries are available
      if (job.maxRetries > 0) {
        await this.queue.scheduleRetry(job.id);
      }
    } finally {
      this.activeJobs--;
    }
  }
}
