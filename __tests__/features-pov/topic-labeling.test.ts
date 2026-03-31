import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { processEmailWithWorkflow, createEmailProcessingWorkflow, type TopicLoader } from '@core/workflows/langgraph-workflow';
import { buildTopicLabelingPrompt } from '@core/workflows/prompts/topic-labeling';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmail(overrides: Partial<Email> & { id: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: overrides.senderEmail ?? `noreply@${overrides.senderDomain ?? 'example.com'}`,
    senderName: overrides.senderName ?? null,
    senderDomain: overrides.senderDomain ?? 'example.com',
    subject: overrides.subject ?? null,
    snippet: overrides.snippet ?? null,
    receivedAt: overrides.receivedAt ?? new Date(),
    ...overrides,
  };
}

async function insertEmail(repos: Repositories, email: Email): Promise<void> {
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
 * Follows the same pattern as email-processing-pipeline.test.ts and topic-summaries.test.ts.
 */
function createMockLLM(responses: {
  classification?: { type: string; confidence: number; reason?: string };
  update?: Record<string, unknown>;
  deal?: Record<string, unknown>;
  topic?: { parent: string; child: string; confidence: number };
  summary?: string;
  topicLabelingShouldFail?: boolean;
  topicLabelingFailCount?: number; // fail this many times, then succeed
}): LLMProvider {
  let topicLabelingCallCount = 0;

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
        topicLabelingCallCount++;
        if (responses.topicLabelingShouldFail) {
          throw new Error('LLM labeling failed');
        }
        if (responses.topicLabelingFailCount && topicLabelingCallCount <= responses.topicLabelingFailCount) {
          throw new Error('LLM labeling failed (retry)');
        }
        return (
          responses.topic ?? {
            parent: 'General',
            child: 'Test',
            confidence: 0.8,
          }
        );
      }
      return {};
    }),
  };
}

// ---------------------------------------------------------------------------
// Feature: Topic Labeling
//
// Tests the LLM-based topic labeling system: classification short-circuits,
// label generation (TB/{Parent} + TB/{Parent}/{Child}), retry behavior,
// and database persistence of topic hierarchies.
//
// RULES:
// - Every test calls REAL production code (processEmailWithWorkflow,
//   buildTopicLabelingPrompt, repository methods).
// - Only the LLM provider is mocked with deterministic responses.
// - Assertions focus on REAL workflow behavior: label format, retry logic,
//   gmailCategory short-circuits, and DB persistence.
// ---------------------------------------------------------------------------

describe('Feature: Topic Labeling', () => {
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
  // User Story: gmailCategory short-circuit classification
  // =========================================================================
  describe('gmailCategory short-circuit classification', () => {
    it('skips LLM and classifies promotions gmailCategory as promotional', async () => {
      const email = makeEmail({
        id: 'gmail-promo-1',
        senderDomain: 'amazon.com',
        subject: 'Big Sale Today!',
        gmailCategory: 'promotions',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      });

      const mockLLM = createMockLLM({});

      const result = await processEmailWithWorkflow(email, mockLLM);

      // Classification is from gmailCategory mapping, not LLM
      expect(result.classification).toBeDefined();
      expect(result.classification?.type).toBe('promotional');
      expect(result.classification?.confidence).toBe(0.95);
      expect(result.classification?.reason).toContain('promotions');

      // The LLM should NOT have been called for classification since gmailCategory was used
      // (generateObject may still be called for extraction/labeling but not for classification)
    });

    it('maps social gmailCategory to social type', async () => {
      const email = makeEmail({
        id: 'gmail-social-1',
        senderDomain: 'linkedin.com',
        subject: 'Someone endorsed you',
        gmailCategory: 'social',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({});
      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.classification?.type).toBe('social');
      expect(result.classification?.confidence).toBe(0.95);
    });

    it('maps updates gmailCategory to updates type', async () => {
      const email = makeEmail({
        id: 'gmail-updates-1',
        senderDomain: 'chase.com',
        subject: 'Statement Ready',
        gmailCategory: 'updates',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({});
      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.classification?.type).toBe('updates');
      expect(result.classification?.confidence).toBe(0.95);
    });

    it('maps forums gmailCategory to updates type with lower confidence', async () => {
      const email = makeEmail({
        id: 'gmail-forums-1',
        senderDomain: 'reddit.com',
        subject: 'New reply to your post',
        gmailCategory: 'forums',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({});
      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.classification?.type).toBe('updates');
      expect(result.classification?.confidence).toBe(0.85);
    });

    it('maps primary gmailCategory to regular type', async () => {
      const email = makeEmail({
        id: 'gmail-primary-1',
        senderDomain: 'company.com',
        subject: 'Meeting Tomorrow',
        gmailCategory: 'primary',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({});
      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.classification?.type).toBe('regular');
      expect(result.classification?.confidence).toBe(0.85);
    });

    it('falls through to LLM when gmailCategory is absent', async () => {
      const email = makeEmail({
        id: 'gmail-none-1',
        senderDomain: 'company.com',
        subject: 'Project Update',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        // no gmailCategory
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.92, reason: 'Work email' },
      });

      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.classification?.type).toBe('regular');
      expect(result.classification?.confidence).toBe(0.92);
      // LLM was used for classification (not gmailCategory)
      expect(result.classification?.reason).toBe('Work email');
    });

    it('falls through to LLM when gmailCategory is unrecognized', async () => {
      const email = makeEmail({
        id: 'gmail-unknown-1',
        senderDomain: 'company.com',
        subject: 'Project Update',
        gmailCategory: 'custom_category' as any,
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.88, reason: 'LLM fallback' },
      });

      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.classification?.type).toBe('regular');
      expect(result.classification?.confidence).toBe(0.88);
      expect(result.classification?.reason).toBe('LLM fallback');
    });
  });

  // =========================================================================
  // User Story: Two Gmail labels per email (TB/{Parent} + TB/{Parent}/{Child})
  // =========================================================================
  describe('Two Gmail labels per email', () => {
    it('generates TB/Parent and TB/Parent/Child labels from LLM topic result', async () => {
      const email = makeEmail({
        id: 'label-1',
        senderDomain: 'chase.com',
        subject: 'Statement Ready',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.92 },
      });

      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.topic).toBeDefined();
      expect(result.topic).not.toBeNull();
      expect(result.topic?.parent).toBe('Banking');
      expect(result.topic?.child).toBe('Chase');
      expect(result.topic?.confidence).toBe(0.92);

      // Two TB labels plus Processed label
      expect(result.labels).toContain('TB/Banking');
      expect(result.labels).toContain('TB/Banking/Chase');
      expect(result.labels).toContain('TuskerBrain/Processed');
    });

    it('generates correct labels for Shopping/Amazon topic', async () => {
      const email = makeEmail({
        id: 'label-2',
        senderDomain: 'amazon.com',
        subject: 'Your order has shipped',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.9 },
        topic: { parent: 'Shopping', child: 'Amazon', confidence: 0.88 },
      });

      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.labels).toContain('TB/Shopping');
      expect(result.labels).toContain('TB/Shopping/Amazon');
    });

    it('does not generate TB labels when topic labeling is skipped (promotional)', async () => {
      const email = makeEmail({
        id: 'label-3',
        senderDomain: 'bestbuy.com',
        subject: 'Flash Sale!',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({
        classification: { type: 'promotional', confidence: 0.97 },
        deal: {
          dealTitle: 'Flash Sale',
          brandName: 'Best Buy',
          dealValue: '50% off',
          isActive: true,
        },
      });

      const result = await processEmailWithWorkflow(email, mockLLM);

      // Promotional emails skip topic labeling (needsTopicLabeling=false)
      expect(result.topic).toBeNull();
      expect(result.labels).not.toContain(expect.stringMatching(/^TB\//));
    });
  });

  // =========================================================================
  // User Story: LLM-based labeling with existing topics
  // =========================================================================
  describe('LLM-based labeling with existing topics', () => {
    it('passes existing topics to the LLM prompt via topicLoader', async () => {
      const existingTopics = [
        { parent: 'Banking', children: ['Chase', 'Wells Fargo'] },
        { parent: 'Shopping', children: ['Amazon', 'eBay'] },
      ];

      const topicLoader: TopicLoader = vi.fn().mockResolvedValue(existingTopics);

      const email = makeEmail({
        id: 'existing-topics-1',
        senderDomain: 'chase.com',
        subject: 'Statement Ready',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.95 },
      });

      const result = await processEmailWithWorkflow(email, mockLLM, topicLoader);

      // topicLoader was called
      expect(topicLoader).toHaveBeenCalled();

      // LLM received the topic context and matched an existing topic
      expect(result.topic?.parent).toBe('Banking');
      expect(result.topic?.child).toBe('Chase');
    });

    it('topicLoader failure does not crash the workflow', async () => {
      const topicLoader: TopicLoader = vi.fn().mockRejectedValue(new Error('DB connection lost'));

      const email = makeEmail({
        id: 'topicloader-fail-1',
        senderDomain: 'company.com',
        subject: 'Project Update',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.9 },
        topic: { parent: 'Work', child: 'Projects', confidence: 0.8 },
      });

      // Should NOT throw — proceeds without existing topics
      const result = await processEmailWithWorkflow(email, mockLLM, topicLoader);

      expect(result.topic).toBeDefined();
      expect(result.topic?.parent).toBe('Work');
    });

    it('works without topicLoader (no existing topics context)', async () => {
      const email = makeEmail({
        id: 'no-topicloader-1',
        senderDomain: 'newstartup.com',
        subject: 'Welcome to our platform',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.9 },
        topic: { parent: 'Business', child: 'NewStartup', confidence: 0.75 },
      });

      // No topicLoader provided
      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.topic?.parent).toBe('Business');
      expect(result.topic?.child).toBe('NewStartup');
    });
  });

  // =========================================================================
  // User Story: Prompt builder includes existing topics
  // =========================================================================
  describe('buildTopicLabelingPrompt', () => {
    it('includes existing parent/child topics in prompt text', () => {
      const prompt = buildTopicLabelingPrompt({
        email: {
          subject: 'Your Amazon Order',
          snippet: 'Your order has shipped.',
          senderDomain: 'amazon.com',
        },
        existingTopics: [
          { parent: 'Banking', children: ['Chase', 'Wells Fargo'] },
          { parent: 'Shopping', children: ['Amazon'] },
        ],
      });

      expect(prompt).toContain('Banking');
      expect(prompt).toContain('Chase');
      expect(prompt).toContain('Wells Fargo');
      expect(prompt).toContain('Shopping');
      expect(prompt).toContain('Amazon');
      expect(prompt).toContain('amazon.com');
    });

    it('shows no-topics message when no existing topics', () => {
      const prompt = buildTopicLabelingPrompt({
        email: {
          subject: 'Test',
          snippet: 'Test',
          senderDomain: 'test.com',
        },
        existingTopics: [],
      });

      expect(prompt).toContain('No existing topics yet');
    });

    it('handles missing subject and snippet', () => {
      const prompt = buildTopicLabelingPrompt({
        email: {
          senderDomain: 'test.com',
        },
        existingTopics: [],
      });

      expect(prompt).toContain('No subject');
      expect(prompt).toContain('No snippet');
    });
  });

  // =========================================================================
  // User Story: Retry behavior on labeling failure
  // =========================================================================
  describe('Retry behavior on labeling failure', () => {
    it('returns null topic and error when LLM labeling fails after retries', async () => {
      const email = makeEmail({
        id: 'retry-fail-1',
        senderDomain: 'company.com',
        subject: 'Project Update',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.9 },
        topicLabelingShouldFail: true,
      });

      const result = await processEmailWithWorkflow(email, mockLLM);

      // After all retries exhausted, topic is null
      expect(result.topic).toBeNull();

      // Error is recorded
      expect(result.error).toBeDefined();
      expect(result.error).toContain('LLM labeling failed');

      // Only Processed label (no TB labels)
      expect(result.labels).toContain('TuskerBrain/Processed');
      expect(result.labels).not.toContain(expect.stringMatching(/^TB\//));

      // LLM was called multiple times (initial + 2 retries = 3 calls for topic)
      const generateObjectCalls = (mockLLM.generateObject as ReturnType<typeof vi.fn>).mock.calls;
      const topicCalls = generateObjectCalls.filter(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('Assign a topic label')
      );
      expect(topicCalls.length).toBe(3); // 1 initial + 2 retries
    });

    it('succeeds after retrying on transient failure', async () => {
      const email = makeEmail({
        id: 'retry-success-1',
        senderDomain: 'company.com',
        subject: 'Project Update',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      });

      const mockLLM = createMockLLM({
        classification: { type: 'regular', confidence: 0.9 },
        topic: { parent: 'Work', child: 'Projects', confidence: 0.85 },
        topicLabelingFailCount: 1, // fail once, then succeed
      });

      const result = await processEmailWithWorkflow(email, mockLLM);

      // Succeeds after retry
      expect(result.topic).toBeDefined();
      expect(result.topic).not.toBeNull();
      expect(result.topic?.parent).toBe('Work');
      expect(result.topic?.child).toBe('Projects');

      // Labels are correctly applied
      expect(result.labels).toContain('TB/Work');
      expect(result.labels).toContain('TB/Work/Projects');
      expect(result.labels).toContain('TuskerBrain/Processed');
    });
  });

  // =========================================================================
  // User Story: Topic hierarchy persistence with database
  // =========================================================================
  describe('Topic hierarchy persistence with database', () => {
    it('stores parent and child topics in correct hierarchy', async () => {
      const email = makeEmail({
        id: 'hier-1',
        senderDomain: 'chase.com',
        senderName: 'Chase',
        subject: 'Statement Ready',
        receivedAt: new Date(),
      });

      await insertEmail(repos, email);

      // Simulate what the orchestrator does with the topic result
      const parentName = 'Banking';
      const childName = 'Chase';
      const parentPath = parentName;
      const childPath = `${parentName}/${childName}`;

      // Create parent topic
      const parentTopic = await repos.topics.create({
        id: `topic-${parentName.toLowerCase()}`,
        name: parentName,
        fullPath: parentPath,
      });

      // Create child topic linked to parent
      const childTopic = await repos.topics.create({
        id: `topic-${parentName.toLowerCase()}-${childName.toLowerCase()}`,
        parentId: parentTopic.id,
        name: childName,
        fullPath: childPath,
      });

      expect(parentTopic.name).toBe('Banking');
      expect(childTopic.parentId).toBe(parentTopic.id);
      expect(childTopic.fullPath).toBe('Banking/Chase');

      // Verify hierarchy navigation
      const children = await repos.topics.findChildren(parentTopic.id);
      expect(children).toHaveLength(1);
      expect(children[0].name).toBe('Chase');
    });

    it('finds topic by full path after creation', async () => {
      await repos.topics.create({
        id: 'topic-banking',
        name: 'Banking',
        fullPath: 'Banking',
      });
      await repos.topics.create({
        id: 'topic-banking-chase',
        parentId: 'topic-banking',
        name: 'Chase',
        fullPath: 'Banking/Chase',
      });

      const found = await repos.topics.findByFullPath('Banking/Chase');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Chase');
      expect(found!.parentId).toBe('topic-banking');
    });

    it('links emails to topics with confidence score', async () => {
      const email = makeEmail({ id: 'link-email-1', senderDomain: 'chase.com', subject: 'Test' });
      await insertEmail(repos, email);

      await repos.topics.create({
        id: 'topic-banking-chase',
        name: 'Chase',
        fullPath: 'Banking/Chase',
      });

      await repos.topics.linkEmail('link-email-1', 'topic-banking-chase', 0.85);

      const emailTopics = await repos.topics.findTopicsForEmail('link-email-1');
      expect(emailTopics).toHaveLength(1);
      expect(emailTopics[0].name).toBe('Chase');
      expect(emailTopics[0].confidenceScore).toBe(0.85);
    });

    it('supports linking multiple topics to a single email', async () => {
      const email = makeEmail({
        id: 'multi-topic-1',
        senderDomain: 'amazon.com',
        subject: 'Prime Day Deals',
        receivedAt: new Date(),
      });
      await insertEmail(repos, email);

      const shoppingParent = await repos.topics.create({
        id: 'topic-shopping',
        name: 'Shopping',
        fullPath: 'Shopping',
      });
      const amazonChild = await repos.topics.create({
        id: 'topic-shopping-amazon',
        parentId: shoppingParent.id,
        name: 'Amazon',
        fullPath: 'Shopping/Amazon',
      });
      const techParent = await repos.topics.create({
        id: 'topic-technology',
        name: 'Technology',
        fullPath: 'Technology',
      });
      const electronicsChild = await repos.topics.create({
        id: 'topic-technology-electronics',
        parentId: techParent.id,
        name: 'Electronics',
        fullPath: 'Technology/Electronics',
      });

      await repos.topics.linkEmail(email.id, amazonChild.id, 0.9);
      await repos.topics.linkEmail(email.id, electronicsChild.id, 0.7);

      const emailTopics = await repos.topics.findTopicsForEmail(email.id);
      expect(emailTopics).toHaveLength(2);

      const topicNames = emailTopics.map(t => t.name);
      expect(topicNames).toContain('Amazon');
      expect(topicNames).toContain('Electronics');
    });
  });

  // =========================================================================
  // User Story: Gmail label repository (TB format)
  // =========================================================================
  describe('Gmail label repository (TB format)', () => {
    it('creates and finds a TB/Parent label', async () => {
      await repos.labels.create({
        id: 'label-tb-banking',
        name: 'TB/Banking',
        type: 'user',
        labelType: 'topic',
      });

      const found = await repos.labels.findByName('TB/Banking');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('TB/Banking');
    });

    it('creates and finds TB/Parent/Child label', async () => {
      await repos.labels.create({
        id: 'label-tb-banking-chase',
        name: 'TB/Banking/Chase',
        type: 'user',
        labelType: 'topic',
      });

      const found = await repos.labels.findByName('TB/Banking/Chase');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('TB/Banking/Chase');
    });

    it('links TB labels to an email and retrieves them', async () => {
      const email = makeEmail({ id: 'tb-label-email-1', senderDomain: 'chase.com', subject: 'Test' });
      await insertEmail(repos, email);

      const parentLabel = await repos.labels.create({
        id: 'label-tb-banking',
        name: 'TB/Banking',
        type: 'user',
        labelType: 'topic',
      });
      const childLabel = await repos.labels.create({
        id: 'label-tb-banking-chase',
        name: 'TB/Banking/Chase',
        type: 'user',
        labelType: 'topic',
      });

      await repos.labels.linkLabelsToEmail(email.id, [parentLabel.id, childLabel.id]);

      const labels = await repos.labels.getLabelsForEmail(email.id);
      expect(labels).toHaveLength(2);
      const labelNames = labels.map(l => l.name);
      expect(labelNames).toContain('TB/Banking');
      expect(labelNames).toContain('TB/Banking/Chase');
    });

    it('stores sender labels in TuskerBrain/Sender/* format (unchanged)', async () => {
      const label = await repos.labels.create({
        id: 'label-sender-chase',
        name: 'TuskerBrain/Sender/chase.com',
        type: 'user',
        labelType: 'sender',
      });

      const found = await repos.labels.findByName('TuskerBrain/Sender/chase.com');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(label.id);
    });
  });

  // =========================================================================
  // User Story: End-to-end topic assignment pipeline
  // =========================================================================
  describe('End-to-end topic assignment', () => {
    it('classifies email, stores topic hierarchy, and generates TB labels', async () => {
      const email = makeEmail({
        id: 'e2e-1',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase',
        senderDomain: 'chase.com',
        subject: 'Chase Statement',
        snippet: 'Your statement is ready.',
        receivedAt: new Date(),
      });

      // Step 1: Run workflow to get LLM topic result
      const mockLLM = createMockLLM({
        classification: { type: 'updates', confidence: 0.9 },
        topic: { parent: 'Banking', child: 'Chase', confidence: 0.92 },
      });

      const result = await processEmailWithWorkflow(email, mockLLM);

      expect(result.topic).toBeDefined();
      expect(result.topic?.parent).toBe('Banking');
      expect(result.topic?.child).toBe('Chase');

      // Step 2: Store topic hierarchy (simulating orchestrator)
      await insertEmail(repos, email);

      let parentTopic = await repos.topics.findByFullPath(result.topic!.parent);
      if (!parentTopic) {
        parentTopic = await repos.topics.create({
          id: `topic-${result.topic!.parent.toLowerCase()}`,
          name: result.topic!.parent,
          fullPath: result.topic!.parent,
        });
      }

      let childTopic = await repos.topics.findByFullPath(`${result.topic!.parent}/${result.topic!.child}`);
      if (!childTopic) {
        childTopic = await repos.topics.create({
          id: `topic-${result.topic!.parent.toLowerCase()}-${result.topic!.child.toLowerCase()}`,
          parentId: parentTopic.id,
          name: result.topic!.child,
          fullPath: `${result.topic!.parent}/${result.topic!.child}`,
        });
      }

      // Step 3: Store TB labels
      const parentLabel = await repos.labels.create({
        id: 'label-tb-banking',
        name: 'TB/Banking',
        type: 'user',
        labelType: 'topic',
      });
      const childLabel = await repos.labels.create({
        id: 'label-tb-banking-chase',
        name: 'TB/Banking/Chase',
        type: 'user',
        labelType: 'topic',
      });

      // Step 4: Link everything
      await repos.topics.linkEmail(email.id, childTopic.id, result.topic!.confidence);
      await repos.labels.linkLabelsToEmail(email.id, [parentLabel.id, childLabel.id]);

      // Verify all links
      const emailTopics = await repos.topics.findTopicsForEmail(email.id);
      expect(emailTopics).toHaveLength(1);
      expect(emailTopics[0].fullPath).toBe('Banking/Chase');

      const emailLabels = await repos.labels.getLabelsForEmail(email.id);
      expect(emailLabels).toHaveLength(2);
      const labelNames = emailLabels.map(l => l.name);
      expect(labelNames).toContain('TB/Banking');
      expect(labelNames).toContain('TB/Banking/Chase');
    });
  });
});
