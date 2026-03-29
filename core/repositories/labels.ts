import { eq, and, inArray, sql } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';

/**
 * Gmail label record type
 */
export interface GmailLabelRecord {
  id: string;
  name: string;
  type: 'system' | 'user' | null;
  labelType: string | null;
  createdAt: Date;
}

/**
 * Label creation data
 */
export interface CreateLabelData {
  id: string;
  name: string;
  type?: 'system' | 'user';
  labelType?: string;
}

/**
 * Labels repository for database operations
 */
export class LabelsRepository {
  private db: TuskerBrainDatabase;

  constructor(db: TuskerBrainDatabase) {
    this.db = db;
  }

  /**
   * Create a new label
   */
  async create(data: CreateLabelData): Promise<GmailLabelRecord> {
    const [label] = await this.db.getDatabase()
      .insert(schema.gmailLabels)
      .values({
        id: data.id,
        name: data.name,
        type: data.type || null,
        labelType: data.labelType || null,
      })
      .returning();

    return this.toRecord(label);
  }

  /**
   * Find a label by ID
   */
  async findById(id: string): Promise<GmailLabelRecord | null> {
    const [label] = await this.db.getDatabase()
      .select()
      .from(schema.gmailLabels)
      .where(eq(schema.gmailLabels.id, id))
      .limit(1);

    return label ? this.toRecord(label) : null;
  }

  /**
   * Find a label by name
   */
  async findByName(name: string): Promise<GmailLabelRecord | null> {
    const [label] = await this.db.getDatabase()
      .select()
      .from(schema.gmailLabels)
      .where(eq(schema.gmailLabels.name, name))
      .limit(1);

    return label ? this.toRecord(label) : null;
  }

  /**
   * Find all labels
   */
  async findAll(): Promise<GmailLabelRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.gmailLabels)
      .orderBy(schema.gmailLabels.name);

    return results.map(this.toRecord);
  }

  /**
   * Find system labels
   */
  async findSystemLabels(): Promise<GmailLabelRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.gmailLabels)
      .where(eq(schema.gmailLabels.type, 'system'))
      .orderBy(schema.gmailLabels.name);

    return results.map(this.toRecord);
  }

  /**
   * Find user labels
   */
  async findUserLabels(): Promise<GmailLabelRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.gmailLabels)
      .where(eq(schema.gmailLabels.type, 'user'))
      .orderBy(schema.gmailLabels.name);

    return results.map(this.toRecord);
  }

  /**
   * Link labels to an email
   *
   * Note: better-sqlite3 transactions are synchronous. For atomic operations
   * that require multiple statements, we use a batched approach with individual
   * statements. Drizzle ORM with better-sqlite3 handles each statement atomically.
   */
  async linkLabelsToEmail(emailId: string, labelIds: string[]): Promise<void> {
    if (labelIds.length === 0) return;

    const db = this.db.getDatabase();

    // Delete existing links first
    await db.delete(schema.emailLabels)
      .where(eq(schema.emailLabels.emailId, emailId));

    // Create new links
    const values = labelIds.map((labelId) => ({
      emailId,
      labelId,
    }));

    await db.insert(schema.emailLabels)
      .values(values)
      .onConflictDoNothing();
  }

  /**
   * Get labels for an email
   */
  async getLabelsForEmail(emailId: string): Promise<GmailLabelRecord[]> {
    const results = await this.db.getDatabase()
      .select({
        id: schema.gmailLabels.id,
        name: schema.gmailLabels.name,
        type: schema.gmailLabels.type,
        labelType: schema.gmailLabels.labelType,
        createdAt: schema.gmailLabels.createdAt,
      })
      .from(schema.gmailLabels)
      .innerJoin(
        schema.emailLabels,
        eq(schema.gmailLabels.id, schema.emailLabels.labelId)
      )
      .where(eq(schema.emailLabels.emailId, emailId));

    return results.map(this.toRecord);
  }

  /**
   * Find labels for an email (alias for getLabelsForEmail)
   */
  async findLabelsForEmail(emailId: string): Promise<GmailLabelRecord[]> {
    return this.getLabelsForEmail(emailId);
  }

  /**
   * Get emails with a specific label
   */
  async getEmailsWithLabel(labelId: string): Promise<string[]> {
    const results = await this.db.getDatabase()
      .select({ emailId: schema.emailLabels.emailId })
      .from(schema.emailLabels)
      .where(eq(schema.emailLabels.labelId, labelId));

    return results.map((r) => r.emailId);
  }

  /**
   * Remove all labels from an email
   */
  async clearEmailLabels(emailId: string): Promise<void> {
    await this.db.getDatabase()
      .delete(schema.emailLabels)
      .where(eq(schema.emailLabels.emailId, emailId));
  }

  /**
   * Update a label
   */
  async update(id: string, data: Partial<CreateLabelData>): Promise<GmailLabelRecord | null> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.labelType !== undefined) updateData.labelType = data.labelType;

    const [label] = await this.db.getDatabase()
      .update(schema.gmailLabels)
      .set(updateData)
      .where(eq(schema.gmailLabels.id, id))
      .returning();

    return label ? this.toRecord(label) : null;
  }

  /**
   * Delete a label
   */
  async delete(id: string): Promise<void> {
    // First delete email-label links
    await this.db.getDatabase()
      .delete(schema.emailLabels)
      .where(eq(schema.emailLabels.labelId, id));

    // Then delete the label
    await this.db.getDatabase()
      .delete(schema.gmailLabels)
      .where(eq(schema.gmailLabels.id, id));
  }

  /**
   * Count labels
   */
  async count(): Promise<number> {
    const [result] = await this.db.getDatabase()
      .select({ count: sql<number>`count(*)` })
      .from(schema.gmailLabels);

    return result?.count || 0;
  }

  /**
   * Sync labels from Gmail
   * This creates or updates labels based on Gmail API response
   */
  async syncFromGmail(labels: Array<{ id: string; name: string; type: string }>): Promise<void> {
    for (const label of labels) {
      await this.db.getDatabase()
        .insert(schema.gmailLabels)
        .values({
          id: label.id,
          name: label.name,
          type: label.type === 'system' ? 'system' : 'user',
        })
        .onConflictDoUpdate({
          target: schema.gmailLabels.id,
          set: {
            name: label.name,
            type: label.type === 'system' ? 'system' : 'user',
          },
        });
    }
  }

  /**
   * Convert database row to record type
   */
  private toRecord(row: typeof schema.gmailLabels.$inferSelect): GmailLabelRecord {
    return {
      id: row.id,
      name: row.name,
      type: row.type as 'system' | 'user' | null,
      labelType: row.labelType,
      createdAt: row.createdAt,
    };
  }
}
