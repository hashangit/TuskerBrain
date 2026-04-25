import type { ProviderName as LLMProvider } from '@core/llm/provider';
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
  activeModels: Record<string, string>;
}

const DEFAULT_PROCESSING_INTERVAL = 30;
const DEFAULT_LOOKBACK_DAYS = 30;
const VALID_PROCESSING_INTERVALS: readonly number[] = [15, 30, 60, 120, 1440];
const VALID_LOOKBACK_DAYS: readonly number[] = [7, 14, 30, 60, 90];

/**
 * In-memory settings state with optional disk persistence.
 */
export class SettingsStore {
  settings: Map<string, unknown> = new Map();
  apiKeys: Map<string, string> = new Map();
  activeProvider: LLMProvider | null = null;
  providerValidationStatus: Map<string, { isValid: boolean; timestamp: number }> = new Map();
  activeModels: Map<string, string> = new Map();

  private settingsPath: string | null = null;
  private savePending = false;

  constructor() {
    this.applyDefaults();
  }

  initializeWithFilePath(filePath: string): void {
    this.settingsPath = filePath;
    this.loadFromDisk();
    this.applyDefaults();
  }

  saveToDisk(): void {
    if (!this.settingsPath) return;

    // Debounce saves to avoid excessive disk writes.
    if (this.savePending) return;
    this.savePending = true;

    setImmediate(() => {
      try {
        const settingsPath = this.settingsPath;
        if (!settingsPath) return;

        const dir = dirname(settingsPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        const data: SettingsFile = {
          settings: Object.fromEntries(this.settings),
          apiKeys: Object.fromEntries(this.apiKeys),
          activeProvider: this.activeProvider,
          providerValidationStatus: Object.fromEntries(this.providerValidationStatus),
          activeModels: Object.fromEntries(this.activeModels),
        };

        writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log('[SettingsManager] Saved settings to disk');
      } catch (error) {
        console.error('[SettingsManager] Failed to save settings to disk:', error);
      } finally {
        this.savePending = false;
      }
    });
  }

  reset(): void {
    this.settings.clear();
    this.apiKeys.clear();
    this.activeProvider = null;
    this.providerValidationStatus.clear();
    this.activeModels.clear();
    this.applyDefaults();
    this.saveToDisk();
  }

  private loadFromDisk(): void {
    if (!this.settingsPath) return;

    try {
      if (!existsSync(this.settingsPath)) return;

      const data = readFileSync(this.settingsPath, 'utf-8');
      const parsed: SettingsFile = JSON.parse(data);

      this.settings = new Map(Object.entries(parsed.settings || {}));
      this.apiKeys = new Map(Object.entries(parsed.apiKeys || {}));
      this.activeProvider = parsed.activeProvider || null;
      this.providerValidationStatus = new Map(Object.entries(parsed.providerValidationStatus || {}));
      this.activeModels = new Map(Object.entries(parsed.activeModels || {}));
      console.log('[SettingsManager] Loaded settings from disk');
    } catch (error) {
      console.error('[SettingsManager] Failed to load settings from disk:', error);
      this.resetInMemory();
    }
  }

  private resetInMemory(): void {
    this.settings.clear();
    this.apiKeys.clear();
    this.activeProvider = null;
    this.providerValidationStatus.clear();
    this.activeModels.clear();
    this.applyDefaults();
  }

  private applyDefaults(): void {
    if (!this.settings.has('processingInterval')) {
      this.settings.set('processingInterval', DEFAULT_PROCESSING_INTERVAL);
    }
    if (!this.settings.has('lookbackDays')) {
      this.settings.set('lookbackDays', DEFAULT_LOOKBACK_DAYS);
    }
  }
}

const defaultSettingsStore = new SettingsStore();

/**
 * Settings manager for user preferences and API keys.
 * Uses safeStorage for secure API key storage.
 * Persists settings to disk for survival across app restarts.
 */
export class SettingsManager {
  constructor(private readonly store: SettingsStore = new SettingsStore()) {}

  /**
   * Initialize the default settings store with a file path for persistence.
   * Must be called before using the manager in production.
   */
  static initializeWithFilePath(filePath: string): void {
    defaultSettingsStore.initializeWithFilePath(filePath);
  }

  /**
   * Get processing interval in minutes.
   */
  async getProcessingInterval(): Promise<number> {
    return (this.store.settings.get('processingInterval') as number) ?? DEFAULT_PROCESSING_INTERVAL;
  }

  /**
   * Set processing interval in minutes.
   */
  async setProcessingInterval(minutes: number): Promise<void> {
    if (!VALID_PROCESSING_INTERVALS.includes(minutes)) {
      throw new Error(`Invalid processing interval: ${minutes}. Must be one of: ${VALID_PROCESSING_INTERVALS.join(', ')}`);
    }
    this.store.settings.set('processingInterval', minutes);
    this.store.saveToDisk();
  }

  /**
   * Get lookback days.
   */
  async getLookbackDays(): Promise<number> {
    return (this.store.settings.get('lookbackDays') as number) ?? DEFAULT_LOOKBACK_DAYS;
  }

  /**
   * Set lookback days.
   */
  async setLookbackDays(days: number): Promise<void> {
    if (!VALID_LOOKBACK_DAYS.includes(days)) {
      throw new Error(`Invalid lookback days: ${days}. Must be one of: ${VALID_LOOKBACK_DAYS.join(', ')}`);
    }
    this.store.settings.set('lookbackDays', days);
    this.store.saveToDisk();
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
    const encrypted = this.store.apiKeys.get(provider);
    if (!encrypted) return null;
    return await this.decrypt(encrypted);
  }

  /**
   * Set API key for a provider (encrypts before storing).
   */
  async setApiKey(provider: LLMProvider, key: string): Promise<void> {
    // Validate the key first.
    const validation = await this.validateApiKey(provider, key);
    if (!validation.valid) {
      throw new Error(`Invalid API key: ${validation.error}`);
    }
    this.store.apiKeys.set(provider, await this.encrypt(key));
    this.store.saveToDisk();
  }

  /**
   * Get raw storage for testing (to verify encryption).
   */
  async getRawStorage(): Promise<string> {
    const data: Record<string, unknown> = {
      settings: Object.fromEntries(this.store.settings),
      apiKeys: Object.fromEntries(this.store.apiKeys),
    };
    return JSON.stringify(data);
  }

  /**
   * Get configured providers.
   */
  async getConfiguredProviders(): Promise<LLMProvider[]> {
    const providers: LLMProvider[] = [];
    for (const [provider, key] of this.store.apiKeys) {
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
    return this.store.activeProvider;
  }

  /**
   * Set active provider.
   */
  async setActiveProvider(provider: LLMProvider): Promise<void> {
    const configured = await this.getConfiguredProviders();
    if (!configured.includes(provider)) {
      throw new Error(`Provider ${provider} is not configured`);
    }
    this.store.activeProvider = provider;
    this.store.saveToDisk();
  }

  /**
   * Get active model for a provider.
   */
  async getActiveModel(provider: LLMProvider): Promise<string | null> {
    return this.store.activeModels.get(provider) ?? null;
  }

  /**
   * Set active model for a provider.
   */
  async setActiveModel(provider: LLMProvider, model: string): Promise<void> {
    this.store.activeModels.set(provider, model);
    this.store.saveToDisk();
  }

  /**
   * Get provider validation status.
   */
  async getProviderValidationStatus(provider: LLMProvider): Promise<{ isValid: boolean; timestamp: number } | null> {
    return this.store.providerValidationStatus.get(provider) ?? null;
  }

  /**
   * Set provider validation status.
   */
  async setProviderValidationStatus(provider: LLMProvider, isValid: boolean): Promise<void> {
    this.store.providerValidationStatus.set(provider, {
      isValid,
      timestamp: Date.now(),
    });
    this.store.saveToDisk();
  }

  /**
   * Validate API key format.
   */
  async validateApiKey(provider: LLMProvider, key: string): Promise<{ valid: boolean; error?: string }> {
    // More lenient patterns for testing - accept any non-empty string with reasonable format.
    const patterns: Record<LLMProvider, RegExp> = {
      openai: /^sk-[a-zA-Z0-9_-]+$/,
      anthropic: /^sk-ant-[a-zA-Z0-9_-]+$/,
      google: /^[A-Za-z][a-zA-Z0-9_-]+$/,
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
    this.store.reset();
  }

  /**
   * Reset a specific setting to default.
   */
  async resetSetting(setting: string): Promise<void> {
    switch (setting) {
      case 'processingInterval':
        this.store.settings.set('processingInterval', DEFAULT_PROCESSING_INTERVAL);
        break;
      case 'lookbackDays':
        this.store.settings.set('lookbackDays', DEFAULT_LOOKBACK_DAYS);
        break;
      default:
        throw new Error(`Unknown setting: ${setting}`);
    }
    this.store.saveToDisk();
  }

  /**
   * Generic get method for arbitrary settings.
   */
  async get<T = unknown>(key: string): Promise<T | null> {
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
      return (this.store.settings.get('onboarding_complete') ?? false) as T;
    }
    return (this.store.settings.get(key) ?? null) as T | null;
  }

  /**
   * Generic set method for arbitrary settings.
   */
  async set(key: string, value: unknown): Promise<void> {
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
    this.store.settings.set(key, value);
    this.store.saveToDisk();
  }

  /**
   * Generic reset method for arbitrary settings.
   */
  async reset(key: string): Promise<void> {
    if (key === 'processingInterval' || key === 'lookbackDays') {
      await this.resetSetting(key);
      return;
    }
    this.store.settings.delete(key);
    this.store.saveToDisk();
  }
}
