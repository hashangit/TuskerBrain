import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsManager } from '@capabilities/settings/manager';
import type { LLMProvider } from '@capabilities/llm/provider';

/**
 * Design Spec Reference: Lines 1032-1056
 *
 * Settings Persistence:
 * - Saves processing interval preference
 * - Saves initial lookback days preference
 * - Saves and encrypts API keys
 * - Supports multiple LLM providers
 * - Switches between LLM providers
 * - Validates API keys before saving
 */
describe('Settings Persistence', () => {
  let settingsManager: SettingsManager;

  beforeEach(async () => {
    settingsManager = new SettingsManager();
    // Reset to clean state for each test
    await settingsManager.resetAllSettings();
  });

  describe('Processing Interval', () => {
    it('should save processing interval preference', async () => {
        await settingsManager.setProcessingInterval(30); // 30 minutes

        const interval = await settingsManager.getProcessingInterval();
        expect(interval).toBe(30);
      });

    it('should validate processing interval values', async () => {
        await expect(settingsManager.setProcessingInterval(5)).rejects.toThrow(/invalid/i);
        await expect(settingsManager.setProcessingInterval(5000)).rejects.toThrow(/invalid/i);
      });

    it('should allow valid interval options: 15, 30, 60, 120, 1440 minutes', async () => {
        const validIntervals = [15, 30, 60, 120, 1440]; // 15min, 30min, 1hr, 2hr, daily

        for (const interval of validIntervals) {
          await expect(settingsManager.setProcessingInterval(interval)).resolves.not.toThrow();
        }
      });

    it('should persist interval across restart', async () => {
        await settingsManager.setProcessingInterval(60);

        // Simulate restart by creating new instance
        const newManager = new SettingsManager();
        const interval = await newManager.getProcessingInterval();
        expect(interval).toBe(60);
      });
  });

  describe('Lookback Days', () => {
    it('should save initial lookback days preference', async () => {
        await settingsManager.setLookbackDays(30);

        const lookback = await settingsManager.getLookbackDays();
        expect(lookback).toBe(30);
      });

    it('should validate lookback days values', async () => {
        await expect(settingsManager.setLookbackDays(0)).rejects.toThrow(/invalid/i);
        await expect(settingsManager.setLookbackDays(400)).rejects.toThrow(/invalid/i);
      });

    it('should allow valid lookback options: 7, 14, 30, 60, 90 days', async () => {
        const validLookbacks = [7, 14, 30, 60, 90];

        for (const days of validLookbacks) {
          await expect(settingsManager.setLookbackDays(days)).resolves.not.toThrow();
        }
      });
  });

  describe('API Key Storage', () => {
    it('should save and encrypt API keys', async () => {
        const apiKey = 'sk-test-api-key-12345';
        await settingsManager.setApiKey('openai', apiKey);

        const retrieved = await settingsManager.getApiKey('openai');
        expect(retrieved).toBe(apiKey);
      });

    it('should not store API keys in plaintext', async () => {
        const apiKey = 'sk-test-api-key-12345';
        await settingsManager.setApiKey('openai', apiKey);

        // Check that the raw database/storage doesn't contain plaintext
        const rawStorage = await settingsManager.getRawStorage();
        expect(rawStorage).not.toContain(apiKey);
      });

    it('should retrieve API keys correctly', async () => {
        await settingsManager.setApiKey('anthropic', 'sk-ant-key-12345');

        const key = await settingsManager.getApiKey('anthropic');
        expect(key).toBe('sk-ant-key-12345');
      });

    it('should return null for non-existent API key', async () => {
        const key = await settingsManager.getApiKey('nonexistent');
        expect(key).toBeNull();
      });
  });

  describe('Multiple LLM Providers', () => {
    it('should support multiple LLM providers', async () => {
        await settingsManager.setApiKey('openai', 'sk-openai-key');
        await settingsManager.setApiKey('anthropic', 'sk-ant-key');
        await settingsManager.setApiKey('google', 'AIza-google-api-key');

        const providers = await settingsManager.getConfiguredProviders();
        expect(providers).toContain('openai');
        expect(providers).toContain('anthropic');
        expect(providers).toContain('google');
      });

    it('should store API keys separately for each provider', async () => {
        await settingsManager.setApiKey('openai', 'sk-openai-key');
        await settingsManager.setApiKey('anthropic', 'sk-ant-anthropic-key');

        const openaiKey = await settingsManager.getApiKey('openai');
        const anthropicKey = await settingsManager.getApiKey('anthropic');

        expect(openaiKey).toBe('sk-openai-key');
        expect(anthropicKey).toBe('sk-ant-anthropic-key');
      });
  });

  describe('Active Provider Selection', () => {
    it('should switch between LLM providers', async () => {
        await settingsManager.setApiKey('openai', 'sk-openai-key');
        await settingsManager.setApiKey('anthropic', 'sk-ant-anthropic-key');

        await settingsManager.setActiveProvider('anthropic');
        const activeProvider = await settingsManager.getActiveProvider();
        expect(activeProvider).toBe('anthropic');

        await settingsManager.setActiveProvider('openai');
        const newActiveProvider = await settingsManager.getActiveProvider();
        expect(newActiveProvider).toBe('openai');
      });

    it('should not switch to unconfigured provider', async () => {
        await expect(settingsManager.setActiveProvider('unconfigured')).rejects.toThrow(/not configured/i);
      });

    it('should return default provider when none set', async () => {
        const provider = await settingsManager.getActiveProvider();
        expect(provider).toBeNull(); // No default until configured
      });
  });

  describe('API Key Validation', () => {
    it('should validate API key before saving', async () => {
        // Mock validation - invalid key
        vi.spyOn(settingsManager, 'validateApiKey').mockResolvedValueOnce({
          valid: false,
          error: 'Invalid API key format',
        });

        await expect(settingsManager.setApiKey('openai', 'invalid-key')).rejects.toThrow(/invalid/i);
      });

    it('should accept valid API key format', async () => {
        // Mock validation - valid key
        vi.spyOn(settingsManager, 'validateApiKey').mockResolvedValueOnce({
          valid: true,
        });

        await expect(settingsManager.setApiKey('openai', 'sk-valid-key')).resolves.not.toThrow();
      });

    it('should validate OpenAI key format (sk-)', async () => {
        const result = await settingsManager.validateApiKey('openai', 'sk-1234567890');
        expect(result.valid).toBe(true);
      });

    it('should reject invalid OpenAI key format', async () => {
        const result = await settingsManager.validateApiKey('openai', 'invalid-key');
        expect(result.valid).toBe(false);
      });

    it('should validate Anthropic key format', async () => {
        const result = await settingsManager.validateApiKey('anthropic', 'sk-ant-1234567890');
        expect(result.valid).toBe(true);
      });

    it('should validate Google API key format', async () => {
        const result = await settingsManager.validateApiKey('google', 'AIza1234567890abcdefghijklmnop');
        expect(result.valid).toBe(true);
      });
  });

  describe('Settings Export/Import', () => {
    it('should export settings for backup', async () => {
        await settingsManager.setProcessingInterval(30);
        await settingsManager.setLookbackDays(14);
        await settingsManager.setApiKey('openai', 'sk-test-key');

        const exported = await settingsManager.exportSettings();

        expect(exported.processingInterval).toBe(30);
        expect(exported.lookbackDays).toBe(14);
        // API keys should NOT be in export for security
        expect(exported.apiKeys).toBeUndefined();
      });

    it('should import settings from backup', async () => {
        const backup = {
          processingInterval: 60,
          lookbackDays: 30,
        };

        await settingsManager.importSettings(backup);

        expect(await settingsManager.getProcessingInterval()).toBe(60);
        expect(await settingsManager.getLookbackDays()).toBe(30);
      });
  });

  describe('Settings Reset', () => {
    it('should reset all settings to defaults', async () => {
        await settingsManager.setProcessingInterval(60);
        await settingsManager.setLookbackDays(90);
        await settingsManager.setApiKey('openai', 'sk-test-key');

        await settingsManager.resetAllSettings();

        expect(await settingsManager.getProcessingInterval()).toBe(30); // default
        expect(await settingsManager.getLookbackDays()).toBe(30); // default
        expect(await settingsManager.getApiKey('openai')).toBeNull();
      });

    it('should reset specific setting', async () => {
        await settingsManager.setProcessingInterval(60);
        await settingsManager.setLookbackDays(90);

        await settingsManager.resetSetting('processingInterval');

        expect(await settingsManager.getProcessingInterval()).toBe(30); // default
        expect(await settingsManager.getLookbackDays()).toBe(90); // unchanged
      });
  });
});
