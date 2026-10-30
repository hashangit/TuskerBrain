import { describe, it, expect } from 'vitest';
import { extractUpdate, extractDeal, extractFromEmail } from '@domain/workflows/nodes/extract';
import type { Email } from '@foundations/types/email';

/**
 * Design Spec Reference: Lines 759-792
 *
 * Update Extraction Tests:
 * - Extracts title, description, summary from email
 * - Identifies action items in email
 * - Extracts key entities (dates, amounts, names)
 * - Assigns correct priority based on content
 * - Identifies sentiment correctly
 * - Extracts follow-up dates when mentioned
 * - Extracts financial impact when applicable
 * - Marks user-important emails as high priority
 */
describe('Email Extraction', () => {
  describe('extractUpdate', () => {
    it('should extract update from bank statement email', async () => {
      const email: Partial<Email> = {
        id: 'email-1',
        threadId: 'thread-1',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Your January Statement is Ready',
        snippet: 'Your January 2024 statement is now available. Log in to view your account activity. Balance: $2,450.00. Payment due: February 15, 2024.',
        receivedAt: new Date('2024-01-20'),
      };

      const result = await extractUpdate(email as Email);

      expect(result).toBeDefined();
      expect(result?.title).toContain('Statement');
      expect(result?.description).toBeDefined();
      expect(result?.summary).toBeDefined();
      expect(result?.priority).toBe('medium');
      expect(result?.keyEntities?.amounts).toContain(2450);
    });

    it('should extract action item from email requiring response', async () => {
      const email: Partial<Email> = {
        id: 'email-2',
        threadId: 'thread-2',
        senderEmail: 'john.smith@company.com',
        senderName: 'John Smith',
        senderDomain: 'company.com',
        subject: 'Re: Project Alpha - Action Required',
        snippet: 'Hi team, We need your approval by Friday. Please review the attached document and respond.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result).toBeDefined();
      expect(result?.actionItem).toBe(true);
      expect(result?.actionItemTitle).toContain('approval');
      expect(result?.priority).toBe('high');
    });

    it('should extract key entities from email', async () => {
      const email: Partial<Email> = {
        id: 'email-3',
        threadId: 'thread-3',
        senderEmail: 'hr@company.com',
        senderName: 'HR Department',
        senderDomain: 'company.com',
        subject: 'Open Enrollment: November 1-30',
        snippet: 'Open enrollment period is November 1-30, 2024. Contact benefits@company.com for questions. Premium increase: $50/month. Please review your options.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result).toBeDefined();
      expect(result?.keyEntities).toBeDefined();
      expect(result?.keyEntities?.dates.length).toBeGreaterThan(0);
      expect(result?.keyEntities?.amounts).toContain(50);
    });

    it('should return null for non-update email', async () => {
      const email: Partial<Email> = {
        id: 'email-4',
        threadId: 'thread-4',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon Deals',
        senderDomain: 'amazon.com',
        subject: '50% off Electronics - Today Only!',
        snippet: 'Save big on electronics today!',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);
      expect(result).toBeNull();
    });
  });

  describe('Priority Assignment', () => {
    it('should assign high priority to urgent emails', async () => {
      const email: Partial<Email> = {
        id: 'email-10',
        threadId: 'thread-10',
        senderEmail: 'legal@company.com',
        senderName: 'Legal Department',
        senderDomain: 'company.com',
        subject: 'URGENT: Contract Signature Required',
        snippet: 'This is urgent. We need your signature on the contract by end of day or the deal will be void.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.priority).toBe('high');
      expect(result?.urgency).toBe(true);
    });

    it('should assign medium priority to informational emails', async () => {
      const email: Partial<Email> = {
        id: 'email-11',
        threadId: 'thread-11',
        senderEmail: 'news@company.com',
        senderName: 'Company News',
        senderDomain: 'company.com',
        subject: 'Monthly Newsletter',
        snippet: 'Here are the updates from this month. New product launches, team changes, and upcoming events.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.priority).toBe('medium');
    });

    it('should assign low priority to FYI emails', async () => {
      const email: Partial<Email> = {
        id: 'email-12',
        threadId: 'thread-12',
        senderEmail: 'colleague@company.com',
        senderName: 'Colleague',
        senderDomain: 'company.com',
        subject: 'FYI: Interesting article',
        snippet: 'Thought you might find this article interesting. No action needed.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.priority).toBe('low');
    });

    it('should mark user-important emails as high priority (Gmail important flag)', async () => {
      const email: Partial<Email> = {
        id: 'email-13',
        threadId: 'thread-13',
        senderEmail: 'boss@company.com',
        senderName: 'Boss',
        senderDomain: 'company.com',
        subject: 'Weekly Update',
        snippet: 'Here is my weekly update.',
        receivedAt: new Date(),
        isImportant: true, // Gmail important flag
      };

      const result = await extractUpdate(email as Email);

      expect(result?.priority).toBe('high');
    });
  });

  describe('Sentiment Analysis', () => {
    it('should identify positive sentiment', async () => {
      const email: Partial<Email> = {
        id: 'email-14',
        threadId: 'thread-14',
        senderEmail: 'hr@company.com',
        senderName: 'HR',
        senderDomain: 'company.com',
        subject: 'Congratulations on Your Promotion!',
        snippet: 'We are pleased to inform you that you have been promoted! Great work on your achievements.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.sentiment).toBe('positive');
    });

    it('should identify negative sentiment', async () => {
      const email: Partial<Email> = {
        id: 'email-15',
        threadId: 'thread-15',
        senderEmail: 'support@service.com',
        senderName: 'Customer Service',
        senderDomain: 'service.com',
        subject: 'Service Disruption - We Apologize',
        snippet: 'We regret to inform you that there was an issue with your order. We apologize for the inconvenience and delay.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.sentiment).toBe('negative');
    });

    it('should identify neutral sentiment', async () => {
      const email: Partial<Email> = {
        id: 'email-16',
        threadId: 'thread-16',
        senderEmail: 'system@company.com',
        senderName: 'System',
        senderDomain: 'company.com',
        subject: 'Scheduled Maintenance',
        snippet: 'Maintenance will occur from 2-4 AM. Services will be unavailable during this time.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.sentiment).toBe('neutral');
    });
  });

  describe('Follow-up Date Extraction', () => {
    it('should extract follow-up date when mentioned', async () => {
      const email: Partial<Email> = {
        id: 'email-17',
        threadId: 'thread-17',
        senderEmail: 'pm@company.com',
        senderName: 'Project Manager',
        senderDomain: 'company.com',
        subject: 'Project Deadline',
        snippet: 'The project deadline is February 28, 2024. Please ensure all deliverables are submitted by then.',
        receivedAt: new Date('2024-01-15'),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.followUpDate).toBeDefined();
      expect(result?.followUpDate).toMatch(/2024-02-28|February 28/);
    });

    it('should handle relative date references', async () => {
      const email: Partial<Email> = {
        id: 'email-18',
        threadId: 'thread-18',
        senderEmail: 'team@company.com',
        senderName: 'Team Lead',
        senderDomain: 'company.com',
        subject: 'Meeting Tomorrow',
        snippet: 'Please join the meeting tomorrow at 3 PM.',
        receivedAt: new Date('2024-01-15'),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.followUpDate).toBeDefined();
    });
  });

  describe('Financial Impact Extraction', () => {
    it('should extract financial impact when applicable', async () => {
      const email: Partial<Email> = {
        id: 'email-19',
        threadId: 'thread-19',
        senderEmail: 'finance@company.com',
        senderName: 'Finance',
        senderDomain: 'company.com',
        subject: 'Invoice Due',
        snippet: 'Your invoice of $1,500 is due on February 1, 2024. Please process payment.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.financialImpact).toBe(1500);
    });

    it('should extract multiple amounts and use largest as financial impact', async () => {
      const email: Partial<Email> = {
        id: 'email-20',
        threadId: 'thread-20',
        senderEmail: 'vendor@company.com',
        senderName: 'Vendor',
        senderDomain: 'company.com',
        subject: 'Contract Renewal',
        snippet: 'Your contract renewal fee is $5,000. Previous fee was $4,500. A $100 setup fee also applies.',
        receivedAt: new Date(),
      };

      const result = await extractUpdate(email as Email);

      expect(result?.financialImpact).toBe(5000);
    });
  });

  describe('extractDeal', () => {
    it('should extract deal from promotional email', async () => {
      const email: Partial<Email> = {
        id: 'email-5',
        threadId: 'thread-5',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon',
        senderDomain: 'amazon.com',
        subject: '50% Off Electronics - Today Only!',
        snippet: 'Save big on electronics today. Use code SAVE50 at checkout. Offer expires midnight. Minimum purchase $100.',
        receivedAt: new Date(),
      };

      const result = await extractDeal(email as Email);

      expect(result).toBeDefined();
      expect(result?.dealTitle).toMatch(/50%/i);
      expect(result?.brandName).toBe('Amazon');
      expect(result?.dealCode).toBe('SAVE50');
      expect(result?.minimumPurchase).toBe('100');
    });

    it('should extract expiry date from deal', async () => {
      const email: Partial<Email> = {
        id: 'email-6',
        threadId: 'thread-6',
        senderEmail: 'offers@bestbuy.com',
        senderName: 'Best Buy',
        senderDomain: 'bestbuy.com',
        subject: 'Flash Sale Ends Friday!',
        snippet: 'Flash sale ends Friday at midnight. Get 20% off all TVs.',
        receivedAt: new Date('2024-01-15'),
      };

      const result = await extractDeal(email as Email);

      expect(result).toBeDefined();
      expect(result?.dealExpiry).toBeDefined();
    });

    it('should extract brand name from sender or content', async () => {
      const email: Partial<Email> = {
        id: 'email-21',
        threadId: 'thread-21',
        senderEmail: 'noreply@store.com',
        senderName: 'Mega Store',
        senderDomain: 'store.com',
        subject: 'Deal Inside!',
        snippet: 'Save 30% at Mega Store!',
        receivedAt: new Date(),
      };

      const result = await extractDeal(email as Email);

      expect(result?.brandName).toMatch(/mega store/i);
    });

    it('should extract deal link when present', async () => {
      const email: Partial<Email> = {
        id: 'email-22',
        threadId: 'thread-22',
        senderEmail: 'deals@store.com',
        senderName: 'Store',
        senderDomain: 'store.com',
        subject: 'Special Offer',
        snippet: 'Click here to redeem: https://store.com/deal/special-offer-123',
        receivedAt: new Date(),
      };

      const result = await extractDeal(email as Email);

      expect(result?.dealLink).toContain('store.com/deal');
    });

    it('should return null for non-promotional email', async () => {
      const email: Partial<Email> = {
        id: 'email-7',
        threadId: 'thread-7',
        senderEmail: 'john.smith@company.com',
        senderName: 'John Smith',
        senderDomain: 'company.com',
        subject: 'Re: Project Update',
        snippet: 'Here is the project update you requested.',
        receivedAt: new Date(),
      };

      const result = await extractDeal(email as Email);
      expect(result).toBeNull();
    });
  });

  describe('extractFromEmail', () => {
    it('should extract update for update-type email', async () => {
      const email: Partial<Email> = {
        id: 'email-8',
        threadId: 'thread-8',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Your Statement is Ready',
        snippet: 'Your statement is now available. Please review.',
        receivedAt: new Date(),
      };

      const result = await extractFromEmail(email as Email, 'updates');

      expect(result.type).toBe('update');
      expect(result.update).toBeDefined();
      expect(result.deal).toBeUndefined();
    });

    it('should extract deal for promotional-type email', async () => {
      const email: Partial<Email> = {
        id: 'email-9',
        threadId: 'thread-9',
        senderEmail: 'deals@store.com',
        senderName: 'Store Deals',
        senderDomain: 'store.com',
        subject: 'Save 30% Today!',
        snippet: 'Use code SAVE30 for 30% off.',
        receivedAt: new Date(),
      };

      const result = await extractFromEmail(email as Email, 'promotional');

      expect(result.type).toBe('deal');
      expect(result.deal).toBeDefined();
      expect(result.update).toBeUndefined();
    });
  });
});
