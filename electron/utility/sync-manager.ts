import type { GmailClient } from '@core/gmail/sync';
import { JobScheduler } from './scheduler';

export interface SyncStatus {
  isRunning: boolean;
  isPaused: boolean;
  phase: 'idle' | 'initial' | 'incremental' | 'backfill';
  scheduledInterval?: number;
  error?: string;
  lastSyncAt?: Date;
  historyId?: string;
}

export interface BackfillJob {
  id: string;
  date: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface BackfillProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
}

type SyncEvent = 'sync:started' | 'sync:completed' | 'sync:error' | 'progress';
type SyncEventHandler = (data?: unknown) => void;

/**
 * SyncManager orchestrates Gmail sync operations in the utility process.
 */
export class SyncManager {
  private client: GmailClient;
  private scheduler: JobScheduler;
  private status: SyncStatus;
  private backfillJobs: BackfillJob[] = [];
  private eventHandlers: Map<SyncEvent, Set<SyncEventHandler>> = new Map();

  constructor(client: GmailClient) {
    this.client = client;
    this.scheduler = new JobScheduler();
    this.status = {
      isRunning: false,
      isPaused: false,
      phase: 'idle',
    };
  }

  /**
   * Start initial sync with a lookback period.
   */
  async startInitialSync(lookbackDays: number): Promise<void> {
    this.status.isRunning = true;
    this.status.phase = 'initial';
    this.status.error = undefined;
    this.emit('sync:started', { lookbackDays });

    try {
      // Fetch messages to get total count
      const result = await this.client.listMessages({ maxResults: 100 });
      this.emit('progress', {
        total: result.messages?.length || 0,
        processed: 0,
      });

      // Create backfill jobs for each day
      this.backfillJobs = [];
      for (let i = 0; i < lookbackDays; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        this.backfillJobs.push({
          id: `backfill-${date.toISOString().split('T')[0]}`,
          date: date.toISOString().split('T')[0],
          status: 'pending',
        });
      }

      this.status.phase = 'backfill';
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : 'Unknown error';
      this.status.isRunning = false;
      this.emit('sync:error', { error: this.status.error });
      throw error;
    }
  }

  /**
   * Start incremental sync from a history ID.
   */
  async startIncrementalSync(historyId: string): Promise<void> {
    this.status.isRunning = true;
    this.status.phase = 'incremental';
    this.status.historyId = historyId;
    this.emit('sync:started', { type: 'incremental', historyId });

    try {
      await this.client.listMessages({ maxResults: 100 });
      this.status.lastSyncAt = new Date();
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('sync:error', { error: this.status.error });
      throw error;
    }
  }

  /**
   * Schedule periodic incremental sync.
   */
  async scheduleIncrementalSync(intervalMinutes: number): Promise<void> {
    this.status.scheduledInterval = intervalMinutes;

    this.scheduler.schedule('incremental-sync', async () => {
      if (this.status.historyId) {
        await this.startIncrementalSync(this.status.historyId);
      }
    }, { intervalMs: intervalMinutes * 60 * 1000 });
  }

  /**
   * Process the next backfill job.
   */
  async processNextBackfillJob(): Promise<boolean> {
    const pendingJob = this.backfillJobs.find(j => j.status === 'pending');
    if (!pendingJob) {
      this.status.isRunning = false;
      this.emit('sync:completed');
      return false;
    }

    pendingJob.status = 'running';

    try {
      // Simulate processing - in real implementation, this would fetch and process emails
      await this.client.listMessages({ maxResults: 100 });
      pendingJob.status = 'completed';
      this.emit('progress', this.getBackfillProgress());
      return true;
    } catch (error) {
      pendingJob.status = 'failed';
      pendingJob.error = error instanceof Error ? error.message : 'Unknown error';
      return true;
    }
  }

  /**
   * Get all backfill jobs.
   */
  getBackfillJobs(): BackfillJob[] {
    return [...this.backfillJobs];
  }

  /**
   * Get backfill progress.
   */
  getBackfillProgress(): BackfillProgress {
    const completed = this.backfillJobs.filter(j => j.status === 'completed').length;
    const failed = this.backfillJobs.filter(j => j.status === 'failed').length;
    const pending = this.backfillJobs.filter(j => j.status === 'pending').length;

    return {
      total: this.backfillJobs.length,
      completed,
      failed,
      pending,
    };
  }

  /**
   * Get current sync status.
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * Stop sync operation.
   */
  stop(): void {
    this.status.isRunning = false;
    this.status.phase = 'idle';
    this.scheduler.stopAll();
  }

  /**
   * Pause sync operation.
   */
  pause(): void {
    this.status.isPaused = true;
  }

  /**
   * Resume sync operation.
   */
  resume(): void {
    this.status.isPaused = false;
  }

  /**
   * Register event handler.
   */
  on(event: SyncEvent, handler: SyncEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unregister event handler.
   */
  off(event: SyncEvent, handler: SyncEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit event.
   */
  private emit(event: SyncEvent, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }
}
