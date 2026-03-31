import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { processEmailWithWorkflow } from '@core/workflows/langgraph-workflow';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';

/**
 * Feature: Low-Content Email Handling
 *
 * As a user, I want the system to gracefully handle emails with minimal content
 * (thank-yous, auto-replies, empty bodies, generic newsletters) so that
 * processing never crashes and even low-signal emails get reasonable classification.
 *
 * Business Rules:
 * - One-liner emails get a topic assignment and summary
 * - Auto-replies are processed without crashing
 * - Empty/null subject and snippet don't crash any component
 * - Generic newsletters get classified and summarized
 *
 * RULES:
 * - Every test calls REAL production code (processEmailWithWorkflow).
 * - LLM calls are mocked for workflow tests.
 * - In-memory SQLite with migration schema.
 *
 * Infrastructure note:
 * db.initialize() runs Drizzle migrations from the migrations folder.
 */

/** Helper: create an Email object with sensible defaults. */
function makeEmail(overrides: Partial<Email> & { id: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: 'sender@example.com',
    senderName: 'Sender',
    senderDomain: 'example.com',
    subject: 'Some subject',
    snippet: 'Some snippet text.',
    receivedAt: new Date(), // Use current date to avoid archiving
    ...overrides,
  };
}

/** Helper: create a mock LLM provider for testing. */
function createMockLLMProvider(responses: {
  classification?: { type: string; confidence: number };
  update?: object;
  deal?: object;
  topic?: { parent: string; child: string; confidence: number };
  summary?: string;
}): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockResolvedValue({
      text: responses.summary ?? 'A concise summary covering recent activity and key information.',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    generateObject: vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Classify this email')) {
        return responses.classification ?? { type: 'updates', confidence: 0.9 };
      }
      if (prompt.includes('Extract deal information')) {
        return responses.deal ?? null;
      }
      if (prompt.includes('Extract key information')) {
        return responses.update ?? null;
      }
      if (prompt.includes('Assign a topic label to this email')) {
        return responses.topic ?? { parent: 'General', child: 'Test', confidence: 0.8 };
      }
      return {};
    }),
  };
}

describe('Feature: Low-Content Emails', () => {
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

  // --- Thank-You Email ---

  describe('Thank-you email ("Thanks!")', () => {
    it('workflow generates a summary for a thank-you email', async () => {
      // Given: A thank-you email
      const email = makeEmail({
        id: 'thankyou-2',
        subject: 'Thanks',
        snippet: 'Thanks!',
        senderEmail: 'colleague@company.com',
        senderName: 'John',
        senderDomain: 'company.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        summary: 'Thank-you email received.',
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: Summary is generated
      expect(result.summary).toBeDefined();
      expect(result.summary).toBe('Thank-you email received.');
    });

    it('workflow returns no update for bare thank-you', async () => {
      // Given: A plain thank-you email
      const email = makeEmail({
        id: 'thankyou-3',
        subject: 'Thanks',
        snippet: 'Thanks!',
        senderEmail: 'colleague@company.com',
        senderDomain: 'company.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        update: null,
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: No update extracted
      expect(result.extraction?.update).toBeUndefined();
    });

    it('workflow returns no deal for thank-you email', async () => {
      // Given: A thank-you email
      const email = makeEmail({
        id: 'thankyou-4',
        subject: 'Thanks',
        snippet: 'Thanks!',
        senderEmail: 'colleague@company.com',
        senderDomain: 'company.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        deal: null,
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: No deal extracted
      expect(result.extraction?.deal).toBeUndefined();
    });

    it('thank-you email is persisted and retrievable from the database', async () => {
      // Given: A thank-you email
      const email = makeEmail({
        id: 'thankyou-db',
        subject: 'Thanks',
        snippet: 'Thanks!',
        senderEmail: 'colleague@company.com',
        senderDomain: 'company.com',
      });

      // When: Stored in the repository
      await repos.emails.create({
        id: email.id,
        threadId: email.threadId,
        senderEmail: email.senderEmail,
        senderName: email.senderName || undefined,
        senderDomain: email.senderDomain,
        subject: email.subject || undefined,
        snippet: email.snippet || undefined,
        receivedAt: email.receivedAt,
      });

      // Then: Can be retrieved
      const stored = await repos.emails.findById(email.id);
      expect(stored).toBeDefined();
      expect(stored!.id).toBe('thankyou-db');
      expect(stored!.subject).toBe('Thanks');
    });
  });

  // --- Auto-Reply Email ---

  describe('Auto-reply email ("Out of Office")', () => {
    it('workflow generates summary for auto-reply without crashing', async () => {
      // Given: An auto-reply email
      const email = makeEmail({
        id: 'ooo-2',
        subject: 'Out of Office: Re: Your Email',
        snippet: 'I am currently out of the office and will return on Monday.',
        senderEmail: 'john.doe@company.com',
        senderName: 'John Doe',
        senderDomain: 'company.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        summary: 'Auto-reply: Out of office notification.',
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: Summary is generated
      expect(result.summary).toBeDefined();
      expect(result.summary).toBe('Auto-reply: Out of office notification.');
    });

    it('workflow does not crash on OOO auto-reply', async () => {
      // Given: Auto-reply email
      const email = makeEmail({
        id: 'ooo-3',
        subject: 'Out of Office: Re: Lunch',
        snippet: 'I am currently out of the office and will return on Monday.',
        senderEmail: 'john.doe@company.com',
        senderDomain: 'company.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        update: null,
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: No crash -- completes workflow
      expect(result.currentStep).toBe('summarize');
    });

    it('auto-reply email is stored and retrieved without error', async () => {
      // Given: An auto-reply email
      const email = makeEmail({
        id: 'ooo-db',
        subject: 'Out of Office: Re: Your Email',
        snippet: 'I am currently out of the office and will return on Monday.',
        senderEmail: 'john.doe@company.com',
        senderDomain: 'company.com',
      });

      // When: Stored in the repository
      await repos.emails.create({
        id: email.id,
        threadId: email.threadId,
        senderEmail: email.senderEmail,
        senderName: email.senderName || undefined,
        senderDomain: email.senderDomain,
        subject: email.subject || undefined,
        snippet: email.snippet || undefined,
        receivedAt: email.receivedAt,
      });

      // Then: Can be retrieved without error
      const stored = await repos.emails.findById(email.id);
      expect(stored).toBeDefined();
      expect(stored!.subject).toBe('Out of Office: Re: Your Email');
    });
  });

  // --- Empty Body Email ---

  describe('Empty body email (null subject/snippet)', () => {
    it('workflow handles null subject and null snippet without crashing', async () => {
      // Given: An email with null subject and null snippet
      const email = makeEmail({
        id: 'empty-2',
        subject: null,
        snippet: null,
        senderEmail: 'sender@example.com',
        senderDomain: 'example.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        summary: 'Email with no content.',
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: Doesn't crash, produces some summary
      expect(result.summary).toBeDefined();
      expect(result.summary).toBe('Email with no content.');
    });

    it('workflow handles email with null subject and snippet for update extraction', async () => {
      // Given: An email with null subject/snippet
      const email = makeEmail({
        id: 'empty-3',
        subject: null,
        snippet: null,
        senderEmail: 'sender@example.com',
        senderDomain: 'example.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        update: null,
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: Doesn't crash, returns no update
      expect(result.extraction?.update).toBeUndefined();
    });

    it('workflow handles null subject and snippet for deal extraction', async () => {
      // Given: An email with null subject and snippet
      const email = makeEmail({
        id: 'empty-4',
        subject: null,
        snippet: null,
        senderEmail: 'sender@example.com',
        senderDomain: 'example.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        deal: null,
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: No crash -- returns no deal
      expect(result.extraction?.deal).toBeUndefined();
    });

    it('email with null subject/snippet is persisted and retrievable', async () => {
      // Given: An email with null content
      const email = makeEmail({
        id: 'empty-db',
        subject: null,
        snippet: null,
        senderEmail: 'sender@example.com',
        senderDomain: 'example.com',
      });

      // When: Stored in the repository
      await repos.emails.create({
        id: email.id,
        threadId: email.threadId,
        senderEmail: email.senderEmail,
        senderDomain: email.senderDomain,
        receivedAt: email.receivedAt,
      });

      // Then: Can be retrieved
      const stored = await repos.emails.findById(email.id);
      expect(stored).toBeDefined();
      expect(stored!.id).toBe('empty-db');
    });
  });

  // --- Generic Newsletter ---

  describe('Generic newsletter ("Weekly Update")', () => {
    it('workflow generates summary for a generic newsletter', async () => {
      // Given: A newsletter email
      const email = makeEmail({
        id: 'newsletter-2',
        subject: 'Weekly Update',
        snippet: 'Here are this week\'s updates.',
        senderEmail: 'news@aggregator.com',
        senderName: 'Aggregator News',
        senderDomain: 'aggregator.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        summary: 'Weekly update newsletter received.',
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: A valid summary is produced
      expect(result.summary).toBeDefined();
      expect(result.summary).toBe('Weekly update newsletter received.');
    });

    it('workflow detects updates in newsletter', async () => {
      // Given: A newsletter with "Weekly Update" subject
      const email = makeEmail({
        id: 'newsletter-3',
        subject: 'Weekly Update',
        snippet: 'Here are this week\'s updates.',
        senderEmail: 'news@aggregator.com',
        senderDomain: 'aggregator.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        update: { title: 'Weekly Update', priority: 'medium' },
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: Update is extracted
      expect(result.extraction?.update).toBeDefined();
      expect(result.extraction?.type).toBe('update');
    });

    it('workflow returns no deal for non-promotional newsletter', async () => {
      // Given: A generic newsletter with no deal keywords
      const email = makeEmail({
        id: 'newsletter-4',
        subject: 'Weekly Update',
        snippet: 'Here are this week\'s updates. Nothing promotional about this.',
        senderEmail: 'news@aggregator.com',
        senderDomain: 'aggregator.com',
      });
      const mockLLM = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        deal: null,
      });

      // When: Processed through workflow
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: No deal extracted
      expect(result.extraction?.deal).toBeUndefined();
    });

    it('newsletter is persisted with topic classification in the database', async () => {
      // Given: A newsletter email
      const email = makeEmail({
        id: 'newsletter-db',
        subject: 'Weekly Update',
        snippet: 'Here are this week\'s updates.',
        senderEmail: 'news@aggregator.com',
        senderName: 'Aggregator News',
        senderDomain: 'aggregator.com',
      });

      // When: Email is stored and classified
      await repos.emails.create({
        id: email.id,
        threadId: email.threadId,
        senderEmail: email.senderEmail,
        senderName: email.senderName || undefined,
        senderDomain: email.senderDomain,
        subject: email.subject || undefined,
        snippet: email.snippet || undefined,
        receivedAt: email.receivedAt,
      });

      const parent = await repos.topics.create({
        id: 'topic-bus-news',
        name: 'Business',
        fullPath: 'Business',
      });
      const topic = await repos.topics.create({
        id: 'topic-bus-news-aggregator',
        parentId: parent.id,
        name: 'News',
        fullPath: 'Business/News',
      });
      await repos.topics.linkEmail(email.id, topic.id);

      // Then: Email and topic are linked
      const stored = await repos.emails.findById(email.id);
      expect(stored).toBeDefined();
      expect(stored!.subject).toBe('Weekly Update');

      const linkedEmailIds = await repos.topics.findEmailsForTopic(topic.id);
      expect(linkedEmailIds.length).toBe(1);
      expect(linkedEmailIds[0]).toBe('newsletter-db');
    });
  });
});
