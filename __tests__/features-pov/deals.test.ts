import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';

/**
 * Feature: Deals
 *
 * Design Spec Reference: Lines 136-142, 793-809
 *
 * As a user, I want promotional deals extracted from my emails,
 * so I can easily find and use discounts, promo codes, and special offers.
 *
 * Business Rules:
 * - Extract deal title, description, brand
 * - Extract promo code, expiry date, link
 * - Track active/expired status
 * - Show minimum purchase requirements
 */
describe('Feature: Deals', () => {
  let app: TuskerBrainApp;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });
  });

  beforeEach(async () => {
    // Clear deals before each test for isolation
    await app.clearDeals();
    // Clear filters to prevent test pollution
    await app.setDealsFilter({});
  });

  afterAll(async () => {
    await app.shutdown();
  });

  describe('Deal Extraction', () => {
    it('User sees deal extracted from promotional email', async () => {
      // Given: User receives a promotional email with a deal
      await app.processEmail({
        id: 'promo-1',
        subject: '50% Off Electronics - Today Only!',
        body: 'Save 50% on all electronics today. Use code SAVE50 at checkout.',
        category: 'promotions',
        sender: 'deals@amazon.com',
        receivedAt: new Date(),
      });

      // When: User views their deals
      const deals = await app.getDeals();

      // Then: Deal is extracted and visible
      expect(deals).toContainEqual(
        expect.objectContaining({
          title: expect.stringContaining('50%'),
          brand: 'Amazon',
          promoCode: 'SAVE50',
        })
      );
    });

    it('User sees brand name extracted from sender domain', async () => {
      // Given: User receives promo from Best Buy
      await app.processEmail({
        id: 'promo-2',
        subject: 'Flash Sale!',
        body: '20% off all TVs this weekend.',
        category: 'promotions',
        sender: 'offers@bestbuy.com',
        senderName: 'Best Buy',
        receivedAt: new Date(),
      });

      // When: User views the deal
      const deal = await app.getDealForEmail('promo-2');

      // Then: Brand is correctly identified
      expect(deal.brand).toMatch(/best buy/i);
    });

    it('User sees promo code prominently displayed', async () => {
      // Given: Deal has a promo code
      await app.processEmail({
        id: 'promo-3',
        subject: 'Special Offer',
        body: 'Use code FREESHIP for free shipping on orders over $50.',
        category: 'promotions',
        sender: 'marketing@store.com',
        receivedAt: new Date(),
      });

      // When: User views the deal
      const deal = await app.getDealForEmail('promo-3');

      // Then: Promo code is easy to see and copy
      expect(deal.promoCode).toBe('FREESHIP');
      expect(deal.canCopyCode).toBe(true);
    });

    it('User sees minimum purchase requirement when present', async () => {
      // Given: Deal has a minimum purchase
      await app.processEmail({
        id: 'promo-4',
        subject: 'Save $20',
        body: 'Get $20 off your order of $100 or more.',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
      });

      // When: User views the deal
      const deal = await app.getDealForEmail('promo-4');

      // Then: Minimum purchase is shown
      expect(deal.minimumPurchase).toMatch(/100/i);
    });

    it('User sees deal link when email contains one', async () => {
      // Given: Deal email has a link
      await app.processEmail({
        id: 'promo-5',
        subject: 'Exclusive Deal',
        body: 'Click here to claim: https://store.com/deal/special-2024',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
      });

      // When: User views the deal
      const deal = await app.getDealForEmail('promo-5');

      // Then: Deal link is available
      expect(deal.link).toContain('store.com/deal');
    });
  });

  describe('Expiry Dates', () => {
    it('User sees expiry date when deal has one', async () => {
      // Given: Deal expires on a specific date
      await app.processEmail({
        id: 'promo-6',
        subject: 'Limited Time Offer',
        body: 'Offer expires February 28, 2024. Act now!',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User views the deal
      const deal = await app.getDealForEmail('promo-6');

      // Then: Expiry date is shown
      expect(deal.expiryDate).toMatch(/2024-02-28|February 28/i);
    });

    it('User sees "Expires Soon" warning for deals ending soon', async () => {
      // Given: Deal expires tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await app.processEmail({
        id: 'promo-7',
        subject: 'Last Chance!',
        body: `Offer expires tomorrow at midnight.`,
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
        simulatedExpiry: tomorrow,
      });

      // When: User views their deals
      const deals = await app.getDeals();

      // Then: Expiring deal is flagged
      const expiringDeal = deals.find(d => d.id === 'promo-7');
      expect(expiringDeal.isExpiringSoon).toBe(true);
      expect(expiringDeal.warning).toMatch(/expires soon|last chance/i);
    });

    it('User sees expired deals moved to "Expired" section', async () => {
      // Given: Some deals have expired
      await app.processEmail({
        id: 'expired-1',
        subject: 'Old Deal',
        body: 'This deal expired last week.',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date('2024-01-01'),
        simulatedExpiry: new Date('2024-01-15'), // Already expired
      });

      // When: User views deals
      const activeDeals = await app.getActiveDeals();
      const expiredDeals = await app.getExpiredDeals();

      // Then: Expired deal is in the expired section
      expect(activeDeals.find(d => d.id === 'expired-1')).toBeUndefined();
      expect(expiredDeals.find(d => d.id === 'expired-1')).toBeDefined();
    });
  });

  describe('Deal Filtering', () => {
    it('User can filter to show only active deals', async () => {
      // Given: User has active and expired deals
      await app.seedDeals({ active: 5, expired: 3 });

      // When: User selects "Active Only" filter
      await app.setDealsFilter({ status: 'active' });
      const deals = await app.getDeals();

      // Then: Only active deals are shown
      expect(deals.every(d => d.isActive)).toBe(true);
    });

    it('User can filter deals by brand', async () => {
      // Given: User has deals from multiple brands
      await app.seedDeals({ brands: ['Amazon', 'Best Buy', 'Walmart'] });

      // When: User filters by "Amazon"
      await app.setDealsFilter({ brand: 'Amazon' });
      const deals = await app.getDeals();

      // Then: Only Amazon deals are shown
      expect(deals.every(d => d.brand === 'Amazon')).toBe(true);
    });

    it('User can filter deals by category', async () => {
      // Given: User has deals in different categories
      await app.seedDeals({ categories: ['Electronics', 'Clothing', 'Travel'] });

      // When: User filters by "Electronics"
      await app.setDealsFilter({ category: 'Electronics' });
      const deals = await app.getDeals();

      // Then: Only electronics deals are shown
      expect(deals.every(d => d.category === 'Electronics')).toBe(true);
    });
  });

  describe('Deal Actions', () => {
    it('User can copy promo code with one click', async () => {
      // Given: User is viewing a deal with a promo code
      await app.processEmail({
        id: 'promo-8',
        subject: 'Use Code SAVE20',
        body: 'Enter SAVE20 at checkout for 20% off.',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
      });

      // When: User clicks "Copy Code"
      const deal = await app.getDealForEmail('promo-8');
      await deal.copyCode();

      // Then: Code is copied to clipboard
      const clipboard = await app.getClipboard();
      expect(clipboard).toBe('SAVE20');

      // And: User sees confirmation
      const notification = await app.getLastNotification();
      expect(notification.message).toMatch(/copied/i);
    });

    it('User can click to open deal link', async () => {
      // Given: Deal has a link
      await app.processEmail({
        id: 'promo-9',
        subject: 'Click to Save',
        body: 'Visit https://store.com/sale to shop.',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
      });

      // When: User clicks "Open Deal"
      const deal = await app.getDealForEmail('promo-9');
      const link = deal.link;

      // Then: Link opens in browser
      expect(link).toBe('https://store.com/sale');
    });

    it('User can mark a deal as "Used"', async () => {
      // Given: User has an active deal
      await app.processEmail({
        id: 'promo-10',
        subject: 'Save 30%',
        body: 'Use code USED30 for 30% off.',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
      });

      // When: User marks deal as used
      const deal = await app.getDealForEmail('promo-10');
      await deal.markAsUsed();

      // Then: Deal is marked and moved to "Used" section
      const updatedDeal = await app.getDealForEmail('promo-10');
      expect(updatedDeal.isUsed).toBe(true);
    });

    it('User can dismiss/hide a deal they don\'t want', async () => {
      // Given: User sees a deal they're not interested in
      await app.processEmail({
        id: 'promo-11',
        subject: 'Deal I Don\'t Want',
        body: 'Some promotional content.',
        category: 'promotions',
        sender: 'deals@unwanted.com',
        receivedAt: new Date(),
      });

      // When: User dismisses the deal
      const deal = await app.getDealForEmail('promo-11');
      await deal.dismiss();

      // Then: Deal no longer appears in active deals
      const activeDeals = await app.getActiveDeals();
      expect(activeDeals.find(d => d.id === 'promo-11')).toBeUndefined();
    });
  });

  describe('Deal Sorting', () => {
    it('User sees deals sorted by expiry date (soonest first)', async () => {
      // Given: User has deals with different expiry dates
      await app.seedDealsWithExpiry([
        { id: 'deal-1', daysUntilExpiry: 30 },
        { id: 'deal-2', daysUntilExpiry: 7 },
        { id: 'deal-3', daysUntilExpiry: 14 },
      ]);

      // When: User views deals sorted by expiry
      const deals = await app.getDeals({ sortBy: 'expiryDate' });

      // Then: Soonest expiry appears first
      expect(deals[0].id).toBe('deal-2'); // 7 days
      expect(deals[1].id).toBe('deal-3'); // 14 days
      expect(deals[2].id).toBe('deal-1'); // 30 days
    });

    it('User sees deals sorted by most recently added', async () => {
      // Given: User received deals on different days
      await app.processEmail({
        id: 'old-deal',
        subject: 'Old Deal',
        body: 'Deal content',
        category: 'promotions',
        receivedAt: new Date('2024-01-01'),
      });

      await app.processEmail({
        id: 'new-deal',
        subject: 'New Deal',
        body: 'Deal content',
        category: 'promotions',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User sorts by "Most Recent"
      const deals = await app.getDeals({ sortBy: 'recentlyAdded' });

      // Then: Newest deal appears first
      expect(deals[0].id).toBe('new-deal');
    });
  });

  describe('Deals View Integration', () => {
    it('User can click a deal to see the original email', async () => {
      // Given: User is viewing a deal
      await app.processEmail({
        id: 'deal-to-view',
        subject: 'Test Deal',
        body: 'Use code TEST20 for 20% off',
        category: 'promotions',
        sender: 'deals@test.com',
        receivedAt: new Date(),
      });
      const deal = await app.getFirstDeal();

      // When: User clicks "View Original Email"
      await deal.viewOriginalEmail();

      // Then: User is taken to the email in the timeline
      const currentView = await app.getCurrentView();
      expect(currentView.page).toBe('timeline');
      expect(currentView.emailId).toBe(deal.emailId);
    });

    it('User sees deal count in navigation', async () => {
      // Given: User has active deals
      await app.seedDeals({ active: 7 });

      // When: User looks at navigation
      const nav = await app.getNavigation();

      // Then: Active deal count is shown
      expect(nav.dealsCount).toBe(7);
    });
  });

  describe('Deal Value Extraction', () => {
    it('Extracts dollar amount from deal text', async () => {
      // Given: Promotional email with dollar value
      await app.processEmail({
        id: 'dollar-deal',
        subject: 'Save $20 on your next order',
        body: 'Get $20 off your purchase of $100 or more. Limited time offer.',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
      });

      // When: Deal is extracted
      const deal = await app.getDealForEmail('dollar-deal');

      // Then: Dollar value is captured
      expect(deal.dealValue).toBeDefined();
      expect(deal.dealValue).toMatch(/\$20/);
    });

    it('Extracts percentage discount from deal text', async () => {
      // Given: Promotional email with percentage
      await app.processEmail({
        id: 'percent-deal',
        subject: '50% discount on all items',
        body: 'Take 50% off everything in store. No exclusions.',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
      });

      // When: Deal is extracted
      const deal = await app.getDealForEmail('percent-deal');

      // Then: Percentage value is captured
      expect(deal.dealValue).toBeDefined();
      expect(deal.dealValue).toMatch(/50%/);
    });

    it('Extracts "Save $X" format from deal text', async () => {
      // Given: Promotional email with Save format
      await app.processEmail({
        id: 'save-deal',
        subject: 'Flash Sale Today',
        body: 'Save $100 on your next purchase over $500. Hurry, ends tonight!',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
      });

      // When: Deal is extracted
      const deal = await app.getDealForEmail('save-deal');

      // Then: Save amount is captured
      expect(deal.dealValue).toBeDefined();
      expect(deal.dealValue).toMatch(/100/);
    });
  });

  describe('Deal Category Extraction', () => {
    it('Extracts category from deal content (Electronics)', async () => {
      // Given: Deal about electronics
      await app.processEmail({
        id: 'electronics-deal',
        subject: 'Electronics Sale',
        body: 'Save on TVs, laptops, and all electronics. Use code TECH20.',
        category: 'promotions',
        sender: 'deals@bestbuy.com',
        receivedAt: new Date(),
      });

      // When: Deal is extracted
      const deal = await app.getDealForEmail('electronics-deal');

      // Then: Category is identified
      expect(deal.dealCategory).toBeDefined();
      expect(deal.dealCategory.toLowerCase()).toMatch(/electronics|tech/);
    });

    it('Extracts category from deal content (Fashion)', async () => {
      // Given: Deal about fashion
      await app.processEmail({
        id: 'fashion-deal',
        subject: 'Fashion Week Sale',
        body: 'Get 30% off all clothing, shoes, and fashion accessories.',
        category: 'promotions',
        sender: 'deals@nordstrom.com',
        receivedAt: new Date(),
      });

      // When: Deal is extracted
      const deal = await app.getDealForEmail('fashion-deal');

      // Then: Category is identified
      expect(deal.dealCategory).toBeDefined();
      expect(deal.dealCategory.toLowerCase()).toMatch(/fashion|clothing/);
    });

    it('Extracts category from deal content (Travel)', async () => {
      // Given: Deal about travel
      await app.processEmail({
        id: 'travel-deal',
        subject: 'Flight Deals',
        body: 'Book your next vacation with 25% off flights and hotels.',
        category: 'promotions',
        sender: 'deals@expedia.com',
        receivedAt: new Date(),
      });

      // When: Deal is extracted
      const deal = await app.getDealForEmail('travel-deal');

      // Then: Category is identified
      expect(deal.dealCategory).toBeDefined();
      expect(deal.dealCategory.toLowerCase()).toMatch(/travel|vacation/);
    });
  });

  describe('Deal Description Extraction', () => {
    it('Extracts full deal description', async () => {
      // Given: Email with detailed deal
      await app.processEmail({
        id: 'description-deal',
        subject: 'Limited Time Offer',
        body: 'Get 40% off all outdoor furniture. Includes patio sets, umbrellas, and garden decor. Valid in-store only.',
        category: 'promotions',
        sender: 'deals@target.com',
        receivedAt: new Date(),
      });

      // When: Deal is extracted
      const deal = await app.getDealForEmail('description-deal');

      // Then: Full description is captured
      expect(deal.dealDescription).toBeDefined();
      expect(deal.dealDescription.length).toBeGreaterThan(20);
    });
  });

  describe('Multiple Deals Per Email', () => {
    it('Extracts multiple deals from single email', async () => {
      // Given: Email with multiple offers
      await app.processEmail({
        id: 'multi-deal-email',
        subject: 'Choose Your Deal',
        body: 'Option 1: Use code SAVE20 for 20% off. Option 2: Use code FREESHIP for free shipping. Option 3: Use code BUNDLE for buy 2 get 1 free.',
        category: 'promotions',
        sender: 'deals@store.com',
        receivedAt: new Date(),
      });

      // When: Deals are extracted
      const deals = await app.getDealsForEmail('multi-deal-email');

      // Then: All deals are captured
      expect(deals.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('No Deal Present', () => {
    it('Promotional email without deal does not create deal record', async () => {
      // Given: Newsletter without any deal
      await app.processEmail({
        id: 'no-deal-newsletter',
        subject: 'Weekly Newsletter',
        body: 'Check out our latest blog posts and product updates. No offers this week.',
        category: 'promotions',
        sender: 'newsletter@company.com',
        receivedAt: new Date(),
      });

      // When: User checks for deals
      const deal = await app.getDealForEmail('no-deal-newsletter');

      // Then: No deal record is created
      expect(deal).toBeNull();
    });
  });
});
