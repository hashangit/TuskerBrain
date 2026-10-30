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
  type LLMConfig,
} from '@capabilities/llm/provider';

/**
 * Scenario: LLM Provider Matrix
 *
 * Tests all supported LLM providers (openai, anthropic, google) to ensure
 * consistent behavior across different AI backends.
 * Uses REAL production code -- no mocks of managers.
 * Only real providers are tested; groq/zai/openrouter do not exist.
 */
describe('Scenario: LLM Provider Matrix', () => {
  let tmpDir: string;
  let settingsPath: string;
  let settingsManager: SettingsManager;
  let providerManager: LLMProviderManager;

  const VALID_KEYS: Record<ProviderName, string> = {
    openai: 'sk-openai-key123',
    anthropic: 'sk-ant-anthropic-key123',
    google: 'AIza-google-key123',
  };

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-matrix-test-'));
    settingsPath = path.join(tmpDir, 'settings.json');

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
  // OpenAI                                                              //
  // ------------------------------------------------------------------ //
  describe('OpenAI', () => {
    it('configures OpenAI provider with valid API key', async () => {
      await providerManager.setProvider('openai', VALID_KEYS.openai);

      const providers = await providerManager.listProviders();
      const openai = providers.find((p) => p.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai!.isConfigured).toBe(true);
    });

    it('creates OpenAI LLM provider with correct defaults', () => {
      const provider = createLLMProvider({
        provider: 'openai',
        apiKey: VALID_KEYS.openai,
      });
      expect(provider.name).toBe('openai');
      expect(provider.model).toBe(getDefaultModel('openai'));
    });

    it('lists correct OpenAI models', () => {
      const models = AVAILABLE_MODELS.openai;
      expect(models).toEqual(['gpt-5.1-mini', 'gpt-5.1', 'gpt-5-pro']);
    });
  });

  // ------------------------------------------------------------------ //
  // Anthropic                                                           //
  // ------------------------------------------------------------------ //
  describe('Anthropic', () => {
    it('configures Anthropic provider with valid API key', async () => {
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);

      const providers = await providerManager.listProviders();
      const anthropic = providers.find((p) => p.id === 'anthropic');
      expect(anthropic).toBeDefined();
      expect(anthropic!.isConfigured).toBe(true);
    });

    it('creates Anthropic LLM provider with correct defaults', () => {
      const provider = createLLMProvider({
        provider: 'anthropic',
        apiKey: VALID_KEYS.anthropic,
      });
      expect(provider.name).toBe('anthropic');
      expect(provider.model).toBe(getDefaultModel('anthropic'));
    });

    it('lists correct Anthropic models', () => {
      const models = AVAILABLE_MODELS.anthropic;
      expect(models).toEqual([
        'claude-3-5-haiku-latest',
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
      ]);
    });
  });

  // ------------------------------------------------------------------ //
  // Google                                                              //
  // ------------------------------------------------------------------ //
  describe('Google', () => {
    it('configures Google provider with valid API key', async () => {
      await providerManager.setProvider('google', VALID_KEYS.google);

      const providers = await providerManager.listProviders();
      const google = providers.find((p) => p.id === 'google');
      expect(google).toBeDefined();
      expect(google!.isConfigured).toBe(true);
    });

    it('creates Google LLM provider with correct defaults', () => {
      const provider = createLLMProvider({
        provider: 'google',
        apiKey: VALID_KEYS.google,
      });
      expect(provider.name).toBe('google');
      expect(provider.model).toBe(getDefaultModel('google'));
    });

    it('lists correct Google models', () => {
      const models = AVAILABLE_MODELS.google;
      expect(models).toEqual([
        'gemini-3.1-flash-lite-preview',
        'gemini-3-flash-preview',
        'gemini-3.1-pro-preview',
      ]);
    });
  });

  // ------------------------------------------------------------------ //
  // Provider Consistency                                                //
  // ------------------------------------------------------------------ //
  describe('Provider Consistency', () => {
    it('all providers have the same set of required methods', () => {
      const providers = getAvailableProviders();
      expect(providers.length).toBe(3);

      for (const providerName of providers) {
        const provider = createLLMProvider({
          provider: providerName,
          apiKey: VALID_KEYS[providerName],
        });

        // Every provider must expose these methods
        expect(typeof provider.generateText).toBe('function');
        expect(typeof provider.generateObject).toBe('function');
        expect(typeof provider.name).toBe('string');
        expect(typeof provider.model).toBe('string');
      }
    });

    it('all providers report correct name matching their ProviderName', () => {
      const providers = getAvailableProviders();

      for (const providerName of providers) {
        const provider = createLLMProvider({
          provider: providerName,
          apiKey: VALID_KEYS[providerName],
        });
        expect(provider.name).toBe(providerName);
      }
    });

    it('all providers have at least one model available', () => {
      const providers = getAvailableProviders();

      for (const providerName of providers) {
        const models = AVAILABLE_MODELS[providerName];
        expect(models.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('default model is included in the available models list', () => {
      const providers = getAvailableProviders();

      for (const providerName of providers) {
        const defaultModel = getDefaultModel(providerName);
        const models = AVAILABLE_MODELS[providerName];
        expect(models).toContain(defaultModel);
      }
    });

    it('each provider can override model via config', () => {
      const providers = getAvailableProviders();

      for (const providerName of providers) {
        const models = AVAILABLE_MODELS[providerName];
        // Use a non-default model
        const overrideModel = models.find((m) => m !== getDefaultModel(providerName)) ?? models[0];
        const provider = createLLMProvider({
          provider: providerName,
          apiKey: VALID_KEYS[providerName],
          model: overrideModel,
        });
        expect(provider.model).toBe(overrideModel);
      }
    });
  });

  // ------------------------------------------------------------------ //
  // Provider Fallback                                                   //
  // ------------------------------------------------------------------ //
  describe('Provider Fallback', () => {
    it('can switch active provider when multiple are configured', async () => {
      // Given: All providers configured, OpenAI active
      await providerManager.setProvider('openai', VALID_KEYS.openai);
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setProvider('google', VALID_KEYS.google);
      await providerManager.setActiveProvider('openai');

      // When: Switching to Anthropic
      await providerManager.setActiveProvider('anthropic');

      // Then: Anthropic is active
      const active = await providerManager.getActiveProvider();
      expect(active).not.toBeNull();
      expect(active!.name).toBe('anthropic');
    });

    it('listProviders shows all configured providers', async () => {
      // Given: All three providers configured
      await providerManager.setProvider('openai', VALID_KEYS.openai);
      await providerManager.setProvider('anthropic', VALID_KEYS.anthropic);
      await providerManager.setProvider('google', VALID_KEYS.google);

      // When: Listing providers
      const providers = await providerManager.listProviders();

      // Then: All three show as configured
      const configuredCount = providers.filter((p) => p.isConfigured).length;
      expect(configuredCount).toBe(3);

      const ids = providers.map((p) => p.id);
      expect(ids).toContain('openai');
      expect(ids).toContain('anthropic');
      expect(ids).toContain('google');
    });

    it('unconfigured providers are listed but not marked configured', async () => {
      // Given: Only OpenAI configured
      await providerManager.setProvider('openai', VALID_KEYS.openai);

      // When: Listing providers
      const providers = await providerManager.listProviders();

      // Then: OpenAI is configured, others are not
      const openai = providers.find((p) => p.id === 'openai');
      const anthropic = providers.find((p) => p.id === 'anthropic');
      const google = providers.find((p) => p.id === 'google');

      expect(openai!.isConfigured).toBe(true);
      expect(anthropic!.isConfigured).toBe(false);
      expect(google!.isConfigured).toBe(false);
    });
  });
});
