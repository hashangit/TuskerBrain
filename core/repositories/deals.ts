import { eq, and, desc, sql } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';

/**
 * Deal value type
 */
export type DealValueType = 'percentage' | 'fixed_amount' | 'other';

/**
 * Deal record type
 */
export interface DealRecord {
  id: string;
  emailId: string;
  dealTitle: string;
  dealDescription: string | null;
  brandName: string;
  dealCategory: string | null;
  dealValue: string | null;
  dealValueType: DealValueType | null;
  dealCode: string | null;
  minimumPurchase: string | null;
  dealExpiry: Date | null;
  createdAt: Date;
  isActive: boolean;
  usedAt: Date | null;
  dismissedAt: Date | null;
  dealLink: string | null;
}

/**
 * Deal creation data
 */
export interface CreateDealData {
  id: string;
  emailId: string;
  dealTitle: string;
  dealDescription?: string;
  brandName: string;
  dealCategory?: string;
  dealValue?: string;
  dealValueType?: DealValueType;
  dealCode?: string;
  minimumPurchase?: string;
  dealExpiry?: Date;
  dealLink?: string;
  isActive?: boolean;
}

/**
 * Deals repository for database operations
 */
export class DealsRepository {
  private db: TuskerBrainDatabase;

  constructor(db: TuskerBrainDatabase) {
    this.db = db;
  }

  /**
   * Create a new deal
   */
  async create(data: CreateDealData): Promise<DealRecord> {
    const [deal] = await this.db.getDatabase()
      .insert(schema.deals)
      .values({
        id: data.id,
        emailId: data.emailId,
        dealTitle: data.dealTitle,
        dealDescription: data.dealDescription || null,
        brandName: data.brandName,
        dealCategory: data.dealCategory || null,
        dealValue: data.dealValue || null,
        dealValueType: data.dealValueType || null,
        dealCode: data.dealCode || null,
        minimumPurchase: data.minimumPurchase || null,
        dealExpiry: data.dealExpiry || null,
        dealLink: data.dealLink || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
      })
      .returning();

    return this.toRecord(deal);
  }

  /**
   * Find a deal by ID
   */
  async findById(id: string): Promise<DealRecord | null> {
    const [deal] = await this.db.getDatabase()
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.id, id))
      .limit(1);

    return deal ? this.toRecord(deal) : null;
  }

  /**
   * Find deals by email ID
   */
  async findByEmailId(emailId: string): Promise<DealRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.emailId, emailId))
      .orderBy(desc(schema.deals.createdAt));

    return results.map(this.toRecord);
  }

  /**
   * Find deals by brand
   */
  async findByBrand(brandName: string): Promise<DealRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.brandName, brandName))
      .orderBy(desc(schema.deals.createdAt));

    return results.map(this.toRecord);
  }

  /**
   * Find active deals
   */
  async findActive(limit?: number): Promise<DealRecord[]> {
    let query = this.db.getDatabase()
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.isActive, true))
      .orderBy(desc(schema.deals.createdAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    const results = await query;
    return results.map(this.toRecord);
  }

  /**
   * Find all deals
   */
  async findAll(): Promise<DealRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.deals)
      .orderBy(desc(schema.deals.createdAt));

    return results.map(this.toRecord);
  }

  /**
   * Find deals by category
   */
  async findByCategory(category: string): Promise<DealRecord[]> {
    const results = await this.db.getDatabase()
      .select()
      .from(schema.deals)
      .where(eq(schema.deals.dealCategory, category))
      .orderBy(desc(schema.deals.createdAt));

    return results.map(this.toRecord);
  }

  /**
   * Find expiring deals
   */
  async findExpiring(withinDays: number): Promise<DealRecord[]> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + withinDays);
    const expiryStr = expiryDate.toISOString().split('T')[0];

    const results = await this.db.getDatabase()
      .select()
      .from(schema.deals)
      .where(
        and(
          eq(schema.deals.isActive, true),
          sql`${schema.deals.dealExpiry} <= ${expiryStr}`
        )
      )
      .orderBy(schema.deals.dealExpiry);

    return results.map(this.toRecord);
  }

  /**
   * Update a deal
   */
  async update(id: string, data: Partial<CreateDealData>): Promise<DealRecord | null> {
    const updateData: Record<string, unknown> = {};

    if (data.dealTitle !== undefined) updateData.dealTitle = data.dealTitle;
    if (data.dealDescription !== undefined) updateData.dealDescription = data.dealDescription;
    if (data.brandName !== undefined) updateData.brandName = data.brandName;
    if (data.dealValue !== undefined) updateData.dealValue = data.dealValue;
    if (data.dealCode !== undefined) updateData.dealCode = data.dealCode;
    if (data.dealExpiry !== undefined) updateData.dealExpiry = data.dealExpiry;
    if (data.dealLink !== undefined) updateData.dealLink = data.dealLink;
    if (data.minimumPurchase !== undefined) updateData.minimumPurchase = data.minimumPurchase;
    if (data.dealCategory !== undefined) updateData.dealCategory = data.dealCategory;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [deal] = await this.db.getDatabase()
      .update(schema.deals)
      .set(updateData)
      .where(eq(schema.deals.id, id))
      .returning();

    return deal ? this.toRecord(deal) : null;
  }

  /**
   * Mark a deal as inactive
   */
  async deactivate(id: string): Promise<void> {
    await this.db.getDatabase()
      .update(schema.deals)
      .set({ isActive: false })
      .where(eq(schema.deals.id, id));
  }

  /**
   * Mark a deal as used
   */
  async markAsUsed(id: string): Promise<DealRecord | null> {
    const [deal] = await this.db.getDatabase()
      .update(schema.deals)
      .set({ usedAt: new Date() })
      .where(eq(schema.deals.id, id))
      .returning();

    return deal ? this.toRecord(deal) : null;
  }

  /**
   * Dismiss a deal
   */
  async dismiss(id: string): Promise<DealRecord | null> {
    const [deal] = await this.db.getDatabase()
      .update(schema.deals)
      .set({ dismissedAt: new Date() })
      .where(eq(schema.deals.id, id))
      .returning();

    return deal ? this.toRecord(deal) : null;
  }

  /**
   * Delete a deal
   */
  async delete(id: string): Promise<void> {
    await this.db.getDatabase()
      .delete(schema.deals)
      .where(eq(schema.deals.id, id));
  }

  /**
   * Count deals
   */
  async count(): Promise<number> {
    const [result] = await this.db.getDatabase()
      .select({ count: sql<number>`count(*)` })
      .from(schema.deals);

    return result?.count || 0;
  }

  /**
   * Count active deals
   */
  async countActive(): Promise<number> {
    const [result] = await this.db.getDatabase()
      .select({ count: sql<number>`count(*)` })
      .from(schema.deals)
      .where(eq(schema.deals.isActive, true));

    return result?.count || 0;
  }

  /**
   * Convert database row to record type
   */
  private toRecord(row: typeof schema.deals.$inferSelect): DealRecord {
    return {
      id: row.id,
      emailId: row.emailId,
      dealTitle: row.dealTitle,
      dealDescription: row.dealDescription,
      brandName: row.brandName,
      dealCategory: row.dealCategory,
      dealValue: row.dealValue,
      dealValueType: row.dealValueType,
      dealCode: row.dealCode,
      minimumPurchase: row.minimumPurchase,
      dealExpiry: row.dealExpiry,
      dealLink: row.dealLink,
      isActive: row.isActive ?? true,
      usedAt: row.usedAt,
      dismissedAt: row.dismissedAt,
      createdAt: row.createdAt,
    };
  }
}
