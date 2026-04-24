/**
 * Centralized model configuration for all LLM providers.
 * This is the single source of truth for available models.
 *
 * Models are organized by tier: Low (fast/cheap), Medium (balanced), High (capable)
 *
 * IMPORTANT: Update this file when new models become available.
 * Last updated: 2025-06-18
 */

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'google';

export type ModelTier = 'low' | 'medium' | 'high';

export interface ModelConfig {
  id: string;
  name: string;
  tier: ModelTier;
  description: string;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  placeholder: string;
  models: ModelConfig[];
  defaultTier: ModelTier;
}

/**
 * LLM Provider configurations with their available models organized by tier.
 */
export const LLM_PROVIDERS: ProviderConfig[] = [
  // Anthropic (Claude)
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    defaultTier: 'medium',
    models: [
      {
        id: 'claude-haiku-4-5',
        name: 'Haiku 4.5',
        tier: 'low',
        description: 'Fastest, most cost-effective for simple tasks',
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Sonnet 4.6',
        tier: 'medium',
        description: 'Optimal balance for intelligence, speed, and cost',
      },
      {
        id: 'claude-opus-4-6',
        name: 'Opus 4.6',
        tier: 'high',
        description: 'Most intelligent for agents and long-horizon coding',
      },
    ],
  },

  // OpenAI
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    placeholder: 'sk-...',
    defaultTier: 'medium',
    models: [
      {
        id: 'gpt-5.1-nano',
        name: 'GPT-5.1 nano',
        tier: 'low',
        description: 'Efficient for chatbots and data analysis',
      },
      {
        id: 'gpt-5.4-mini',
        name: 'GPT-5.4 mini',
        tier: 'medium',
        description: 'Strong reasoning at lower cost/speed',
      },
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        tier: 'high',
        description: 'Best for complex software and research',
      },
    ],
  },

  // Google (Gemini)
  {
    id: 'google',
    name: 'Google (Gemini)',
    placeholder: 'AIza...',
    defaultTier: 'medium',
    models: [
      {
        id: 'gemini-3.1-flash-lite-preview',
        name: 'Gemini 3.1 Flash Lite',
        tier: 'low',
        description: '2.5x faster TTFT, $0.25/MTok',
      },
      {
        id: 'gemini-3-flash-preview',
        name: 'Gemini 3 Flash',
        tier: 'medium',
        description: 'Balanced speed and capability',
      },
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro',
        tier: 'high',
        description: 'Stronger reasoning than prior versions',
      },
    ],
  },
];

// Convenience maps
export const AVAILABLE_MODELS: Record<ProviderId, ModelConfig[]> = {
  anthropic: LLM_PROVIDERS.find(p => p.id === 'anthropic')!.models,
  openai: LLM_PROVIDERS.find(p => p.id === 'openai')!.models,
  google: LLM_PROVIDERS.find(p => p.id === 'google')!.models,
};

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: LLM_PROVIDERS.find(p => p.id === 'anthropic')!.models.find(m => m.tier === 'medium')!.id,
  openai: LLM_PROVIDERS.find(p => p.id === 'openai')!.models.find(m => m.tier === 'medium')!.id,
  google: LLM_PROVIDERS.find(p => p.id === 'google')!.models.find(m => m.tier === 'medium')!.id,
};

// Helper functions
export function getProviderConfig(providerId: ProviderId): ProviderConfig | undefined {
  return LLM_PROVIDERS.find(p => p.id === providerId);
}

export function getDefaultModel(providerId: ProviderId): string {
  return DEFAULT_MODELS[providerId];
}

export function getAvailableModels(providerId: ProviderId): ModelConfig[] {
  return AVAILABLE_MODELS[providerId] || [];
}

export function getModelById(providerId: ProviderId, modelId: string): ModelConfig | undefined {
  return AVAILABLE_MODELS[providerId]?.find(m => m.id === modelId);
}

export function getModelsByTier(providerId: ProviderId, tier: ModelTier): ModelConfig[] {
  return AVAILABLE_MODELS[providerId]?.filter(m => m.tier === tier) || [];
}

// Get all provider IDs
export function getProviderIds(): ProviderId[] {
  return LLM_PROVIDERS.map(p => p.id);
}
