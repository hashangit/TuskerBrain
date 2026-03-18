import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Settings Persistence
 *
 * Design Spec Reference: Lines 1061-1091
 *
 * As a user, I want my preferences and configuration to persist across app restarts,
 * so I don't have to reconfigure the app every time I launch it.
 *
 * Business Rules:
 * - Processing interval preference persists
 * - Initial lookback days preference persists
 * - API keys are encrypted and persist
 * - Multiple LLM providers can be stored
 * - Provider switching works correctly
 * - Invalid API keys are rejected before saving
 */
describe('Feature: Settings', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    gmail = await GmailTestAccount.connect();
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Sync Interval Persistence', () => {
    it('User can save processing interval preference', async () => {
      // Given: User is on settings page
      await app.navigateTo('settings');

      // When: User sets 30-minute sync interval
      await app.setSyncInterval(30);

      // Then: Preference is saved
      const settings = await app.getSettings();
      expect(settings.syncInterval).toBe(30);
    });

    it('Processing interval persists across app restarts', async () => {
      // Given: User has set a specific interval
      await app.setSyncInterval(60);
      const beforeRestart = await app.getSettings();

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: Interval is preserved
      const afterRestart = await app.getSettings();
      expect(afterRestart.syncInterval).toBe(beforeRestart.syncInterval);
    });

    it('All sync interval options are available', async () => {
      // When: User views sync interval options
      const options = await app.getSyncIntervalOptions();

      // Then: All expected options are present
      expect(options).toContainEqual(expect.objectContaining({ value: 15 }));
      expect(options).toContainEqual(expect.objectContaining({ value: 30 }));
      expect(options).toContainEqual(expect.objectContaining({ value: 60 }));
      expect(options).toContainEqual(expect.objectContaining({ value: 120 }));
      expect(options).toContainEqual(expect.objectContaining({ value: 1440 }));
    });
  });

  describe('Lookback Period Persistence', () => {
    it('User can save initial lookback days preference', async () => {
      // Given: User is on settings page
      await app.navigateTo('settings');

      // When: User sets 14-day lookback
      await app.setLookbackDays(14);

      // Then: Preference is saved
      const settings = await app.getSettings();
      expect(settings.lookbackDays).toBe(14);
    });

    it('Lookback days persist across app restarts', async () => {
      // Given: User has set a specific lookback
      await app.setLookbackDays(60);
      const beforeRestart = await app.getSettings();

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: Lookback is preserved
      const afterRestart = await app.getSettings();
      expect(afterRestart.lookbackDays).toBe(beforeRestart.lookbackDays);
    });

    it('All lookback period options are available', async () => {
      // When: User views lookback options
      const options = await app.getLookbackOptions();

      // Then: All expected options are present
      expect(options).toContainEqual(expect.objectContaining({ value: 7 }));
      expect(options).toContainEqual(expect.objectContaining({ value: 14 }));
      expect(options).toContainEqual(expect.objectContaining({ value: 30 }));
      expect(options).toContainEqual(expect.objectContaining({ value: 60 }));
      expect(options).toContainEqual(expect.objectContaining({ value: 90 }));
    });
  });

  describe('API Key Storage', () => {
    it('User can save and encrypt API keys', async () => {
      // Given: User is on settings page
      await app.navigateTo('settings');

      // When: User enters and saves API key
      await app.setLLMProvider('anthropic');
      await app.enterApiKey('sk-ant-test-api-key-12345');
      await app.saveApiKey();

      // Then: Key is stored securely (not in plaintext)
      const storedKey = await app.getStoredApiKey('anthropic');
      expect(storedKey).not.toBe('sk-ant-test-api-key-12345');
      expect(storedKey).toMatch(/encrypted|\*+/);
    });

    it('API key is retrievable after app restart', async () => {
      // Given: User has saved an API key
      await app.setLLMProvider('openai');
      await app.enterApiKey('sk-test-openai-key');
      await app.saveApiKey();

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: Key is still available (decrypted)
      const isValid = await app.validateStoredApiKey('openai');
      expect(isValid).toBe(true);
    });
  });

  describe('Multiple LLM Providers', () => {
    it('User can add multiple LLM provider keys', async () => {
      // Given: User is on settings page
      await app.navigateTo('settings');

      // When: User adds keys for multiple providers
      await app.setLLMProvider('anthropic');
      await app.enterApiKey('sk-ant-key-1');
      await app.saveApiKey();

      await app.setLLMProvider('openai');
      await app.enterApiKey('sk-openai-key-2');
      await app.saveApiKey();

      // Then: Both providers are stored
      const providers = await app.getConfiguredProviders();
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
    });

    it('User can switch between LLM providers', async () => {
      // Given: User has multiple providers configured
      await app.configureProvider('anthropic', 'sk-ant-key');
      await app.configureProvider('openai', 'sk-openai-key');

      // When: User selects Anthropic as active provider
      await app.setActiveProvider('anthropic');

      // Then: Subsequent operations use Anthropic
      const activeProvider = await app.getActiveProvider();
      expect(activeProvider).toBe('anthropic');

      // When: User switches to OpenAI
      await app.setActiveProvider('openai');

      // Then: Active provider is OpenAI
      const newActiveProvider = await app.getActiveProvider();
      expect(newActiveProvider).toBe('openai');
    });

    it('Active provider selection persists across restarts', async () => {
      // Given: User has multiple providers and selects one
      await app.configureProvider('anthropic', 'sk-ant-key');
      await app.configureProvider('openai', 'sk-openai-key');
      await app.setActiveProvider('openai');

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: Active provider is still OpenAI
      const activeProvider = await app.getActiveProvider();
      expect(activeProvider).toBe('openai');
    });
  });

  describe('API Key Validation', () => {
    it('User sees error if API key is invalid', async () => {
      // Given: User is on settings page
      await app.navigateTo('settings');
      await app.setLLMProvider('anthropic');

      // When: User enters invalid key
      await app.enterApiKey('invalid-key-format');
      const result = await app.validateApiKey();

      // Then: Validation fails with error
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/invalid|unauthorized|incorrect/i);
    });

    it('Invalid API key is not saved', async () => {
      // Given: User tries to save invalid key
      await app.setLLMProvider('openai');
      await app.enterApiKey('bad-key');
      await app.saveApiKey(); // Should fail validation

      // When: Checking stored keys
      const hasStored = await app.hasStoredApiKey('openai');

      // Then: Invalid key was not saved
      expect(hasStored).toBe(false);
    });

    it('Valid API key is accepted and saved', async () => {
      // Given: User enters valid-looking key
      await app.setLLMProvider('anthropic');
      await app.enterApiKey('sk-ant-valid-test-key');
      const result = await app.validateApiKey();

      // Then: Validation passes
      expect(result.isValid).toBe(true);

      // When: User saves
      await app.saveApiKey();

      // Then: Key is stored
      const hasStored = await app.hasStoredApiKey('anthropic');
      expect(hasStored).toBe(true);
    });
  });

  describe('Settings Reset', () => {
    it('User can reset all settings to defaults', async () => {
      // Given: User has customized settings
      await app.setSyncInterval(120);
      await app.setLookbackDays(90);

      // When: User resets to defaults
      await app.resetToDefaults();

      // Then: Settings are back to defaults
      const settings = await app.getSettings();
      expect(settings.syncInterval).toBe(30); // Default
      expect(settings.lookbackDays).toBe(30); // Default
    });
  });

  describe('OAuth Token Persistence', () => {
    it('OAuth tokens persist across app restarts', async () => {
      // Given: User has connected Gmail
      await app.connectGmail(gmail.credentials);

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: Gmail is still connected
      const isConnected = await app.isGmailConnected();
      expect(isConnected).toBe(true);
    });
  });

  describe('Configuration Export/Import', () => {
    it('User can export their configuration', async () => {
      // Given: User has configuration
      await app.setSyncInterval(60);
      await app.setLookbackDays(14);

      // When: User exports configuration
      const config = await app.exportConfiguration();

      // Then: Export contains settings (without sensitive keys)
      expect(config.syncInterval).toBe(60);
      expect(config.lookbackDays).toBe(14);
      expect(config.apiKeys).toBeUndefined(); // Keys not exported
    });
  });
});
