/**
 * Vendors layer: Vercel AI SDK
 *
 * The ONLY place in the codebase allowed to import the raw `ai` and
 * `@ai-sdk/*` packages. Upper layers (domain/capabilities) must perform
 * LLM completions exclusively through this wrapper.
 */
import { generateText, generateObject, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ZodType } from 'zod';

export type { LanguageModel };

/** Identifier of a supported chat model vendor. */
export type ChatProviderId = 'openai' | 'anthropic' | 'google';

/**
 * Construct a chat model handle for the given vendor.
 */
export function createChatModel(
  provider: ChatProviderId,
  apiKey: string,
  modelId: string
): LanguageModel {
  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey })(modelId);
    case 'anthropic':
      return createAnthropic({ apiKey })(modelId);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(modelId);
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unknown chat provider: ${String(exhaustive)}`);
    }
  }
}

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TextCompletionResult {
  text: string;
  usage: CompletionUsage;
}

/**
 * Run a text completion against the given model.
 */
export async function completeText(
  model: LanguageModel,
  prompt: string,
  system?: string
): Promise<TextCompletionResult> {
  const result = await generateText({
    model,
    prompt,
    system,
  });

  return {
    text: result.text,
    usage: {
      promptTokens: result.usage.inputTokens ?? 0,
      completionTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0,
    },
  };
}

/**
 * Run a structured-object completion against the given model.
 */
export async function completeObject<T>(
  model: LanguageModel,
  prompt: string,
  schema: ZodType<T>,
  system?: string
): Promise<T> {
  const { object } = await generateObject({
    model,
    prompt,
    schema,
    system,
  });
  return object;
}
