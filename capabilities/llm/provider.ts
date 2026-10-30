import {
  createChatModel,
  completeText,
  completeObject,
} from '@vendors/ai-sdk';
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
  return createProvider(config.provider, config.apiKey, model);
}

/**
 * Build an LLMProvider on top of the vendors/ai-sdk wrapper.
 * All raw `ai` / `@ai-sdk/*` calls live in the vendors layer.
 */
function createProvider(providerId: ProviderName, apiKey: string, modelId: string): LLMProvider {
  const model = createChatModel(providerId, apiKey, modelId);

  return {
    name: providerId,
    model: modelId,

    async generateText(prompt: string, systemPrompt?: string): Promise<GenerateTextResult> {
      return completeText(model, prompt, systemPrompt);
    },

    async generateObject<T>(prompt: string, schema: ZodSchema<T>, systemPrompt?: string): Promise<T> {
      return completeObject<T>(model, prompt, schema, systemPrompt);
    },
  };
}

export function getAvailableProviders(): ProviderName[] {
  return ['openai', 'anthropic', 'google'];
}

export function getDefaultModel(provider: ProviderName): string {
  return DEFAULT_MODELS[provider];
}
