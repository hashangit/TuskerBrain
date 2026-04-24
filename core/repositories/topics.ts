import { eq, and, desc, sql, inArray } from 'drizzle-orm';
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
  gmailLabelId: string | null;
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
  gmailLabelId?: string;
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
        gmailLabelId: data.gmailLabelId || null,
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
        gmailLabelId: schema.topics.gmailLabelId,
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
      emailCount: row.emailCount ?? 0,
      gmailLabelId: row.gmailLabelId,
      createdAt: row.createdAt ?? new Date(),
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
    wordCount?: number,
    lastEmailId?: string
  ): Promise<TopicSummaryRecord> {
    const db = this.db.getDatabase();
    const count = wordCount ?? summary.split(/\s+/).filter(w => w.length > 0).length;

    // Check if summary exists
    const [existing] = await db
      .select()
      .from(schema.topicSummaries)
      .where(eq(schema.topicSummaries.topicId, topicId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(schema.topicSummaries)
        .set({
          summary,
          wordCount: count,
          lastUpdated: new Date(),
          ...(lastEmailId ? { lastEmailId } : {}),
          updateCount: sql`${schema.topicSummaries.updateCount} + 1`,
        })
        .where(eq(schema.topicSummaries.topicId, topicId))
        .returning();

      return this.toSummaryRecord(updated);
    } else {
      const [created] = await db
        .insert(schema.topicSummaries)
        .values({
          id: `ts_${topicId}`,
          topicId,
          summary,
          wordCount: count,
          ...(lastEmailId ? { lastEmailId } : {}),
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
   * Update the Gmail label ID for a topic
   */
  async updateGmailLabelId(topicId: string, gmailLabelId: string): Promise<void> {
    await this.db.getDatabase()
      .update(schema.topics)
      .set({ gmailLabelId })
      .where(eq(schema.topics.id, topicId));
  }

  /**
   * Find topics that don't have a Gmail label assigned
   */
  async findTopicsWithoutGmailLabel(): Promise<TopicRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.topics)
      .where(sql`${schema.topics.gmailLabelId} IS NULL`)
      .orderBy(schema.topics.fullPath);

    return results.map(this.toRecord);
  }

  /**
   * Get all descendant topic IDs (children, grandchildren, etc.)
   */
  private async getDescendantTopicIds(topicId: string): Promise<string[]> {
    const children = await this.db.getDatabase()
      .select({ id: schema.topics.id })
      .from(schema.topics)
      .where(eq(schema.topics.parentId, topicId));

    const childIds = children.map((c) => c.id);

    // Recursively get grandchildren
    const descendants: string[] = [];
    for (const childId of childIds) {
      descendants.push(childId);
      const grandChildren = await this.getDescendantTopicIds(childId);
      descendants.push(...grandChildren);
    }

    return descendants;
  }

  /**
   * Get detailed topic data including emails, senders, and action items
   * Aggregates data from child topics for parent topics
   */
  async getTopicDetail(topicId: string): Promise<{
    topic: TopicRecord;
    parentTopic: TopicRecord | null;
    childTopics: TopicRecord[];
    summary: TopicSummaryRecord | null;
    emails: Array<{
      id: string;
      threadId: string;
      subject: string | null;
      snippet: string | null;
      senderName: string | null;
      senderEmail: string;
      senderInitial: string;
      receivedAt: Date;
      isRead: boolean;
      topicName?: string;
    }>;
    senders: Array<{
      name: string;
      emailCount: number;
    }>;
    actionItems: Array<{
      id: string;
      title: string;
      completed: boolean;
      completedAt?: string;
      dueDate?: string;
      urgent?: boolean;
    }>;
    deals: Array<{
      id: string;
      title: string;
      code?: string;
      expiry?: Date;
      minPurchase?: string;
      autoApplied: boolean;
    }>;
    totalSpend?: number;
  } | null> {
    // Get the topic
    const topic = await this.findById(topicId);
    if (!topic) return null;

    // Get parent topic for category
    let parentTopic: TopicRecord | null = null;
    if (topic.parentId) {
      parentTopic = await this.findById(topic.parentId);
    }

    // Get child topics
    const childTopics = await this.findChildren(topicId);

    // Get all topic IDs to aggregate from (this topic + all descendants)
    const descendantIds = await this.getDescendantTopicIds(topicId);
    const allTopicIds = [topicId, ...descendantIds];

    // Get the summary (prefer this topic's summary, fallback to first child with summary)
    let summary = await this.getSummary(topicId);
    if (!summary && childTopics.length > 0) {
      for (const child of childTopics) {
        summary = await this.getSummary(child.id);
        if (summary) break;
      }
    }

    // Get emails from all related topics
    const emailResults = await this.db.getDatabase()
      .select({
        id: schema.emails.id,
        threadId: schema.emails.threadId,
        subject: schema.emails.subject,
        snippet: schema.emails.snippet,
        senderName: schema.emails.senderName,
        senderEmail: schema.emails.senderEmail,
        receivedAt: schema.emails.receivedAt,
        isRead: schema.emails.isRead,
        topicId: schema.emailTopics.topicId,
        topicName: schema.topics.name,
      })
      .from(schema.emails)
      .innerJoin(
        schema.emailTopics,
        eq(schema.emails.id, schema.emailTopics.emailId)
      )
      .innerJoin(
        schema.topics,
        eq(schema.emailTopics.topicId, schema.topics.id)
      )
      .where(inArray(schema.emailTopics.topicId, allTopicIds))
      .orderBy(desc(schema.emails.receivedAt))
      .limit(50);

    // Get sender aggregation from all related topics
    const senderResults = await this.db.getDatabase()
      .select({
        senderName: schema.emails.senderName,
        senderEmail: schema.emails.senderEmail,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(schema.emails)
      .innerJoin(
        schema.emailTopics,
        eq(schema.emails.id, schema.emailTopics.emailId)
      )
      .where(inArray(schema.emailTopics.topicId, allTopicIds))
      .groupBy(schema.emails.senderEmail, schema.emails.senderName)
      .orderBy(sql`count(*) desc`)
      .limit(50);

    // Get action items from timeline updates for emails in all related topics
    const actionItemResults = await this.db.getDatabase()
      .select({
        id: schema.timelineUpdates.id,
        title: schema.timelineUpdates.actionItemTitle,
        actionItemCompleted: schema.timelineUpdates.actionItemCompleted,
        actionItemCompletedAt: schema.timelineUpdates.actionItemCompletedAt,
        followUpDate: schema.timelineUpdates.followUpDate,
        urgency: schema.timelineUpdates.urgency,
      })
      .from(schema.timelineUpdates)
      .innerJoin(
        schema.emailTopics,
        eq(schema.timelineUpdates.emailId, schema.emailTopics.emailId)
      )
      .where(
        and(
          inArray(schema.emailTopics.topicId, allTopicIds),
          eq(schema.timelineUpdates.actionItem, true)
        )
      )
      .orderBy(desc(schema.timelineUpdates.createdAt))
      .limit(15);

    // Transform emails
    const emails = emailResults.map((e) => ({
      id: e.id,
      threadId: e.threadId,
      subject: e.subject,
      snippet: e.snippet,
      senderName: e.senderName,
      senderEmail: e.senderEmail,
      senderInitial: e.senderName?.charAt(0).toUpperCase() || e.senderEmail.charAt(0).toUpperCase(),
      receivedAt: e.receivedAt,
      isRead: e.isRead || false,
      topicName: e.topicName,
    }));

    // Transform senders - aggregate by display name
    const senderMap = new Map<string, number>();
    for (const s of senderResults) {
      const name = s.senderName || s.senderEmail.split('@')[0];
      const current = senderMap.get(name) || 0;
      senderMap.set(name, current + s.count);
    }
    const senders = Array.from(senderMap.entries())
      .map(([name, count]) => ({ name, emailCount: count }))
      .sort((a, b) => b.emailCount - a.emailCount);

    // Transform action items
    const actionItems = actionItemResults
      .filter((a) => a.title)
      .map((a) => ({
        id: a.id,
        title: a.title!,
        completed: a.actionItemCompleted ?? false,
        completedAt: a.actionItemCompletedAt?.toISOString() ?? undefined,
        dueDate: a.followUpDate ?? undefined,
        urgent: a.urgency ?? false,
      }));

    // Get deals from emails in all related topics
    const dealResults = await this.db.getDatabase()
      .select({
        id: schema.deals.id,
        dealTitle: schema.deals.dealTitle,
        dealCode: schema.deals.dealCode,
        dealExpiry: schema.deals.dealExpiry,
        minimumPurchase: schema.deals.minimumPurchase,
        dealLink: schema.deals.dealLink,
        isActive: schema.deals.isActive,
        usedAt: schema.deals.usedAt,
        dismissedAt: schema.deals.dismissedAt,
      })
      .from(schema.deals)
      .innerJoin(
        schema.emails,
        eq(schema.deals.emailId, schema.emails.id)
      )
      .innerJoin(
        schema.emailTopics,
        eq(schema.emails.id, schema.emailTopics.emailId)
      )
      .where(
        and(
          inArray(schema.emailTopics.topicId, allTopicIds),
          eq(schema.deals.isActive, true),
          sql`${schema.deals.usedAt} IS NULL`,
          sql`${schema.deals.dismissedAt} IS NULL`
        )
      )
      .orderBy(desc(schema.deals.createdAt))
      .limit(15);

    // Aggregate financial impact from timeline updates
    const financialResult = await this.db.getDatabase()
      .select({
        total: sql<number>`COALESCE(SUM(${schema.timelineUpdates.financialImpact}), 0)`,
      })
      .from(schema.timelineUpdates)
      .innerJoin(
        schema.emailTopics,
        eq(schema.timelineUpdates.emailId, schema.emailTopics.emailId)
      )
      .where(
        and(
          inArray(schema.emailTopics.topicId, allTopicIds),
          sql`${schema.timelineUpdates.financialImpact} IS NOT NULL`
        )
      );

    const deals = dealResults.map((d) => ({
      id: d.id,
      title: d.dealTitle,
      code: d.dealCode ?? undefined,
      expiry: d.dealExpiry ?? undefined,
      minPurchase: d.minimumPurchase ?? undefined,
      autoApplied: false,
    }));

    const totalSpend = financialResult[0]?.total ?? 0;

    return {
      topic,
      parentTopic,
      childTopics,
      summary,
      emails,
      senders,
      actionItems,
      deals,
      totalSpend: totalSpend > 0 ? totalSpend : undefined,
    };
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
      emailCount: row.emailCount ?? 0,
      gmailLabelId: row.gmailLabelId,
      createdAt: row.createdAt ?? new Date(),
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
      lastUpdated: row.lastUpdated ?? new Date(),
      lastEmailId: row.lastEmailId,
      updateCount: row.updateCount ?? 0,
    };
  }
}
