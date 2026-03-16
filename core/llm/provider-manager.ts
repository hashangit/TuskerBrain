import { SettingsManager } from '@core/settings/manager';
import { createLLMProvider, getAvailableProviders, getDefaultModel, type ProviderName, type LLMProvider } from './provider';

/**
 * LLM Provider Manager handles provider configuration and validation.
 */
export interface ProviderInfo {
  id: ProviderName;
  name: string;
  isConfigured: boolean;
  isValid: boolean;
  lastValidated?: Date;
}

export interface ValidationResult {
  isValid: boolean;
  models?: string[];
  error?: string;
}

export interface TestResult {
  response: string;
  tokensUsed: number;
  error?: string;
}

/**
 * LLMProviderManager manages LLM provider configuration and validation.
 */
export class LLMProviderManager {
  private settingsManager: SettingsManager;
  private providers: Map<ProviderName, LLMProvider> = new Map();
  private validationCache: Map<ProviderName, { isValid: boolean; timestamp: number }> = new Map();
  private static readonly VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(settingsManager?: SettingsManager) {
    this.settingsManager = settingsManager ?? new SettingsManager();
  }

  /**
   * List all available providers with their configuration status.
   */
  async listProviders(): Promise<ProviderInfo[]> {
    const availableProviders = getAvailableProviders();
    const configuredProviders = await this.settingsManager.getConfiguredProviders();
    const activeProvider = await this.settingsManager.getActiveProvider();

    return availableProviders.map(id => {
      const isConfigured = configuredProviders.includes(id);
      const cached = this.validationCache.get(id);
      const isValid = cached
        ? cached.isValid && (Date.now() - cached.timestamp) < LLMProviderManager.VALIDATION_CACHE_TTL
        : false;

      return {
        id,
        name: this.getProviderDisplayName(id),
        isConfigured,
        isValid,
      };
    });
  }

  /**
   * Set the API key for a provider.
   */
  async setProvider(providerId: ProviderName, apiKey: string): Promise<void> {
    // Validate format first
    const validation = await this.settingsManager.validateApiKey(providerId, apiKey);
    if (!validation.valid) {
      throw new Error(validation.error ?? 'Invalid API key format');
    }

    // Store the API key (encrypted)
    await this.settingsManager.setApiKey(providerId, apiKey);

    // Clear validation cache for this provider
    this.validationCache.delete(providerId);

    // Create provider instance
    const provider = createLLMProvider({
      provider: providerId,
      apiKey,
    });
    this.providers.set(providerId, provider);
  }

  /**
   * Validate a provider's API key by making a test call.
   */
  async validateProvider(providerId: ProviderName): Promise<ValidationResult> {
    const apiKey = await this.settingsManager.getApiKey(providerId);
    if (!apiKey) {
      return {
        isValid: false,
        error: 'No API key configured for this provider',
      };
    }

    try {
      // Create a provider instance for validation
      const provider = createLLMProvider({
        provider: providerId,
        apiKey,
      });

      // Make a minimal test call
      const result = await provider.generateText('Say "OK" and nothing else.');

      // Cache the successful validation
      this.validationCache.set(providerId, {
        isValid: true,
        timestamp: Date.now(),
      });

      return {
        isValid: true,
        models: [getDefaultModel(providerId)],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Cache the failed validation
      this.validationCache.set(providerId, {
        isValid: false,
        timestamp: Date.now(),
      });

      return {
        isValid: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Test a provider with a custom prompt.
   */
  async testProvider(providerId: ProviderName, prompt?: string): Promise<TestResult> {
    const apiKey = await this.settingsManager.getApiKey(providerId);
    if (!apiKey) {
      return {
        response: '',
        tokensUsed: 0,
        error: 'No API key configured for this provider',
      };
    }

    try {
      const provider = createLLMProvider({
        provider: providerId,
        apiKey,
      });

      const testPrompt = prompt ?? 'Hello, can you confirm you are working?';
      const result = await provider.generateText(testPrompt);

      return {
        response: result.text,
        tokensUsed: result.usage.totalTokens,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        response: '',
        tokensUsed: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the active provider instance.
   */
  async getActiveProvider(): Promise<LLMProvider | null> {
    const activeId = await this.settingsManager.getActiveProvider();
    if (!activeId) {
      return null;
    }

    // Check if we have a cached instance
    let provider = this.providers.get(activeId);
    if (provider) {
      return provider;
    }

    // Create a new instance
    const apiKey = await this.settingsManager.getApiKey(activeId);
    if (!apiKey) {
      return null;
    }

    provider = createLLMProvider({
      provider: activeId,
      apiKey,
    });
    this.providers.set(activeId, provider);
    return provider;
  }

  /**
   * Set the active provider.
   */
  async setActiveProvider(providerId: ProviderName): Promise<void> {
    await this.settingsManager.setActiveProvider(providerId);
  }

  /**
   * Get display name for a provider.
   */
  private getProviderDisplayName(id: ProviderName): string {
    const names: Record<ProviderName, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google AI',
    };
    return names[id] ?? id;
  }
}
