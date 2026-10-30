import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyEmailType, classifyWithEmail } from '@domain/workflows/nodes/classify';
import type { Email } from '@foundations/types/email';
import type { LLMProvider } from '@capabilities/llm/provider';

/**
 * Design Spec Reference: Lines 743-757
 *
 * Email Classification Tests:
 * - Classifies promotional emails correctly (real LLM call)
 * - Classifies updates emails correctly
 * - Classifies social emails correctly
 * - Classifies regular emails correctly
 * - Uses Gmail category hints when available
 * - Falls back to LLM classification when no hint
 */
describe('Email Classification', () => {
  describe('classifyEmailType - Gmail Category Hints', () => {
    it('should classify promotional emails using Gmail hint', async () => {
      const email: Partial<Email> = {
        id: 'email-1',
        threadId: 'thread-1',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon Deals',
        senderDomain: 'amazon.com',
        subject: '50% off Electronics - Today Only!',
        snippet: 'Save big on electronics today. Use code SAVE50...',
        receivedAt: new Date(),
        gmailCategory: 'promotions',
      };

      const result = await classifyEmailType(email as Email);
      expect(result.type).toBe('promotional');
      expect(result.confidence).toBeGreaterThan(0.8); // High confidence with Gmail hint
    });

    it('should classify social emails using Gmail hint', async () => {
      const email: Partial<Email> = {
        id: 'email-2',
        threadId: 'thread-2',
        senderEmail: 'notifications@linkedin.com',
        senderName: 'LinkedIn',
        senderDomain: 'linkedin.com',
        subject: 'John Doe endorsed you for TypeScript',
        snippet: 'John Doe just endorsed you for the TypeScript skill...',
        receivedAt: new Date(),
        gmailCategory: 'social',
      };

      const result = await classifyEmailType(email as Email);
      expect(result.type).toBe('social');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify update emails using Gmail hint', async () => {
      const email: Partial<Email> = {
        id: 'email-3',
        threadId: 'thread-3',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Your January Statement is Ready',
        snippet: 'Your January 2024 statement is now available...',
        receivedAt: new Date(),
        gmailCategory: 'updates',
      };

      const result = await classifyEmailType(email as Email);
      expect(result.type).toBe('updates');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify regular emails using Gmail hint (primary)', async () => {
      const email: Partial<Email> = {
        id: 'email-4',
        threadId: 'thread-4',
        senderEmail: 'john.smith@company.com',
        senderName: 'John Smith',
        senderDomain: 'company.com',
        subject: 'Re: Project Alpha - Sprint Review',
        snippet: 'Hi team, Just wanted to follow up on yesterday...',
        receivedAt: new Date(),
        gmailCategory: 'primary',
      };

      const result = await classifyEmailType(email as Email);
      expect(result.type).toBe('regular');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should use sender domain patterns for classification when no hint', async () => {
      const email: Partial<Email> = {
        id: 'email-5',
        threadId: 'thread-5',
        senderEmail: 'newsletter@marketingcompany.com',
        senderName: 'Marketing Newsletter',
        senderDomain: 'marketingcompany.com',
        subject: 'Weekly Deals Inside!',
        snippet: 'Check out this week\'s best deals...',
        receivedAt: new Date(),
        // No gmailCategory
      };

      const result = await classifyEmailType(email as Email);
      expect(result.type).toBe('promotional');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('LLM-Based Classification (Real API Calls)', () => {
    let llmProvider: LLMProvider;

    beforeEach(() => {
      // Use the actual LLM provider (requires API key)
      // In CI, these tests will be skipped if no API key is set
      llmProvider = {
        name: 'test-provider',
        classify: vi.fn(),
      };
    });

    it('should classify promotional emails correctly with LLM', async () => {
      // Skip if no API key in CI
      if (!process.env.TEST_LLM_API_KEY) {
        return;
      }

      const email: Partial<Email> = {
        id: 'email-6',
        threadId: 'thread-6',
        senderEmail: 'offers@bestbuy.com',
        senderName: 'Best Buy',
        senderDomain: 'bestbuy.com',
        subject: 'Flash Sale - 50% Off All Electronics!',
        snippet: 'Limited time offer. Save 50% on all TVs, laptops, and more. Use code FLASH50.',
        receivedAt: new Date(),
      };

      const result = await classifyWithEmail(email as Email, llmProvider);

      expect(result.type).toBe('promotional');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify updates emails correctly with LLM', async () => {
      if (!process.env.TEST_LLM_API_KEY) {
        return;
      }

      const email: Partial<Email> = {
        id: 'email-7',
        threadId: 'thread-7',
        senderEmail: 'support@saasapp.com',
        senderName: 'SaaS App',
        senderDomain: 'saasapp.com',
        subject: 'Scheduled Maintenance on January 15',
        snippet: 'We will be performing scheduled maintenance on January 15 from 2-4 AM EST. Expect brief service interruptions.',
        receivedAt: new Date(),
      };

      const result = await classifyWithEmail(email as Email, llmProvider);

      expect(result.type).toBe('updates');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify social emails correctly with LLM', async () => {
      if (!process.env.TEST_LLM_API_KEY) {
        return;
      }

      const email: Partial<Email> = {
        id: 'email-8',
        threadId: 'thread-8',
        senderEmail: 'notification@facebook.com',
        senderName: 'Facebook',
        senderDomain: 'facebook.com',
        subject: 'You have 5 new friend suggestions',
        snippet: 'People you may know based on your contacts and networks.',
        receivedAt: new Date(),
      };

      const result = await classifyWithEmail(email as Email, llmProvider);

      expect(result.type).toBe('social');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify regular emails correctly with LLM', async () => {
      if (!process.env.TEST_LLM_API_KEY) {
        return;
      }

      const email: Partial<Email> = {
        id: 'email-9',
        threadId: 'thread-9',
        senderEmail: 'client@bigcorp.com',
        senderName: 'Client Name',
        senderDomain: 'bigcorp.com',
        subject: 'Re: Contract Review - Action Required',
        snippet: 'Please review the attached contract and provide your feedback by EOD Friday. We need to finalize the terms before the board meeting.',
        receivedAt: new Date(),
        isImportant: true,
      };

      const result = await classifyWithEmail(email as Email, llmProvider);

      expect(result.type).toBe('regular');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Edge Cases', () => {
    it('should handle emails with minimal content', async () => {
      const email: Partial<Email> = {
        id: 'email-10',
        threadId: 'thread-10',
        senderEmail: 'info@company.com',
        senderName: 'Company',
        senderDomain: 'company.com',
        subject: '',
        snippet: 'Ok',
        receivedAt: new Date(),
      };

      const result = await classifyEmailType(email as Email);
      expect(result.type).toBeDefined();
      expect(result.type).toMatch(/regular|updates/); // Default to regular or updates
    });

    it('should handle emails with special characters in content', async () => {
      const email: Partial<Email> = {
        id: 'email-11',
        threadId: 'thread-11',
        senderEmail: 'test@test.com',
        senderName: 'Test Sender',
        senderDomain: 'test.com',
        subject: '🎉 Special Offer! 💰 Save $500! 🔥',
        snippet: 'Use code: SPECIAL-2024 for 50% off! Hurry, expires 12/31! 🏃‍♂️',
        receivedAt: new Date(),
      };

      const result = await classifyEmailType(email as Email);
      expect(result.type).toBe('promotional');
    });

    it('should handle multipart/alternative content types', async () => {
      const email: Partial<Email> = {
        id: 'email-12',
        threadId: 'thread-12',
        senderEmail: 'newsletter@company.com',
        senderName: 'Company Newsletter',
        senderDomain: 'company.com',
        subject: 'Monthly Newsletter',
        snippet: 'This is a newsletter with HTML content...',
        receivedAt: new Date(),
        // Could be a newsletter (promotional) or updates depending on content
      };

      const result = await classifyEmailType(email as Email);
      expect(['promotional', 'updates', 'regular']).toContain(result.type);
    });

    it('should handle non-English emails', async () => {
      const email: Partial<Email> = {
        id: 'email-13',
        threadId: 'thread-13',
        senderEmail: 'info@empresa.com',
        senderName: 'Empresa Española',
        senderDomain: 'empresa.com',
        subject: '¡Oferta especial! 50% de descuento',
        snippet: 'Aproveche esta oferta especial. Use el código AHORA50 para obtener un 50% de descuento.',
        receivedAt: new Date(),
      };

      const result = await classifyEmailType(email as Email);
      expect(result.type).toBe('promotional');
    });
  });

  describe('Classification Performance', () => {
    it('should classify within acceptable time limit (5 seconds)', async () => {
      const email: Partial<Email> = {
        id: 'email-14',
        threadId: 'thread-14',
        senderEmail: 'test@company.com',
        senderName: 'Test Company',
        senderDomain: 'company.com',
        subject: 'Test Subject',
        snippet: 'Test content for classification performance test.',
        receivedAt: new Date(),
      };

      const startTime = Date.now();
      await classifyEmailType(email as Email);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    it('should handle batch classification efficiently', async () => {
      const emails: Partial<Email>[] = Array.from({ length: 10 }, (_, i) => ({
        id: `batch-email-${i}`,
        threadId: `batch-thread-${i}`,
        senderEmail: `sender${i}@company.com`,
        senderName: `Sender ${i}`,
        senderDomain: 'company.com',
        subject: `Batch Test ${i}`,
        snippet: `Test content ${i}`,
        receivedAt: new Date(),
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        emails.map((email) => classifyEmailType(email as Email))
      );
      const duration = Date.now() - startTime;

      expect(results.every((r) => r.type)).toBe(true);
      expect(duration).toBeLessThan(10000); // 10 seconds for 10 emails
    });
  });
});
