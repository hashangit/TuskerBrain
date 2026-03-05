import { describe, it, expect } from 'vitest';
import { extractUpdate, extractDeal, extractFromEmail } from '@core/workflows/nodes/extract';
import type { Email } from '@core/types/email';

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
      expect(result?.priority).toBe('medium');
      // Bank statements typically don require action, they're informational
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
