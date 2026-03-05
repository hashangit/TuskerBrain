import { describe, it, expect } from 'vitest';
import { classifyEmailType } from '@core/workflows/nodes/classify';
import type { Email } from '@core/types/email';

describe('Email Classification', () => {
  describe('classifyEmailType', () => {
    it('should classify promotional emails', async () => {
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
    });

    it('should classify social emails', async () => {
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
    });

    it('should classify update emails', async () => {
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
    });

    it('should classify regular emails from individuals', async () => {
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
    });

    it('should use sender domain patterns for classification', async () => {
      const email: Partial<Email> = {
        id: 'email-5',
        threadId: 'thread-5',
        senderEmail: 'newsletter@marketingcompany.com',
        senderName: 'Marketing Newsletter',
        senderDomain: 'marketingcompany.com',
        subject: 'Weekly Deals Inside!',
        snippet: 'Check out this week\'s best deals...',
        receivedAt: new Date(),
      };

      const result = await classifyEmailType(email as Email);
      expect(result.type).toBe('promotional');
    });
  });
});
