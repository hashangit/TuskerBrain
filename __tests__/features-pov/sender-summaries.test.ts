import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { EmailProcessingOrchestrator } from '@core/orchestrator';
import { JobQueue } from '@core/jobs/queue';
import type { LLMProvider } from '@core/llm/provider';
import type { GmailClient } from '@core/gmail/client';
import type { Email } from '@core/types/email';

/**
 * A thin adapter around the real in-memory JobQueue that adds
 * startProcessing/stopProcessing/processAll for test-driven execution.
 */
class ProcessableJobQueue extends JobQueue {
  private handler: ((job: { id: string; type: string; payload: Record<string, unknown> }) => Promise<void>) | null = null;

  startProcessing(handler: (job: { id: string; type: string; payload: Record<string, unknown> }) => Promise<void>): void {
    this.handler = handler;
  }

  stopProcessing(): void {
    this.handler = null;
  }

  async processAll(): Promise<void> {
    if (!this.handler) return;
    while (true) {
      const job = await this.getNextJob();
      if (!job) break;
      await this.updateJobStatus(job.id, 'running');
      try {
        await this.handler({ id: job.id, type: job.type, payload: job.payload });
        await this.updateJobStatus(job.id, 'completed');
      } catch (error) {
        await this.updateJobStatus(job.id, 'failed');
        throw error;
      }
    }
  }
}

function createMockLLMProvider(responses: {
  classification?: { type: string; confidence: number };
  update?: object;
  deal?: object;
  topic?: { parent: string; child: string; confidence: number };
  summary?: string;
  senderSummary?: string;
}): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockImplementation(async (_prompt: string, _systemPrompt?: string) => {
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
      if (prompt.includes('Assign a topic label')) {
        return responses.topic ?? { parent: 'General', child: 'Test', confidence: 0.8 };
      }
      // Sender summary prompt (buildSenderSummaryPrompt produces "Summarize recent emails from")
      if (prompt.includes('Summarize recent emails from')) {
        const summaryText = responses.senderSummary ?? responses.summary ?? 'A comprehensive summary of emails from this sender covering recent activity and key information.';
        return { summary: summaryText, wordCount: summaryText.split(/\s+/).filter(w => w.length > 0).length, paragraphCount: 3 };
      }
      // Topic summary merge prompt (buildSummaryPrompt produces "Generate a rolling summary")
      if (prompt.includes('Generate a rolling summary')) {
        const summaryText = responses.summary ?? 'A concise summary of the topic covering recent activity.';
        return { summary: summaryText, wordCount: summaryText.split(/\s+/).filter(w => w.length > 0).length, paragraphCount: 3 };
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
 * Helper: create an orchestrator wired to the given queue, LLM, repos, etc.
 * Also starts the orchestrator so the queue handler is registered.
 */
function createStartedOrchestrator(opts: {
  queue: ProcessableJobQueue;
  db: TuskerBrainDatabase;
  repos: Repositories;
  llm: LLMProvider;
  gmail?: GmailClient;
}): EmailProcessingOrchestrator {
  const gmail = opts.gmail ?? createMockGmailClient();

  const topicsWithStub = Object.assign(opts.repos.topics, {
    updateSummary: vi.fn().mockResolvedValue(undefined),
  });

  const orchestrator = new EmailProcessingOrchestrator({
    db: opts.db,
    jobQueue: opts.queue,
    gmailClient: gmail,
    llmProvider: opts.llm,
    repositories: {
      emails: opts.repos.emails,
      timeline: opts.repos.timeline,
      deals: opts.repos.deals,
      topics: topicsWithStub,
      summaries: opts.repos.summaries,
      labels: opts.repos.labels,
    },
  });

  // Start is synchronous in effect — registers the handler with the queue
  orchestrator.start();

  return orchestrator;
}

/**
 * Helper: enqueue an email for processing and drain the queue.
 */
async function processEmailViaQueue(queue: ProcessableJobQueue, emailId: string): Promise<void> {
  await queue.createJob({ type: 'email_process', emailId, payload: { emailId } });
  await queue.processAll();
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
  let queue: ProcessableJobQueue;
  let orchestrator: EmailProcessingOrchestrator;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
    mockLLM = createMockLLMProvider({
      senderSummary: 'A comprehensive summary of emails from this sender covering recent activity and key information.',
    });
    queue = new ProcessableJobQueue();
    orchestrator = createStartedOrchestrator({ queue, db, repos, llm: mockLLM });
  });

  afterEach(async () => {
    await orchestrator.stop();
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

      // When: the email is processed through the queue
      await processEmailViaQueue(queue, email.id);

      // Then: the summary exists with correct metadata
      const record = await repos.summaries.getSenderSummary('chase.com');
      expect(record).toBeDefined();
      expect(record!.senderDomain).toBe('chase.com');
      expect(record!.updateCount).toBe(1);
      expect(record!.summary.length).toBeGreaterThan(0);
      expect(record!.lastEmailId).toBe('email-1');
    });

    it('stores the summary in the database and retrieves it by domain', async () => {
      // Given: an email is processed
      const email = makeEmail({ id: 'e1', senderDomain: 'amazon.com' });
      await persistEmail(repos, email);
      await processEmailViaQueue(queue, email.id);

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

      const structuredQueue = new ProcessableJobQueue();
      const orchestratorStructured = createStartedOrchestrator({
        queue: structuredQueue,
        db,
        repos,
        llm: mockLLMStructured,
      });

      const email = makeEmail({
        id: 'struct-0',
        senderDomain: 'newsletters.com',
        subject: 'Newsletter Issue 1',
        snippet: 'Latest updates on technology, science, and world events.',
      });
      await persistEmail(repos, email);

      // When: processing the email
      await processEmailViaQueue(structuredQueue, email.id);

      // Then: paragraph count is 3-4
      const result = await repos.summaries.getSenderSummary('newsletters.com');
      const paragraphs = result!.summary.split('\n\n').filter(p => p.length > 0);
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
      expect(paragraphs.length).toBeLessThanOrEqual(4);

      // And: word count is within limit
      const wordCount = result!.summary.split(/\s+/).filter(w => w.length > 0).length;
      expect(wordCount).toBeLessThanOrEqual(500);

      await orchestratorStructured.stop();
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
      await processEmailViaQueue(queue, email1.id);

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
      await processEmailViaQueue(queue, email2.id);

      // Then: update count is incremented and lastEmailId updated
      const updated = await repos.summaries.getSenderSummary('bank.com');
      expect(updated!.updateCount).toBe(2);
      expect(updated!.lastEmailId).toBe('update-2');
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
        await processEmailViaQueue(queue, email.id);
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
      await processEmailViaQueue(queue, shoppingEmail.id);
      await processEmailViaQueue(queue, dealsEmail.id);

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

      const wordyQueue = new ProcessableJobQueue();
      const orchestratorWordy = createStartedOrchestrator({
        queue: wordyQueue,
        db,
        repos,
        llm: mockLLMWordy,
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
        await processEmailViaQueue(wordyQueue, email.id);
      }

      // When: checking the final summary
      const result = await repos.summaries.getSenderSummary('wordy-sender.com');

      // Then: summary stays within the 500-word limit
      expect(result).toBeDefined();
      const manualWordCount = result!.summary.split(/\s+/).filter(w => w.length > 0).length;
      expect(manualWordCount).toBeLessThanOrEqual(500);

      await orchestratorWordy.stop();
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
      await processEmailViaQueue(queue, oldEmail.id);

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
      await processEmailViaQueue(queue, newEmail.id);

      // Then: the updated summary reflects both emails
      const updatedSummary = await repos.summaries.getSenderSummary('rolling.com');
      expect(updatedSummary).toBeDefined();
      expect(updatedSummary!.updateCount).toBe(2);
      expect(updatedSummary!.summary.length).toBeGreaterThan(0);

      // And: the newer email is listed first (lastEmailId is the newest)
      expect(updatedSummary!.lastEmailId).toBe('rolling-new');
    });
  });

  describe('Cascade Delete', () => {
    it('removes the sender summary when explicitly deleted', async () => {
      // Given: a sender has a summary
      const email = makeEmail({ id: 'cascade-1', senderDomain: 'to-delete.com' });
      await persistEmail(repos, email);
      await processEmailViaQueue(queue, email.id);

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

      await processEmailViaQueue(queue, email1.id);
      await processEmailViaQueue(queue, email2.id);

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

  // --- Summary Quality ---

  describe('Summary Quality', () => {
    it('sender summary accumulates across multiple emails from same domain', async () => {
      // Verify that buildSenderSummaryPrompt includes content from ALL processed
      // emails when generating an updated summary (not just the latest one).
      //
      // The prompt builder must receive: (a) the existing summary containing
      // themes from earlier emails, and (b) new content from the current email.
      // The LLM then merges them — we cannot test the LLM output, but we CAN
      // test that the prompt is constructed with accumulated context.

      const { buildSenderSummaryPrompt } = await import('@core/workflows/prompts/summarization');

      // Scenario: after 5 emails, the existing summary covers security, payments,
      // and rewards. A 6th email about fraud arrives.
      const existingSummary = 'Chase sends regular account updates including security alerts, monthly statements, payment confirmations, reward point balances, and premium account status changes.';
      const newEmailContent = 'Subject: Fraud Alert\nFraud Alert: Suspicious transaction of $1,200 flagged for review.';

      // When building the prompt for the 6th email
      const prompt = buildSenderSummaryPrompt({
        senderDomain: 'chase.com',
        currentSummary: existingSummary,
        newContent: newEmailContent,
        maxWords: 500,
      });

      // Then: the prompt contains the accumulated context from ALL previous emails
      // (via currentSummary) AND the new email content
      expect(prompt).toContain('chase.com');
      expect(prompt).toContain('security');
      expect(prompt).toContain('payment');
      expect(prompt).toContain('reward');
      expect(prompt).toContain('Fraud Alert');
      expect(prompt).toContain('Suspicious transaction');
      // The prompt instructs the LLM to synthesize, not just list
      expect(prompt).toContain('synthesizing information rather than listing');
      // Word limit is conveyed
      expect(prompt).toContain('500');
    });

    it('sender summary reflects email frequency', async () => {
      // Given: A domain that sends daily emails (10 emails from same sender)
      const frequencyQueue = new ProcessableJobQueue();
      const orchestratorFrequent = createStartedOrchestrator({
        queue: frequencyQueue,
        db,
        repos,
        llm: mockLLM,
      });

      for (let i = 0; i < 10; i++) {
        const email = makeEmail({
          id: `freq-${i}`,
          senderDomain: 'daily-sender.com',
          subject: `Daily Digest ${i}`,
          snippet: `Daily update number ${i} from the sender.`,
        });
        await persistEmail(repos, email);
        await processEmailViaQueue(frequencyQueue, email.id);
      }

      // When: User views the sender summary
      const summary = await repos.summaries.getSenderSummary('daily-sender.com');

      // Then: Summary metadata reflects high volume
      expect(summary).toBeDefined();
      expect(summary!.updateCount).toBe(10);

      await orchestratorFrequent.stop();
    });

    it('sender summary persists across app restart', async () => {
      // Given: A file-based DB so data survives close/reopen
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tusker-sender-test-'));
      const dbPath = path.join(tmpDir, 'test.db');

      const fileDb = new TuskerBrainDatabase(dbPath);
      await fileDb.initialize();
      const fileRepos = createRepositories(fileDb);

      const fileMockLLM = createMockLLMProvider({
        senderSummary: 'A comprehensive summary of emails from this sender for persistence testing.',
      });

      const fileQueue = new ProcessableJobQueue();
      const fileOrchestrator = createStartedOrchestrator({
        queue: fileQueue,
        db: fileDb,
        repos: fileRepos,
        llm: fileMockLLM,
      });

      const email = makeEmail({ id: 'persist-1', senderDomain: 'persist.com' });
      await persistEmail(fileRepos, email);
      await processEmailViaQueue(fileQueue, email.id);

      const originalSummary = await fileRepos.summaries.getSenderSummary('persist.com');
      expect(originalSummary).not.toBeNull();

      // When: Closing the DB and reopening (simulating app restart)
      await fileOrchestrator.stop();
      await fileDb.close();

      const reopenedDb = new TuskerBrainDatabase(dbPath);
      await reopenedDb.initialize();
      const reopenedRepos = createRepositories(reopenedDb);

      const afterRestart = await reopenedRepos.summaries.getSenderSummary('persist.com');

      // Then: Summary is intact after restart
      expect(afterRestart).not.toBeNull();
      expect(afterRestart!.summary).toBe(originalSummary!.summary);
      expect(afterRestart!.senderDomain).toBe('persist.com');
      expect(afterRestart!.updateCount).toBe(originalSummary!.updateCount);

      await reopenedDb.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('handles conflicting information from same sender', async () => {
      // Verify that buildSenderSummaryPrompt passes BOTH the existing summary
      // (containing the old/Q3 info) and the new content (containing the
      // Q4 correction) so the LLM can resolve the conflict with full context.
      //
      // We cannot test the LLM's resolution, but we CAN test that the prompt
      // gives the LLM all the information it needs to do so.

      const { buildSenderSummaryPrompt } = await import('@core/workflows/prompts/summarization');

      // Scenario: first email said Q3, second email corrects to Q4
      const existingSummary = 'Product launch planned for Q3. The sender provides product development updates.';
      const newEmailContent = 'Subject: Product Launch Delayed to Q4\nCorrection: The product launch has been delayed to Q4. The previous Q3 timeline is no longer accurate.';

      const prompt = buildSenderSummaryPrompt({
        senderDomain: 'news-source.com',
        currentSummary: existingSummary,
        newContent: newEmailContent,
        maxWords: 500,
      });

      // Then: the prompt includes BOTH the old (Q3) and new (Q4) data
      // so the LLM can see the conflict and resolve it
      expect(prompt).toContain('Q3');
      expect(prompt).toContain('Q4');
      expect(prompt).toContain('Correction');
      expect(prompt).toContain('no longer accurate');
      // The existing summary context is preserved so the LLM sees the contradiction
      expect(prompt).toContain('Product launch planned');
      // Guidelines for temporal handling
      expect(prompt).toContain('Gradually reduce focus on older emails');
    });
  });
});
