// @ts-nocheck
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
  senderDomain?: string;
  gmailCategory?: string | null;
  senderEmail?: string;
  senderName?: string | null;
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
      .select({
        id: schema.timelineUpdates.id,
        emailId: schema.timelineUpdates.emailId,
        title: schema.timelineUpdates.title,
        description: schema.timelineUpdates.description,
        summary: schema.timelineUpdates.summary,
        priority: schema.timelineUpdates.priority,
        sentiment: schema.timelineUpdates.sentiment,
        urgency: schema.timelineUpdates.urgency,
        importanceReason: schema.timelineUpdates.importanceReason,
        actionItem: schema.timelineUpdates.actionItem,
        actionItemTitle: schema.timelineUpdates.actionItemTitle,
        followUpDate: schema.timelineUpdates.followUpDate,
        financialImpact: schema.timelineUpdates.financialImpact,
        keyEntities: schema.timelineUpdates.keyEntities,
        createdAt: schema.timelineUpdates.createdAt,
        senderDomain: schema.emails.senderDomain,
        gmailCategory: schema.emails.gmailCategory,
        senderEmail: schema.emails.senderEmail,
        senderName: schema.emails.senderName,
      })
      .from(schema.timelineUpdates)
      .innerJoin(schema.emails, eq(schema.timelineUpdates.emailId, schema.emails.id));

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
    return results.map(row => this.toRecord(row));
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
    const weekAgo = new Date(startDate);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const results = await this.db.getDatabase()
      .select({
        domain: schema.emails.senderDomain,
        category: schema.emails.gmailCategory,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(schema.timelineUpdates)
      .innerJoin(schema.emails, eq(schema.timelineUpdates.emailId, schema.emails.id))
      .where(sql`${schema.timelineUpdates.createdAt} >= ${weekAgo.getTime()}`)
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
   * Convert database row to record type
   */
  private toRecord(row: any): TimelineUpdateRecord {
    // Handle createdAt conversion - Drizzle's timestamp mode multiplies by 1000 incorrectly
    // DB stores milliseconds, but Drizzle treats it as seconds and converts to milliseconds
    let createdAt: Date;
    if (row.createdAt instanceof Date) {
      // Drizzle multiplied by 1000, so we need to divide back
      const correctedMs = row.createdAt.getTime() / 1000;
      createdAt = new Date(correctedMs);
    } else if (typeof row.createdAt === 'number') {
      createdAt = new Date(row.createdAt);
    } else if (typeof row.createdAt === 'string') {
      createdAt = new Date(row.createdAt);
    } else {
      createdAt = new Date();
    }

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
      createdAt,
      senderDomain: row.senderDomain,
      gmailCategory: row.gmailCategory,
      senderEmail: row.senderEmail,
      senderName: row.senderName,
    };
  }
}
