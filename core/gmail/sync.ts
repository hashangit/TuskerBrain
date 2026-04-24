import type { Email } from '@core/types/email';
import type { JobQueue } from '@core/jobs/queue';
import { ProcessingDecision } from '@core/workflows/processing-decision';
import type { ListMessagesOptions, ListMessagesResponse, ListHistoryOptions, ListHistoryResponse } from './types';
import type { LabelsRepository } from '@core/repositories/labels';
import type { TopicsRepository } from '@core/repositories/topics';
import type { EmailRepository } from '@core/repositories/emails';

// Re-export types for consumers
export type { ListMessagesOptions, ListMessagesResponse, ListHistoryOptions, ListHistoryResponse } from './types';

export interface GmailClient {
  listMessages(options?: ListMessagesOptions): Promise<ListMessagesResponse>;
  listHistory(options?: ListHistoryOptions): Promise<ListHistoryResponse>;
  getMessage(id: string): Promise<any>;
  getProfile(): Promise<{ emailAddress?: string; historyId?: string; messagesTotal?: number }>;
  modifyMessage(messageId: string, modifications: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any>;
  batchModifyMessages?(messageIds: string[], modifications: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any>;
  listLabels?(): Promise<any>;
  createLabel?(name: string): Promise<any>;
  updateLabel?(id: string, updates: { name?: string }): Promise<any>;
  deleteLabel?(id: string): Promise<any>;
}

export interface SyncProgress {
  isRunning: boolean;
  isPaused: boolean;
  total: number;
  processed: number;
  failed: number;
  currentBatch?: string;
}

export interface SyncCheckpoint {
  lastMessageId?: string;
  lastProcessedIndex: number;
  timestamp: Date;
  pageToken?: string;
}

export interface SyncState {
  historyId?: string;
  lastFullSync?: Date;
  lastIncrementalSync?: Date;
  totalEmailsProcessed: number;
  totalTokensUsed: number;
  isPaused?: boolean;
  backfillJobs?: BackfillJob[];
}

export interface BackfillJob {
  type: 'backfill_day';
  status: 'pending' | 'running' | 'completed' | 'failed';
  date: string;
}

/** Interface for persisting sync state */
export interface SyncStateStore {
  load(): Promise<SyncState>;
  save(state: SyncState): Promise<void>;
}

type SyncEvent = 'sync:started' | 'sync:completed' | 'sync:error' | 'progress';
type SyncEventHandler = (data?: unknown) => void;

/** Error message when Gmail historyId has expired and full sync is needed. */
export const HISTORY_ID_EXPIRED = 'HISTORY_ID_EXPIRED';

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
  private jobQueue?: JobQueue;
  private syncStateStore?: SyncStateStore;

  /** Replace the Gmail client (e.g. after OAuth token refresh). */
  setClient(client: GmailClient): void {
    this.client = client;
  }
  private emailRepo?: EmailRepository;
  private progress: SyncProgress = {
    isRunning: false,
    isPaused: false,
    total: 0,
    processed: 0,
    failed: 0,
  };
  private backfillJobs: BackfillJob[] = [];
  private checkpoint: SyncCheckpoint = {
    lastProcessedIndex: 0,
    timestamp: new Date(),
  };
  private processedEmailIds: Set<string> = new Set();
  private sharedState: SyncState = {
    totalEmailsProcessed: 0,
    totalTokensUsed: 0,
  };
  private isStateInitialized: boolean = false;
  private eventHandlers: Map<SyncEvent, Set<SyncEventHandler>> = new Map();
  private maxRetries: number = 5;
  private baseBackoffMs: number = 1000; // 1 second base backoff for production

  /** Maximum number of processed email IDs to keep in memory */
  private readonly MAX_PROCESSED_IDS = 10000;

  /** Maximum body size in characters (500KB) to prevent runaway memory */
  private readonly MAX_BODY_SIZE = 500_000;

  /** Get the current history ID - stored for incremental sync */
  getHistoryId(): string | undefined { return this.sharedState.historyId; }

  /** Set the history ID and persist it (used after initial sync to enable incremental) */
  async seedHistoryId(historyId: string): Promise<void> {
    this.sharedState.historyId = historyId;
    await this.persistState();
  }

  /** Get the current checkpoint for recovery */
  getCheckpoint(): SyncCheckpoint {
    return { ...this.checkpoint };
  }

  /** Pause the current sync operation */
  async pause(): Promise<void> {
    this.progress.isPaused = true;
    this.sharedState.isPaused = true;
    await this.persistState();
  }

  /** Resume a paused sync operation */
  async resume(): Promise<void> {
    this.progress.isPaused = false;
    this.sharedState.isPaused = false;
    await this.persistState();
  }

  /** Get the current sync state */
  async getSyncState(): Promise<SyncState> {
    return {
      historyId: this.sharedState.historyId,
      lastFullSync: this.sharedState.lastFullSync,
      lastIncrementalSync: this.sharedState.lastIncrementalSync,
      totalEmailsProcessed: this.sharedState.totalEmailsProcessed,
      totalTokensUsed: this.sharedState.totalTokensUsed,
      isPaused: this.sharedState.isPaused,
    };
  }

  /** Get saved progress for recovery purposes */
  async getSavedProgress(): Promise<SyncProgress & { checkpoint: SyncCheckpoint }> {
    return {
      ...this.progress,
      checkpoint: this.checkpoint,
    };
  }

  private initializationPromise?: Promise<void>;

  constructor(client: GmailClient, jobQueue?: JobQueue, syncStateStore?: SyncStateStore, emailRepo?: EmailRepository) {
    this.client = client;
    this.jobQueue = jobQueue;
    this.syncStateStore = syncStateStore;
    this.emailRepo = emailRepo;
  }

  /**
   * Initialize the sync manager by loading persisted state from the store.
   * Must be called before accessing any state-dependent methods.
   * This method is idempotent - calling it multiple times is safe.
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isStateInitialized) {
      return;
    }

    // If initialization is already in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = (async () => {
      if (this.syncStateStore) {
        try {
          const state = await this.syncStateStore.load();
          this.sharedState = {
            ...this.sharedState,
            ...state,
          };
          // Apply persisted isPaused state to progress
          if (state.isPaused !== undefined) {
            this.progress.isPaused = state.isPaused;
          }
          // Load persisted backfill jobs
          if (state.backfillJobs) {
            this.backfillJobs = state.backfillJobs;
          }
        } catch {
          // Store not available yet — start with empty state
        }
      }
      this.isStateInitialized = true;
    })();

    return this.initializationPromise;
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

  private emit(event: SyncEvent, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach(handler => handler(data));
  }

  /**
   * Persist current state to the store.
   */
  private async persistState(): Promise<void> {
    if (this.syncStateStore) {
      await this.syncStateStore.save({
        historyId: this.sharedState.historyId,
        lastFullSync: this.sharedState.lastFullSync,
        lastIncrementalSync: this.sharedState.lastIncrementalSync,
        totalEmailsProcessed: this.sharedState.totalEmailsProcessed,
        totalTokensUsed: this.sharedState.totalTokensUsed,
        isPaused: this.sharedState.isPaused,
        backfillJobs: this.backfillJobs,
      });
    }
  }

  /**
   * Sleep utility for backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute an operation with retry logic and exponential backoff.
   * Handles rate limits (429) and network errors.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Check for rate limit error
        const isRateLimit = error?.code === 429 ||
          error?.message?.toLowerCase().includes('rate limit');

        // Check for network error
        const isNetworkError = error?.message?.toLowerCase().includes('network') ||
          error?.code === 'ECONNRESET' ||
          error?.code === 'ENOTFOUND' ||
          error?.code === 'ETIMEDOUT';

        if (!isRateLimit && !isNetworkError) {
          // Not a retriable error, throw immediately
          throw error;
        }

        if (attempt < this.maxRetries - 1) {
          // Calculate exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
          const backoffMs = this.baseBackoffMs * Math.pow(2, attempt);
          console.warn(`${operationName} failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${backoffMs}ms...`);
          await this.sleep(backoffMs);
        }
      }
    }

    // All retries exhausted
    throw new Error(`${operationName} failed after ${this.maxRetries} retries: ${lastError?.message}`);
  }

  /**
   * Fetch emails from Gmail and queue them as jobs for processing.
   * Handles pagination to fetch all emails.
   * Returns the number of emails queued.
   */
  async fetchAndQueueEmails(): Promise<number> {
    if (!this.jobQueue) {
      throw new Error('JobQueue not provided to GmailSyncManager');
    }

    this.progress.isRunning = true;
    this.progress.processed = 0;
    this.progress.failed = 0;

    try {
      let totalQueued = 0;
      let pageToken: string | undefined;

      // Fetch all pages of messages
      do {
        const result = await this.withRetry(
          () => this.client.listMessages({ maxResults: 100, pageToken }),
          'fetchAndQueueEmails'
        );
        const messages = result.messages || [];

        // Update historyId if present in response
        if (result.historyId) {
          this.sharedState.historyId = result.historyId;
        }

        this.progress.total += messages.length;

        // Create jobs for each email
        for (const message of messages) {
          try {
            await this.jobQueue.createJob({
              type: 'email_process',
              payload: { emailId: message.id },
              emailId: message.id,
            });
            totalQueued++;
            this.progress.processed++;
          } catch (error) {
            // Job might already exist (deduplication)
            this.progress.failed++;
          }
        }

        // Persist historyId after each page
        await this.persistState();

        pageToken = result.nextPageToken;
      } while (pageToken);

      this.sharedState.lastFullSync = new Date();
      await this.persistState();
      return totalQueued;
    } finally {
      this.progress.isRunning = false;
    }
  }

  /**
   * Start initial sync with a lookback period.
   * The sync remains "running" until explicitly stopped.
   */
  async startInitialSync(lookbackDays: number): Promise<void> {
    this.progress.isRunning = true;
    this.progress.isPaused = false;
    this.progress.processed = 0;
    this.progress.failed = 0;

    // Mark state as initialized to prevent async load from overwriting it
    this.isStateInitialized = true;

    // Fetch profile to get initial historyId
    const profile = await this.withRetry(
      () => this.client.getProfile(),
      'getProfile'
    );
    if (profile.historyId) {
      this.sharedState.historyId = profile.historyId;
    }

    // Calculate date range
    const after = new Date();
    after.setDate(after.getDate() - lookbackDays);

    // Fetch all messages in lookback period with retry
    const result = await this.withRetry(
      () => this.client.listMessages({ maxResults: 100 }),
      'startInitialSync'
    );

    this.progress.total = result.messages?.length || 0;
    this.sharedState.lastFullSync = new Date();

    // Update historyId if present
    if (result.historyId) {
      this.sharedState.historyId = result.historyId;
    }

    // Update checkpoint with page token for recovery
    this.checkpoint = {
      lastProcessedIndex: 0,
      timestamp: new Date(),
      pageToken: result.nextPageToken,
    };

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

    // Persist state including backfill jobs
    await this.persistState();

    // Note: isRunning remains true until stop() is called
  }

  /**
   * Start incremental sync from a history ID.
   */
  async startIncrementalSync(historyId: string): Promise<void> {
    this.progress.isRunning = true;
    this.sharedState.historyId = historyId;

    // Fetch changes since last sync with retry and historyId
    const result = await this.withRetry(
      () => this.client.listMessages({
        maxResults: 100,
        startHistoryId: historyId,
      }),
      'startIncrementalSync'
    );

    // Update historyId from response
    if (result.historyId) {
      this.sharedState.historyId = result.historyId;
    }

    this.sharedState.lastIncrementalSync = new Date();
    await this.persistState();
    // Note: isRunning remains true until stop() is called
  }

  /**
   * Fetch new emails since a given history ID.
   * Returns the list of new emails, excluding already processed ones.
   */
  async fetchNewEmailsSince(historyId: string): Promise<any[]> {
    const result = await this.withRetry(
      () => this.client.listMessages({
        maxResults: 100,
        startHistoryId: historyId,
      }),
      'fetchNewEmailsSince'
    );

    // Update historyId from response
    if (result.historyId) {
      this.sharedState.historyId = result.historyId;
    }

    const messages = result.messages || [];

    // Filter out already processed emails
    return messages.filter((msg) => !this.processedEmailIds.has(msg.id));
  }

  /**
   * Perform incremental sync using Gmail's history API.
   * Returns lists of added and deleted message IDs since last sync.
   * Throws HISTORY_ID_EXPIRED if the stored historyId is too old.
   */
  async performIncrementalSync(): Promise<{ added: string[]; deleted: string[] }> {
    await this.initialize();

    const currentHistoryId = this.sharedState.historyId;
    if (!currentHistoryId) {
      throw new Error('No historyId — must perform initial sync first');
    }

    const added: string[] = [];
    const deleted: string[] = [];
    let pageToken: string | undefined;
    let latestHistoryId = currentHistoryId;

    try {
      do {
        const result = await this.withRetry(
          () => this.client.listHistory({
            startHistoryId: currentHistoryId,
            maxResults: 100,
            pageToken,
          }),
          'performIncrementalSync'
        );

        if (result.historyId) latestHistoryId = result.historyId;

        for (const record of result.history || []) {
          for (const item of record.messagesAdded || []) {
            const id = item.message?.id;
            if (id && !this.processedEmailIds.has(id)) {
              added.push(id);
            }
          }
          for (const item of record.messagesDeleted || []) {
            const id = item.message?.id;
            if (id) deleted.push(id);
          }
        }

        pageToken = result.nextPageToken;
      } while (pageToken);

      this.sharedState.historyId = latestHistoryId;
      this.sharedState.lastIncrementalSync = new Date();
      await this.persistState();

      return { added, deleted };
    } catch (error: any) {
      // historyId expired — Gmail returns 404 when too old
      if (error?.code === 404 || error?.response?.status === 404) {
        throw new Error(HISTORY_ID_EXPIRED);
      }
      throw error;
    }
  }

  /**
   * Mark emails as processed to prevent re-fetching.
   * Automatically cleans up old entries when exceeding MAX_PROCESSED_IDS.
   */
  async markEmailsAsProcessed(emailIds: string[]): Promise<void> {
    emailIds.forEach((id) => this.processedEmailIds.add(id));

    // Cleanup if exceeding limit (keep most recent)
    if (this.processedEmailIds.size > this.MAX_PROCESSED_IDS) {
      const idsToRemove = Array.from(this.processedEmailIds).slice(
        0,
        this.processedEmailIds.size - this.MAX_PROCESSED_IDS
      );
      idsToRemove.forEach((id) => this.processedEmailIds.delete(id));
    }
  }

  /**
   * Clear all processed email IDs (for testing or reset).
   */
  clearProcessedEmails(): void {
    this.processedEmailIds.clear();
  }

  /**
   * Clear completed backfill jobs to free memory.
   */
  clearCompletedBackfillJobs(): void {
    this.backfillJobs = this.backfillJobs.filter(
      (job) => job.status !== 'completed' && job.status !== 'failed'
    );
  }

  /**
   * Resume sync from a saved checkpoint.
   */
  async resumeFromCheckpoint(checkpoint: SyncCheckpoint): Promise<void> {
    this.progress.isRunning = true;
    this.checkpoint = checkpoint;

    // Resume from the saved page token
    const result = await this.withRetry(
      () => this.client.listMessages({
        maxResults: 100,
        pageToken: checkpoint.pageToken,
      }),
      'resumeFromCheckpoint'
    );

    this.progress.total = result.messages?.length || 0;

    // Update historyId from response
    if (result.historyId) {
      this.sharedState.historyId = result.historyId;
    }
    // Note: isRunning remains true until stop() is called
  }

  /**
   * Get current sync progress.
   * Returns a snapshot of the current progress state.
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
   * Apply cleanup rules to a batch of emails.
   * Archives/deletes old emails based on age-based rules WITHOUT AI.
   * Only queues recent emails for AI processing.
   *
   * @param emails - List of emails to process
   * @returns Object with counts for each action type
   */
  async applyCleanupRules(emails: Email[]): Promise<{
    archived: number;
    deleted: number;
    queuedForAI: number;
    cleanupActions: Array<{ emailId: string; action: 'archive' | 'delete' }>;
  }> {
    // Get all decisions first
    const allDecisions = await Promise.all(
      emails.map(async (email) => {
        const decision = await ProcessingDecision.decide(email);
        return {
          emailId: email.id,
          originalAction: decision.action,
          // For Gmail operations: process -> archive, extract_deals -> no cleanup action
          cleanupAction: decision.action === 'process' ? 'archive' as const :
                         decision.action === 'extract_deals' ? null :
                         decision.action as 'archive' | 'delete',
        };
      })
    );

    // Count by original action type
    const archived = allDecisions.filter((d) => d.cleanupAction === 'archive').length;
    const deleted = allDecisions.filter((d) => d.cleanupAction === 'delete').length;
    const queuedForAI = allDecisions.filter((d) => d.originalAction === 'process' || d.originalAction === 'extract_deals').length;

    // Group emails by action type for batch operations
    const toArchive = allDecisions.filter((d) => d.cleanupAction === 'archive').map((d) => d.emailId);
    const toDelete = allDecisions.filter((d) => d.cleanupAction === 'delete').map((d) => d.emailId);

    // Use batch operations if available, otherwise fall back to sequential
    const batchOps: Promise<any>[] = [];

    if (this.client.batchModifyMessages) {
      // Batch archive (remove INBOX label)
      if (toArchive.length > 0) {
        batchOps.push(
          this.client.batchModifyMessages(toArchive, {
            removeLabelIds: ['INBOX'],
          })
        );
      }
      // Batch delete (remove INBOX and add TRASH)
      if (toDelete.length > 0) {
        batchOps.push(
          this.client.batchModifyMessages(toDelete, {
            removeLabelIds: ['INBOX'],
            addLabelIds: ['TRASH'],
          })
        );
      }
    } else {
      // Fall back to individual operations (still parallel)
      batchOps.push(
        ...toArchive.map((id) =>
          this.client.modifyMessage(id, { removeLabelIds: ['INBOX'] })
        ),
        ...toDelete.map((id) =>
          this.client.modifyMessage(id, { removeLabelIds: ['INBOX'], addLabelIds: ['TRASH'] })
        )
      );
    }

    // Execute all operations in parallel
    await Promise.all(batchOps);

    // Update progress
    this.progress.processed += archived + deleted;

    return {
      archived,
      deleted,
      queuedForAI,
      cleanupActions: allDecisions
        .filter((d) => d.cleanupAction !== null)
        .map((d) => ({ emailId: d.emailId, action: d.cleanupAction! })),
    };
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
      bodyPlain: this.extractBody(message, 'text/plain'),
      bodyHtml: this.extractBody(message, 'text/html'),
      receivedAt: new Date(parseInt(message.internalDate) || Date.now()),
      messageIdHeader: getHeader('Message-ID') || null,
      referencesHeader: getHeader('References') || null,
      inReplyToHeader: getHeader('In-Reply-To') || null,
    };

    this.progress.processed++;
    this.sharedState.totalEmailsProcessed++;

    // Mark as processed
    this.processedEmailIds.add(emailId);

    // Update checkpoint
    this.checkpoint = {
      lastMessageId: emailId,
      lastProcessedIndex: this.progress.processed,
      timestamp: new Date(),
    };

    // Persist state after processing each email
    await this.persistState();

    return email;
  }

  /**
   * Fetch and store emails from today into the database.
   * This method downloads emails from Gmail for the given date range,
   * processes them, and stores them in the database.
   *
   * @param since - Start date for fetching emails (typically today at midnight)
   * @param emailRepo - Repository for storing emails
   * @returns Object containing email IDs and total count
   */
  async fetchAndStoreToday(
    since: Date,
    emailRepo: { upsert(email: Email): Promise<void> }
  ): Promise<{ emailIds: string[]; total: number }> {
    this.progress.isRunning = true;
    this.progress.processed = 0;
    this.progress.failed = 0;

    const emailIds: string[] = [];
    let total = 0;

    try {
      // Build Gmail query for date filtering
      const afterTimestamp = Math.floor(since.getTime() / 1000);
      const query = `after:${afterTimestamp}`;

      let pageToken: string | undefined;

      // Fetch all pages of messages for today
      do {
        const result = await this.withRetry(
          () => this.client.listMessages({
            maxResults: 100,
            pageToken,
            q: query,
          }),
          'fetchAndStoreToday'
        );

        const messages = result.messages || [];
        this.progress.total = total + messages.length;

        // Process each email: download, parse, and store
        for (const message of messages) {
          try {
            // Download and parse the email
            const email = await this.processEmail(message.id);

            if (email) {
              // Store in database
              await emailRepo.upsert(email);
              emailIds.push(message.id);

              // Emit progress event
              this.emit('progress', {
                processed: this.progress.processed,
                total: this.progress.total,
                phase: 'sync',
              });
            }
          } catch (error) {
            console.error(`Failed to process email ${message.id}:`, error);
            this.progress.failed++;
          }
        }

        total += messages.length;
        pageToken = result.nextPageToken;
      } while (pageToken);

      // Emit completion event
      this.emit('sync:completed', { total });

      return { emailIds, total };
    } finally {
      this.progress.isRunning = false;
    }
  }

  /**
   * Sync labels between Gmail and the database.
   *
   * 1. Lists all labels from Gmail API
   * 2. Upserts gmail-system and gmail-user labels into gmailLabels
   * 3. Removes gmail-user labels from DB that were deleted in Gmail
   * 4. Re-creates TB labels that were deleted in Gmail
   * 5. Re-applies TB labels to messages that lost them
   * 6. Backfills topics without gmailLabelId
   */
  async syncLabels(
    labelsRepo: LabelsRepository,
    topicsRepo: TopicsRepository,
  ): Promise<void> {
    // 1. List all labels from Gmail API
    if (!this.client.listLabels) {
      console.warn('GmailClient.listLabels not available, skipping label sync');
      return;
    }

    const gmailLabelsResponse = await this.withRetry(
      () => this.client.listLabels!(),
      'syncLabels:listLabels'
    );

    const gmailLabels: Array<{ id: string; name: string; type: string }> =
      (gmailLabelsResponse.labels || [])
        .filter((l: any) => l.id && l.name && l.type)
        .map((l: any) => ({ id: l.id, name: l.name, type: l.type }));

    // 1.5. One-time migration: rename TuskerBrain/* labels in Gmail to TB/*
    const legacyLabels = gmailLabels.filter(l => l.name.startsWith('TuskerBrain/'));
    if (legacyLabels.length > 0 && this.client.updateLabel) {
      for (const legacy of legacyLabels) {
        const newName = legacy.name.replace(/^TuskerBrain\//, 'TB/');
        try {
          await this.withRetry(
            () => this.client.updateLabel!(legacy.id, { name: newName }),
            `syncLabels:migrate_${legacy.name}`
          );
          // Update our local copy
          legacy.name = newName;
        } catch (error) {
          console.warn(`Failed to rename legacy label ${legacy.name} to ${newName}: ${error}`);
        }
      }
    }

    // 2. Upsert gmail-system and gmail-user labels into DB
    const nonTBLabels = gmailLabels.filter(l => l.type === 'system' || l.type === 'user');
    if (nonTBLabels.length > 0) {
      await labelsRepo.upsertFromGmail(nonTBLabels);
    }

    // 3. Remove gmail-user labels from DB that were deleted in Gmail
    const gmailLabelIds = new Set(gmailLabels.map(l => l.id));
    const dbUserLabels = await labelsRepo.findByLabelSource('gmail-user');
    const deletedUserLabels = dbUserLabels.filter(l => !gmailLabelIds.has(l.id));
    for (const deleted of deletedUserLabels) {
      await labelsRepo.delete(deleted.id);
    }

    // 4. Re-create TB labels that were deleted in Gmail
    const dbTBLabels = await labelsRepo.findTBLabels();
    const gmailLabelNames = new Set(gmailLabels.map(l => l.name));

    for (const tbLabel of dbTBLabels) {
      if (!gmailLabelNames.has(tbLabel.name)) {
        try {
          if (this.client.createLabel) {
            await this.withRetry(
              () => this.client.createLabel!(tbLabel.name),
              `syncLabels:recreateLabel:${tbLabel.name}`
            );
          }
        } catch (error) {
          console.warn(`Failed to re-create TB label ${tbLabel.name}: ${error}`);
        }
      }
    }

    // 5. Re-apply TB labels to messages that lost them
    for (const tbLabel of dbTBLabels) {
      const emailIds = await labelsRepo.getEmailsWithLabel(tbLabel.id);
      if (emailIds.length === 0) continue;

      const gmailLabel = gmailLabels.find(l => l.name === tbLabel.name);
      if (!gmailLabel) continue;

      // Check which messages are missing the label and re-apply in batches
      const batchSize = 50;
      for (let i = 0; i < emailIds.length; i += batchSize) {
        const batch = emailIds.slice(i, i + batchSize);
        try {
          if (this.client.batchModifyMessages) {
            await this.client.batchModifyMessages(batch, {
              addLabelIds: [gmailLabel.id],
            });
          } else {
            await Promise.all(
              batch.map(emailId =>
                this.client.modifyMessage(emailId, { addLabelIds: [gmailLabel.id] })
              )
            );
          }
        } catch (error) {
          console.warn(`Failed to re-apply TB label ${tbLabel.name}: ${error}`);
        }
      }
    }

    // 6. Backfill topics without gmailLabelId
    const topicsWithoutLabel = await topicsRepo.findTopicsWithoutGmailLabel();
    for (const topic of topicsWithoutLabel) {
      // Determine the Gmail label name for this topic
      const labelName = topic.parentId
        ? `TB/${topic.fullPath}`
        : `TB/${topic.name}`;

      try {
        // Find or create the label in Gmail
        let gmailLabelId: string | undefined;

        // Check if label already exists in Gmail
        const existing = gmailLabels.find(l => l.name === labelName);
        if (existing) {
          gmailLabelId = existing.id;
        } else if (this.client.createLabel) {
          const created = await this.withRetry(
            () => this.client.createLabel!(labelName),
            `syncLabels:backfillCreate:${labelName}`
          );
          gmailLabelId = created.id;
        }

        if (gmailLabelId) {
          // Insert gmailLabels row if not present
          let dbLabel = await labelsRepo.findById(gmailLabelId);
          if (!dbLabel) {
            dbLabel = await labelsRepo.create({
              id: gmailLabelId,
              name: labelName,
              labelSource: 'tb',
              labelType: 'topic',
            });
          }

          // Link topic to the gmailLabel
          await topicsRepo.updateGmailLabelId(topic.id, gmailLabelId);
        }
      } catch (error) {
        console.warn(`Failed to backfill Gmail label for topic ${topic.fullPath}: ${error}`);
      }
    }
  }

  /**
   * Extract decoded email body from a Gmail message payload.
   * Handles both simple messages and multipart MIME structures.
   */
  private extractBody(message: any, mimeType: 'text/plain' | 'text/html'): string | null {
    const payload = message.payload;
    if (!payload) return null;

    // Try direct body first (simple, non-multipart messages)
    if (payload.mimeType === mimeType && payload.body?.data) {
      return this.truncateBody(this.decodeBase64Url(payload.body.data));
    }

    // Search parts recursively (multipart messages)
    const findPart = (parts: any[]): string | null => {
      for (const part of parts) {
        if (part.mimeType === mimeType && part.body?.data) {
          return this.truncateBody(this.decodeBase64Url(part.body.data));
        }
        if (part.parts?.length) {
          const found = findPart(part.parts);
          if (found) return found;
        }
      }
      return null;
    };

    if (payload.parts?.length) {
      return findPart(payload.parts);
    }

    return null;
  }

  private truncateBody(decoded: string): string {
    return decoded.length > this.MAX_BODY_SIZE
      ? decoded.substring(0, this.MAX_BODY_SIZE)
      : decoded;
  }

  /**
   * Decode Gmail's base64url encoding to UTF-8 string.
   */
  private decodeBase64Url(data: string): string {
    // Gmail uses base64url: replace URL-safe chars and add padding
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
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
