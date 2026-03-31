import { describe, it, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { processEmailWithWorkflow } from '@core/workflows/langgraph-workflow';
import { EmailProcessingOrchestrator, type OrchestratorOptions } from '@core/orchestrator';
import { TuskerBrainDatabase } from '../../database';
import { createRepositories, type Repositories } from '@core/repositories';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an Email object with sensible defaults for a regular (non-promo) email. */
function makeRegularEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: `email_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    threadId: 'thread_1',
    senderEmail: 'colleague@company.com',
    senderName: 'Colleague',
    senderDomain: 'company.com',
    subject: 'Project Update',
    snippet: 'Here is the latest update on the project.',
    receivedAt: new Date(), // recent by default
    ...overrides,
  };
}

/** Build an Email object for a promotional email. */
function makePromoEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: `email_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    threadId: 'thread_promo',
    senderEmail: 'deals@store.com',
    senderName: 'Store Deals',
    senderDomain: 'store.com',
    subject: 'Big Sale This Weekend!',
    snippet: 'Save 50% on everything this weekend only.',
    receivedAt: new Date(), // recent by default
    ...overrides,
  };
}

/** Seed an email into the database so FK constraints are satisfied. */
async function seedEmail(repos: Repositories, email: Email): Promise<void> {
  await repos.emails.create({
    id: email.id,
    threadId: email.threadId,
    senderEmail: email.senderEmail,
    senderName: email.senderName ?? undefined,
    senderDomain: email.senderDomain,
    subject: email.subject ?? undefined,
    snippet: email.snippet ?? undefined,
    receivedAt: email.receivedAt,
  });
}

/**
 * Create a mock LLM provider that returns controlled responses based on prompt content.
 * This mirrors the pattern used in deals.test.ts and conflicting-info.test.ts.
 */
function createMockLLM(responses: {
  classification?: { type: string; confidence: number; reason?: string };
  update?: Record<string, unknown>;
  deal?: Record<string, unknown>;
  topic?: { parent: string; child: string; confidence: number };
  summary?: string;
  shouldFail?: boolean;
}): LLMProvider {
  if (responses.shouldFail) {
    return {
      name: 'openai',
      model: 'gpt-4o-mini',
      generateText: vi.fn().mockRejectedValue(new Error('LLM service unavailable')),
      generateObject: vi.fn().mockRejectedValue(new Error('LLM service unavailable')),
    };
  }

  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockResolvedValue({
      text: responses.summary ?? 'A concise summary of the email content.',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    generateObject: vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Classify this email')) {
        return responses.classification ?? { type: 'regular', confidence: 0.9 };
      }
      if (prompt.includes('Extract deal information')) {
        return (
          responses.deal ?? {
            dealTitle: 'Default Deal',
            brandName: 'Store',
            dealValue: '50% off',
            isActive: true,
          }
        );
      }
      if (prompt.includes('Extract key information')) {
        return (
          responses.update ?? {
            title: 'Default Update',
            description: 'Default description',
            priority: 'medium',
          }
        );
      }
      if (prompt.includes('Assign a topic label to this email')) {
        return (
          responses.topic ?? {
            parent: 'General',
            child: 'Test',
            confidence: 0.8,
          }
        );
      }
      // Fallback for summary merge / sender summary prompts
      if (prompt.includes('summary') || prompt.includes('Summary')) {
        return { summary: 'A merged summary.', wordCount: 10 };
      }
      return {};
    }),
  };
}

/** Create a mock GmailClient that does nothing (no real Gmail API). */
function createMockGmailClient() {
  return {
    modifyMessage: vi.fn().mockResolvedValue(undefined),
  };
}

/** Create a mock job queue (orchestrator requires it but we never use it here). */
function createMockJobQueue() {
  return {
    startProcessing: vi.fn(),
    stopProcessing: vi.fn(),
    addJob: vi.fn(),
    getJob: vi.fn(),
    updateJobStatus: vi.fn(),
  };
}

/** Build an orchestrator wired to the real DB + repos with mocked externals. */
function buildOrchestrator(
  db: TuskerBrainDatabase,
  repos: Repositories,
  llm: LLMProvider,
): EmailProcessingOrchestrator {
  return new EmailProcessingOrchestrator({
    db,
    jobQueue: createMockJobQueue() as unknown as OrchestratorOptions['jobQueue'],
    gmailClient: createMockGmailClient() as unknown as OrchestratorOptions['gmailClient'],
    llmProvider: llm,
    repositories: {
      emails: repos.emails,
      timeline: repos.timeline,
      deals: repos.deals,
      topics: repos.topics as unknown as OrchestratorOptions['repositories']['topics'],
      summaries: repos.summaries,
      labels: repos.labels,
    },
  });
}

// ---------------------------------------------------------------------------
// Feature: Email Processing Pipeline
//
// Tests the full user-facing pipeline: classification -> decision -> extraction
// -> topic labeling -> summarization. Tests the workflow from the user's
// perspective: "When an email arrives, does it get properly classified,
// summarized, and organized?"
//
// RULES:
// - Every test calls REAL production code (processEmailWithWorkflow).
// - Only the LLM provider is mocked.
// - Assertions focus on REAL workflow behavior: decision routing, graph
//   traversal paths, and node visit order -- not mock passthrough values.
// ---------------------------------------------------------------------------

describe('Feature: Email Processing Pipeline', () => {
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

  // =========================================================================
  // User Story: Regular email processing (happy path)
  // =========================================================================
  describe('Regular email processing', () => {
    it('classifies regular email, persists timeline update, topics, and labels to DB', async () => {
      // Given: a recent regular email
      const email = makeRegularEmail({
        senderEmail: 'alice@company.com',
        senderName: 'Alice',
        senderDomain: 'company.com',
        subject: 'Q3 Planning Notes',
        snippet: 'Here are the key takeaways from our Q3 planning session.',
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.95, reason: 'Personal work email' },
        update: {
          title: 'Q3 Planning Notes',
          description: 'Key takeaways from the Q3 planning session',
          summary: 'Q3 planning notes shared by Alice',
          priority: 'medium',
          sentiment: 'neutral',
          actionItem: false,
          keyEntities: { names: ['Alice'], dates: [], amounts: [] },
        },
        topic: {
          parent: 'Work',
          child: 'Planning',
          confidence: 0.9,
        },
        summary: 'Alice shared Q3 planning notes with key takeaways.',
      });

      // Seed email into DB so orchestrator persistence works
      await seedEmail(repos, email);
      const orchestrator = buildOrchestrator(db, repos, mockLLM);

      // When: the email is processed through the orchestrator (workflow + DB persistence)
      const result = await orchestrator.processEmail(email);

      // Then: classification is persisted correctly
      expect(result.classification.type).toBe('regular');
      expect(result.classification.confidence).toBe(0.95);

      // And: timeline update was persisted to DB
      expect(result.timelineUpdate).toBeDefined();
      expect(result.timelineUpdate!.title).toBe('Q3 Planning Notes');
      const dbTimeline = await repos.timeline.findByEmailId(email.id);
      expect(dbTimeline).toHaveLength(1);
      expect(dbTimeline[0].title).toBe('Q3 Planning Notes');
      expect(dbTimeline[0].priority).toBe('medium');

      // And: topic was persisted with correct parent/child hierarchy
      expect(result.topics.length).toBeGreaterThan(0);
      const dbTopics = await repos.topics.findTopicsForEmail(email.id);
      expect(dbTopics).toHaveLength(1);
      expect(dbTopics[0].fullPath).toBe('Work/Planning');

      // And: TB labels were generated and persisted
      expect(result.gmailActions.labelsAdded).toContain('TB/Work');
      expect(result.gmailActions.labelsAdded).toContain('TB/Work/Planning');
      expect(result.gmailActions.labelsAdded).toContain('TuskerBrain/Processed');

      // And: email is marked as processed with correct type
      const dbEmail = await repos.emails.findById(email.id);
      expect(dbEmail).not.toBeNull();
      expect(dbEmail!.isProcessed).toBe(true);
      expect(dbEmail!.emailType).toBe('regular');

      // And: regular emails are not archived
      expect(result.gmailActions.archived).toBe(false);
    });

    it('persists action item extraction with priority and follow-up date', async () => {
      // Given: an email containing tasks and deadlines
      const email = makeRegularEmail({
        senderEmail: 'bob@company.com',
        senderName: 'Bob',
        subject: 'Action Required: Complete Q3 Report by Friday',
        snippet: 'Please complete the Q3 financial report by end of day Friday. Include revenue figures and expense breakdown.',
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.92, reason: 'Work email with action items' },
        update: {
          title: 'Q3 Report Deadline',
          description: 'Complete Q3 financial report with revenue and expenses by Friday',
          priority: 'high',
          urgency: true,
          actionItem: true,
          actionItemTitle: 'Complete Q3 financial report',
          followUpDate: 'Friday',
          keyEntities: {
            dates: ['Friday'],
            names: ['Bob'],
            amounts: [],
          },
        },
        topic: {
          parent: 'Work',
          child: 'Reports',
          confidence: 0.88,
        },
        summary: 'Bob requested the Q3 financial report be completed by Friday.',
      });

      await seedEmail(repos, email);
      const orchestrator = buildOrchestrator(db, repos, mockLLM);

      // When: the email is processed through the orchestrator
      const result = await orchestrator.processEmail(email);

      // Then: timeline update was persisted with action item fields
      expect(result.timelineUpdate).toBeDefined();
      expect(result.timelineUpdate!.priority).toBe('high');
      const dbTimeline = await repos.timeline.findByEmailId(email.id);
      expect(dbTimeline[0].actionItem).toBe(true);
      expect(dbTimeline[0].actionItemTitle).toBe('Complete Q3 financial report');
      expect(dbTimeline[0].followUpDate).toBe('Friday');

      // And: topic was persisted
      const dbTopics = await repos.topics.findTopicsForEmail(email.id);
      expect(dbTopics).toHaveLength(1);
      expect(dbTopics[0].fullPath).toBe('Work/Reports');

      // And: TB labels applied
      expect(result.gmailActions.labelsAdded).toContain('TB/Work');
      expect(result.gmailActions.labelsAdded).toContain('TB/Work/Reports');
    });
  });

  // =========================================================================
  // User Story: Promotional email processing
  // =========================================================================
  describe('Promotional email processing', () => {
    it('extracts deal and persists to DB, skips topic labeling', async () => {
      // Given: a recent promotional email from a retailer
      const email = makePromoEmail({
        senderDomain: 'bestbuy.com',
        senderName: 'Best Buy',
        senderEmail: 'deals@bestbuy.com',
        subject: 'Flash Sale: 40% Off All Electronics!',
        snippet: 'Get 40% off all electronics this weekend. Use code FLASH40 at checkout. Limited time only!',
      });

      const mockLLM = createMockLLM({
        classification: { type: 'promotional', confidence: 0.97, reason: 'Marketing email with sale offer' },
        deal: {
          dealTitle: '40% Off All Electronics',
          dealDescription: 'Flash sale on all electronics this weekend',
          brandName: 'Best Buy',
          dealValue: '40% off',
          dealCode: 'FLASH40',
          dealCategory: 'Electronics',
          isActive: true,
        },
        summary: 'Best Buy flash sale: 40% off all electronics with code FLASH40.',
      });

      await seedEmail(repos, email);
      const orchestrator = buildOrchestrator(db, repos, mockLLM);

      // When: the email is processed through the orchestrator
      const result = await orchestrator.processEmail(email);

      // Then: deal was extracted and persisted to DB
      expect(result.deal).toBeDefined();
      expect(result.deal!.dealTitle).toBe('40% Off All Electronics');
      expect(result.deal!.brandName).toBe('Best Buy');

      // Verify deal in DB directly
      const dbDeals = await repos.deals.findByEmailId(email.id);
      expect(dbDeals).toHaveLength(1);
      expect(dbDeals[0].dealTitle).toBe('40% Off All Electronics');
      expect(dbDeals[0].brandName).toBe('Best Buy');
      expect(dbDeals[0].dealCode).toBe('FLASH40');

      // And: no topics assigned (promotional skips topic labeling)
      expect(result.topics).toHaveLength(0);
      const dbTopics = await repos.topics.findTopicsForEmail(email.id);
      expect(dbTopics).toHaveLength(0);

      // And: email marked as processed with promotional type
      const dbEmail = await repos.emails.findById(email.id);
      expect(dbEmail!.isProcessed).toBe(true);
      expect(dbEmail!.emailType).toBe('promotional');

      // And: promotional emails get archived by default
      expect(result.gmailActions.archived).toBe(true);
    });
  });

  // =========================================================================
  // User Story: Age-based routing
  // =========================================================================
  describe('Age-based routing', () => {
    it('routes old promotional email to delete and marks deleted in DB', async () => {
      // Given: a promotional email older than 30 days
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const email = makePromoEmail({
        receivedAt: fortyDaysAgo,
        subject: 'Old Sale You Missed',
        snippet: 'This sale ended a long time ago.',
      });

      const mockLLM = createMockLLM({
        classification: { type: 'promotional', confidence: 0.9 },
      });

      await seedEmail(repos, email);
      const orchestrator = buildOrchestrator(db, repos, mockLLM);

      // When: the email is processed
      const result = await orchestrator.processEmail(email);

      // Then: it is routed to delete
      expect(result.gmailActions.deleted).toBe(true);

      // And: email is marked as processed + deleted in DB
      const dbEmail = await repos.emails.findById(email.id);
      expect(dbEmail!.isProcessed).toBe(true);
      expect(dbEmail!.isDeleted).toBe(true);
      expect(dbEmail!.emailType).toBe('promotional');

      // And: generateObject was only called once (classification only, not extraction)
      const generateObjectCalls = (mockLLM.generateObject as ReturnType<typeof vi.fn>).mock.calls;
      expect(generateObjectCalls.length).toBe(1); // only classification
    });

    it('routes old regular email to archive and marks archived in DB', async () => {
      // Given: a regular email older than 6 months (180 days)
      const twoHundredDaysAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
      const email = makeRegularEmail({
        receivedAt: twoHundredDaysAgo,
        subject: 'Old Project Discussion',
        snippet: 'This is from a long time ago.',
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.9 },
      });

      await seedEmail(repos, email);
      const orchestrator = buildOrchestrator(db, repos, mockLLM);

      // When: the email is processed
      const result = await orchestrator.processEmail(email);

      // Then: it is routed to archive
      expect(result.gmailActions.archived).toBe(true);

      // And: email is marked as processed + archived in DB
      const dbEmail = await repos.emails.findById(email.id);
      expect(dbEmail!.isProcessed).toBe(true);
      expect(dbEmail!.isArchived).toBe(true);
      expect(dbEmail!.emailType).toBe('regular');
    });
  });

  // =========================================================================
  // User Story: Priority handling
  // =========================================================================
  describe('Priority handling', () => {
    it('gives high priority to Gmail important-flagged email', async () => {
      // Given: an old promotional email (>30 days) that would normally be deleted,
      // BUT Gmail has flagged it as important
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const importantPromoEmail = makePromoEmail({
        receivedAt: fortyDaysAgo,
        subject: 'Flight Confirmation: Your Trip Next Week',
        snippet: 'Your flight to San Francisco is confirmed. Confirmation code ABC123.',
        gmailCategory: 'promotions',
        isImportant: true,
      });

      const mockLLM = createMockLLM({
        classification: { type: 'promotional', confidence: 0.95, reason: 'Promotional email' },
        deal: {
          dealTitle: 'Flight Confirmation',
          brandName: 'Airlines',
          dealValue: 'N/A',
          isActive: true,
        },
        summary: 'Flight confirmation for trip to San Francisco.',
      });

      await seedEmail(repos, importantPromoEmail);
      const orchestrator = buildOrchestrator(db, repos, mockLLM);

      // When: the important email is processed
      const result = await orchestrator.processEmail(importantPromoEmail);

      // Then: it is NOT deleted (unlike non-important old promotional emails)
      expect(result.gmailActions.deleted).toBe(false);

      // And: it gets processed with deal extraction instead
      expect(result.deal).toBeDefined();
      expect(result.deal!.dealTitle).toBe('Flight Confirmation');

      // And: email is marked as processed (not deleted)
      const dbEmail = await repos.emails.findById(importantPromoEmail.id);
      expect(dbEmail!.isProcessed).toBe(true);
      expect(dbEmail!.isDeleted).toBe(false);
      expect(dbEmail!.emailType).toBe('promotional');
    });
  });

  // =========================================================================
  // User Story: Error handling
  // =========================================================================
  describe('Error handling', () => {
    it('persists fallback classification when LLM classification fails', async () => {
      // Given: an email where only classification LLM call fails
      // (other calls like sender summary merge must succeed for orchestrator to complete)
      const email = makeRegularEmail({
        senderDomain: 'company.com',
      });

      let classificationCallCount = 0;
      const mockLLM: LLMProvider = {
        name: 'openai',
        model: 'gpt-4o-mini',
        generateText: vi.fn().mockResolvedValue({
          text: 'A summary of the email.',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
        generateObject: vi.fn().mockImplementation(async (prompt: string) => {
          // First classification call fails — triggers fallback
          if (prompt.includes('Classify this email')) {
            classificationCallCount++;
            if (classificationCallCount === 1) {
              throw new Error('LLM service unavailable');
            }
          }
          // All other calls succeed normally
          if (prompt.includes('Extract key information')) {
            return {
              title: 'Fallback Update',
              description: 'Extracted after fallback classification',
              priority: 'low',
            };
          }
          if (prompt.includes('Assign a topic label to this email')) {
            return { parent: 'General', child: 'Uncategorized', confidence: 0.5 };
          }
          // Summary merge / sender summary prompts
          if (prompt.includes('summary') || prompt.includes('Summary')) {
            return { summary: 'A merged summary.', wordCount: 10 };
          }
          return {};
        }),
      };

      await seedEmail(repos, email);
      const orchestrator = buildOrchestrator(db, repos, mockLLM);

      // When: the email is processed with a classification failure
      const result = await orchestrator.processEmail(email);

      // Then: fallback classification is used (regular, low confidence)
      expect(result.classification).toBeDefined();
      expect(result.classification.type).toBe('regular');
      expect(result.classification.confidence).toBeLessThan(0.9);

      // And: the fallback classification is persisted to DB
      const dbEmail = await repos.emails.findById(email.id);
      expect(dbEmail!.emailType).toBe('regular');
      expect(dbEmail!.isProcessed).toBe(true);
    });

    it('handles malformed email data through workflow', async () => {
      // Given: an email with missing/null fields
      // This test exercises real null-safety in classifyNode (?? undefined),
      // prompt building (|| fallbacks), and decideNode (?? 'regular' default).
      const email: Email = {
        id: 'email_malformed',
        threadId: '',
        senderEmail: '',
        senderName: null,
        senderDomain: '',
        subject: null,
        snippet: null,
        receivedAt: new Date(),
      };

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.6 },
      });

      // When: the email is processed through the workflow directly
      // (no DB seeding needed - testing workflow null-safety, not persistence)
      const result = await processEmailWithWorkflow(email, mockLLM);

      // Then: it processes without crashing
      expect(result).toBeDefined();
      expect(result.classification).toBeDefined();
      expect(result.classification?.type).toBe('regular');

      // And: the workflow completes to a terminal step
      expect(['summarize', 'archive', 'delete']).toContain(result.currentStep);

      // And: decideNode handled the null-domain email correctly
      // (type=regular + recent -> action=process)
      expect(result.decision?.action).toBe('process');
      expect(result.decision?.needsExtraction).toBe(true);
    });
  });
});
