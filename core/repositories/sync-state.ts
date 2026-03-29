import { eq } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';

export interface BackfillJob {
  type: 'backfill_day';
  status: 'pending' | 'running' | 'completed' | 'failed';
  date: string;
}

export interface SyncStateData {
  historyId?: string;
  lastFullSync?: Date;
  lastIncrementalSync?: Date;
  totalEmailsProcessed: number;
  totalTokensUsed: number;
  isPaused?: boolean;
  backfillJobs?: BackfillJob[];
}

/**
 * Repository for persisting sync state to the sync_state table.
 * Uses singleton-row pattern (id=1) with upsert.
 */
export class SyncStateRepository {
  private db: TuskerBrainDatabase;

  constructor(db: TuskerBrainDatabase) {
    this.db = db;
  }

  async load(): Promise<SyncStateData> {
    const drizzle = this.db.getDatabase();
    const rows = await drizzle
      .select()
      .from(schema.syncState)
      .where(eq(schema.syncState.id, 1))
      .limit(1);

    // Use raw SQL to get all values since Drizzle is not returning them correctly
    const sqlite = this.db.getSqlite();
    const rawRow = sqlite.prepare('SELECT * FROM sync_state WHERE id = 1').get() as {
      history_id: string | null;
      last_full_sync: number | null;
      last_incremental_sync: number | null;
      total_emails_processed: number | null;
      total_tokens_used: number | null;
      is_paused: number | null;
      backfill_jobs: string | null;
    } | undefined;

    let backfillJobs: BackfillJob[] | undefined;
    if (rawRow?.backfill_jobs) {
      try {
        backfillJobs = JSON.parse(rawRow.backfill_jobs) as BackfillJob[];
      } catch {
        backfillJobs = undefined;
      }
    }

    return {
      historyId: rawRow?.history_id ?? undefined,
      lastFullSync: rawRow?.last_full_sync ? new Date(rawRow.last_full_sync) : undefined,
      lastIncrementalSync: rawRow?.last_incremental_sync ? new Date(rawRow.last_incremental_sync) : undefined,
      totalEmailsProcessed: rawRow?.total_emails_processed ?? 0,
      totalTokensUsed: rawRow?.total_tokens_used ?? 0,
      isPaused: rawRow?.is_paused === 1,
      backfillJobs,
    };
  }

  async save(state: SyncStateData): Promise<void> {
    const drizzle = this.db.getDatabase();

    const isPausedValue = state.isPaused === undefined ? false : state.isPaused;
    const isPausedInt = isPausedValue ? 1 : 0;

    const backfillJobsJson = state.backfillJobs ? JSON.stringify(state.backfillJobs) : null;

    // Use raw SQL for all fields to work around Drizzle ORM issue
    const sqlite = this.db.getSqlite();

    // Check if row exists
    const existingRow = sqlite.prepare('SELECT id FROM sync_state WHERE id = 1').get();

    if (existingRow) {
      // Row exists, update it using raw SQL
      sqlite.prepare(`
        UPDATE sync_state
        SET history_id = ?,
            last_full_sync = ?,
            last_incremental_sync = ?,
            total_emails_processed = ?,
            total_tokens_used = ?,
            is_paused = ?,
            backfill_jobs = ?
        WHERE id = 1
      `).run(
        state.historyId ?? null,
        state.lastFullSync ? state.lastFullSync.getTime() : null,
        state.lastIncrementalSync ? state.lastIncrementalSync.getTime() : null,
        state.totalEmailsProcessed,
        state.totalTokensUsed,
        isPausedInt,
        backfillJobsJson
      );
    } else {
      // Row doesn't exist, insert it using raw SQL
      sqlite.prepare(`
        INSERT INTO sync_state (id, history_id, last_full_sync, last_incremental_sync, total_emails_processed, total_tokens_used, is_paused, backfill_jobs)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        state.historyId ?? null,
        state.lastFullSync ? state.lastFullSync.getTime() : null,
        state.lastIncrementalSync ? state.lastIncrementalSync.getTime() : null,
        state.totalEmailsProcessed,
        state.totalTokensUsed,
        isPausedInt,
        backfillJobsJson
      );
    }
  }
}
