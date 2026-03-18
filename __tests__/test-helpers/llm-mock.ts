/**
 * LLM Mock - Mock LLM provider responses for testing
 *
 * This provides mock responses for LLM API calls, allowing tests to run
 * without requiring actual API keys or network access.
 */

export interface MockLLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: string;
}

export interface MockLLMConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'zai' | 'openrouter' | 'groq';
  shouldFail?: boolean;
  failureReason?: string;
  latency?: number;
}

/**
 * Mock LLM Provider class for testing
 */
export class MockLLMProvider {
  private config: MockLLMConfig;
  private callHistory: Array<{ prompt: string; response: string; timestamp: Date }> = [];
  private responseOverrides: Map<string, MockLLMResponse> = new Map();

  constructor(config: MockLLMConfig) {
    this.config = config;
  }

  /**
   * Set a custom response for a specific prompt pattern
   */
  setResponseForPrompt(pattern: string, response: MockLLMResponse): void {
    this.responseOverrides.set(pattern, response);
  }

  /**
   * Mock API call - returns simulated LLM response
   */
  async complete(prompt: string): Promise<MockLLMResponse> {
    // Simulate latency if configured
    if (this.config.latency) {
      await new Promise(resolve => setTimeout(resolve, this.config.latency));
    }

    // Simulate failure if configured
    if (this.config.shouldFail) {
      return {
        content: '',
        error: this.config.failureReason || 'API Error',
        usage: { inputTokens: 0, outputTokens: 0 }
      };
    }

    // Check for custom response overrides
    for (const [pattern, response] of this.responseOverrides) {
      if (prompt.includes(pattern)) {
        this.callHistory.push({
          prompt,
          response: response.content,
          timestamp: new Date()
        });
        return response;
      }
    }

    // Generate default mock response based on prompt content
    const response = this.generateDefaultResponse(prompt);

    this.callHistory.push({
      prompt,
      response: response.content,
      timestamp: new Date()
    });

    return response;
  }

  /**
   * Generate default mock responses based on prompt content
   */
  private generateDefaultResponse(prompt: string): MockLLMResponse {
    // Email classification
    if (prompt.includes('classify') || prompt.includes('category')) {
      if (prompt.includes('promotional') || prompt.includes('deal') || prompt.includes('discount')) {
        return {
          content: JSON.stringify({ type: 'promotional', confidence: 0.95 }),
          usage: { inputTokens: 150, outputTokens: 20 }
        };
      }
      if (prompt.includes('social') || prompt.includes('linkedin') || prompt.includes('facebook')) {
        return {
          content: JSON.stringify({ type: 'social', confidence: 0.92 }),
          usage: { inputTokens: 150, outputTokens: 20 }
        };
      }
      if (prompt.includes('update') || prompt.includes('notification') || prompt.includes('alert')) {
        return {
          content: JSON.stringify({ type: 'updates', confidence: 0.88 }),
          usage: { inputTokens: 150, outputTokens: 20 }
        };
      }
      return {
        content: JSON.stringify({ type: 'regular', confidence: 0.90 }),
        usage: { inputTokens: 150, outputTokens: 20 }
      };
    }

    // Topic assignment
    if (prompt.includes('topic') || prompt.includes('assign')) {
      return {
        content: JSON.stringify({
          topic: 'Projects/Client-ABC',
          confidence: 0.85,
          isNewTopic: false
        }),
        usage: { inputTokens: 200, outputTokens: 30 }
      };
    }

    // Deal extraction
    if (prompt.includes('deal') || prompt.includes('extract')) {
      return {
        content: JSON.stringify({
          title: '20% Off Selected Items',
          code: 'SAVE20',
          value: '20%',
          expiryDate: '2024-12-31',
          category: 'General'
        }),
        usage: { inputTokens: 250, outputTokens: 50 }
      };
    }

    // Summary generation
    if (prompt.includes('summary') || prompt.includes('summarize')) {
      return {
        content: 'This is a mock summary of the email content. It provides a high-level overview of the key points and action items.',
        usage: { inputTokens: 500, outputTokens: 100 }
      };
    }

    // Default response
    return {
      content: 'Mock LLM response',
      usage: { inputTokens: 100, outputTokens: 10 }
    };
  }

  /**
   * Get call history for assertions
   */
  getCallHistory(): Array<{ prompt: string; response: string; timestamp: Date }> {
    return [...this.callHistory];
  }

  /**
   * Clear call history
   */
  clearHistory(): void {
    this.callHistory = [];
  }

  /**
   * Get total token usage
   */
  getTotalTokenUsage(): { inputTokens: number; outputTokens: number } {
    return this.callHistory.reduce(
      (acc, _, idx) => {
        // Estimate based on mock responses
        acc.inputTokens += 100;
        acc.outputTokens += 20;
        return acc;
      },
      { inputTokens: 0, outputTokens: 0 }
    );
  }
}

/**
 * Create a mock LLM provider for testing
 */
export function createMockLLM(config: MockLLMConfig = { provider: 'anthropic' }): MockLLMProvider {
  return new MockLLMProvider(config);
}

/**
 * Pre-configured mock for Anthropic-compatible APIs (ZAI, etc.)
 */
export function createAnthropicMock(): MockLLMProvider {
  return createMockLLM({ provider: 'anthropic' });
}

/**
 * Pre-configured mock for OpenAI-compatible APIs (OpenRouter, Groq, etc.)
 */
export function createOpenAIMock(): MockLLMProvider {
  return createMockLLM({ provider: 'openai' });
}

/**
 * Pre-configured mock for Google Gemini
 */
export function createGeminiMock(): MockLLMProvider {
  return createMockLLM({ provider: 'google' });
}

/**
 * Mock that simulates API failures
 */
export function createFailingMock(reason: string = 'API Error'): MockLLMProvider {
  return createMockLLM({
    provider: 'anthropic',
    shouldFail: true,
    failureReason: reason
  });
}

/**
 * Mock with simulated latency
 */
export function createSlowMock(latencyMs: number = 1000): MockLLMProvider {
  return createMockLLM({
    provider: 'anthropic',
    latency: latencyMs
  });
}
