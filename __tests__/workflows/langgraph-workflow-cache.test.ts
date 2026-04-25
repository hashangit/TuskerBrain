import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email } from '@core/types/email';
import type { LLMProvider } from '@core/llm/provider';

const compileMock = vi.hoisted(() =>
  vi.fn(() => ({
    invoke: vi.fn(async (state: Record<string, unknown>) => ({
      ...state,
      currentStep: 'summarize',
    })),
  }))
);

vi.mock('@langchain/langgraph', () => {
  const Annotation = Object.assign(vi.fn(() => ({})), {
    Root: vi.fn(() => ({})),
  });

  const StateGraph = vi.fn(function StateGraph() {
    const graph = {
      addNode: vi.fn(() => graph),
      addEdge: vi.fn(() => graph),
      addConditionalEdges: vi.fn(() => graph),
      compile: compileMock,
    };
    return graph;
  });

  return {
    Annotation,
    END: '__end__',
    START: '__start__',
    StateGraph,
  };
});

import { processEmailWithWorkflow, type TopicLoader } from '@core/workflows/langgraph-workflow';

function createTestEmail(id: string): Email {
  return {
    id,
    threadId: 'thread-1',
    senderEmail: 'test@example.com',
    senderName: 'Test Sender',
    senderDomain: 'example.com',
    subject: 'Test Subject',
    snippet: 'Test snippet content',
    receivedAt: new Date(),
  };
}

function createMockLLMProvider(): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn(),
    generateObject: vi.fn(),
  };
}

describe('LangGraph workflow cache', () => {
  beforeEach(() => {
    compileMock.mockClear();
  });

  it('reuses the compiled workflow for the same provider and topic loader', async () => {
    const llmProvider = createMockLLMProvider();
    const topicLoader: TopicLoader = vi.fn().mockResolvedValue([]);

    await processEmailWithWorkflow(createTestEmail('email-1'), llmProvider, topicLoader);
    await processEmailWithWorkflow(createTestEmail('email-2'), llmProvider, topicLoader);

    expect(compileMock).toHaveBeenCalledTimes(1);
  });
});
