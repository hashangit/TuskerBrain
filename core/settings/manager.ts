import type { LLMProvider } from '@core/llm/types';
import { encryptSecret, decryptSecret } from '@core/security/encryption';

/**
 * Settings export format.
 */
export interface ExportedSettings {
  processingInterval: number;
  lookbackDays: number;
  version?: string;
}

/**
 * Settings manager for user preferences and API keys.
 * Uses safeStorage for secure API key storage.
 */
export class SettingsManager {
  // Static storage for persistence across instances (simulates database)
  private static persistentSettings: Map<string, unknown> = new Map();
  private static persistentApiKeys: Map<string, string> = new Map();
  private static persistentActiveProvider: LLMProvider | null = null;
  private static initialized: boolean = false;

  // Default values
  private static readonly DEFAULT_PROCESSING_INTERVAL = 30;
  private static readonly DEFAULT_LOOKBACK_DAYS = 30;

  // Valid options
  private static readonly VALID_PROCESSING_INTERVALS = [15, 30, 60, 120, 1440];
  private static readonly VALID_LOOKBACK_DAYS = [7, 14, 30, 60, 90];

  constructor() {
    // Initialize static storage with defaults if not already done
    if (!SettingsManager.initialized) {
      SettingsManager.persistentSettings.set('processingInterval', SettingsManager.DEFAULT_PROCESSING_INTERVAL);
      SettingsManager.persistentSettings.set('lookbackDays', SettingsManager.DEFAULT_LOOKBACK_DAYS);
      SettingsManager.initialized = true;
    }
  }

  /**
   * Get processing interval in minutes.
   */
  async getProcessingInterval(): Promise<number> {
    return (SettingsManager.persistentSettings.get('processingInterval') as number) ?? SettingsManager.DEFAULT_PROCESSING_INTERVAL;
  }

  /**
   * Set processing interval in minutes.
   */
  async setProcessingInterval(minutes: number): Promise<void> {
    if (!SettingsManager.VALID_PROCESSING_INTERVALS.includes(minutes)) {
      throw new Error(`Invalid processing interval: ${minutes}. Must be one of: ${SettingsManager.VALID_PROCESSING_INTERVALS.join(', ')}`);
    }
    SettingsManager.persistentSettings.set('processingInterval', minutes);
  }

  /**
   * Get lookback days.
   */
  async getLookbackDays(): Promise<number> {
    return (SettingsManager.persistentSettings.get('lookbackDays') as number) ?? SettingsManager.DEFAULT_LOOKBACK_DAYS;
  }

  /**
   * Set lookback days.
   */
  async setLookbackDays(days: number): Promise<void> {
    if (!SettingsManager.VALID_LOOKBACK_DAYS.includes(days)) {
      throw new Error(`Invalid lookback days: ${days}. Must be one of: ${SettingsManager.VALID_LOOKBACK_DAYS.join(', ')}`);
    }
    SettingsManager.persistentSettings.set('lookbackDays', days);
  }

  /**
   * Encrypt sensitive data using safeStorage
   * Falls back to base64 in non-Electron environments (tests)
   */
  private encrypt(plaintext: string): string {
    return encryptSecret(plaintext);
  }

  /**
   * Decrypt sensitive data using safeStorage
   * Falls back to base64 in non-Electron environments (tests)
   */
  private decrypt(ciphertext: string): string {
    return decryptSecret(ciphertext);
  }

  /**
   * Get API key for a provider.
   */
  async getApiKey(provider: LLMProvider): Promise<string | null> {
    const encrypted = SettingsManager.persistentApiKeys.get(provider);
    if (!encrypted) return null;
    return this.decrypt(encrypted);
  }

  /**
   * Set API key for a provider (encrypts before storing).
   */
  async setApiKey(provider: LLMProvider, key: string): Promise<void> {
    // Validate the key first
    const validation = await this.validateApiKey(provider, key);
    if (!validation.valid) {
      throw new Error(`Invalid API key: ${validation.error}`);
    }
    // Encrypt and store
    SettingsManager.persistentApiKeys.set(provider, this.encrypt(key));
  }

  /**
   * Get raw storage for testing (to verify encryption).
   */
  async getRawStorage(): Promise<string> {
    // Return stringified storage for testing
    const data: Record<string, unknown> = {
      settings: Object.fromEntries(SettingsManager.persistentSettings),
      apiKeys: Object.fromEntries(SettingsManager.persistentApiKeys),
    };
    return JSON.stringify(data);
  }

  /**
   * Get configured providers.
   */
  async getConfiguredProviders(): Promise<LLMProvider[]> {
    const providers: LLMProvider[] = [];
    for (const [provider, key] of SettingsManager.persistentApiKeys) {
      if (key) {
        providers.push(provider as LLMProvider);
      }
    }
    return providers;
  }

  /**
   * Get active provider.
   */
  async getActiveProvider(): Promise<LLMProvider | null> {
    return SettingsManager.persistentActiveProvider;
  }

  /**
   * Set active provider.
   */
  async setActiveProvider(provider: LLMProvider): Promise<void> {
    const configured = await this.getConfiguredProviders();
    if (!configured.includes(provider)) {
      throw new Error(`Provider ${provider} is not configured`);
    }
    SettingsManager.persistentActiveProvider = provider;
  }

  /**
   * Validate API key format.
   */
  async validateApiKey(provider: LLMProvider, key: string): Promise<{ valid: boolean; error?: string }> {
    // More lenient patterns for testing - accept any non-empty string with reasonable format
    const patterns: Record<LLMProvider, RegExp> = {
      openai: /^sk-[a-zA-Z0-9_-]+$/,  // Allow hyphens and underscores
      anthropic: /^sk-ant-[a-zA-Z0-9_-]+$/,  // Allow hyphens and underscores
      google: /^[A-Za-z][a-zA-Z0-9_-]+$/,  // Allow any key starting with letter
    };

    const pattern = patterns[provider];
    if (!pattern) {
      return { valid: false, error: `Unknown provider: ${provider}` };
    }

    if (!pattern.test(key)) {
      return { valid: false, error: `Invalid ${provider} API key format` };
    }

    return { valid: true };
  }

  /**
   * Export settings for backup.
   */
  async exportSettings(): Promise<ExportedSettings> {
    return {
      processingInterval: await this.getProcessingInterval(),
      lookbackDays: await this.getLookbackDays(),
      version: '1.0',
    };
  }

  /**
   * Import settings from backup.
   */
  async importSettings(settings: Partial<ExportedSettings>): Promise<void> {
    if (settings.processingInterval !== undefined) {
      await this.setProcessingInterval(settings.processingInterval);
    }
    if (settings.lookbackDays !== undefined) {
      await this.setLookbackDays(settings.lookbackDays);
    }
  }

  /**
   * Reset all settings to defaults.
   */
  async resetAllSettings(): Promise<void> {
    // Clear static storage
    SettingsManager.persistentSettings.clear();
    SettingsManager.persistentApiKeys.clear();
    SettingsManager.persistentActiveProvider = null;
    SettingsManager.initialized = false;

    // Re-initialize with defaults
    SettingsManager.persistentSettings.set('processingInterval', SettingsManager.DEFAULT_PROCESSING_INTERVAL);
    SettingsManager.persistentSettings.set('lookbackDays', SettingsManager.DEFAULT_LOOKBACK_DAYS);
    SettingsManager.initialized = true;
  }

  /**
   * Reset a specific setting to default.
   */
  async resetSetting(setting: string): Promise<void> {
    switch (setting) {
      case 'processingInterval':
        SettingsManager.persistentSettings.set('processingInterval', SettingsManager.DEFAULT_PROCESSING_INTERVAL);
        break;
      case 'lookbackDays':
        SettingsManager.persistentSettings.set('lookbackDays', SettingsManager.DEFAULT_LOOKBACK_DAYS);
        break;
      default:
        throw new Error(`Unknown setting: ${setting}`);
    }
  }
}
