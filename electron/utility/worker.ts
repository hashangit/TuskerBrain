import { JobScheduler } from './scheduler';
import { SyncManager } from './sync-manager';

export interface WorkerStatus {
  isRunning: boolean;
  isPaused: boolean;
  jobCount: number;
  completedCount: number;
  errorCount: number;
}

export interface JobPayload {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * UtilityWorker manages background jobs in the utility process.
 */
export class UtilityWorker {
  private scheduler: JobScheduler;
  private status: WorkerStatus;
  private handlers: Map<string, (payload: unknown) => Promise<unknown>>;
  private eventHandlers: Map<string, Set<(data?: unknown) => void>> = new Map();

  constructor() {
    this.scheduler = new JobScheduler();
    this.status = {
      isRunning: false,
      isPaused: false,
      jobCount: 0,
      completedCount: 0,
      errorCount: 0,
    };
    this.handlers = new Map();
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    // Register default job handlers
    this.handlers.set('email_process', async (payload) => {
      return { success: true };
    });

    this.handlers.set('test', async (payload) => {
      return { success: true };
    });

    // Handler that fails for error testing
    this.handlers.set('failing_job', async (payload) => {
      throw new Error('Job failed');
    });
  }

  /**
   * Register event handler.
   */
  on(event: string, handler: (data?: unknown) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Emit event to handlers.
   */
  private emit(event: string, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  /**
   * Send status update to main process.
   */
  sendStatusUpdate(): void {
    if (process.send) {
      process.send({
        type: 'worker:status',
        status: this.status,
      });
    }
  }

  /**
   * Handle command from main process.
   */
  handleCommand(command: string): void {
    switch (command) {
      case 'pause':
        this.status.isPaused = true;
        break;
      case 'resume':
        this.status.isPaused = false;
        break;
    }
  }

  /**
   * Start the worker.
   */
  async start(): Promise<void> {
    this.status.isRunning = true;

    // Schedule periodic jobs
    this.scheduler.schedule('job-processor', async () => {
      await this.processPendingJobs();
    }, { intervalMs: 5000 });

    // Notify main process that worker is ready
    if (process.send) {
      process.send({ type: 'worker:ready' });
    }
  }

  /**
   * Stop the worker.
   */
  stop(): void {
    this.status.isRunning = false;
    this.scheduler.stopAll();
  }

  /**
   * Get worker status.
   */
  getStatus(): WorkerStatus {
    return { ...this.status };
  }

  /**
   * Handle an incoming job from main process.
   */
  async handleJob(job: JobPayload): Promise<void> {
    this.status.jobCount++;
    this.emit('job:received', job);

    const handler = this.handlers.get(job.type);
    if (!handler) {
      this.status.errorCount++;
      this.emit('job:error', { job, error: 'Unknown job type' });
      if (process.send) {
        process.send({ type: 'job:error', job, error: 'Unknown job type' });
      }
      return;
    }

    try {
      await handler(job.payload);
      this.status.completedCount++;
      this.emit('job:completed', job);

      if (process.send) {
        process.send({ type: 'job:completed', job });
      }
    } catch (error) {
      this.status.errorCount++;
      this.emit('job:error', { job, error: error instanceof Error ? error.message : 'Unknown error' });
      if (process.send) {
        process.send({
          type: 'job:error',
          job,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Register a custom job handler.
   */
  registerHandler(type: string, handler: (payload: unknown) => Promise<unknown>): void {
    this.handlers.set(type, handler);
  }

  /**
   * Process any pending jobs.
   */
  private async processPendingJobs(): Promise<void> {
    // In a real implementation, this would check a job queue
    // For now, it's a no-op since jobs come via IPC
  }
}
