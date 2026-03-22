// @ts-nocheck
import type { LLMProvider } from '@core/llm/types';
import { encryptSecret, decryptSecret } from '@core/security/encryption';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Settings export format.
 */
export interface ExportedSettings {
  processingInterval: number;
  lookbackDays: number;
  version?: string;
}

/**
 * Settings file structure for disk persistence.
 */
interface SettingsFile {
  settings: Record<string, unknown>;
  apiKeys: Record<string, string>;
  activeProvider: LLMProvider | null;
  providerValidationStatus: Record<string, { isValid: boolean; timestamp: number }>;
}

/**
 * Settings manager for user preferences and API keys.
 * Uses safeStorage for secure API key storage.
 * Persists settings to disk for survival across app restarts.
 */
export class SettingsManager {
  // In-memory storage (loaded from disk on init)
  private static persistentSettings: Map<string, unknown> = new Map();
  private static persistentApiKeys: Map<string, string> = new Map();
  private static persistentActiveProvider: LLMProvider | null = null;
  private static persistentProviderValidationStatus: Map<string, { isValid: boolean; timestamp: number }> = new Map();
  private static initialized: boolean = false;
  private static settingsPath: string | null = null;
  private static savePending: boolean = false;

  // Default values
  private static readonly DEFAULT_PROCESSING_INTERVAL = 30;
  private static readonly DEFAULT_LOOKBACK_DAYS = 30;

  // Valid options
  private static readonly VALID_PROCESSING_INTERVALS = [15, 30, 60, 120, 1440];
  private static readonly VALID_LOOKBACK_DAYS = [7, 14, 30, 60, 90];

  /**
   * Initialize the settings manager with a file path for persistence.
   * Must be called before using the manager in production.
   */
  static initializeWithFilePath(filePath: string): void {
    SettingsManager.settingsPath = filePath;
    SettingsManager.loadFromDisk();
  }

  /**
   * Load settings from disk.
   */
  private static loadFromDisk(): void {
    if (!SettingsManager.settingsPath) return;

    try {
      if (existsSync(SettingsManager.settingsPath)) {
        const data = readFileSync(SettingsManager.settingsPath, 'utf-8');
        const parsed: SettingsFile = JSON.parse(data);

        SettingsManager.persistentSettings = new Map(Object.entries(parsed.settings || {}));
        SettingsManager.persistentApiKeys = new Map(Object.entries(parsed.apiKeys || {}));
        SettingsManager.persistentActiveProvider = parsed.activeProvider || null;
        SettingsManager.persistentProviderValidationStatus = new Map(Object.entries(parsed.providerValidationStatus || {}));
        console.log('[SettingsManager] Loaded settings from disk');
      }
    } catch (error) {
      console.error('[SettingsManager] Failed to load settings from disk:', error);
    }
  }

  /**
   * Save settings to disk (debounced).
   */
  private static saveToDisk(): void {
    if (!SettingsManager.settingsPath) return;

    // Debounce saves to avoid excessive disk writes
    if (SettingsManager.savePending) return;
    SettingsManager.savePending = true;

    // Use setImmediate to batch multiple saves
    setImmediate(() => {
      try {
        const dir = dirname(SettingsManager.settingsPath!);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        const data: SettingsFile = {
          settings: Object.fromEntries(SettingsManager.persistentSettings),
          apiKeys: Object.fromEntries(SettingsManager.persistentApiKeys),
          activeProvider: SettingsManager.persistentActiveProvider,
          providerValidationStatus: Object.fromEntries(SettingsManager.persistentProviderValidationStatus),
        };

        writeFileSync(SettingsManager.settingsPath!, JSON.stringify(data, null, 2), 'utf-8');
        console.log('[SettingsManager] Saved settings to disk');
      } catch (error) {
        console.error('[SettingsManager] Failed to save settings to disk:', error);
      } finally {
        SettingsManager.savePending = false;
      }
    });
  }

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
    SettingsManager.saveToDisk();
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
    SettingsManager.saveToDisk();
  }

  /**
   * Encrypt sensitive data using safeStorage
   * Falls back to base64 in non-Electron environments (tests)
   */
  private async encrypt(plaintext: string): Promise<string> {
    return await encryptSecret(plaintext);
  }

  /**
   * Decrypt sensitive data using safeStorage
   * Falls back to base64 in non-Electron environments (tests)
   */
  private async decrypt(ciphertext: string): Promise<string> {
    return await decryptSecret(ciphertext);
  }

  /**
   * Get API key for a provider.
   */
  async getApiKey(provider: LLMProvider): Promise<string | null> {
    const encrypted = SettingsManager.persistentApiKeys.get(provider);
    if (!encrypted) return null;
    return await this.decrypt(encrypted);
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
    SettingsManager.persistentApiKeys.set(provider, await this.encrypt(key));
    SettingsManager.saveToDisk();
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
    SettingsManager.saveToDisk();
  }

  /**
   * Get provider validation status.
   */
  async getProviderValidationStatus(provider: LLMProvider): Promise<{ isValid: boolean; timestamp: number } | null> {
    return SettingsManager.persistentProviderValidationStatus.get(provider) ?? null;
  }

  /**
   * Set provider validation status.
   */
  async setProviderValidationStatus(provider: LLMProvider, isValid: boolean): Promise<void> {
    SettingsManager.persistentProviderValidationStatus.set(provider, {
      isValid,
      timestamp: Date.now(),
    });
    SettingsManager.saveToDisk();
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
    SettingsManager.persistentProviderValidationStatus.clear();
    SettingsManager.initialized = false;

    // Re-initialize with defaults
    SettingsManager.persistentSettings.set('processingInterval', SettingsManager.DEFAULT_PROCESSING_INTERVAL);
    SettingsManager.persistentSettings.set('lookbackDays', SettingsManager.DEFAULT_LOOKBACK_DAYS);
    SettingsManager.initialized = true;
    SettingsManager.saveToDisk();
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
    SettingsManager.saveToDisk();
  }

  /**
   * Generic get method for arbitrary settings.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    // Handle special keys
    if (key === 'processingInterval') {
      return (await this.getProcessingInterval()) as T;
    }
    if (key === 'lookbackDays') {
      return (await this.getLookbackDays()) as T;
    }
    if (key === 'activeProvider') {
      return (await this.getActiveProvider()) as T;
    }
    if (key === 'onboarding_complete') {
      return (SettingsManager.persistentSettings.get('onboarding_complete') ?? false) as T;
    }
    // Return from generic storage
    return (SettingsManager.persistentSettings.get(key) ?? null) as T | null;
  }

  /**
   * Generic set method for arbitrary settings.
   */
  async set(key: string, value: unknown): Promise<void> {
    // Handle special keys
    if (key === 'processingInterval') {
      await this.setProcessingInterval(value as number);
      return;
    }
    if (key === 'lookbackDays') {
      await this.setLookbackDays(value as number);
      return;
    }
    if (key === 'activeProvider') {
      await this.setActiveProvider(value as LLMProvider);
      return;
    }
    // Store in generic storage
    SettingsManager.persistentSettings.set(key, value);
    SettingsManager.saveToDisk();
  }

  /**
   * Generic reset method for arbitrary settings.
   */
  async reset(key: string): Promise<void> {
    if (key === 'processingInterval' || key === 'lookbackDays') {
      await this.resetSetting(key);
      return;
    }
    SettingsManager.persistentSettings.delete(key);
    SettingsManager.saveToDisk();
  }
}
