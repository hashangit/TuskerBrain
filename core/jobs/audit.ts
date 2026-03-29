import type { Job } from './types';

/**
 * Audit log entry for tracking job execution.
 */
export interface AuditEntry {
  id: string;
  jobId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  tokensUsed?: number;
  durationMs?: number;
  reason?: string;
  createdAt: Date;
}

/**
 * Token usage record.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  provider?: string;
}

/**
 * Audit logger for tracking job execution, tokens, and durations.
 */
export class AuditLogger {
  private entries: Map<string, AuditEntry[]> = new Map();
  private allEntries: AuditEntry[] = [];
  private retentionDays: number = 90;
  private entryIdCounter: number = 0;

  /**
   * Log an audit entry for a job.
   */
  async logEntry(
    jobId: string,
    action: string,
    options?: {
      entityType?: string;
      entityId?: string;
      details?: Record<string, unknown>;
      tokensUsed?: number;
      durationMs?: number;
      reason?: string;
    }
  ): Promise<void> {
    const entry: AuditEntry = {
      id: `audit-${++this.entryIdCounter}`,
      jobId,
      action,
      entityType: options?.entityType,
      entityId: options?.entityId,
      details: options?.details,
      tokensUsed: options?.tokensUsed,
      durationMs: options?.durationMs,
      reason: options?.reason,
      createdAt: new Date(),
    };

    // Store by job ID
    if (!this.entries.has(jobId)) {
      this.entries.set(jobId, []);
    }
    this.entries.get(jobId)!.push(entry);

    // Also store in all entries
    this.allEntries.push(entry);
  }

  /**
   * Get all audit entries for a specific job.
   */
  async getEntriesForJob(jobId: string): Promise<AuditEntry[]> {
    return this.entries.get(jobId) ?? [];
  }

  /**
   * Log token usage for a job.
   */
  async logTokenUsage(jobId: string, usage: TokenUsage): Promise<void> {
    await this.logEntry(jobId, 'token_usage', {
      tokensUsed: usage.totalTokens,
      details: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        provider: usage.provider,
      },
    });
  }

  /**
   * Get total tokens used across all jobs.
   */
  async getTotalTokensUsed(): Promise<number> {
    let total = 0;
    for (const entries of this.entries.values()) {
      for (const entry of entries) {
        if (entry.tokensUsed) {
          total += entry.tokensUsed;
        }
      }
    }
    return total;
  }

  /**
   * Get tokens used by a specific provider.
   */
  async getTokensByProvider(provider: string): Promise<number> {
    let total = 0;
    for (const entries of this.entries.values()) {
      for (const entry of entries) {
        if (entry.tokensUsed && (entry.details?.provider === provider)) {
          total += entry.tokensUsed;
        }
      }
    }
    return total;
  }

  /**
   * Get average job duration by type.
   */
  async getAverageJobDuration(_jobType: string): Promise<number> {
    const durations: number[] = [];
    for (const entries of this.entries.values()) {
      for (const entry of entries) {
        if (entry.action === 'completed' && entry.durationMs) {
          durations.push(entry.durationMs);
        }
      }
    }
    if (durations.length === 0) return 0;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }

  /**
   * Get audit entries by date range.
   */
  async getEntriesByDateRange(start: Date, end: Date): Promise<AuditEntry[]> {
    return this.allEntries.filter((e) => {
      return e.createdAt >= start && e.createdAt <= end;
    });
  }

  /**
   * Get audit entries by action type.
   */
  async getEntriesByAction(action: string): Promise<AuditEntry[]> {
    return this.allEntries.filter((e) => e.action === action);
  }

  /**
   * Get paginated audit entries.
   */
  async getEntries(options: { limit: number; offset: number }): Promise<AuditEntry[]> {
    return this.allEntries.slice(options.offset, options.offset + options.limit);
  }

  /**
   * Get all audit entries.
   */
  async getAllEntries(): Promise<AuditEntry[]> {
    return [...this.allEntries];
  }

  /**
   * Get the oldest audit entry.
   */
  async getOldestEntry(): Promise<AuditEntry> {
    if (this.allEntries.length === 0) {
      return {
        id: 'none',
        jobId: 'none',
        action: 'none',
        createdAt: new Date(),
      };
    }
    return this.allEntries.reduce((oldest, current) => 
      current.createdAt < oldest.createdAt ? current : oldest
    );
  }

  /**
   * Set retention period in days.
   */
  async setRetentionDays(days: number): Promise<void> {
    this.retentionDays = days;
  }


  /**
   * Purge entries older than retention period.
   */
  async purgeOldEntries(): Promise<void> {
    const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);

    // Filter all entries
    this.allEntries = this.allEntries.filter((e) => e.createdAt >= cutoffDate);

    // Filter entries by job
    for (const [jobId, entries] of this.entries) {
      const filtered = entries.filter((e) => e.createdAt >= cutoffDate);
      if (filtered.length === 0) {
        this.entries.delete(jobId);
      } else {
        this.entries.set(jobId, filtered);
      }
    }
  }

  /**
   * Record job start (called by JobQueue).
   */
  async recordJobStart(job: Job): Promise<void> {
    await this.logEntry(job.id, 'started', {
      entityType: job.emailId ? 'email' : undefined,
      entityId: job.emailId,
      details: { type: job.type, payload: job.payload },
    });
  }

  /**
   * Record job status update (called by JobQueue).
   */
  async recordJobStatusUpdate(
    job: Job,
    status: string,
    options?: { result?: Record<string, unknown>; error?: string }
  ): Promise<void> {
    // Calculate duration
    const durationMs = job.startedAt
      ? Date.now() - job.startedAt.getTime()
      : undefined;

    // Build details object with result nested under 'result' key
    let details: Record<string, unknown> | undefined;
    if (options?.result) {
      details = { result: options.result };
    } else if (options?.error) {
      details = { error: options.error };
    }

    // Map status to action name for audit log
    // 'running' -> 'started', others stay the same
    const action = status === 'running' ? 'started' : status;

    await this.logEntry(job.id, action, {
      entityType: job.emailId ? 'email' : undefined,
      entityId: job.emailId,
      details,
      durationMs,
    });
  }
}
