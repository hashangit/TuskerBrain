import { describe, it, expect, beforeEach } from 'vitest';
import { SummaryGenerator } from '@core/summaries/generator';
import type { Email } from '@core/types/email';

describe('Summary Generation', () => {
  let generator: SummaryGenerator;

  beforeEach(() => {
    generator = new SummaryGenerator();
  });

  describe('Topic Summaries', () => {
    it('should create initial summary from first email', async () => {
      const email: Partial<Email> = {
        id: 'email-1',
        threadId: 'thread-1',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Your January Statement is Ready',
        snippet: 'Your January 2024 statement is now available. Balance: $2,450.00. Payment due: February 15, 2024.',
        receivedAt: new Date('2024-01-20'),
      };

      const result = await generator.generateTopicSummary('Banking/Chase', [email as Email]);

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.wordCount).toBeLessThanOrEqual(500);
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      expect(result.paragraphCount).toBeLessThanOrEqual(4);
      expect(result.paragraphs[0]).toBeDefined();
    });

    it('should update summary when new email is added', async () => {
      const emails: Partial<Email>[] = [
        {
          id: 'email-1',
          threadId: 'thread-1',
          senderEmail: 'noreply@chase.com',
          senderName: 'Chase Bank',
          senderDomain: 'chase.com',
          subject: 'January Statement Ready',
          snippet: 'Your January statement is available. Balance: $2,450.',
          receivedAt: new Date('2024-01-20'),
        },
        {
          id: 'email-2',
          threadId: 'thread-2',
          senderEmail: 'alerts@chase.com',
          senderName: 'Chase',
          senderDomain: 'chase.com',
          subject: 'Payment Received',
          snippet: 'Your payment of $500 has been received. New balance: $1,950.',
          receivedAt: new Date('2024-02-01'),
        },
      ];

      const result = await generator.generateTopicSummary('Banking/Chase', emails as Email[]);

      expect(result).toBeDefined();
      // Check for Payment in recent activity (case-insensitive)
      expect(result.summary.toLowerCase()).toContain('payment');
      expect(result.updateCount).toBe(2);
    });

    it('should maintain high-level overview in first paragraph', async () => {
      const emails: Partial<Email>[] = Array.from({ length: 10 }, (_, i) => ({
        id: `email-${i}`,
        threadId: `thread-${i}`,
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: `Statement ${i} Ready`,
        snippet: `Statement ${i} is available. Balance: $${2000 + i * 100}.`,
        receivedAt: new Date(2024, 0, i + 1),
      }));

      const result = await generator.generateTopicSummary('Banking/Chase', emails as Email[]);

      // First paragraph should be overview, not detailed
      const firstParagraph = result.paragraphs[0];
      expect(firstParagraph.length).toBeLessThan(300);
    });

    it('should reduce focus on older information', async () => {
      const oldEmail: Partial<Email> = {
        id: 'old-email',
        threadId: 'old-thread',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Very Old Statement',
        snippet: 'This is very old information about your account from 2022.',
        receivedAt: new Date('2022-01-01'),
      };

      const newEmail: Partial<Email> = {
        id: 'new-email',
        threadId: 'new-thread',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Recent Statement',
        snippet: 'Your latest statement shows significant changes to your account.',
        receivedAt: new Date('2024-01-01'),
      };

      const result = await generator.generateTopicSummary('Banking/Chase', [oldEmail, newEmail] as Email[]);

      // Recent info should be more prominent
      expect(result.summary.toLowerCase()).toContain('recent');
    });

    it('should stay within 500 word limit', async () => {
      const emails: Partial<Email>[] = Array.from({ length: 50 }, (_, i) => ({
        id: `email-${i}`,
        threadId: `thread-${i}`,
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: `Update ${i}`,
        snippet: `This is update number ${i} with lots of detailed information about your banking activities and transactions and various account changes that have occurred over time.`,
        receivedAt: new Date(2024, 0, 1),
      }));

      const result = await generator.generateTopicSummary('Banking/Chase', emails as Email[]);

      expect(result.wordCount).toBeLessThanOrEqual(500);
    });
  });

  describe('Sender Summaries', () => {
    it('should create summary per sender domain', async () => {
      const emails: Partial<Email>[] = [
        {
          id: 'email-1',
          threadId: 'thread-1',
          senderEmail: 'support@amazon.com',
          senderName: 'Amazon Support',
          senderDomain: 'amazon.com',
          subject: 'Your Order Shipped',
          snippet: 'Your order #123 has shipped.',
          receivedAt: new Date(),
        },
        {
          id: 'email-2',
          threadId: 'thread-2',
          senderEmail: 'deals@amazon.com',
          senderName: 'Amazon Deals',
          senderDomain: 'amazon.com',
          subject: 'Daily Deals',
          snippet: 'Check out today\'s deals.',
          receivedAt: new Date(),
        },
      ];

      const result = await generator.generateSenderSummary('amazon.com', emails as Email[]);

      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.wordCount).toBeLessThanOrEqual(500);
    });

    it('should track update count', async () => {
      const emails: Partial<Email>[] = [
        {
          id: 'email-1',
          threadId: 'thread-1',
          senderEmail: 'news@company.com',
          senderName: 'Company News',
          senderDomain: 'company.com',
          subject: 'Update 1',
          snippet: 'First update.',
          receivedAt: new Date(),
        },
        {
          id: 'email-2',
          threadId: 'thread-2',
          senderEmail: 'news@company.com',
          senderName: 'Company News',
          senderDomain: 'company.com',
          subject: 'Update 2',
          snippet: 'Second update.',
          receivedAt: new Date(),
        },
      ];

      const result = await generator.generateSenderSummary('company.com', emails as Email[]);

      expect(result.updateCount).toBe(2);
    });
  });

  describe('Summary Structure', () => {
    it('should have 3-4 paragraphs', async () => {
      const emails: Partial<Email>[] = [
        {
          id: 'email-1',
          threadId: 'thread-1',
          senderEmail: 'test@test.com',
          senderName: 'Test',
          senderDomain: 'test.com',
          subject: 'Test Subject',
          snippet: 'Test content for summary generation.',
          receivedAt: new Date(),
        },
        {
          id: 'email-2',
          threadId: 'thread-2',
          senderEmail: 'test@test.com',
          senderName: 'Test',
          senderDomain: 'test.com',
          subject: 'Another Test',
          snippet: 'More test content for better summary.',
          receivedAt: new Date(),
        },
      ];

      const result = await generator.generateTopicSummary('Test/Topic', emails as Email[]);

      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      expect(result.paragraphCount).toBeLessThanOrEqual(4);
    });
  });
});
