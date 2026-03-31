import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { TuskerBrainDatabase } from '../../database';
import { createRepositories, type Repositories } from '@core/repositories';
import { processEmailWithWorkflow } from '@core/workflows/langgraph-workflow';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';
import {
  isDealExpiringSoon,
  getDealStatus,
  toDealData,
  filterDeals,
  sortDeals,
  extractCategories,
  extractBrands,
  groupDealsByStatus,
  formatExpiryDate,
  formatDealValue,
} from '../../database/deals';
import type { CreateDealData } from '@core/repositories/deals';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a promotional Email object for extractDeal tests. */
function promoEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: `email_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    threadId: 'thread_1',
    senderEmail: 'deals@store.com',
    senderName: 'Store',
    senderDomain: 'store.com',
    subject: null,
    snippet: null,
    receivedAt: new Date(),
    emailType: 'promotional',
    ...overrides,
  };
}

let _counter = 0;

/** Build CreateDealData for repository tests. */
function createDealData(overrides: Partial<CreateDealData> = {}): CreateDealData {
  const n = ++_counter;
  return {
    id: `deal_${n}_${Date.now()}`,
    emailId: `email_${n}_${Date.now()}`,
    dealTitle: 'Test Deal',
    brandName: 'TestBrand',
    ...overrides,
  };
}

/**
 * Seed a minimal email row so the deals FK constraint is satisfied.
 */
async function seedEmail(repos: Repositories, emailId: string): Promise<void> {
  await repos.emails.create({
    id: emailId,
    threadId: `thread_${emailId}`,
    senderEmail: 'deals@test.com',
    senderName: 'Test Sender',
    senderDomain: 'test.com',
    subject: 'Test email for deal',
    snippet: 'Test snippet',
    receivedAt: new Date(),
  });
}

/**
 * Convenience: seed parent email + create deal in one call.
 */
async function createDeal(
  repos: Repositories,
  overrides: Partial<CreateDealData> = {},
) {
  const data = createDealData(overrides);
  await seedEmail(repos, data.emailId);
  return repos.deals.create(data);
}

/**
 * Helper: create a mock LLM provider for testing workflow extraction.
 */
function createMockLLMProvider(responses: {
  classification?: { type: string; confidence: number };
  deal?: {
    dealTitle?: string;
    dealDescription?: string;
    brandName?: string;
    dealValue?: string;
    dealCode?: string;
    dealExpiry?: string;
    dealLink?: string;
    minimumPurchase?: string;
    dealCategory?: string;
    isActive?: boolean;
  };
  topic?: { parent: string; child: string; confidence: number };
  summary?: string;
}): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockResolvedValue({
      text: responses.summary ?? 'Summary text.',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    generateObject: vi.fn().mockImplementation(async (prompt: string, schema: z.ZodSchema<any>) => {
      if (prompt.includes('Classify this email')) {
        return responses.classification ?? { type: 'promotional', confidence: 0.95 };
      }
      if (prompt.includes('Extract deal information')) {
        return responses.deal ?? { dealTitle: 'Test Deal', brandName: 'Test Brand', dealValue: '50% off', isActive: true };
      }
      if (prompt.includes('Extract key information')) {
        return { title: 'Test', description: 'Test', priority: 'medium' };
      }
      if (prompt.includes('Assign a topic label')) {
        return responses.topic ?? { parent: 'Shopping', child: 'Store', confidence: 0.8 };
      }
      return {};
    }),
  };
}

// ---------------------------------------------------------------------------
// Feature: Deals
//
// Tests real production code:
//   - processEmailWithWorkflow() from core/workflows/langgraph-workflow
//   - DealsRepository from core/repositories/deals
//   - Utility functions from database/deals (filtering, sorting, status, etc.)
// ---------------------------------------------------------------------------
describe('Feature: Deals', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
  });

  afterEach(async () => {
    await db.close();
  });

  // =========================================================================
  // 1. Deal Extraction (processEmailWithWorkflow)
  // =========================================================================
  describe('Deal Extraction', () => {
    it('extracts deal title and promo code from promotional email', async () => {
      const email = promoEmail({
        subject: '50% Off Electronics - Today Only!',
        snippet: 'Save 50% on all electronics today. Use code SAVE50 at checkout.',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: '50% Off Electronics - Today Only!', brandName: 'Store', dealCode: 'SAVE50', dealValue: '50% off', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.dealTitle).toBeDefined();
      expect(deal!.dealCode).toBe('SAVE50');
    });

    it('extracts brand name from sender name', async () => {
      const email = promoEmail({
        subject: 'Flash Sale!',
        snippet: '20% off all TVs this weekend.',
        senderName: 'Best Buy',
        senderDomain: 'bestbuy.com',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: 'Flash Sale!', brandName: 'Best Buy', dealValue: '20% off', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.brandName).toMatch(/best buy/i);
    });

    it('extracts promo code when present in email body', async () => {
      const email = promoEmail({
        subject: 'Special Offer',
        snippet: 'Use code FREESHIP for free shipping on orders over $50.',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: 'Special Offer', brandName: 'Store', dealCode: 'FREESHIP', dealValue: 'Free shipping', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.dealCode).toBe('FREESHIP');
    });

    it('extracts deal link from email content', async () => {
      const email = promoEmail({
        subject: 'Exclusive Deal',
        snippet: 'Click here to claim: https://store.com/deal/special-2024',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: 'Exclusive Deal', brandName: 'Store', dealLink: 'https://store.com/deal/special-2024', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.dealLink).toContain('store.com/deal');
    });

    it('extracts deal description from email snippet', async () => {
      const email = promoEmail({
        subject: 'Limited Time Offer',
        snippet: 'Get 40% off all outdoor furniture. Includes patio sets, umbrellas, and garden decor.',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: 'Limited Time Offer', brandName: 'Store', dealDescription: 'Get 40% off all outdoor furniture. Includes patio sets, umbrellas, and garden decor.', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.dealDescription).toBeDefined();
      expect(deal!.dealDescription!.length).toBeGreaterThan(10);
    });
  });

  // =========================================================================
  // 2. Expiry Dates
  // =========================================================================
  describe('Expiry Dates', () => {
    it('extracts expiry date from email content', async () => {
      const email = promoEmail({
        subject: 'Limited Time Offer',
        snippet: 'Offer expires today. Act now!',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: 'Limited Time Offer', brandName: 'Store', dealExpiry: '2024-12-31', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.dealExpiry).toBeDefined();
    });

    it('identifies deals expiring soon with isDealExpiringSoon', () => {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      expect(isDealExpiringSoon(threeDaysFromNow)).toBe(true);
    });

    it('does not flag far-future deals as expiring soon', () => {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      expect(isDealExpiringSoon(thirtyDaysFromNow)).toBe(false);
    });
  });

  // =========================================================================
  // 3. Deal Filtering
  // =========================================================================
  describe('Deal Filtering', () => {
    it('filters to show only active deals via repository', async () => {
      await createDeal(repos, { dealTitle: 'Active Deal', isActive: true });
      await createDeal(repos, { dealTitle: 'Inactive Deal', isActive: false });

      const active = await repos.deals.findActive();

      expect(active).toHaveLength(1);
      expect(active[0].dealTitle).toBe('Active Deal');
      expect(active[0].isActive).toBe(true);
    });

    it('filters deals by category via repository', async () => {
      await createDeal(repos, { dealCategory: 'Electronics' });
      await createDeal(repos, { dealCategory: 'Fashion' });
      await createDeal(repos, { dealCategory: 'Electronics' });

      const electronics = await repos.deals.findByCategory('Electronics');

      expect(electronics).toHaveLength(2);
      expect(electronics.every((d) => d.dealCategory === 'Electronics')).toBe(true);
    });

    it('filters deals client-side with filterDeals utility', async () => {
      await createDeal(repos, { brandName: 'Amazon', dealCategory: 'Electronics' });
      await createDeal(repos, { brandName: 'Best Buy', dealCategory: 'Electronics' });
      await createDeal(repos, { brandName: 'Nordstrom', dealCategory: 'Fashion' });

      const all = await repos.deals.findAll();
      const dealDataList = all.map(toDealData);

      const filtered = filterDeals(dealDataList, { brand: 'Amazon' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].brand).toBe('Amazon');
    });
  });

  // =========================================================================
  // 4. Deal Actions (repository state transitions)
  // =========================================================================
  describe('Deal Actions', () => {
    it('marks a deal as used', async () => {
      const deal = await createDeal(repos);

      const updated = await repos.deals.markAsUsed(deal.id);

      expect(updated).not.toBeNull();
      expect(updated!.usedAt).toBeDefined();
      // usedAt should be a Date-like value close to now
      expect(new Date(updated!.usedAt!).getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it('marks a deal as expired by deactivating it', async () => {
      const deal = await createDeal(repos, { isActive: true });

      await repos.deals.deactivate(deal.id);

      const found = await repos.deals.findById(deal.id);
      expect(found!.isActive).toBe(false);
    });

    it('dismisses a deal', async () => {
      const deal = await createDeal(repos);

      const dismissed = await repos.deals.dismiss(deal.id);

      expect(dismissed).not.toBeNull();
      expect(dismissed!.dismissedAt).toBeDefined();
    });

    it('undoes a dismiss', async () => {
      const deal = await createDeal(repos);
      await repos.deals.dismiss(deal.id);

      const restored = await repos.deals.undoDismiss(deal.id);

      expect(restored).not.toBeNull();
      expect(restored!.dismissedAt).toBeNull();
    });
  });

  // =========================================================================
  // 5. Deal Sorting
  // =========================================================================
  describe('Deal Sorting', () => {
    it('sorts deals by expiry date (soonest first)', async () => {
      const soonExpiry = new Date();
      soonExpiry.setDate(soonExpiry.getDate() + 5);
      const laterExpiry = new Date();
      laterExpiry.setDate(laterExpiry.getDate() + 30);

      await createDeal(repos, { dealTitle: 'Expires Later', dealExpiry: laterExpiry });
      await createDeal(repos, { dealTitle: 'Expires Soon', dealExpiry: soonExpiry });

      const all = await repos.deals.findAll();
      const dealDataList = all.map(toDealData);
      const sorted = sortDeals(dealDataList, 'expiry_asc');

      expect(sorted[0].title).toBe('Expires Soon');
      expect(sorted[1].title).toBe('Expires Later');
    });

    it('sorts deals by creation date (most recent first)', async () => {
      // The DB uses second-precision for created_at, so we need a 1s+ delay
      await createDeal(repos, { dealTitle: 'Older Deal' });
      await new Promise((r) => setTimeout(r, 1100));
      await createDeal(repos, { dealTitle: 'Newer Deal' });

      const all = await repos.deals.findAll();
      const dealDataList = all.map(toDealData);
      const sorted = sortDeals(dealDataList, 'created_desc');

      expect(sorted[0].title).toBe('Newer Deal');
    });
  });

  // =========================================================================
  // 6. View Integration (deals <-> email linkage)
  // =========================================================================
  describe('Deals View Integration', () => {
    it('links deal to original email via emailId', async () => {
      const deal = await createDeal(repos);
      const emailId = deal.emailId;

      expect(deal.emailId).toBe(emailId);

      const found = await repos.deals.findByEmailId(emailId);
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe(deal.id);
    });

    it('counts active deals correctly', async () => {
      await createDeal(repos, { isActive: true });
      await createDeal(repos, { isActive: true });
      await createDeal(repos, { isActive: false });

      const activeCount = await repos.deals.countActive();
      expect(activeCount).toBe(2);

      const totalCount = await repos.deals.count();
      expect(totalCount).toBe(3);
    });
  });

  // =========================================================================
  // 7. Value Extraction
  // =========================================================================
  describe('Deal Value Extraction', () => {
    it('extracts dollar amount from deal text', async () => {
      const email = promoEmail({
        subject: 'Save $20 on your next order',
        snippet: 'Get $20 off your purchase of $100 or more. Limited time offer.',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: 'Save $20 on your next order', brandName: 'Store', dealValue: '$20 off', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.dealValue).toBeDefined();
      expect(deal!.dealValue).toMatch(/\$20/);
    });

    it('extracts percentage discount from deal text', async () => {
      const email = promoEmail({
        subject: '50% discount on all items',
        snippet: 'Take 50% off everything in store. No exclusions.',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: '50% discount on all items', brandName: 'Store', dealValue: '50% off', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.dealValue).toBeDefined();
      expect(deal!.dealValue).toMatch(/50%/);
    });

    it('extracts "Save $X" format from deal text', async () => {
      const email = promoEmail({
        subject: 'Flash Sale Today',
        snippet: 'Save $100 on your next purchase over $500. Hurry, ends tonight!',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: 'Flash Sale Today', brandName: 'Store', dealValue: '$100 off', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.dealValue).toBeDefined();
      expect(deal!.dealValue).toMatch(/\$100/);
    });
  });

  // =========================================================================
  // 8. Category Extraction
  // =========================================================================
  describe('Deal Category Extraction', () => {
    it('extracts unique categories from deals list', async () => {
      await createDeal(repos, { dealCategory: 'Electronics' });
      await createDeal(repos, { dealCategory: 'Fashion' });
      await createDeal(repos, { dealCategory: 'Electronics' });
      await createDeal(repos, { dealCategory: 'Travel' });

      const all = await repos.deals.findAll();
      const dealDataList = all.map(toDealData);
      const categories = extractCategories(dealDataList);

      expect(categories).toEqual(expect.arrayContaining(['Electronics', 'Fashion', 'Travel']));
      expect(categories).toHaveLength(3);
    });

    it('extracts unique brands from deals list', async () => {
      await createDeal(repos, { brandName: 'Amazon' });
      await createDeal(repos, { brandName: 'Best Buy' });
      await createDeal(repos, { brandName: 'Amazon' });

      const all = await repos.deals.findAll();
      const dealDataList = all.map(toDealData);
      const brands = extractBrands(dealDataList);

      expect(brands).toEqual(expect.arrayContaining(['Amazon', 'Best Buy']));
      expect(brands).toHaveLength(2);
    });

    it('groups deals by status correctly', async () => {
      // Active deal
      await createDeal(repos, { isActive: true });
      // Expired deal (inactive)
      await createDeal(repos, { isActive: false });
      // Used deal
      const usedDeal = await createDeal(repos, { isActive: true });
      await repos.deals.markAsUsed(usedDeal.id);
      // Dismissed deal
      const dismissedDeal = await createDeal(repos, { isActive: true });
      await repos.deals.dismiss(dismissedDeal.id);

      const all = await repos.deals.findAll();
      const dealDataList = all.map(toDealData);
      const grouped = groupDealsByStatus(dealDataList);

      expect(grouped.active.length).toBeGreaterThanOrEqual(1);
      expect(grouped.expired.length).toBeGreaterThanOrEqual(1);
      expect(grouped.used).toHaveLength(1);
      expect(grouped.dismissed).toHaveLength(1);
    });
  });

  // =========================================================================
  // 9. Deal Description
  // =========================================================================
  describe('Deal Description Extraction', () => {
    it('extracts full deal description from email snippet', async () => {
      const email = promoEmail({
        subject: 'Limited Time Offer',
        snippet: 'Get 40% off all outdoor furniture. Includes patio sets, umbrellas, and garden decor. Valid in-store only.',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.95 },
        deal: { dealTitle: 'Limited Time Offer', brandName: 'Store', dealDescription: 'Get 40% off all outdoor furniture. Includes patio sets, umbrellas, and garden decor. Valid in-store only.', isActive: true },
      });
      const result = await processEmailWithWorkflow(email, mockLLM);
      const deal = result.extraction?.deal ?? null;

      expect(deal).not.toBeNull();
      expect(deal!.dealDescription).toBeDefined();
      expect(deal!.dealDescription!.length).toBeGreaterThan(20);
    });
  });

  // =========================================================================
  // 10. Multiple Deals Per Email
  // =========================================================================
  describe('Multiple Deals Per Email', () => {
    it('stores multiple deals linked to the same email', async () => {
      const sharedEmailId = `email_shared_${Date.now()}`;
      // Seed the parent email once
      await seedEmail(repos, sharedEmailId);

      await repos.deals.create(createDealData({
        emailId: sharedEmailId,
        dealTitle: 'Save 20%',
        dealCode: 'SAVE20',
      }));
      await repos.deals.create(createDealData({
        emailId: sharedEmailId,
        dealTitle: 'Free Shipping',
        dealCode: 'FREESHIP',
      }));

      const deals = await repos.deals.findByEmailId(sharedEmailId);

      expect(deals).toHaveLength(2);
      expect(deals.map((d) => d.dealTitle)).toEqual(
        expect.arrayContaining(['Save 20%', 'Free Shipping']),
      );
    });
  });

  // =========================================================================
  // 11. No Deal Present
  // =========================================================================
  describe('No Deal Present', () => {
    it('returns null for email without deal keywords', async () => {
      const email = promoEmail({
        subject: 'Weekly Newsletter',
        snippet: 'Check out our latest blog posts and product updates. No offers this week.',
      });

      const mockLLM = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        // No deal response → workflow may not extract a deal
      });
      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.extraction?.deal).toBeUndefined();
    });
  });

  // =========================================================================
  // 12. Deal Status & Formatting Utilities
  // =========================================================================
  describe('Deal Status and Formatting', () => {
    it('determines deal status as active for a fresh deal', () => {
      const status = getDealStatus({
        isActive: true,
        dealExpiry: null,
        usedAt: null,
        dismissedAt: null,
      });

      expect(status).toBe('active');
    });

    it('determines deal status as expired when expiry is in the past', () => {
      const pastExpiry = new Date();
      pastExpiry.setDate(pastExpiry.getDate() - 5);

      const status = getDealStatus({
        isActive: true,
        dealExpiry: pastExpiry,
        usedAt: null,
        dismissedAt: null,
      });

      expect(status).toBe('expired');
    });

    it('formats expiry date for human-readable display', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const formatted = formatExpiryDate(tomorrow);

      // Could be "Expires tomorrow" or "Expires in 1 days" depending on timing
      expect(formatted).toMatch(/expires/i);
    });

    it('formats deal value with percentage type', () => {
      expect(formatDealValue('20', 'percentage')).toBe('20% off');
      expect(formatDealValue('50', 'fixed_amount')).toBe('$50 off');
      expect(formatDealValue('BOGO', undefined)).toBe('BOGO');
    });
  });

  // =========================================================================
  // 13. Repository CRUD
  // =========================================================================
  describe('Repository CRUD', () => {
    it('creates and retrieves a deal by ID', async () => {
      const created = await createDeal(repos, { dealTitle: 'My Deal' });

      const found = await repos.deals.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.dealTitle).toBe('My Deal');
    });

    it('updates deal fields', async () => {
      const deal = await createDeal(repos, { dealTitle: 'Original' });

      const updated = await repos.deals.update(deal.id, { dealTitle: 'Updated' });

      expect(updated).not.toBeNull();
      expect(updated!.dealTitle).toBe('Updated');
    });

    it('deletes a deal', async () => {
      const deal = await createDeal(repos);

      await repos.deals.delete(deal.id);

      const found = await repos.deals.findById(deal.id);
      expect(found).toBeNull();
    });

    it('finds deals by brand', async () => {
      await createDeal(repos, { brandName: 'Nike' });
      await createDeal(repos, { brandName: 'Adidas' });
      await createDeal(repos, { brandName: 'Nike' });

      const nike = await repos.deals.findByBrand('Nike');

      expect(nike).toHaveLength(2);
      expect(nike.every((d) => d.brandName === 'Nike')).toBe(true);
    });

    it('paginates deal results', async () => {
      for (let i = 0; i < 5; i++) {
        await createDeal(repos, { dealTitle: `Deal ${i}` });
      }

      const page1 = await repos.deals.findAllPaginated({ limit: 2, offset: 0 });
      const page2 = await repos.deals.findAllPaginated({ limit: 2, offset: 2 });

      expect(page1.deals).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page2.deals).toHaveLength(2);
    });
  });
});
