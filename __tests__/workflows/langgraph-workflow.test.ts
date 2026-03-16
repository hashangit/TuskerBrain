import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmailWithWorkflow, createEmailProcessingWorkflow } from '@core/workflows/langgraph-workflow';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';

// Mock LLM Provider
function createMockLLMProvider(responses: {
  classification?: { type: 'regular' | 'updates' | 'social' | 'promotional'; confidence: number; reason?: string };
  update?: object;
  deal?: object;
  topic?: { parentTopic: string; childTopic: string; fullPath: string; confidence: number };
  summary?: string;
}): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockResolvedValue({
      text: responses.summary ?? 'Test summary',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    generateObject: vi.fn().mockImplementation(async (prompt: string, schema: unknown) => {
      const schemaName = schema?._def?.typeName ?? 'unknown';

      // Check prompt content to determine what to return
      if (prompt.includes('Classify this email')) {
        return responses.classification ?? { type: 'regular', confidence: 0.9 };
      }
      if (prompt.includes('Extract deal information')) {
        return responses.deal ?? {
          dealTitle: 'Test Deal',
          brandName: 'Test Brand',
          dealValue: '50% off',
          isActive: true,
        };
      }
      if (prompt.includes('Extract key information from this email update')) {
        return responses.update ?? {
          title: 'Test Update',
          description: 'Test description',
          priority: 'medium',
        };
      }
      if (prompt.includes('Determine:') || prompt.includes('determine the appropriate topic label')) {
        return responses.topic ?? {
          parentTopic: 'General',
          childTopic: 'Test',
          fullPath: 'General/Test',
          confidence: 0.8,
        };
      }
      if (prompt.includes('Analyze this email and determine the appropriate topic label')) {
        return responses.topic ?? {
          parentTopic: 'General',
          childTopic: 'Test',
          fullPath: 'General/Test',
          confidence: 0.8,
        };
      }

      return {};
    }),
  };
}

function createTestEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'test-email-1',
    threadId: 'thread-1',
    senderEmail: 'test@example.com',
    senderName: 'Test Sender',
    senderDomain: 'example.com',
    subject: 'Test Subject',
    snippet: 'Test snippet content',
    receivedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    ...overrides,
  };
}

describe('LangGraph Email Processing Workflow', () => {
  describe('Workflow Creation', () => {
    it('should create a workflow with all required nodes', () => {
      const mockProvider = createMockLLMProvider({});
      const workflow = createEmailProcessingWorkflow(mockProvider);

      expect(workflow).toBeDefined();
      expect(workflow.nodes).toBeDefined();
    });
  });

  describe('Classification Node', () => {
    it('should classify a regular email correctly', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.95, reason: 'Personal email' },
      });

      const email = createTestEmail({
        senderEmail: 'john@company.com',
        senderDomain: 'company.com',
        subject: 'Project Update',
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification).toBeDefined();
      expect(result.classification?.type).toBe('regular');
      expect(result.classification?.confidence).toBe(0.95);
    });

    it('should classify a promotional email correctly', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.9, reason: 'Marketing email' },
      });

      const email = createTestEmail({
        senderEmail: 'deals@amazon.com',
        senderDomain: 'amazon.com',
        subject: '50% Off Today Only!',
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification?.type).toBe('promotional');
    });

    it('should classify a social email correctly', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'social', confidence: 0.9, reason: 'LinkedIn notification' },
      });

      const email = createTestEmail({
        senderEmail: 'notifications@linkedin.com',
        senderDomain: 'linkedin.com',
        subject: 'Someone endorsed you',
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification?.type).toBe('social');
    });

    it('should classify an updates email correctly', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.85, reason: 'Bank notification' },
      });

      const email = createTestEmail({
        senderEmail: 'noreply@chase.com',
        senderDomain: 'chase.com',
        subject: 'Your statement is ready',
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification?.type).toBe('updates');
    });
  });

  describe('Decision Node', () => {
    it('should decide to process recent regular emails', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
      });

      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.decision?.action).toBe('process');
      expect(result.decision?.needsExtraction).toBe(true);
    });

    it('should decide to archive old regular emails (>6 months)', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
      });

      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // ~6.5 months ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.decision?.action).toBe('archive');
      expect(result.decision?.needsExtraction).toBe(false);
    });

    it('should decide to extract deals from recent promotional emails', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.9 },
      });

      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.decision?.action).toBe('extract_deals');
      expect(result.decision?.needsExtraction).toBe(true);
    });

    it('should decide to delete old promotional emails (>1 month)', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.9 },
      });

      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.decision?.action).toBe('delete');
    });

    it('should decide to delete old social emails (1 month - 2 years)', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'social', confidence: 0.9 },
      });

      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 2 months ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.decision?.action).toBe('delete');
    });

    it('should decide to archive very old social emails (>2 years)', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'social', confidence: 0.9 },
      });

      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 800 * 24 * 60 * 60 * 1000), // ~2+ years ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.decision?.action).toBe('archive');
      expect(result.decision?.action).not.toBe('delete');
    });

    it('should decide to archive old update emails (>1 month)', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
      });

      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.decision?.action).toBe('archive');
    });
  });

  describe('Extraction Node', () => {
    it('should extract deal information from promotional emails', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.9 },
        deal: {
          dealTitle: '50% Off Electronics',
          brandName: 'Amazon',
          dealValue: '50% off',
          dealCode: 'SAVE50',
          isActive: true,
        },
      });

      const email = createTestEmail({
        senderDomain: 'amazon.com',
        subject: '50% Off Today!',
        receivedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.extraction?.type).toBe('deal');
      expect(result.extraction?.deal?.dealTitle).toBe('50% Off Electronics');
      expect(result.extraction?.deal?.brandName).toBe('Amazon');
      expect(result.extraction?.deal?.dealCode).toBe('SAVE50');
    });

    it('should extract update information from regular emails', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        update: {
          title: 'Project Alpha Update',
          description: 'The project is on track',
          priority: 'high',
          actionItem: true,
          actionItemTitle: 'Review the attached document',
        },
      });

      const email = createTestEmail({
        subject: 'Project Alpha Update',
        snippet: 'Please review the attached document by Friday.',
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.extraction?.type).toBe('update');
      expect(result.extraction?.update?.title).toBe('Project Alpha Update');
      expect(result.extraction?.update?.actionItem).toBe(true);
    });
  });

  describe('Topic Labeling Node', () => {
    it('should label emails with appropriate topics', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: {
          parentTopic: 'Banking',
          childTopic: 'Chase',
          fullPath: 'Banking/Chase',
          confidence: 0.9,
        },
      });

      const email = createTestEmail({
        senderDomain: 'chase.com',
        subject: 'Statement Ready',
        receivedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago (recent)
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.topic).toBeDefined();
      expect(result.topic?.parent).toBe('Banking');
      expect(result.topic?.child).toBe('Chase');
      expect(result.topic?.fullPath).toBe('Banking/Chase');
    });

    it('should add TuskerBrain labels to processed emails', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        topic: {
          parentTopic: 'Work',
          childTopic: 'Projects',
          fullPath: 'Work/Projects',
          confidence: 0.85,
        },
      });

      const email = createTestEmail();

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.labels).toBeDefined();
      expect(result.labels).toContain('TuskerBrain/Processed');
    });
  });

  describe('Summary Node', () => {
    it('should generate a summary for processed emails', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        summary: 'This email contains an important project update that requires review by Friday.',
      });

      const email = createTestEmail({
        subject: 'Project Update',
        snippet: 'Please review the attached document.',
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('project update');
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM errors gracefully with fallback classification', async () => {
      const mockProvider: LLMProvider = {
        name: 'openai',
        model: 'gpt-4o-mini',
        generateText: vi.fn().mockRejectedValue(new Error('API error')),
        generateObject: vi.fn().mockRejectedValue(new Error('API error')),
      };

      const email = createTestEmail({
        senderDomain: 'amazon.com',
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      // Should have fallback classification
      expect(result.classification).toBeDefined();
      expect(result.error).toContain('API error');
    });
  });

  describe('Token Tracking', () => {
    it('should track tokens used during processing', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
      });

      const email = createTestEmail();

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Workflow Steps', () => {
    it('should process through all steps for a regular email', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        topic: {
          parentTopic: 'General',
          childTopic: 'Test',
          fullPath: 'General/Test',
          confidence: 0.8,
        },
      });

      const email = createTestEmail();

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.currentStep).toBe('summarize'); // Final step for process path
      expect(result.classification).toBeDefined();
      expect(result.decision).toBeDefined();
      expect(result.extraction).toBeDefined();
      expect(result.topic).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should go directly to archive for old regular emails', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
      });

      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000), // ~13 months ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.currentStep).toBe('archive');
      expect(result.extraction).toBeNull();
      expect(result.topic).toBeNull();
    });

    it('should go directly to delete for old promotional emails', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'promotional', confidence: 0.9 },
      });

      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 2 months ago
      });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.currentStep).toBe('delete');
      expect(result.labels).toContain('TuskerBrain/Deleted');
    });
  });
});
