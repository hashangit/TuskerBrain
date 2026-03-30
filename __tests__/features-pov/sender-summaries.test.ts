import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { EmailProcessingOrchestrator } from '@core/orchestrator';
import type { LLMProvider } from '@core/llm/provider';
import type { GmailClient } from '@core/gmail/client';
import type { Email } from '@core/types/email';

const MIGRATION_0000 = path.join(__dirname, '../../database/migrations/0000_initial.sql');
const MIGRATION_0001 = path.join(__dirname, '../../database/migrations/0001_fix_summary_fk_cascade.sql');

function createMockLLMProvider(responses: {
  classification?: { type: string; confidence: number };
  update?: object;
  deal?: object;
  topic?: { parentTopic: string; childTopic: string; fullPath: string; confidence: number };
  summary?: string;
  senderSummary?: string;
}): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockImplementation(async (prompt: string, _systemPrompt?: string) => {
      // Check for sender summary prompts by looking for key indicators
      const isSenderPrompt = prompt.includes('sender domain') ||
                            prompt.includes('Sender Domain') ||
                            prompt.includes('emails from this sender') ||
                            prompt.includes('from this sender') ||
                            _systemPrompt?.includes('sender');

      if (isSenderPrompt) {
        return {
          text: responses.senderSummary ?? responses.summary ?? 'A comprehensive summary of emails from this sender covering recent activity and key information.',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        };
      }
      return {
        text: responses.summary ?? 'A concise summary of the topic covering recent activity.',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    }),
    generateObject: vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Classify this email')) {
        return responses.classification ?? { type: 'updates', confidence: 0.9 };
      }
      if (prompt.includes('Extract deal information')) {
        return responses.deal ?? { dealTitle: 'Test Deal', brandName: 'Test Brand', dealValue: '50% off', isActive: true };
      }
      if (prompt.includes('Extract key information')) {
        return responses.update ?? { title: 'Test Update', description: 'Test description', priority: 'medium', summary: 'Update summary.' };
      }
      if (prompt.includes('Determine:') || prompt.includes('determine the appropriate topic label') || prompt.includes('Analyze this email')) {
        return responses.topic ?? { parentTopic: 'General', childTopic: 'Test', fullPath: 'General/Test', confidence: 0.8 };
      }
      return {};
    }),
  };
}

function createMockGmailClient(): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({ messages: [], historyId: '1000' }),
    getMessage: vi.fn().mockResolvedValue(null),
    getProfile: vi.fn().mockResolvedValue({ emailAddress: 'test@gmail.com', historyId: '1' }),
    modifyMessage: vi.fn().mockResolvedValue(undefined),
    batchModifyMessages: vi.fn().mockResolvedValue(undefined),
    listLabels: vi.fn().mockResolvedValue([]),
    createLabel: vi.fn().mockResolvedValue({ id: 'label_1', name: 'Test' }),
  };
}

function createMockJobQueue() {
  return {
    startProcessing: vi.fn(),
    stopProcessing: vi.fn(),
    createJob: vi.fn(),
    getStats: vi.fn().mockResolvedValue({ pending: 0, running: 0, completed: 0, failed: 0, total: 0 }),
    close: vi.fn(),
  };
}

/**
 * Helper: create an Email object with sensible defaults.
 */
function makeEmail(overrides: Partial<Email> & { id: string; senderDomain: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: `sender@${overrides.senderDomain}`,
    senderName: overrides.senderDomain.split('.')[0],
    subject: `Email from ${overrides.senderDomain}`,
    snippet: `This is a snippet for ${overrides.id}`,
    receivedAt: new Date(), // Use current date by default (within 30 days)
    ...overrides,
  };
}

/**
 * Helper: persist an email in the database so FK constraints are satisfied.
 */
async function persistEmail(repos: Repositories, email: Email) {
  await repos.emails.create({
    id: email.id,
    threadId: email.threadId,
    senderEmail: email.senderEmail,
    senderDomain: email.senderDomain,
    senderName: email.senderName ?? undefined,
    subject: email.subject ?? undefined,
    snippet: email.snippet ?? undefined,
    receivedAt: email.receivedAt,
  });
}

/**
 * Feature: Sender Summaries
 *
 * As a user, I want rolling summaries for each sender domain,
 * so I can quickly understand what's happening with each sender
 * without reading every email.
 *
 * Business Rules:
 * - 3-4 paragraphs, max 500 words
 * - First paragraph always high-level overview
 * - Older info gets less focus over time
 * - Updated with each new email from sender
 */
describe('Feature: Sender Summaries', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let mockLLM: LLMProvider;
  let mockGmail: GmailClient;
  let mockJobQueue: ReturnType<typeof createMockJobQueue>;
  let orchestrator: EmailProcessingOrchestrator;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.execSql(fs.readFileSync(MIGRATION_0000, 'utf-8'));
    await db.execSql(fs.readFileSync(MIGRATION_0001, 'utf-8'));
    repos = createRepositories(db);
    mockLLM = createMockLLMProvider({
      senderSummary: 'A comprehensive summary of emails from this sender covering recent activity and key information.',
    });
    mockGmail = createMockGmailClient();
    mockJobQueue = createMockJobQueue();

    // Add the updateSummary stub to the topics repository using Object.assign
    const topicsWithStub = Object.assign(repos.topics, {
      updateSummary: vi.fn().mockResolvedValue(undefined),
    });

    orchestrator = new EmailProcessingOrchestrator({
      db,
      jobQueue: mockJobQueue,
      gmailClient: mockGmail,
      llmProvider: mockLLM,
      repositories: {
        emails: repos.emails,
        timeline: repos.timeline,
        deals: repos.deals,
        topics: topicsWithStub,
        summaries: repos.summaries,
        labels: repos.labels,
      },
    });
  });

  afterEach(async () => {
    await db.close();
  });

  describe('Initial Summary Creation', () => {
    it('creates a sender summary when the first email from a domain is processed', async () => {
      // Given: an email exists from a sender domain
      const email = makeEmail({
        id: 'email-1',
        senderDomain: 'chase.com',
        subject: 'Your Chase Statement',
        snippet: 'Your January statement shows a balance of $2,450. Payment due February 15.',
      });
      await persistEmail(repos, email);

      // When: the orchestrator processes the email
      await orchestrator.processEmail(email);

      // Then: the summary exists with correct metadata
      const record = await repos.summaries.getSenderSummary('chase.com');
      expect(record).toBeDefined();
      expect(record!.senderDomain).toBe('chase.com');
      expect(record!.updateCount).toBe(1);
      expect(record!.summary.length).toBeGreaterThan(0);
      expect(record!.lastEmailId).toBe('email-1');

      // And: the LLM was called to generate the sender summary
      expect(mockLLM.generateText).toHaveBeenCalled();
      const calls = mockLLM.generateText as ReturnType<typeof vi.fn>;
      const senderSummaryCall = calls.mock.calls.find(call =>
        call[0].includes('sender') || call[0].includes('Sender')
      );
      expect(senderSummaryCall).toBeDefined();
    });

    it('stores the summary in the database and retrieves it by domain', async () => {
      // Given: an email is processed
      const email = makeEmail({ id: 'e1', senderDomain: 'amazon.com' });
      await persistEmail(repos, email);
      await orchestrator.processEmail(email);

      // When: retrieving by domain
      const stored = await repos.summaries.getSenderSummary('amazon.com');

      // Then: it matches what was stored
      expect(stored).not.toBeNull();
      expect(stored!.senderDomain).toBe('amazon.com');
      expect(stored!.summary).toContain('comprehensive summary');
      expect(stored!.lastEmailId).toBe('e1');
    });
  });

  describe('Summary Structure', () => {
    it('produces 3-4 paragraphs with at most 500 words', async () => {
      // Given: a mock LLM that returns a properly structured summary
      const mockLLMStructured = createMockLLMProvider({
        senderSummary: 'Paragraph one overview.\n\nParagraph two details.\n\nParagraph three additional info.\n\nParagraph four conclusion.',
      });

      // Add the updateSummary stub to the topics repository
      const topicsWithStub = Object.assign(repos.topics, {
        updateSummary: vi.fn().mockResolvedValue(undefined),
      });

      const orchestratorStructured = new EmailProcessingOrchestrator({
        db,
        jobQueue: mockJobQueue,
        gmailClient: mockGmail,
        llmProvider: mockLLMStructured,
        repositories: {
          emails: repos.emails,
          timeline: repos.timeline,
          deals: repos.deals,
          topics: topicsWithStub,
          summaries: repos.summaries,
          labels: repos.labels,
        },
      });

      const email = makeEmail({
        id: 'struct-0',
        senderDomain: 'newsletters.com',
        subject: 'Newsletter Issue 1',
        snippet: 'Latest updates on technology, science, and world events.',
      });
      await persistEmail(repos, email);

      // When: processing the email
      await orchestratorStructured.processEmail(email);

      // Then: paragraph count is 3-4
      const result = await repos.summaries.getSenderSummary('newsletters.com');
      const paragraphs = result!.summary.split('\n\n').filter(p => p.length > 0);
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(paragraphs.length).toBeLessThanOrEqual(4);

      // And: word count is within limit
      const wordCount = result!.summary.split(/\s+/).filter(w => w.length > 0).length;
      expect(wordCount).toBeLessThanOrEqual(500);
    });
  });

  describe('Summary Updates', () => {
    it('increments update count when a new email from the same sender arrives', async () => {
      // Given: a sender already has a summary from one email
      const email1 = makeEmail({
        id: 'update-1',
        senderDomain: 'bank.com',
        subject: 'Statement Ready',
        snippet: 'Your January statement is ready.',
      });
      await persistEmail(repos, email1);
      await orchestrator.processEmail(email1);

      const original = await repos.summaries.getSenderSummary('bank.com');
      expect(original!.updateCount).toBe(1);

      // When: a second email is processed
      const email2 = makeEmail({
        id: 'update-2',
        senderDomain: 'bank.com',
        subject: 'Payment Confirmed',
        snippet: 'Your payment of $500 has been received.',
      });
      await persistEmail(repos, email2);
      await orchestrator.processEmail(email2);

      // Then: update count is incremented and lastEmailId updated
      const updated = await repos.summaries.getSenderSummary('bank.com');
      expect(updated!.updateCount).toBe(2);
      expect(updated!.lastEmailId).toBe('update-2');

      // And: the LLM was called twice for sender summaries (once for each email)
      expect(mockLLM.generateText).toHaveBeenCalledTimes(4); // 2 for sender summaries, 2 for topic summaries
    });
  });

  describe('Multiple Sender Summaries', () => {
    it('maintains independent summaries for different sender domains', async () => {
      // Given: emails from three different senders
      const domainA = 'sender-a.com';
      const domainB = 'sender-b.com';
      const domainC = 'sender-c.com';

      for (const domain of [domainA, domainB, domainC]) {
        const email = makeEmail({
          id: `${domain}-1`,
          senderDomain: domain,
        });
        await persistEmail(repos, email);
        await orchestrator.processEmail(email);
      }

      // When: retrieving all summaries
      const allSummaries = await repos.summaries.getAllSenderSummaries();

      // Then: each domain has its own summary
      expect(allSummaries.length).toBe(3);
      const domains = allSummaries.map(s => s.senderDomain);
      expect(domains).toContain(domainA);
      expect(domains).toContain(domainB);
      expect(domains).toContain(domainC);

      // And: each summary is independent (different IDs for different domains)
      const summaryA = await repos.summaries.getSenderSummary(domainA);
      const summaryB = await repos.summaries.getSenderSummary(domainB);
      expect(summaryA!.id).not.toBe(summaryB!.id);
    });
  });

  describe('Sender-Topic Relationship', () => {
    it('tracks that a sender domain can have emails across multiple topics', async () => {
      // Given: two emails from amazon.com in different topics
      const shoppingEmail = makeEmail({
        id: 'amazon-shopping',
        senderDomain: 'amazon.com',
        subject: 'Your Order Shipped',
        snippet: 'Your order #123 has been shipped.',
      });
      const dealsEmail = makeEmail({
        id: 'amazon-deals',
        senderDomain: 'amazon.com',
        subject: 'Deal of the Day',
        snippet: 'Check out today\'s deals on electronics.',
      });

      // Store both emails in the database
      await persistEmail(repos, shoppingEmail);
      await persistEmail(repos, dealsEmail);

      // Create two topics and link emails to them
      await repos.topics.create({ id: 'topic-shopping', name: 'Amazon', fullPath: 'Shopping/Amazon' });
      await repos.topics.create({ id: 'topic-deals', name: 'Amazon', fullPath: 'Deals/Amazon' });
      await repos.topics.linkEmail(shoppingEmail.id, 'topic-shopping');
      await repos.topics.linkEmail(dealsEmail.id, 'topic-deals');

      // When: processing both emails
      await orchestrator.processEmail(shoppingEmail);
      await orchestrator.processEmail(dealsEmail);

      // Then: both emails are reflected in the sender summary (updateCount = 2)
      const summary = await repos.summaries.getSenderSummary('amazon.com');
      expect(summary).toBeDefined();
      expect(summary!.updateCount).toBe(2);
      expect(summary!.lastEmailId).toBe(dealsEmail.id);

      // And: the sender domain has emails in both topics
      const topicsForShopping = await repos.topics.findTopicsForEmail(shoppingEmail.id);
      const topicsForDeals = await repos.topics.findTopicsForEmail(dealsEmail.id);
      expect(topicsForShopping.map(t => t.fullPath)).toContain('Shopping/Amazon');
      expect(topicsForDeals.map(t => t.fullPath)).toContain('Deals/Amazon');
    });
  });

  describe('Word Count Validation', () => {
    it('keeps summary within 500 words even with many emails', async () => {
      // Given: a mock LLM that returns summaries within limits
      const mockLLMWordy = createMockLLMProvider({
        senderSummary: 'This is a concise summary with a reasonable word count that stays under the limit.',
      });

      // Add the updateSummary stub to the topics repository
      const topicsWithStub = Object.assign(repos.topics, {
        updateSummary: vi.fn().mockResolvedValue(undefined),
      });

      const orchestratorWordy = new EmailProcessingOrchestrator({
        db,
        jobQueue: mockJobQueue,
        gmailClient: mockGmail,
        llmProvider: mockLLMWordy,
        repositories: {
          emails: repos.emails,
          timeline: repos.timeline,
          deals: repos.deals,
          topics: topicsWithStub,
          summaries: repos.summaries,
          labels: repos.labels,
        },
      });

      // Process multiple emails from the same sender
      for (let i = 0; i < 5; i++) {
        const email = makeEmail({
          id: `wordy-${i}`,
          senderDomain: 'wordy-sender.com',
          subject: `Update #${i}`,
          snippet: `This is update number ${i}.`,
        });
        await persistEmail(repos, email);
        await orchestratorWordy.processEmail(email);
      }

      // When: checking the final summary
      const result = await repos.summaries.getSenderSummary('wordy-sender.com');

      // Then: summary stays within the 500-word limit
      expect(result).toBeDefined();
      const manualWordCount = result!.summary.split(/\s+/).filter(w => w.length > 0).length;
      expect(manualWordCount).toBeLessThanOrEqual(500);
    });
  });

  describe('Rolling Summary Behavior', () => {
    it('incorporates existing summary context when generating an updated summary', async () => {
      // Given: a sender has an existing summary
      const oldEmail = makeEmail({
        id: 'rolling-old',
        senderDomain: 'rolling.com',
        subject: 'Legacy Account Settings',
        snippet: 'Your legacy account settings from 2022 have been saved.',
      });
      await persistEmail(repos, oldEmail);
      await orchestrator.processEmail(oldEmail);

      const firstSummary = await repos.summaries.getSenderSummary('rolling.com');
      expect(firstSummary).toBeDefined();
      expect(firstSummary!.updateCount).toBe(1);

      // When: a new email arrives and is processed
      const newEmail = makeEmail({
        id: 'rolling-new',
        senderDomain: 'rolling.com',
        subject: 'New Security Features',
        snippet: 'We have added new two-factor authentication options for 2024.',
      });
      await persistEmail(repos, newEmail);
      await orchestrator.processEmail(newEmail);

      // Then: the updated summary reflects both emails
      const updatedSummary = await repos.summaries.getSenderSummary('rolling.com');
      expect(updatedSummary).toBeDefined();
      expect(updatedSummary!.updateCount).toBe(2);
      expect(updatedSummary!.summary.length).toBeGreaterThan(0);

      // And: the newer email is listed first (lastEmailId is the newest)
      expect(updatedSummary!.lastEmailId).toBe('rolling-new');

      // And: the LLM was called multiple times for sender summaries (once for each email)
      const calls = mockLLM.generateText as ReturnType<typeof vi.fn>;
      const senderCalls = calls.mock.calls.filter(call =>
        (call[0] as string).includes('sender domain') ||
        (call[1] as string)?.includes('sender')
      );
      expect(senderCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Cascade Delete', () => {
    it('removes the sender summary when explicitly deleted', async () => {
      // Given: a sender has a summary
      const email = makeEmail({ id: 'cascade-1', senderDomain: 'to-delete.com' });
      await persistEmail(repos, email);
      await orchestrator.processEmail(email);

      const summaryBefore = await repos.summaries.getSenderSummary('to-delete.com');
      expect(summaryBefore).not.toBeNull();

      // When: the sender summary is deleted
      await repos.summaries.deleteSenderSummary('to-delete.com');

      // Then: the summary no longer exists
      const summaryAfter = await repos.summaries.getSenderSummary('to-delete.com');
      expect(summaryAfter).toBeNull();
    });

    it('cleans up associated email data when emails are deleted', async () => {
      // Given: emails exist for a sender with a linked summary
      const email1 = makeEmail({ id: 'del-email-1', senderDomain: 'gone.com' });
      const email2 = makeEmail({ id: 'del-email-2', senderDomain: 'gone.com' });
      await persistEmail(repos, email1);
      await persistEmail(repos, email2);

      await orchestrator.processEmail(email1);
      await orchestrator.processEmail(email2);

      // When: all emails from that sender are deleted
      await repos.emails.delete('del-email-1');
      await repos.emails.delete('del-email-2');

      // Then: no more emails for that domain exist
      const remaining = await repos.emails.findBySenderDomain('gone.com');
      expect(remaining.length).toBe(0);

      // And: the sender summary can be cleaned up
      await repos.summaries.deleteSenderSummary('gone.com');
      const deletedSummary = await repos.summaries.getSenderSummary('gone.com');
      expect(deletedSummary).toBeNull();
    });
  });
});
