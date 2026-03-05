import { describe, it, expect, beforeEach } from 'vitest';
import { LLMProvider, createLLMProvider, getAvailableProviders } from '@core/llm/provider';

describe('LLM Provider', () => {
  describe('Provider Creation', () => {
    it('should create OpenAI provider', async () => {
      const provider = createLLMProvider({
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY || 'test-key',
        model: 'gpt-4o-mini',
      });

      expect(provider).toBeDefined();
      expect(provider.name).toBe('openai');
    });

    it('should create Anthropic provider', async () => {
      const provider = createLLMProvider({
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
        model: 'claude-3-5-haiku-latest',
      });

      expect(provider).toBeDefined();
      expect(provider.name).toBe('anthropic');
    });

    it('should create Google provider', async () => {
      const provider = createLLMProvider({
        provider: 'google',
        apiKey: process.env.GOOGLE_AI_API_KEY || 'test-key',
        model: 'gemini-2.0-flash',
      });

      expect(provider).toBeDefined();
      expect(provider.name).toBe('google');
    });
  });

  describe('Text Generation', () => {
    it('should generate text with Anthropic provider', async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        return; // Skip if no API key
      }

      const provider = createLLMProvider({
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-3-5-haiku-latest',
      });

      const response = await provider.generateText('Say "hello" and nothing else.');

      expect(response.text).toBeDefined();
      expect(response.text.toLowerCase()).toContain('hello');
      expect(response.usage).toBeDefined();
      expect(response.usage.promptTokens).toBeGreaterThan(0);
      expect(response.usage.completionTokens).toBeGreaterThan(0);
    });

    it('should generate text with OpenAI provider', async () => {
      if (!process.env.OPENAI_API_KEY) {
        return; // Skip if no API key
      }

      const provider = createLLMProvider({
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4o-mini',
      });

      const response = await provider.generateText('Say "hello" and nothing else.');

      expect(response.text).toBeDefined();
      expect(response.text.toLowerCase()).toContain('hello');
    });
  });

  describe('Available Providers', () => {
    it('should list available providers', () => {
      const providers = getAvailableProviders();

      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('google');
    });
  });
});
