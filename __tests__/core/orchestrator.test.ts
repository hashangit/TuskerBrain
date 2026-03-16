import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailProcessingOrchestrator, createOrchestrator } from '@core/orchestrator';
import type { JobQueue } from '@core/jobs/queue';
import type { TuskerBrainDatabase } from '../../database';
import type { GmailClient } from '@core/gmail/client';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';
import type { OrchestratorOptions } from '@core/orchestrator';

// Mock factories
function createMockJobQueue(): JobQueue {
  return {
    startProcessing: vi.fn(),
    stopProcessing: vi.fn(),
    addJob: vi.fn(),
    getJob: vi.fn(),
    updateJobStatus: vi.fn(),
  } as unknown as JobQueue;
}

function createMockDatabase(): TuskerBrainDatabase {
  return {} as TuskerBrainDatabase;
}

function createMockGmailClient(): GmailClient {
  return {
    modifyMessage: vi.fn().mockResolvedValue(undefined),
  } as unknown as GmailClient;
}

function createMockLLMProvider(): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockResolvedValue({
      text: 'Test summary content',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    generateObject: vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Classify this email')) {
        return { type: 'regular', confidence: 0.9 };
      }
      if (prompt.includes('Extract deal')) {
        return { dealTitle: 'Test Deal', isActive: true };
      }
      if (prompt.includes('Extract key information')) {
        return { title: 'Test Update', priority: 'medium' };
      }
      if (prompt.includes('topic') || prompt.includes('Determine:')) {
        return { parentTopic: 'General', childTopic: 'Test', fullPath: 'General/Test', confidence: 0.8 };
      }
      return {};
    }),
  } as LLMProvider;
}

function createMockRepositories() {
  return {
    emails: {
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(undefined),
      markProcessed: vi.fn().mockResolvedValue(undefined),
    },
    timeline: {
      create: vi.fn().mockResolvedValue({ id: 'tu_1', title: 'Test Update' }),
    },
    deals: {
      create: vi.fn().mockResolvedValue({ id: 'deal_1', dealTitle: 'Test Deal', brandName: 'Test Brand' }),
    },
    topics: {
      findByFullPath: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'topic_1', name: data.name, fullPath: data.fullPath })),
      linkEmail: vi.fn().mockResolvedValue(undefined),
      incrementEmailCount: vi.fn().mockResolvedValue(undefined),
      getSummary: vi.fn().mockResolvedValue(null),
      updateSummary: vi.fn().mockResolvedValue(undefined),
    },
    summaries: {
      getSenderSummary: vi.fn().mockResolvedValue(null),
      upsertSenderSummary: vi.fn().mockResolvedValue(undefined),
    },
    labels: {
      findByName: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'label_1', name: data.name })),
      linkLabelsToEmail: vi.fn().mockResolvedValue(undefined),
    },
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
    isProcessed: false,
    ...overrides,
  };
}

describe('EmailProcessingOrchestrator', () => {
  let orchestrator: EmailProcessingOrchestrator;
  let mockJobQueue: JobQueue;
  let mockDb: TuskerBrainDatabase;
  let mockGmailClient: GmailClient;
  let mockLLMProvider: LLMProvider;
  let mockRepos: ReturnType<typeof createMockRepositories>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockJobQueue = createMockJobQueue();
    mockDb = createMockDatabase();
    mockGmailClient = createMockGmailClient();
    mockLLMProvider = createMockLLMProvider();
    mockRepos = createMockRepositories();

    orchestrator = createOrchestrator({
      db: mockDb,
      jobQueue: mockJobQueue,
      gmailClient: mockGmailClient,
      llmProvider: mockLLMProvider,
      repositories: mockRepos as unknown as OrchestratorOptions['repositories'],
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop processing', async () => {
      await orchestrator.start();
      expect(mockJobQueue.startProcessing).toHaveBeenCalled();

      await orchestrator.stop();
      expect(mockJobQueue.stopProcessing).toHaveBeenCalled();
    });

    it('should not start twice', async () => {
      await orchestrator.start();
      await orchestrator.start();

      expect(mockJobQueue.startProcessing).toHaveBeenCalledTimes(1);
    });
  });

  describe('Email Processing Pipeline', () => {
    it('should process a regular email through full pipeline', async () => {
      const email = createTestEmail();

      const result = await orchestrator.processEmail(email);

      expect(result.emailId).toBe('test-email-1');
      expect(result.classification).toBeDefined();
      expect(result.classification.type).toBe('regular');
    });

    it('should process a promotional email and extract deal', async () => {
      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'promotional', confidence: 0.95 };
        }
        if (prompt.includes('Extract deal')) {
          return {
            dealTitle: '50% Off',
            brandName: 'Amazon',
            dealCode: 'SAVE50',
            isActive: true,
          };
        }
        return {};
      });

      const email = createTestEmail({
        senderDomain: 'amazon.com',
        subject: '50% Off Today!',
      });

      const result = await orchestrator.processEmail(email);

      expect(result.classification.type).toBe('promotional');
      expect(result.deal).toBeDefined();
    });

    it('should process an update email and extract timeline update', async () => {
      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'updates', confidence: 0.9 };
        }
        if (prompt.includes('Extract key information')) {
          return {
            title: 'Account Statement Ready',
            priority: 'medium',
            actionItem: true,
            actionItemTitle: 'Review statement',
          };
        }
        if (prompt.includes('topic') || prompt.includes('Determine:')) {
          return { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.9 };
        }
        return {};
      });

      const email = createTestEmail({
        senderDomain: 'chase.com',
        subject: 'Your statement is ready',
      });

      const result = await orchestrator.processEmail(email);

      expect(result.classification.type).toBe('updates');
      expect(result.timelineUpdate).toBeDefined();
    });
  });

  describe('Age-based Routing', () => {
    it('should archive old regular emails', async () => {
      const email = createTestEmail({
        receivedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // ~6.5 months ago
      });

      const result = await orchestrator.processEmail(email);

      expect(result.gmailActions.archived).toBe(true);
    });

    it('should delete old promotional emails', async () => {
      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'promotional', confidence: 0.9 };
        }
        return {};
      });

      const email = createTestEmail({
        senderDomain: 'amazon.com',
        receivedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
      });

      const result = await orchestrator.processEmail(email);

      expect(result.gmailActions.deleted).toBe(true);
    });
  });

  describe('Topic Assignment', () => {
    it('should assign topics to processed emails', async () => {
      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'regular', confidence: 0.9 };
        }
        if (prompt.includes('topic') || prompt.includes('Determine:')) {
          return {
            parentTopic: 'Work',
            childTopic: 'Projects',
            fullPath: 'Work/Projects',
            confidence: 0.85,
          };
        }
        return {};
      });

      const email = createTestEmail();
      const result = await orchestrator.processEmail(email);

      expect(result.topics.length).toBeGreaterThan(0);
      expect(result.topics[0].name).toContain('Projects');
    });

    it('should create topics that do not exist', async () => {
      mockRepos.topics.findByFullPath.mockResolvedValue(null);
      mockRepos.topics.create.mockResolvedValue({
        id: 'topic_new',
        name: 'NewTopic',
        fullPath: 'Category/NewTopic',
      });

      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'regular', confidence: 0.9 };
        }
        if (prompt.includes('topic') || prompt.includes('Determine:')) {
          return {
            parentTopic: 'Category',
            childTopic: 'NewTopic',
            fullPath: 'Category/NewTopic',
            confidence: 0.8,
          };
        }
        return {};
      });

      const email = createTestEmail();
      const result = await orchestrator.processEmail(email);

      expect(mockRepos.topics.create).toHaveBeenCalled();
    });
  });

  describe('Gmail Integration', () => {
    it('should apply Gmail labels to processed emails', async () => {
      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'updates', confidence: 0.9 };
        }
        if (prompt.includes('topic') || prompt.includes('Determine:')) {
          return { parentTopic: 'Banking', childTopic: 'Chase', fullPath: 'Banking/Chase', confidence: 0.9 };
        }
        return {};
      });

      const email = createTestEmail({ senderDomain: 'chase.com' });
      await orchestrator.processEmail(email);

      expect(mockGmailClient.modifyMessage).toHaveBeenCalled();
    });

    it('should archive non-regular emails by default', async () => {
      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'promotional', confidence: 0.9 };
        }
        if (prompt.includes('Extract deal')) {
          return { dealTitle: 'Sale', isActive: true };
        }
        return {};
      });

      const email = createTestEmail({ senderDomain: 'amazon.com' });
      const result = await orchestrator.processEmail(email);

      expect(result.gmailActions.archived).toBe(true);
    });

    it('should not archive regular emails', async () => {
      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'regular', confidence: 0.9 };
        }
        if (prompt.includes('topic') || prompt.includes('Determine:')) {
          return { parentTopic: 'General', childTopic: 'Test', fullPath: 'General/Test', confidence: 0.8 };
        }
        return {};
      });

      const email = createTestEmail();
      const result = await orchestrator.processEmail(email);

      expect(result.gmailActions.archived).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM errors gracefully', async () => {
      mockLLMProvider.generateObject = vi.fn().mockRejectedValue(new Error('API error'));

      const email = createTestEmail();

      // Should not throw - should have fallback handling
      const result = await orchestrator.processEmail(email);

      expect(result).toBeDefined();
      expect(result.emailId).toBe('test-email-1');
    });

    it('should handle Gmail API errors gracefully', async () => {
      (mockGmailClient.modifyMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Gmail error'));

      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'regular', confidence: 0.9 };
        }
        if (prompt.includes('topic') || prompt.includes('Determine:')) {
          return { parentTopic: 'General', childTopic: 'Test', fullPath: 'General/Test', confidence: 0.8 };
        }
        return {};
      });

      const email = createTestEmail();

      // Should not throw
      const result = await orchestrator.processEmail(email);

      expect(result).toBeDefined();
    });
  });

  describe('Status Tracking', () => {
    it('should report processing status', async () => {
      const status = orchestrator.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.processed).toBe(0);
    });

    it('should increment processed count', async () => {
      mockLLMProvider.generateObject = vi.fn().mockImplementation(async (prompt: string) => {
        if (prompt.includes('Classify')) {
          return { type: 'regular', confidence: 0.9 };
        }
        if (prompt.includes('topic') || prompt.includes('Determine:')) {
          return { parentTopic: 'General', childTopic: 'Test', fullPath: 'General/Test', confidence: 0.8 };
        }
        return {};
      });

      await orchestrator.processEmail(createTestEmail());
      await orchestrator.processEmail(createTestEmail({ id: 'test-email-2' }));

      const status = orchestrator.getStatus();
      expect(status.processed).toBe(2);
    });
  });
});
