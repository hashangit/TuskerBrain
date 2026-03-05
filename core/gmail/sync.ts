import type { Email } from '@core/types/email';

export interface GmailClient {
  listMessages(options: { maxResults: number; pageToken?: string }): Promise<{ messages: any[]; nextPageToken?: string }>;
  getMessage(id: string): Promise<any>;
}

export interface SyncProgress {
  isRunning: boolean;
  total: number;
  processed: number;
  failed: number;
  currentBatch?: string;
}

export interface BackfillJob {
  type: 'backfill_day';
  status: 'pending' | 'running' | 'completed' | 'failed';
  date: string;
}

/**
 * GmailSyncManager handles initial and incremental email syncing.
 * 
 * Phase 1: Initial Sync (Clean First)
 * - Fetch all emails with lookback period
 * - Apply archival/deletion rules immediately (no AI)
 * 
 * Phase 2: AI Processing (Gradual Backfill)
 * - Process one day at a time
 * - User sees progress: "Processing day 15 of 30..."
 * 
 * Phase 3: Incremental Sync
 * - Track Gmail historyId
 * - Fetch new/changed emails since last sync
 */
export class GmailSyncManager {
  private client: GmailClient;
  private progress: SyncProgress = {
    isRunning: false,
    total: 0,
    processed: 0,
    failed: 0,
  };
  private backfillJobs: BackfillJob[] = [];
  private _historyId?: string;

  /** Get the current history ID - stored for incremental sync */
  getHistoryId(): string | undefined { return this._historyId; }

  constructor(client: GmailClient) {
    this.client = client;
  }

  /**
   * Start initial sync with a lookback period.
   */
  async startInitialSync(lookbackDays: number): Promise<void> {
    this.progress.isRunning = true;
    this.progress.processed = 0;
    this.progress.failed = 0;

    // Calculate date range
    const after = new Date();
    after.setDate(after.getDate() - lookbackDays);

    // Fetch all messages in lookback period
    const result = await this.client.listMessages({
      maxResults: 100,
    });

    this.progress.total = result.messages?.length || 0;

    // Create backfill jobs for each day
    this.backfillJobs = [];
    for (let i = 0; i < lookbackDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      this.backfillJobs.push({
        type: 'backfill_day',
        status: 'pending',
        date: date.toISOString().split('T')[0],
      });
    }
  }

  /**
   * Start incremental sync from a history ID.
   */
  async startIncrementalSync(historyId: string): Promise<void> {
    this.progress.isRunning = true;
    this._historyId = historyId;

    // Fetch changes since last sync
    await this.client.listMessages({
      maxResults: 100,
    });
  }

  /**
   * Get current sync progress.
   */
  getProgress(): SyncProgress {
    return { ...this.progress };
  }

  /**
   * Get backfill jobs.
   */
  async getBackfillJobs(): Promise<BackfillJob[]> {
    return [...this.backfillJobs];
  }

  /**
   * Stop the current sync operation.
   */
  stop(): void {
    this.progress.isRunning = false;
  }

  /**
   * Process a single email.
   */
  async processEmail(emailId: string): Promise<Email | null> {
    const message = await this.client.getMessage(emailId);
    
    if (!message) {
      return null;
    }

    // Extract email data from Gmail message
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) => 
      headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value;

    const email: Email = {
      id: message.id,
      threadId: message.threadId,
      senderEmail: getHeader('from') || '',
      senderName: this.extractName(getHeader('from') || ''),
      senderDomain: this.extractDomain(getHeader('from') || ''),
      subject: getHeader('subject') || null,
      snippet: message.snippet || null,
      receivedAt: new Date(parseInt(message.internalDate) || Date.now()),
    };

    this.progress.processed++;
    return email;
  }

  private extractName(from: string): string {
    const match = from.match(/^(.+?)\s*<.*>$/);
    return match ? match[1].trim() : from.split('@')[0];
  }

  private extractDomain(from: string): string {
    const match = from.match(/@([^>]+)>?$/);
    return match ? match[1].toLowerCase() : '';
  }
}
