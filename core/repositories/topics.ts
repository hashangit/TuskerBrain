import { eq, and, desc, sql } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';

/**
 * Topic record type
 */
export interface TopicRecord {
  id: string;
  parentId: string | null;
  name: string;
  fullPath: string;
  emailCount: number;
  createdAt: Date;
}

/**
 * Topic creation data
 */
export interface CreateTopicData {
  id: string;
  parentId?: string;
  name: string;
  fullPath: string;
  emailCount?: number;
}

/**
 * Topic summary record type
 */
export interface TopicSummaryRecord {
  id: string;
  topicId: string;
  summary: string;
  wordCount: number | null;
  lastUpdated: Date;
  lastEmailId: string | null;
  updateCount: number;
}

/**
 * Topics repository for database operations
 */
export class TopicsRepository {
  private db: TuskerBrainDatabase;

  constructor(db: TuskerBrainDatabase) {
    this.db = db;
  }

  /**
   * Create a new topic
   */
  async create(data: CreateTopicData): Promise<TopicRecord> {
    const [topic] = await this.db.getDatabase()
      .insert(schema.topics)
      .values({
        id: data.id,
        parentId: data.parentId || null,
        name: data.name,
        fullPath: data.fullPath,
        emailCount: data.emailCount || 0,
      })
      .returning();

    return this.toRecord(topic);
  }

  /**
   * Find a topic by ID
   */
  async findById(id: string): Promise<TopicRecord | null> {
    const [topic] = await this.db.getDatabase()
      .select()
      .from(schema.topics)
      .where(eq(schema.topics.id, id))
      .limit(1);

    return topic ? this.toRecord(topic) : null;
  }

  /**
   * Find a topic by full path
   */
  async findByFullPath(fullPath: string): Promise<TopicRecord | null> {
    const [topic] = await this.db.getDatabase()
      .select()
      .from(schema.topics)
      .where(eq(schema.topics.fullPath, fullPath))
      .limit(1);

    return topic ? this.toRecord(topic) : null;
  }

  /**
   * Find all topics
   */
  async findAll(): Promise<TopicRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.topics)
      .orderBy(schema.topics.fullPath);

    return results.map(this.toRecord);
  }

  /**
   * Find root topics (no parent)
   */
  async findRoots(): Promise<TopicRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.topics)
      .where(sql`${schema.topics.parentId} IS NULL`)
      .orderBy(schema.topics.name);

    return results.map(this.toRecord);
  }

  /**
   * Find child topics of a parent
   */
  async findChildren(parentId: string): Promise<TopicRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.topics)
      .where(eq(schema.topics.parentId, parentId))
      .orderBy(schema.topics.name);

    return results.map(this.toRecord);
  }

  /**
   * Update email count
   */
  async incrementEmailCount(id: string): Promise<void> {
    await this.db.getDatabase()
      .update(schema.topics)
      .set({
        emailCount: sql`${schema.topics.emailCount} + 1`,
      })
      .where(eq(schema.topics.id, id));
  }

  /**
   * Link an email to a topic
   */
  async linkEmail(emailId: string, topicId: string, confidenceScore?: number): Promise<void> {
    await this.db.getDatabase()
      .insert(schema.emailTopics)
      .values({
        emailId,
        topicId,
        confidenceScore: confidenceScore || null,
      })
      .onConflictDoNothing();
  }

  /**
   * Find topics for an email
   */
  async findTopicsForEmail(emailId: string): Promise<(TopicRecord & { confidenceScore: number | null })[]> {
    const results = await this.db.getDatabase()
      .select({
        id: schema.topics.id,
        parentId: schema.topics.parentId,
        name: schema.topics.name,
        fullPath: schema.topics.fullPath,
        emailCount: schema.topics.emailCount,
        createdAt: schema.topics.createdAt,
        confidenceScore: schema.emailTopics.confidenceScore,
      })
      .from(schema.topics)
      .innerJoin(
        schema.emailTopics,
        eq(schema.topics.id, schema.emailTopics.topicId)
      )
      .where(eq(schema.emailTopics.emailId, emailId));

    return results.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      fullPath: row.fullPath,
      emailCount: row.emailCount,
      createdAt: row.createdAt,
      confidenceScore: row.confidenceScore,
    }));
  }

  /**
   * Find emails for a topic
   */
  async findEmailsForTopic(topicId: string): Promise<string[]> {
    const results = await this.db.getDatabase()
      .select({ emailId: schema.emailTopics.emailId })
      .from(schema.emailTopics)
      .where(eq(schema.emailTopics.topicId, topicId));

    return results.map((r) => r.emailId);
  }

  /**
   * Create or update a topic summary
   */
  async upsertSummary(
    topicId: string,
    summary: string,
    wordCount: number,
    lastEmailId: string
  ): Promise<TopicSummaryRecord> {
    const [existing] = await this.db.getDatabase()
      .select()
      .from(schema.topicSummaries)
      .where(eq(schema.topicSummaries.topicId, topicId))
      .limit(1);

    if (existing) {
      const [updated] = await this.db.getDatabase()
        .update(schema.topicSummaries)
        .set({
          summary,
          wordCount,
          lastUpdated: new Date(),
          lastEmailId,
          updateCount: sql`${schema.topicSummaries.updateCount} + 1`,
        })
        .where(eq(schema.topicSummaries.topicId, topicId))
        .returning();

      return this.toSummaryRecord(updated);
    } else {
      const [created] = await this.db.getDatabase()
        .insert(schema.topicSummaries)
        .values({
          id: `ts_${topicId}`,
          topicId,
          summary,
          wordCount,
          lastEmailId,
          updateCount: 1,
        })
        .returning();

      return this.toSummaryRecord(created);
    }
  }

  /**
   * Get a topic summary
   */
  async getSummary(topicId: string): Promise<TopicSummaryRecord | null> {
    const [summary] = await this.db.getDatabase()
      .select()
      .from(schema.topicSummaries)
      .where(eq(schema.topicSummaries.topicId, topicId))
      .limit(1);

    return summary ? this.toSummaryRecord(summary) : null;
  }

  /**
   * Delete a topic
   */
  async delete(id: string): Promise<void> {
    await this.db.getDatabase()
      .delete(schema.topics)
      .where(eq(schema.topics.id, id));
  }

  /**
   * Count topics
   */
  async count(): Promise<number> {
    const [result] = await this.db.getDatabase()
      .select({ count: sql<number>`count(*)` })
      .from(schema.topics);

    return result?.count || 0;
  }

  /**
   * Convert database row to record type
   */
  private toRecord(row: typeof schema.topics.$inferSelect): TopicRecord {
    return {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      fullPath: row.fullPath,
      emailCount: row.emailCount,
      createdAt: row.createdAt,
    };
  }

  /**
   * Convert summary database row to record type
   */
  private toSummaryRecord(row: typeof schema.topicSummaries.$inferSelect): TopicSummaryRecord {
    return {
      id: row.id,
      topicId: row.topicId,
      summary: row.summary,
      wordCount: row.wordCount,
      lastUpdated: row.lastUpdated,
      lastEmailId: row.lastEmailId,
      updateCount: row.updateCount,
    };
  }
}
