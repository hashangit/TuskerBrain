import { eq, desc, sql, gte } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';

/**
 * Sender summary record type
 */
export interface SenderSummaryRecord {
  id: string;
  senderDomain: string;
  summary: string;
  wordCount: number | null;
  lastUpdated: Date;
  lastEmailId: string | null;
  updateCount: number;
}

/**
 * Sender summary creation/update data
 */
export interface SenderSummaryData {
  senderDomain: string;
  summary: string;
  wordCount?: number;
  lastEmailId?: string;
}

/**
 * Summaries repository for database operations
 * Handles both topic summaries (via TopicsRepository) and sender summaries
 */
export class SummariesRepository {
  private db: TuskerBrainDatabase;

  constructor(db: TuskerBrainDatabase) {
    this.db = db;
  }

  /**
   * Create or update a sender summary
   *
   * Note: better-sqlite3 transactions are synchronous. The transaction wrapper
   * has been removed since Drizzle ORM with better-sqlite3 handles atomic operations
   * automatically for single statements.
   */
  async upsertSenderSummary(data: SenderSummaryData): Promise<SenderSummaryRecord> {
    const db = this.db.getDatabase();

    // Check if summary exists
    const [existing] = await db
      .select()
      .from(schema.senderSummaries)
      .where(eq(schema.senderSummaries.senderDomain, data.senderDomain))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(schema.senderSummaries)
        .set({
          summary: data.summary,
          wordCount: data.wordCount || null,
          lastUpdated: new Date(),
          lastEmailId: data.lastEmailId || null,
          updateCount: sql`${schema.senderSummaries.updateCount} + 1`,
        })
        .where(eq(schema.senderSummaries.senderDomain, data.senderDomain))
        .returning();

      return this.toSenderRecord(updated);
    } else {
      const [created] = await db
        .insert(schema.senderSummaries)
        .values({
          id: `ss_${data.senderDomain.replace(/[^a-zA-Z0-9]/g, '_')}`,
          senderDomain: data.senderDomain,
          summary: data.summary,
          wordCount: data.wordCount || null,
          lastEmailId: data.lastEmailId || null,
          updateCount: 1,
        })
        .returning();

      return this.toSenderRecord(created);
    }
  }

  /**
   * Get a sender summary by domain
   */
  async getSenderSummary(domain: string): Promise<SenderSummaryRecord | null> {
    const [summary] = await this.db.getDatabase()
      .select()
      .from(schema.senderSummaries)
      .where(eq(schema.senderSummaries.senderDomain, domain))
      .limit(1);

    return summary ? this.toSenderRecord(summary) : null;
  }

  /**
   * Get all sender summaries
   */
  async getAllSenderSummaries(limit?: number): Promise<SenderSummaryRecord[]> {
    let query = this.db.getDatabase()
      .select()
      .from(schema.senderSummaries)
      .orderBy(desc(schema.senderSummaries.lastUpdated));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    const results = await query;
    return results.map(this.toSenderRecord);
  }

  /**
   * Get recently updated sender summaries
   */
  async getRecentlyUpdated(days: number, limit?: number): Promise<SenderSummaryRecord[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    let query = this.db.getDatabase()
      .select()
      .from(schema.senderSummaries)
      .where(gte(schema.senderSummaries.lastUpdated, cutoff))
      .orderBy(desc(schema.senderSummaries.lastUpdated));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    const results = await query;
    return results.map(this.toSenderRecord);
  }

  /**
   * Delete a sender summary
   */
  async deleteSenderSummary(domain: string): Promise<void> {
    await this.db.getDatabase()
      .delete(schema.senderSummaries)
      .where(eq(schema.senderSummaries.senderDomain, domain));
  }

  /**
   * Count sender summaries
   */
  async countSenderSummaries(): Promise<number> {
    const [result] = await this.db.getDatabase()
      .select({ count: sql<number>`count(*)` })
      .from(schema.senderSummaries);

    return result?.count || 0;
  }

  /**
   * Get total word count across all sender summaries
   */
  async getTotalWordCount(): Promise<number> {
    const [result] = await this.db.getDatabase()
      .select({ total: sql<number>`sum(${schema.senderSummaries.wordCount})` })
      .from(schema.senderSummaries);

    return result?.total || 0;
  }

  /**
   * Convert database row to sender summary record type
   */
  private toSenderRecord(row: typeof schema.senderSummaries.$inferSelect): SenderSummaryRecord {
    return {
      id: row.id,
      senderDomain: row.senderDomain,
      summary: row.summary,
      wordCount: row.wordCount,
      lastUpdated: row.lastUpdated ?? new Date(),
      lastEmailId: row.lastEmailId,
      updateCount: row.updateCount ?? 0,
    };
  }
}
