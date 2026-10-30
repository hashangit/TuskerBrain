import { eq, and, desc, sql } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '@foundations/database';
import * as schema from '@foundations/database/schema';
import type { EmailType, GmailCategory } from '@foundations/types/email';

/**
 * Email type for repository operations
 */
export interface EmailRecord {
  id: string;
  threadId: string;
  senderEmail: string;
  senderName: string | null;
  senderDomain: string;
  subject: string | null;
  snippet: string | null;
  receivedAt: Date;
  emailType: EmailType | null;
  gmailCategory: GmailCategory | null;
  isImportant: boolean;
  isRead: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  isProcessed: boolean;
  processedAt: Date | null;
  createdAt: Date;
}

/**
 * Email creation data
 */
export interface CreateEmailData {
  id: string;
  threadId: string;
  senderEmail: string;
  senderName?: string;
  senderDomain: string;
  subject?: string;
  snippet?: string;
  receivedAt: Date;
  emailType?: string;
  gmailCategory?: string;
  isImportant?: boolean;
  isRead?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
}

/**
 * Email update data
 */
export interface UpdateEmailData {
  emailType?: string;
  gmailCategory?: string;
  isImportant?: boolean;
  isRead?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  isProcessed?: boolean;
  processedAt?: Date;
}

/**
 * Email repository for database operations
 */
export class EmailRepository {
  private db: TuskerBrainDatabase;

  constructor(db: TuskerBrainDatabase) {
    this.db = db;
  }

  /**
   * Create a new email record
   */
  async create(data: CreateEmailData): Promise<EmailRecord> {
    const [email] = await this.db.getDatabase()
      .insert(schema.emails)
      .values({
        id: data.id,
        threadId: data.threadId,
        senderEmail: data.senderEmail,
        senderName: data.senderName || null,
        senderDomain: data.senderDomain,
        subject: data.subject || null,
        snippet: data.snippet || null,
        receivedAt: data.receivedAt,
        emailType: (data.emailType as 'regular' | 'updates' | 'social' | 'promotional') || null,
        gmailCategory: data.gmailCategory || null,
        isImportant: data.isImportant || false,
        isRead: data.isRead || false,
        isArchived: data.isArchived || false,
        isDeleted: data.isDeleted || false,
        isProcessed: false,
        processedAt: null,
      })
      .returning();

    return this.toRecord(email);
  }

  /**
   * Find an email by ID
   */
  async findById(id: string): Promise<EmailRecord | null> {
    const [email] = await this.db.getDatabase()
      .select()
      .from(schema.emails)
      .where(eq(schema.emails.id, id))
      .limit(1);

    return email ? this.toRecord(email) : null;
  }

  /**
   * Find emails by thread ID
   */
  async findByThreadId(threadId: string): Promise<EmailRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.emails)
      .where(eq(schema.emails.threadId, threadId))
      .orderBy(desc(schema.emails.receivedAt));

    return results.map(this.toRecord);
  }

  /**
   * Find emails by sender domain
   */
  async findBySenderDomain(domain: string, limit?: number): Promise<EmailRecord[]> {
    let query = this.db.getDatabase()
      .select()
      .from(schema.emails)
      .where(eq(schema.emails.senderDomain, domain))
      .orderBy(desc(schema.emails.receivedAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    const results = await query;
    return results.map(this.toRecord);
  }

  /**
   * Find unprocessed emails
   */
  async findUnprocessed(limit?: number): Promise<EmailRecord[]> {
    let query = this.db.getDatabase()
      .select()
      .from(schema.emails)
      .where(eq(schema.emails.isProcessed, false))
      .orderBy(desc(schema.emails.receivedAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    const results = await query;
    return results.map(this.toRecord);
  }

  /**
   * Find emails by type
   */
  async findByType(emailType: string, limit?: number): Promise<EmailRecord[]> {
    let query = this.db.getDatabase()
      .select()
      .from(schema.emails)
      .where(eq(schema.emails.emailType, emailType as 'regular' | 'updates' | 'social' | 'promotional'))
      .orderBy(desc(schema.emails.receivedAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    const results = await query;
    return results.map(this.toRecord);
  }

  /**
   * Update an email
   */
  async update(id: string, data: UpdateEmailData): Promise<EmailRecord | null> {
    const updateData: Record<string, unknown> = {};

    if (data.emailType !== undefined) updateData.emailType = data.emailType;
    if (data.gmailCategory !== undefined) updateData.gmailCategory = data.gmailCategory;
    if (data.isImportant !== undefined) updateData.isImportant = data.isImportant;
    if (data.isRead !== undefined) updateData.isRead = data.isRead;
    if (data.isArchived !== undefined) updateData.isArchived = data.isArchived;
    if (data.isDeleted !== undefined) updateData.isDeleted = data.isDeleted;
    if (data.isProcessed !== undefined) updateData.isProcessed = data.isProcessed;
    if (data.processedAt !== undefined) updateData.processedAt = data.processedAt;

    const [email] = await this.db.getDatabase()
      .update(schema.emails)
      .set(updateData)
      .where(eq(schema.emails.id, id))
      .returning();

    return email ? this.toRecord(email) : null;
  }

  /**
   * Mark an email as processed
   */
  async markProcessed(id: string): Promise<void> {
    await this.db.getDatabase()
      .update(schema.emails)
      .set({
        isProcessed: true,
        processedAt: new Date(),
      })
      .where(eq(schema.emails.id, id));
  }

  /**
   * Delete an email
   */
  async delete(id: string): Promise<void> {
    await this.db.getDatabase()
      .delete(schema.emails)
      .where(eq(schema.emails.id, id));
  }

  /**
   * Count emails by type
   */
  async countByType(): Promise<Record<string, number>> {
    const results = await this.db.getDatabase()
      .select({
        emailType: schema.emails.emailType,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(schema.emails)
      .groupBy(schema.emails.emailType);

    const counts: Record<string, number> = {};
    for (const row of results) {
      if (row.emailType) {
        counts[row.emailType] = row.count;
      }
    }
    return counts;
  }

  /**
   * Get total count of emails
   */
  async count(): Promise<number> {
    const [result] = await this.db.getDatabase()
      .select({ count: sql<number>`count(*)` })
      .from(schema.emails);

    return result?.count || 0;
  }

  /**
   * Convert database row to record type
   */
  private toRecord(row: typeof schema.emails.$inferSelect): EmailRecord {
    return {
      id: row.id,
      threadId: row.threadId,
      senderEmail: row.senderEmail,
      senderName: row.senderName,
      senderDomain: row.senderDomain,
      subject: row.subject,
      snippet: row.snippet,
      receivedAt: row.receivedAt,
      emailType: row.emailType,
      // Column is free text but only Gmail category values are ever written.
      gmailCategory: row.gmailCategory as GmailCategory | null,
      isImportant: row.isImportant ?? false,
      isRead: row.isRead ?? false,
      isArchived: row.isArchived ?? false,
      isDeleted: row.isDeleted ?? false,
      isProcessed: row.isProcessed ?? false,
      processedAt: row.processedAt ?? new Date(),
      createdAt: row.createdAt ?? new Date(),
    };
  }
}
