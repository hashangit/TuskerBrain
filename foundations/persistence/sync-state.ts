import { eq } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '@foundations/database';
import * as schema from '@foundations/database/schema';

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

    const row = rows[0];

    return {
      historyId: row?.historyId ?? undefined,
      lastFullSync: row?.lastFullSync ?? undefined,
      lastIncrementalSync: row?.lastIncrementalSync ?? undefined,
      totalEmailsProcessed: row?.totalEmailsProcessed ?? 0,
      totalTokensUsed: row?.totalTokensUsed ?? 0,
      isPaused: row?.isPaused ?? false,
      backfillJobs: safeParseBackfillJobs(row?.backfillJobs),
    };
  }

  async save(state: SyncStateData): Promise<void> {
    const drizzle = this.db.getDatabase();

    await drizzle.insert(schema.syncState)
      .values({
        id: 1,
        historyId: state.historyId ?? null,
        lastFullSync: state.lastFullSync ?? null,
        lastIncrementalSync: state.lastIncrementalSync ?? null,
        totalEmailsProcessed: state.totalEmailsProcessed,
        totalTokensUsed: state.totalTokensUsed,
        isPaused: state.isPaused ?? false,
        backfillJobs: state.backfillJobs ?? null,
      })
      .onConflictDoUpdate({
        target: schema.syncState.id,
        set: {
          historyId: state.historyId ?? null,
          lastFullSync: state.lastFullSync ?? null,
          lastIncrementalSync: state.lastIncrementalSync ?? null,
          totalEmailsProcessed: state.totalEmailsProcessed,
          totalTokensUsed: state.totalTokensUsed,
          isPaused: state.isPaused ?? false,
          backfillJobs: state.backfillJobs ?? null,
        },
      });
  }
}

/**
 * Safely parse backfillJobs from the database blob column.
 * Drizzle's blob json mode auto-parses JSON, but corrupted data
 * could still cause a runtime error. This guard returns undefined
 * on any failure, matching the original try/catch around JSON.parse.
 */
function safeParseBackfillJobs(value: unknown): BackfillJob[] | undefined {
  if (value == null) return undefined;
  try {
    if (Array.isArray(value)) return value as BackfillJob[];
    return undefined;
  } catch {
    return undefined;
  }
}
