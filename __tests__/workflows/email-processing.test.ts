import { describe, it, expect } from 'vitest';
import { EmailProcessingWorkflow, ProcessingDecision } from '@core/workflows/email-processing';
import type { Email } from '@core/types/email';

/**
 * Helper to create relative dates for tests.
 * Ensures tests remain valid regardless of when they're run.
 */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

describe('Email Processing Workflow', () => {
  describe('ProcessingDecision', () => {
    it('should decide to delete old promotional emails', async () => {
      const email: Partial<Email> = {
        id: 'email-1',
        threadId: 'thread-1',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon Deals',
        senderDomain: 'amazon.com',
        subject: '50% off Electronics - Today Only!',
        snippet: 'Save big on electronics today!',
        receivedAt: daysAgo(270), // 9 months ago (more than 1 month - should delete)
        gmailCategory: 'promotions',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('delete');
      expect(decision.reason.toLowerCase()).toContain('promotional');
    });

    it('should decide to delete very old promotional emails (2+ years)', async () => {
      const email: Partial<Email> = {
        id: 'email-1b',
        threadId: 'thread-1b',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon Deals',
        senderDomain: 'amazon.com',
        subject: '50% off Electronics - Today Only!',
        snippet: 'Save big on electronics today!',
        receivedAt: daysAgo(800), // ~2.2 years ago (still should delete)
        gmailCategory: 'promotions',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('delete');
      expect(decision.reason.toLowerCase()).toContain('promotional');
    });

    it('should decide to archive old update emails', async () => {
      const email: Partial<Email> = {
        id: 'email-2',
        threadId: 'thread-2',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Your January Statement is Ready',
        snippet: 'Your statement is now available.',
        receivedAt: daysAgo(45), // 45 days ago (more than 1 month - should archive)
        gmailCategory: 'updates',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('archive');
    });

    it('should decide to process recent regular emails', async () => {
      const email: Partial<Email> = {
        id: 'email-3',
        threadId: 'thread-3',
        senderEmail: 'john.smith@company.com',
        senderName: 'John Smith',
        senderDomain: 'company.com',
        subject: 'Re: Project Alpha - Sprint Review',
        snippet: 'Hi team, Just wanted to follow up...',
        receivedAt: new Date(), // Recent
        gmailCategory: 'primary',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('process');
      expect(decision.needsExtraction).toBe(true);
    });

    it('should decide to extract deals from recent promotional emails', async () => {
      const email: Partial<Email> = {
        id: 'email-4',
        threadId: 'thread-4',
        senderEmail: 'offers@bestbuy.com',
        senderName: 'Best Buy',
        senderDomain: 'bestbuy.com',
        subject: 'Flash Sale - 20% Off All TVs!',
        snippet: 'Shop now and save big on all television models.',
        receivedAt: new Date(), // Recent
        gmailCategory: 'promotions',
      };

      const decision = await ProcessingDecision.decide(email as Email);

      expect(decision.action).toBe('extract_deals');
    });
  });

  describe('EmailProcessingWorkflow', () => {
    it('should create workflow with correct nodes', () => {
      const workflow = new EmailProcessingWorkflow();

      expect(workflow.hasNode('classify')).toBe(true);
      expect(workflow.hasNode('decide')).toBe(true);
      expect(workflow.hasNode('extract')).toBe(true);
      expect(workflow.hasNode('label')).toBe(true);
    });

    it('should define correct flow from classify to decide', () => {
      const workflow = new EmailProcessingWorkflow();

      expect(workflow.getEdges('classify')).toContain('decide');
    });

    it('should define conditional edges from decide node', () => {
      const workflow = new EmailProcessingWorkflow();

      const edges = workflow.getEdges('decide');
      expect(edges).toContain('archive');
      expect(edges).toContain('delete');
      expect(edges).toContain('extract');
      expect(edges).toContain('label');
    });

    it('should have end node', () => {
      const workflow = new EmailProcessingWorkflow();

      expect(workflow.hasNode('end')).toBe(true);
    });
  });
});
