import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SettingsManager } from '@capabilities/settings/manager';
import { LLMProviderManager } from '@capabilities/llm/provider-manager';
import {
  AVAILABLE_MODELS,
  getAvailableProviders,
  getDefaultModel,
  createLLMProvider,
  type ProviderName,
} from '@capabilities/llm/provider';

/**
 * Scenario: LLM Provider Switching
 *
 * Tests switching between different LLM providers mid-session using
 * REAL production code (SettingsManager + LLMProviderManager).
 * No mocks of managers. Only real providers: openai, anthropic, google.
 */
describe('Scenario: LLM Provider Switching', () => {
  let tmpDir: string;
  let settingsPath: string;
  let settingsManager: SettingsManager;
  let providerManager: LLMProviderManager;

  // Valid-format API keys accepted by SettingsManager.validateApiKey
  const VALID_KEYS: Record<ProviderName, string> = {
    openai: 'sk-openai-key123',
    anthropic: 'sk-ant-anthropic-key123',
    google: 'AIza-google-key123',
  };

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-switch-test-'));
    settingsPath = path.join(tmpDir, 'settings.json');

    // Reset static state and initialize with temp file
    const sm = new SettingsManager();
    await sm.resetAllSettings();
    SettingsManager.initializeWithFilePath(settingsPath);

    settingsManager = new SettingsManager();
    providerManager = new LLMProviderManager(settingsManager);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------ //
  // Provider Switch                                                     //
  // ------------------------------------------------------------------ //
  describe('Provider Switch', () => {
    it('switches from Anthropic to OpenAI', async () => {
      // Given: Anthropic is configured and set as active
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setActiveProvider('anthropic');
      expect(await settingsManager.getActiveProvider()).toBe('anthropic');

      // When: Switching to OpenAI
      await providerManager.setProvider('openai', VALID_KEYS.openai);
      await providerManager.setActiveProvider('openai');

      // Then: Active provider is now OpenAI
      expect(await settingsManager.getActiveProvider()).toBe('openai');
    });

    it('switches from OpenAI to Google', async () => {
      // Given: OpenAI is configured and set as active
      await providerManager.setProvider('openai', VALID_KEYS.openai);
      await providerManager.setActiveProvider('openai');
      expect(await settingsManager.getActiveProvider()).toBe('openai');

      // When: Switching to Google
      await providerManager.setProvider('google', VALID_KEYS.google);
      await providerManager.setActiveProvider('google');

      // Then: Active provider is now Google
      expect(await settingsManager.getActiveProvider()).toBe('google');
    });

    it('switches from Google to Anthropic', async () => {
      // Given: Google is configured and set as active
      await providerManager.setProvider('google', VALID_KEYS.google);
      await providerManager.setActiveProvider('google');
      expect(await settingsManager.getActiveProvider()).toBe('google');

      // When: Switching to Anthropic
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setActiveProvider('anthropic');

      // Then: Active provider is now Anthropic
      expect(await settingsManager.getActiveProvider()).toBe('anthropic');
    });
  });

  // ------------------------------------------------------------------ //
  // Immediate Use After Switch                                          //
  // ------------------------------------------------------------------ //
  describe('Immediate Use After Switch', () => {
    it('new provider is used immediately after switching', async () => {
      // Given: Anthropic is configured and active
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setActiveProvider('anthropic');

      // When: Switch to OpenAI
      await providerManager.setProvider('openai', VALID_KEYS.openai);
      await providerManager.setActiveProvider('openai');

      // Then: getActiveProvider returns an OpenAI LLMProvider instance
      const activeProvider = await providerManager.getActiveProvider();
      expect(activeProvider).not.toBeNull();
      expect(activeProvider!.name).toBe('openai');
      expect(activeProvider!.model).toBe(getDefaultModel('openai'));
    });

    it('switching back to previous provider works immediately', async () => {
      // Given: OpenAI configured, then switch to Google
      await providerManager.setProvider('openai', VALID_KEYS.openai);
      await providerManager.setProvider('google', VALID_KEYS.google);
      await providerManager.setActiveProvider('google');

      // When: Switching back to OpenAI
      await providerManager.setActiveProvider('openai');

      // Then: OpenAI is immediately active
      const activeProvider = await providerManager.getActiveProvider();
      expect(activeProvider).not.toBeNull();
      expect(activeProvider!.name).toBe('openai');
    });
  });

  // ------------------------------------------------------------------ //
  // API Key Validation                                                  //
  // ------------------------------------------------------------------ //
  describe('API Key Validation', () => {
    it('rejects invalid OpenAI API key format', async () => {
      await expect(
        providerManager.setProvider('openai', 'bad-key')
      ).rejects.toThrow(/invalid/i);
    });

    it('rejects invalid Anthropic API key format', async () => {
      await expect(
        providerManager.setProvider('anthropic', 'sk-wrong-prefix')
      ).rejects.toThrow(/invalid/i);
    });

    it('rejects invalid Google API key format', async () => {
      await expect(
        providerManager.setProvider('google', '123-bad-start')
      ).rejects.toThrow(/invalid/i);
    });

    it('rejects empty API key', async () => {
      await expect(
        providerManager.setProvider('openai', '')
      ).rejects.toThrow(/invalid/i);
    });

    it('accepts valid key for each provider', async () => {
      for (const [provider, key] of Object.entries(VALID_KEYS)) {
        await providerManager.setProvider(provider as ProviderName, key);
        const configured = await settingsManager.getConfiguredProviders();
        expect(configured).toContain(provider);
      }
    });
  });

  // ------------------------------------------------------------------ //
  // Failed Switch Rollback                                              //
  // ------------------------------------------------------------------ //
  describe('Failed Switch Rollback', () => {
    it('failed setProvider does not change the active provider', async () => {
      // Given: Anthropic is configured and active
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setActiveProvider('anthropic');

      // When: Attempting to set OpenAI with an invalid key
      await expect(
        providerManager.setProvider('openai', 'invalid-key')
      ).rejects.toThrow(/invalid/i);

      // Then: Anthropic is still active
      expect(await settingsManager.getActiveProvider()).toBe('anthropic');
    });

    it('cannot activate a provider that has not been configured', async () => {
      // Given: Only Anthropic is configured
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setActiveProvider('anthropic');

      // When: Trying to activate OpenAI without configuring it
      await expect(
        providerManager.setActiveProvider('openai')
      ).rejects.toThrow(/not configured/i);

      // Then: Anthropic is still active
      expect(await settingsManager.getActiveProvider()).toBe('anthropic');
    });
  });

  // ------------------------------------------------------------------ //
  // Provider Capabilities                                              //
  // ------------------------------------------------------------------ //
  describe('Provider Capabilities', () => {
    it('each provider shows appropriate model options', () => {
      // OpenAI models should include gpt
      const openaiModels = AVAILABLE_MODELS.openai;
      expect(openaiModels.length).toBeGreaterThan(0);
      expect(openaiModels.some((m) => m.includes('gpt'))).toBe(true);

      // Anthropic models should include claude
      const anthropicModels = AVAILABLE_MODELS.anthropic;
      expect(anthropicModels.length).toBeGreaterThan(0);
      expect(anthropicModels.some((m) => m.includes('claude'))).toBe(true);

      // Google models should include gemini
      const googleModels = AVAILABLE_MODELS.google;
      expect(googleModels.length).toBeGreaterThan(0);
      expect(googleModels.some((m) => m.includes('gemini'))).toBe(true);
    });

    it('all three providers are listed by getAvailableProviders', () => {
      const providers = getAvailableProviders();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('google');
      expect(providers.length).toBe(3);
    });

    it('each provider has a default model', () => {
      for (const provider of getAvailableProviders()) {
        const defaultModel = getDefaultModel(provider);
        expect(defaultModel).toBeTruthy();
        expect(typeof defaultModel).toBe('string');
      }
    });
  });

  // ------------------------------------------------------------------ //
  // Provider Fallback                                                   //
  // ------------------------------------------------------------------ //
  describe('Provider Fallback', () => {
    it('can switch to a backup provider when primary is available', async () => {
      // Given: Two providers configured, Anthropic active
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setProvider('openai', VALID_KEYS.openai);
      await providerManager.setActiveProvider('anthropic');

      // When: Switching to backup (OpenAI)
      await providerManager.setActiveProvider('openai');

      // Then: OpenAI is now active
      const active = await providerManager.getActiveProvider();
      expect(active).not.toBeNull();
      expect(active!.name).toBe('openai');
    });

    it('can switch to Google as fallback', async () => {
      // Given: All three providers configured, OpenAI active
      await providerManager.setProvider('openai', VALID_KEYS.openai);
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setProvider('google', VALID_KEYS.google);
      await providerManager.setActiveProvider('openai');

      // When: Switching to Google as fallback
      await providerManager.setActiveProvider('google');

      // Then: Google is now active
      const active = await providerManager.getActiveProvider();
      expect(active).not.toBeNull();
      expect(active!.name).toBe('google');
    });

    it('previous provider remains accessible after fallback', async () => {
      // Given: Two providers configured
      await providerManager.setProvider('openai', VALID_KEYS.openai);
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setActiveProvider('openai');

      // When: Switching to Anthropic and back
      await providerManager.setActiveProvider('anthropic');
      await providerManager.setActiveProvider('openai');

      // Then: OpenAI is active again and still works
      const active = await providerManager.getActiveProvider();
      expect(active!.name).toBe('openai');
    });
  });
});
