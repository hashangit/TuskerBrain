import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmailWithWorkflow, createEmailProcessingWorkflow } from '@core/workflows/langgraph-workflow';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';

// Mock LLM Provider
function createMockLLMProvider(responses: {
  classification?: { type: 'regular' | 'updates' | 'social' | 'promotional'; confidence: number; reason?: string };
  update?: object;
  deal?: object;
  topic?: { parent: string; child: string; confidence: number };
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
      if (prompt.includes('Assign a topic label to this email')) {
        return responses.topic ?? {
          parent: 'General',
          child: 'Test',
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
    it('should classify a regular email correctly via LLM', async () => {
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

    it('should classify a promotional email correctly via LLM', async () => {
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

    it('should classify a social email correctly via LLM', async () => {
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

    it('should classify an updates email correctly via LLM', async () => {
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

    it('should short-circuit with gmailCategory=promotions as promotional (0.95)', async () => {
      const mockProvider = createMockLLMProvider({});
      const email = createTestEmail({ gmailCategory: 'promotions' });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification?.type).toBe('promotional');
      expect(result.classification?.confidence).toBe(0.95);
      expect(result.classification?.reason).toContain('promotions');
    });

    it('should short-circuit with gmailCategory=social as social (0.95)', async () => {
      const mockProvider = createMockLLMProvider({});
      const email = createTestEmail({ gmailCategory: 'social' });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification?.type).toBe('social');
      expect(result.classification?.confidence).toBe(0.95);
    });

    it('should short-circuit with gmailCategory=updates as updates (0.95)', async () => {
      const mockProvider = createMockLLMProvider({});
      const email = createTestEmail({ gmailCategory: 'updates' });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification?.type).toBe('updates');
      expect(result.classification?.confidence).toBe(0.95);
    });

    it('should short-circuit with gmailCategory=forums as updates (0.85)', async () => {
      const mockProvider = createMockLLMProvider({});
      const email = createTestEmail({ gmailCategory: 'forums' });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification?.type).toBe('updates');
      expect(result.classification?.confidence).toBe(0.85);
    });

    it('should short-circuit with gmailCategory=primary as regular (0.85)', async () => {
      const mockProvider = createMockLLMProvider({});
      const email = createTestEmail({ gmailCategory: 'primary' });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification?.type).toBe('regular');
      expect(result.classification?.confidence).toBe(0.85);
    });

    it('should fall through to LLM when gmailCategory is unrecognized', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.7, reason: 'LLM classified' },
      });
      const email = createTestEmail({ gmailCategory: 'some_new_category' });

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.classification?.type).toBe('regular');
      expect(result.classification?.confidence).toBe(0.7);
      expect(result.classification?.reason).toBe('LLM classified');
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
    it('should label emails with appropriate topics using new schema', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'updates', confidence: 0.9 },
        topic: {
          parent: 'Banking',
          child: 'Chase',
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
      expect(result.topic?.confidence).toBe(0.9);
    });

    it('should generate two Gmail labels: TB/{Parent} and TB/{Parent}/{Child}', async () => {
      const mockProvider = createMockLLMProvider({
        classification: { type: 'regular', confidence: 0.9 },
        topic: {
          parent: 'Work',
          child: 'Projects',
          confidence: 0.85,
        },
      });

      const email = createTestEmail();

      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.labels).toBeDefined();
      expect(result.labels).toContain('TB/Work');
      expect(result.labels).toContain('TB/Work/Projects');
      expect(result.labels).toContain('TB/Processed');
    });

    it('should retry on labeling failure and succeed on second attempt', async () => {
      let callCount = 0;
      const mockProvider: LLMProvider = {
        name: 'openai',
        model: 'gpt-4o-mini',
        generateText: vi.fn().mockResolvedValue({
          text: 'Test summary',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
        generateObject: vi.fn().mockImplementation(async (prompt: string) => {
          if (prompt.includes('Classify this email')) {
            return { type: 'regular', confidence: 0.9 };
          }
          if (prompt.includes('Extract key information')) {
            return { title: 'Test', description: 'Test', priority: 'medium' };
          }
          if (prompt.includes('Assign a topic label to this email')) {
            callCount++;
            if (callCount === 1) {
              const err = new Error('Rate limit exceeded');
              (err as any).status = 429;
              throw err;
            }
            return { parent: 'Work', child: 'Projects', confidence: 0.8 };
          }
          return {};
        }),
      };

      const email = createTestEmail();
      const result = await processEmailWithWorkflow(email, mockProvider);

      // Should have retried and succeeded
      expect(result.topic).toBeDefined();
      expect(result.topic?.parent).toBe('Work');
      expect(result.topic?.child).toBe('Projects');
      expect(result.labels).toContain('TB/Work');
      expect(result.labels).toContain('TB/Work/Projects');
    });

    it('should return topic null and TB/Processed only after exhausting retries', async () => {
      const mockProvider: LLMProvider = {
        name: 'openai',
        model: 'gpt-4o-mini',
        generateText: vi.fn().mockResolvedValue({
          text: 'Test summary',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        }),
        generateObject: vi.fn().mockImplementation(async (prompt: string) => {
          if (prompt.includes('Classify this email')) {
            return { type: 'regular', confidence: 0.9 };
          }
          if (prompt.includes('Extract key information')) {
            return { title: 'Test', description: 'Test', priority: 'medium' };
          }
          if (prompt.includes('Assign a topic label to this email')) {
            const err = new Error('Rate limit exceeded');
            (err as any).status = 429;
            throw err;
          }
          return {};
        }),
      };

      const email = createTestEmail();
      const result = await processEmailWithWorkflow(email, mockProvider);

      expect(result.topic).toBeNull();
      expect(result.labels).toContain('TB/Processed');
      expect(result.labels).not.toContain(expect.stringMatching(/^TB\/[^P]/));
      expect(result.error).toContain('Rate limit exceeded');
      expect(result.isRetryableError).toBe(true);
    }, 15000);
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
          parent: 'General',
          child: 'Test',
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
      expect(result.labels).toContain('TB/Deleted');
    });
  });
});
