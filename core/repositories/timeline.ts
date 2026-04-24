import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';

/**
 * Timeline update record type
 */
export interface TopicInfo {
  primary: string;
  count: number;
  all: string[];
}

export interface TimelineUpdateRecord {
  id: string;
  emailId: string;
  threadId?: string;
  title: string;
  description: string | null;
  summary: string | null;
  priority: 'high' | 'medium' | 'low' | null;
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  urgency: boolean;
  importanceReason: string | null;
  actionItem: boolean;
  actionItemTitle: string | null;
  actionItemCompleted: boolean;
  actionItemCompletedAt: Date | null;
  followUpDate: string | null;
  financialImpact: number | null;
  keyEntities: { dates: string[]; amounts: number[]; names: string[] } | null;
  createdAt: Date;
  receivedAt?: Date;
  senderDomain?: string;
  gmailCategory?: string | null;
  senderEmail?: string;
  senderName?: string | null;
  topic?: TopicInfo | null;
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
  actionItemCompleted?: boolean;
  actionItemCompletedAt?: Date;
  followUpDate?: string;
  financialImpact?: number;
  keyEntities?: { dates: string[]; amounts: number[]; names: string[] };
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

    return results.map(row => this.toRecord(row));
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

    // Query 1: Get timeline updates with sender info (no topic join = no duplicates)
    let query = this.db.getDatabase()
      .select({
        id: schema.timelineUpdates.id,
        emailId: schema.timelineUpdates.emailId,
        threadId: schema.emails.threadId,
        title: schema.timelineUpdates.title,
        description: schema.timelineUpdates.description,
        summary: schema.timelineUpdates.summary,
        priority: schema.timelineUpdates.priority,
        sentiment: schema.timelineUpdates.sentiment,
        urgency: schema.timelineUpdates.urgency,
        importanceReason: schema.timelineUpdates.importanceReason,
        actionItem: schema.timelineUpdates.actionItem,
        actionItemTitle: schema.timelineUpdates.actionItemTitle,
        actionItemCompleted: schema.timelineUpdates.actionItemCompleted,
        actionItemCompletedAt: schema.timelineUpdates.actionItemCompletedAt,
        followUpDate: schema.timelineUpdates.followUpDate,
        financialImpact: schema.timelineUpdates.financialImpact,
        keyEntities: schema.timelineUpdates.keyEntities,
        createdAt: schema.timelineUpdates.createdAt,
        receivedAt: schema.emails.receivedAt,
        senderDomain: schema.emails.senderDomain,
        gmailCategory: schema.emails.gmailCategory,
        senderEmail: schema.emails.senderEmail,
        senderName: schema.emails.senderName,
      })
      .from(schema.timelineUpdates)
      .innerJoin(schema.emails, eq(schema.timelineUpdates.emailId, schema.emails.id));

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

    const updates = await query;

    if (updates.length === 0) return [];

    // Query 2: Get topics for all emailIds in the result
    const emailIds = updates.map(u => u.emailId);
    const topicRows = await this.db.getDatabase()
      .select({
        emailId: schema.emailTopics.emailId,
        topicPath: schema.topics.fullPath,
        confidence: schema.emailTopics.confidenceScore,
      })
      .from(schema.emailTopics)
      .innerJoin(schema.topics, eq(schema.emailTopics.topicId, schema.topics.id))
      .where(inArray(schema.emailTopics.emailId, emailIds));

    // Build topic map: emailId -> TopicInfo
    const topicMap = new Map<string, { paths: string[]; confidences: number[] }>();
    for (const row of topicRows) {
      const existing = topicMap.get(row.emailId) ?? { paths: [], confidences: [] };
      existing.paths.push(row.topicPath);
      existing.confidences.push(row.confidence ?? 0);
      topicMap.set(row.emailId, existing);
    }

    return updates.map(row => {
      const topicData = topicMap.get(row.emailId);
      let topic: TopicInfo | null = null;
      if (topicData && topicData.paths.length > 0) {
        // Pick the primary topic as the first one (or could be highest confidence)
        topic = {
          primary: topicData.paths[0],
          count: topicData.paths.length,
          all: topicData.paths,
        };
      }
      return this.toRecord(row, topic);
    });
  }

  /**
   * Find recent timeline updates
   */
  async findRecent(limit?: number): Promise<TimelineUpdateRecord[]> {
    return this.findAll({ limit });
  }

  /**
   * Find high priority updates
   */
  async findHighPriority(limit?: number): Promise<TimelineUpdateRecord[]>{
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
   * Get week sender aggregates - emails grouped by sender domain for the past 7 days
   */
  async getWeekSenders(startDate: Date): Promise<Array<{
    domain: string;
    category: string;
    count: number;
    summary: string;
  }>> {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() - startDate.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    weekEnd.setHours(0, 0, 0, 0); // Boundaries for the query

    const results = await this.db.getDatabase()
      .select({
        domain: schema.emails.senderDomain,
        category: schema.emails.gmailCategory,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(schema.timelineUpdates)
      .innerJoin(schema.emails, eq(schema.timelineUpdates.emailId, schema.emails.id))
      .where(and(
        sql`${schema.timelineUpdates.createdAt} >= ${weekStart.getTime()}`,
        sql`${schema.timelineUpdates.createdAt} < ${weekEnd.getTime()}`
      ))
      .groupBy(schema.emails.senderDomain, schema.emails.gmailCategory)
      .orderBy(sql`count(*) DESC`);

    // Get summaries for each sender
    const sendersWithSummaries = await Promise.all(
      results.map(async (r) => {
        const summaryResult = await this.db.getDatabase()
          .select({ summary: schema.senderSummaries.summary })
          .from(schema.senderSummaries)
          .where(eq(schema.senderSummaries.senderDomain, r.domain))
          .limit(1);

        return {
          domain: r.domain,
          category: r.category || 'General',
          count: r.count,
          summary: summaryResult[0]?.summary || `Emails from ${r.domain}`,
        };
      })
    );

    return sendersWithSummaries;
  }

  /**
   * Get month stats aggregates - email counts and action items per month
   */
  async getMonthStats(monthsBack: number = 3): Promise<Array<{
    month: string;
    weeks: number;
    emails: number;
    actionItems: number;
  }>> {
    const results: Array<{ month: string; weeks: number; emails: number; actionItems: number }> = [];

    for (let i = 0; i < monthsBack; i++) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setMonth(monthStart.getMonth() - i);
      monthStart.setHours(0, 0, 0, 0);

      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const [emailResult] = await this.db.getDatabase()
        .select({ count: sql<number>`count(*)` })
        .from(schema.timelineUpdates)
        .where(sql`${schema.timelineUpdates.createdAt} >= ${monthStart.getTime()} AND ${schema.timelineUpdates.createdAt} < ${monthEnd.getTime()}`);

      const [actionResult] = await this.db.getDatabase()
        .select({ count: sql<number>`count(*)` })
        .from(schema.timelineUpdates)
        .where(sql`${schema.timelineUpdates.createdAt} >= ${monthStart.getTime()} AND ${schema.timelineUpdates.createdAt} < ${monthEnd.getTime()} AND ${schema.timelineUpdates.actionItem} = 1`);

      const monthName = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const weeksInMonth = Math.ceil(monthEnd.getDate() / 7);

      results.push({
        month: monthName,
        weeks: weeksInMonth,
        emails: emailResult?.count || 0,
        actionItems: actionResult?.count || 0,
      });
    }

    return results;
  }

  /**
   * Get year stats aggregates - email counts, action items, and deals per year
   */
  async getYearStats(yearsBack: number = 3): Promise<Array<{
    year: string;
    emails: number;
    actionItems: number;
    deals: number;
  }>> {
    const results: Array<{ year: string; emails: number; actionItems: number; deals: number }> = [];

    for (let i = 0; i < yearsBack; i++) {
      const yearStart = new Date();
      yearStart.setFullYear(yearStart.getFullYear() - i);
      yearStart.setMonth(0, 1);
      yearStart.setHours(0, 0, 0, 0);

      const yearEnd = new Date(yearStart);
      yearEnd.setFullYear(yearEnd.getFullYear() + 1);

      const [emailResult] = await this.db.getDatabase()
        .select({ count: sql<number>`count(*)` })
        .from(schema.timelineUpdates)
        .where(sql`${schema.timelineUpdates.createdAt} >= ${yearStart.getTime()} AND ${schema.timelineUpdates.createdAt} < ${yearEnd.getTime()}`);

      const [actionResult] = await this.db.getDatabase()
        .select({ count: sql<number>`count(*)` })
        .from(schema.timelineUpdates)
        .where(sql`${schema.timelineUpdates.createdAt} >= ${yearStart.getTime()} AND ${schema.timelineUpdates.createdAt} < ${yearEnd.getTime()} AND ${schema.timelineUpdates.actionItem} = 1`);

      const [dealResult] = await this.db.getDatabase()
        .select({ count: sql<number>`count(*)` })
        .from(schema.deals)
        .where(sql`${schema.deals.createdAt} >= ${yearStart.getTime()} AND ${schema.deals.createdAt} < ${yearEnd.getTime()}`);

      results.push({
        year: String(yearStart.getFullYear()),
        emails: emailResult?.count || 0,
        actionItems: actionResult?.count || 0,
        deals: dealResult?.count || 0,
      });
    }

    return results;
  }

  /**
   * Toggle an action item's completion status
   */
  async toggleActionItemCompleted(id: string): Promise<TimelineUpdateRecord | null> {
    // Get current state
    const [current] = await this.db.getDatabase()
      .select()
      .from(schema.timelineUpdates)
      .where(eq(schema.timelineUpdates.id, id))
      .limit(1);

    if (!current) return null;

    const newCompleted = !(current.actionItemCompleted ?? false);
    const [updated] = await this.db.getDatabase()
      .update(schema.timelineUpdates)
      .set({
        actionItemCompleted: newCompleted,
        actionItemCompletedAt: newCompleted ? new Date() : null,
      })
      .where(eq(schema.timelineUpdates.id, id))
      .returning();

    return updated ? this.toRecord(updated) : null;
  }

  /**
   * Convert database row to record type
   */
  private toRecord(
    row: typeof schema.timelineUpdates.$inferSelect & Partial<{
      threadId: string | null;
      senderDomain: string | null;
      gmailCategory: string | null;
      senderEmail: string | null;
      senderName: string | null;
      receivedAt: Date | null;
    }>,
    topic?: TopicInfo | null,
  ): TimelineUpdateRecord {
    return {
      id: row.id,
      emailId: row.emailId,
      threadId: row.threadId ?? undefined,
      title: row.title,
      description: row.description,
      summary: row.summary,
      priority: row.priority,
      sentiment: row.sentiment,
      urgency: row.urgency ?? false,
      importanceReason: row.importanceReason,
      actionItem: row.actionItem ?? false,
      actionItemTitle: row.actionItemTitle,
      actionItemCompleted: row.actionItemCompleted ?? false,
      actionItemCompletedAt: row.actionItemCompletedAt ?? null,
      followUpDate: row.followUpDate,
      financialImpact: row.financialImpact,
      keyEntities: row.keyEntities,
      createdAt: row.createdAt ?? new Date(),
      receivedAt: row.receivedAt ?? undefined,
      senderDomain: row.senderDomain ?? undefined,
      gmailCategory: row.gmailCategory ?? undefined,
      senderEmail: row.senderEmail ?? undefined,
      senderName: row.senderName ?? undefined,
      topic,
    };
  }
}
