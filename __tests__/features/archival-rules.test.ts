import { describe, it, expect } from 'vitest';
import { ProcessingDecision } from '@core/workflows/email-processing';
import type { Email } from '@core/types/email';

/**
 * Design Spec Reference: Lines 719-738
 *
 * Archival Rules based on email type and age:
 *
 * | Email Type    | Age < 1 month | Age 1-6 months | Age > 6 months | Age > 2 years |
 * |---------------|---------------|----------------|----------------|---------------|
 * | Regular       | Process with AI| Process with AI| Archive        | Archive       |
 * | Updates       | Process with AI| Archive        | Archive        | Archive       |
 * | Social        | Process with AI| Delete         | Delete         | Archive       |
 * | Promotional   | Extract Deals | Delete         | Delete         | Archive       |
 */
describe('Archival Rules', () => {
  describe('Regular Emails', () => {
    it('should process regular emails less than 1 month old', async () => {
      const email: Partial<Email> = {
        id: 'email-1',
        threadId: 'thread-1',
        senderEmail: 'john@company.com',
        senderName: 'John',
        senderDomain: 'company.com',
        subject: 'Project Update',
        snippet: 'Here is the project update...',
        receivedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        emailType: 'regular',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('process');
      expect(decision.needsExtraction).toBe(true);
    });

    it('should process regular emails between 1-6 months old', async () => {
      const email: Partial<Email> = {
        id: 'email-2',
        threadId: 'thread-2',
        senderEmail: 'john@company.com',
        senderName: 'John',
        senderDomain: 'company.com',
        subject: 'Project Update',
        snippet: 'Here is the project update...',
        receivedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 3 months ago
        emailType: 'regular',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('process');
    });

    it('should archive regular emails older than 6 months', async () => {
      const email: Partial<Email> = {
        id: 'email-3',
        threadId: 'thread-3',
        senderEmail: 'john@company.com',
        senderName: 'John',
        senderDomain: 'company.com',
        subject: 'Project Update',
        snippet: 'Here is the project update...',
        receivedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // ~6.5 months ago
        emailType: 'regular',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('archive');
      expect(decision.needsExtraction).toBe(false);
    });

    it('should archive regular emails older than 2 years', async () => {
      const email: Partial<Email> = {
        id: 'email-4',
        threadId: 'thread-4',
        senderEmail: 'john@company.com',
        senderName: 'John',
        senderDomain: 'company.com',
        subject: 'Old Project Update',
        snippet: 'Here is the old project update...',
        receivedAt: new Date(Date.now() - 800 * 24 * 60 * 60 * 1000), // ~2+ years ago
        emailType: 'regular',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('archive');
    });
  });

  describe('Updates Emails', () => {
    it('should process updates emails less than 1 month old', async () => {
      const email: Partial<Email> = {
        id: 'email-5',
        threadId: 'thread-5',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Statement Ready',
        snippet: 'Your statement is ready...',
        receivedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        emailType: 'updates',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('process');
      expect(decision.needsExtraction).toBe(true);
    });

    it('should archive updates emails older than 1 month', async () => {
      const email: Partial<Email> = {
        id: 'email-6',
        threadId: 'thread-6',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Statement Ready',
        snippet: 'Your statement is ready...',
        receivedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
        emailType: 'updates',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('archive');
      expect(decision.needsExtraction).toBe(false);
    });

    it('should archive updates emails older than 6 months', async () => {
      const email: Partial<Email> = {
        id: 'email-7',
        threadId: 'thread-7',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Statement Ready',
        snippet: 'Your statement is ready...',
        receivedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // ~6.5 months ago
        emailType: 'updates',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('archive');
    });
  });

  describe('Social Emails', () => {
    it('should process social emails less than 1 month old', async () => {
      const email: Partial<Email> = {
        id: 'email-8',
        threadId: 'thread-8',
        senderEmail: 'notifications@linkedin.com',
        senderName: 'LinkedIn',
        senderDomain: 'linkedin.com',
        subject: 'Someone endorsed you',
        snippet: 'You received an endorsement...',
        receivedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        emailType: 'social',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('process');
    });

    it('should delete social emails older than 1 month', async () => {
      const email: Partial<Email> = {
        id: 'email-9',
        threadId: 'thread-9',
        senderEmail: 'notifications@linkedin.com',
        senderName: 'LinkedIn',
        senderDomain: 'linkedin.com',
        subject: 'Someone endorsed you',
        snippet: 'You received an endorsement...',
        receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        emailType: 'social',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('delete');
      expect(decision.reason).toMatch(/social/i);
    });

    it('should delete social emails between 1-6 months old', async () => {
      const email: Partial<Email> = {
        id: 'email-10',
        threadId: 'thread-10',
        senderEmail: 'notifications@linkedin.com',
        senderName: 'LinkedIn',
        senderDomain: 'linkedin.com',
        subject: 'Someone endorsed you',
        snippet: 'You received an endorsement...',
        receivedAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // 4 months ago
        emailType: 'social',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('delete');
    });

    it('should archive social emails older than 2 years (not delete)', async () => {
      const email: Partial<Email> = {
        id: 'email-11',
        threadId: 'thread-11',
        senderEmail: 'notifications@linkedin.com',
        senderName: 'LinkedIn',
        senderDomain: 'linkedin.com',
        subject: 'Old notification',
        snippet: 'Old notification...',
        receivedAt: new Date(Date.now() - 800 * 24 * 60 * 60 * 1000), // ~2+ years ago
        emailType: 'social',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      // Emails older than 2 years should be archived, not deleted
      expect(decision.action).toBe('archive');
      expect(decision.action).not.toBe('delete');
    });
  });

  describe('Promotional Emails', () => {
    it('should extract deals from promotional emails less than 1 month old', async () => {
      const email: Partial<Email> = {
        id: 'email-12',
        threadId: 'thread-12',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon',
        senderDomain: 'amazon.com',
        subject: '50% Off Today!',
        snippet: 'Save 50% on electronics today...',
        receivedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        emailType: 'promotional',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('extract_deals');
      expect(decision.needsExtraction).toBe(true);
    });

    it('should delete promotional emails older than 1 month', async () => {
      const email: Partial<Email> = {
        id: 'email-13',
        threadId: 'thread-13',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon',
        senderDomain: 'amazon.com',
        subject: '50% Off!',
        snippet: 'Save 50% on electronics...',
        receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
        emailType: 'promotional',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('delete');
      expect(decision.reason).toMatch(/promotional/i);
    });

    it('should delete promotional emails between 1-6 months old', async () => {
      const email: Partial<Email> = {
        id: 'email-14',
        threadId: 'thread-14',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon',
        senderDomain: 'amazon.com',
        subject: 'Old Deal',
        snippet: 'Old promotional content...',
        receivedAt: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000), // 5 months ago
        emailType: 'promotional',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('delete');
    });

    it('should archive promotional emails older than 2 years (not delete)', async () => {
      const email: Partial<Email> = {
        id: 'email-15',
        threadId: 'thread-15',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon',
        senderDomain: 'amazon.com',
        subject: 'Very Old Deal',
        snippet: 'Very old promotional content...',
        receivedAt: new Date(Date.now() - 800 * 24 * 60 * 60 * 1000), // ~2+ years ago
        emailType: 'promotional',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      // Emails older than 2 years should be archived regardless of type
      expect(decision.action).toBe('archive');
      expect(decision.action).not.toBe('delete');
    });
  });

  describe('Edge Cases', () => {
    it('should handle email exactly 30 days old as under 1 month', async () => {
      const email: Partial<Email> = {
        id: 'email-16',
        threadId: 'thread-16',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon',
        senderDomain: 'amazon.com',
        subject: 'Deal',
        snippet: 'Promotional content...',
        receivedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Exactly 30 days
        emailType: 'promotional',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      // 30 days should still be considered "under 1 month" for processing
      expect(decision.action).toBe('extract_deals');
    });

    it('should handle email exactly 31 days old as over 1 month', async () => {
      const email: Partial<Email> = {
        id: 'email-17',
        threadId: 'thread-17',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon',
        senderDomain: 'amazon.com',
        subject: 'Deal',
        snippet: 'Promotional content...',
        receivedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000), // Exactly 31 days
        emailType: 'promotional',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('delete');
    });
  });
});
