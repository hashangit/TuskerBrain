import { describe, it, expect } from 'vitest';
import { ProcessingDecision } from '@core/workflows/processing-decision';
import type { Email } from '@core/types/email';

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

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
      receivedAt: daysAgo(270),
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
      receivedAt: daysAgo(800),
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
      receivedAt: daysAgo(45),
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
      receivedAt: new Date(),
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
      receivedAt: new Date(),
      gmailCategory: 'promotions',
    };

    const decision = await ProcessingDecision.decide(email as Email);

    expect(decision.action).toBe('extract_deals');
  });
});
