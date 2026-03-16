import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';

/**
 * Timeline update record type
 */
export interface TimelineUpdateRecord {
  id: string;
  emailId: string;
  title: string;
  description: string | null;
  summary: string | null;
  priority: 'high' | 'medium' | 'low' | null;
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  urgency: boolean;
  importanceReason: string | null;
  actionItem: boolean;
  actionItemTitle: string | null;
  followUpDate: string | null;
  financialImpact: number | null;
  keyEntities: { dates?: string[]; amounts?: number[]; names?: string[] } | null;
  createdAt: Date;
}

/**
 * Timeline update creation data
 */
export interface CreateTimelineUpdateData {
  id: string;
  emailId: string;
  title: string;
  description?: string;
  summary?: string;
  priority?: 'high' | 'medium' | 'low';
  sentiment?: 'positive' | 'negative' | 'neutral';
  urgency?: boolean;
  importanceReason?: string;
  actionItem?: boolean;
  actionItemTitle?: string;
  followUpDate?: string;
  financialImpact?: number;
  keyEntities?: { dates?: string[]; amounts?: number[]; names?: string[] };
}

/**
 * Timeline repository for database operations
 */
export class TimelineRepository {
  private db: TuskerBrainDatabase;

  constructor(db: TuskerBrainDatabase) {
    this.db = db;
  }

  /**
   * Create a new timeline update
   */
  async create(data: CreateTimelineUpdateData): Promise<TimelineUpdateRecord> {
    const [update] = await this.db.getDatabase()
      .insert(schema.timelineUpdates)
      .values({
        id: data.id,
        emailId: data.emailId,
        title: data.title,
        description: data.description || null,
        summary: data.summary || null,
        priority: data.priority || null,
        sentiment: data.sentiment || null,
        urgency: data.urgency || false,
        importanceReason: data.importanceReason || null,
        actionItem: data.actionItem || false,
        actionItemTitle: data.actionItemTitle || null,
        followUpDate: data.followUpDate || null,
        financialImpact: data.financialImpact || null,
        keyEntities: data.keyEntities || null,
      })
      .returning();

    return this.toRecord(update);
  }

  /**
   * Find a timeline update by ID
   */
  async findById(id: string): Promise<TimelineUpdateRecord | null> {
    const [update] = await this.db.getDatabase()
      .select()
      .from(schema.timelineUpdates)
      .where(eq(schema.timelineUpdates.id, id))
      .limit(1);

    return update ? this.toRecord(update) : null;
  }

  /**
   * Find timeline updates by email ID
   */
  async findByEmailId(emailId: string): Promise<TimelineUpdateRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.timelineUpdates)
      .where(eq(schema.timelineUpdates.emailId, emailId))
      .orderBy(desc(schema.timelineUpdates.createdAt));

    return results.map(this.toRecord);
  }

  /**
   * Find all timeline updates with optional filters
   */
  async findAll(options?: {
    priority?: 'high' | 'medium' | 'low';
    sentiment?: 'positive' | 'negative' | 'neutral';
    hasActionItem?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<TimelineUpdateRecord[]> {
    let query = this.db.getDatabase()
      .select()
      .from(schema.timelineUpdates);

    const conditions = [];
    if (options?.priority) {
      conditions.push(eq(schema.timelineUpdates.priority, options.priority));
    }
    if (options?.sentiment) {
      conditions.push(eq(schema.timelineUpdates.sentiment, options.sentiment));
    }
    if (options?.hasActionItem !== undefined) {
      conditions.push(eq(schema.timelineUpdates.actionItem, options.hasActionItem));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    query = query.orderBy(desc(schema.timelineUpdates.createdAt)) as typeof query;

    if (options?.limit) {
      query = query.limit(options.limit) as typeof query;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as typeof query;
    }

    const results = await query;
    return results.map(this.toRecord);
  }

  /**
   * Find high priority updates
   */
  async findHighPriority(limit?: number): Promise<TimelineUpdateRecord[]> {
    return this.findAll({ priority: 'high', limit });
  }

  /**
   * Find updates with action items
   */
  async findActionItems(limit?: number): Promise<TimelineUpdateRecord[]> {
    return this.findAll({ hasActionItem: true, limit });
  }

  /**
   * Update a timeline update
   */
  async update(id: string, data: Partial<CreateTimelineUpdateData>): Promise<TimelineUpdateRecord | null> {
    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.summary !== undefined) updateData.summary = data.summary;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.sentiment !== undefined) updateData.sentiment = data.sentiment;
    if (data.urgency !== undefined) updateData.urgency = data.urgency;
    if (data.importanceReason !== undefined) updateData.importanceReason = data.importanceReason;
    if (data.actionItem !== undefined) updateData.actionItem = data.actionItem;
    if (data.actionItemTitle !== undefined) updateData.actionItemTitle = data.actionItemTitle;
    if (data.followUpDate !== undefined) updateData.followUpDate = data.followUpDate;
    if (data.financialImpact !== undefined) updateData.financialImpact = data.financialImpact;
    if (data.keyEntities !== undefined) updateData.keyEntities = data.keyEntities;

    const [update] = await this.db.getDatabase()
      .update(schema.timelineUpdates)
      .set(updateData)
      .where(eq(schema.timelineUpdates.id, id))
      .returning();

    return update ? this.toRecord(update) : null;
  }

  /**
   * Delete a timeline update
   */
  async delete(id: string): Promise<void> {
    await this.db.getDatabase()
      .delete(schema.timelineUpdates)
      .where(eq(schema.timelineUpdates.id, id));
  }

  /**
   * Delete timeline updates by email ID
   */
  async deleteByEmailId(emailId: string): Promise<void> {
    await this.db.getDatabase()
      .delete(schema.timelineUpdates)
      .where(eq(schema.timelineUpdates.emailId, emailId));
  }

  /**
   * Count timeline updates
   */
  async count(): Promise<number> {
    const [result] = await this.db.getDatabase()
      .select({ count: sql<number>`count(*)` })
      .from(schema.timelineUpdates);

    return result?.count || 0;
  }

  /**
   * Convert database row to record type
   */
  private toRecord(row: typeof schema.timelineUpdates.$inferSelect): TimelineUpdateRecord {
    return {
      id: row.id,
      emailId: row.emailId,
      title: row.title,
      description: row.description,
      summary: row.summary,
      priority: row.priority as 'high' | 'medium' | 'low' | null,
      sentiment: row.sentiment as 'positive' | 'negative' | 'neutral' | null,
      urgency: row.urgency,
      importanceReason: row.importanceReason,
      actionItem: row.actionItem,
      actionItemTitle: row.actionItemTitle,
      followUpDate: row.followUpDate,
      financialImpact: row.financialImpact,
      keyEntities: row.keyEntities as { dates?: string[]; amounts?: number[]; names?: string[] } | null,
      createdAt: row.createdAt,
    };
  }
}
