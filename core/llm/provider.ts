// @ts-nocheck
import { generateText, generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ZodSchema } from 'zod';

export type ProviderName = 'openai' | 'anthropic' | 'google';

export interface LLMConfig {
  provider: ProviderName;
  apiKey: string;
  model?: string;
}

export interface GenerateTextResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  name: ProviderName;
  model: string;
  generateText(prompt: string, systemPrompt?: string): Promise<GenerateTextResult>;
  generateObject<T>(prompt: string, schema: ZodSchema<T>, systemPrompt?: string): Promise<T>;
}

/**
 * Default models for each provider.
 * IMPORTANT: Keep in sync with src/config/models.ts
 */
const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: 'gpt-5.1',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-3-flash-preview',
};

/**
 * Available models for each provider.
 * IMPORTANT: Keep in sync with src/config/models.ts
 */
export const AVAILABLE_MODELS: Record<ProviderName, string[]> = {
  openai: ['gpt-5.1-mini', 'gpt-5.1', 'gpt-5-pro'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'],
  google: ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'],
};

export function createLLMProvider(config: LLMConfig): LLMProvider {
  const model = config.model || DEFAULT_MODELS[config.provider];

  switch (config.provider) {
    case 'openai':
      return createOpenAIProvider(config.apiKey, model);
    case 'anthropic':
      return createAnthropicProvider(config.apiKey, model);
    case 'google':
      return createGoogleProvider(config.apiKey, model);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

function createOpenAIProvider(apiKey: string, modelId: string): LLMProvider {
  const client = createOpenAI({ apiKey });
  const model = client(modelId);

  return {
    name: 'openai',
    model: modelId,

    async generateText(prompt: string, systemPrompt?: string): Promise<GenerateTextResult> {
      const result = await generateText({
        model,
        prompt,
        system: systemPrompt,
      });

      return {
        text: result.text,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    },

    async generateObject<T>(prompt: string, schema: ZodSchema<T>, systemPrompt?: string): Promise<T> {
      const { object: result } = await generateObject({
        model,
        prompt,
        schema,
        system: systemPrompt,
      });
      return result;
    },
  };
}

function createAnthropicProvider(apiKey: string, modelId: string): LLMProvider {
  const client = createAnthropic({ apiKey });
  const model = client(modelId);

  return {
    name: 'anthropic',
    model: modelId,

    async generateText(prompt: string, systemPrompt?: string): Promise<GenerateTextResult> {
      const result = await generateText({
        model,
        prompt,
        system: systemPrompt,
      });

      return {
        text: result.text,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    },

    async generateObject<T>(prompt: string, schema: ZodSchema<T>, systemPrompt?: string): Promise<T> {
      const { object: result } = await generateObject({
        model,
        prompt,
        schema,
        system: systemPrompt,
      });
      return result;
    },
  };
}

function createGoogleProvider(apiKey: string, modelId: string): LLMProvider {
  const client = createGoogleGenerativeAI({ apiKey });
  const model = client(modelId);

  return {
    name: 'google',
    model: modelId,

    async generateText(prompt: string, systemPrompt?: string): Promise<GenerateTextResult> {
      const result = await generateText({
        model,
        prompt,
        system: systemPrompt,
      });

      return {
        text: result.text,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    },

    async generateObject<T>(prompt: string, schema: ZodSchema<T>, systemPrompt?: string): Promise<T> {
      const { object: result } = await generateObject({
        model,
        prompt,
        schema,
        system: systemPrompt,
      });
      return result;
    },
  };
}

export function getAvailableProviders(): ProviderName[] {
  return ['openai', 'anthropic', 'google'];
}

export function getDefaultModel(provider: ProviderName): string {
  return DEFAULT_MODELS[provider];
}
