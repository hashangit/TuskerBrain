import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SettingsManager } from '@core/settings/manager';
import { LLMProviderManager } from '@core/llm/provider-manager';
import { TokenManager, type OAuthTokens } from '@core/auth/token-manager';

/**
 * Feature: Settings Persistence
 *
 * Tests REAL production code -- no mocks of the managers themselves.
 * Uses temp directory for file-based persistence.
 * If a method does not exist, the test will fail and expose the gap.
 */
describe('Feature: Settings', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
    settingsPath = path.join(tmpDir, 'settings.json');
    // Reset all static state so tests are isolated
    const sm = new SettingsManager();
    await sm.resetAllSettings();
    SettingsManager.initializeWithFilePath(settingsPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------ //
  // Sync Interval                                                       //
  // ------------------------------------------------------------------ //
  describe('Sync Interval Persistence', () => {
    it('saves processing interval preference', async () => {
      const sm = new SettingsManager();
      await sm.setProcessingInterval(30);
      expect(await sm.getProcessingInterval()).toBe(30);
    });

    it('persists interval across new instances (simulates app restart)', async () => {
      // Instance 1 writes
      const sm1 = new SettingsManager();
      await sm1.setProcessingInterval(60);

      // Wait for debounced save
      await new Promise((r) => setTimeout(r, 50));

      // Instance 2 reads from same file
      SettingsManager.initializeWithFilePath(settingsPath);
      const sm2 = new SettingsManager();
      expect(await sm2.getProcessingInterval()).toBe(60);
    });

    it('accepts all valid interval options', async () => {
      const sm = new SettingsManager();
      const validIntervals = [15, 30, 60, 120, 1440];

      for (const minutes of validIntervals) {
        await sm.setProcessingInterval(minutes);
        expect(await sm.getProcessingInterval()).toBe(minutes);
      }
    });

    it('rejects an invalid interval', async () => {
      const sm = new SettingsManager();
      await expect(sm.setProcessingInterval(25)).rejects.toThrow(/invalid/i);
    });
  });

  // ------------------------------------------------------------------ //
  // Lookback Period                                                     //
  // ------------------------------------------------------------------ //
  describe('Lookback Period Persistence', () => {
    it('saves lookback days preference', async () => {
      const sm = new SettingsManager();
      await sm.setLookbackDays(14);
      expect(await sm.getLookbackDays()).toBe(14);
    });

    it('persists lookback days across new instances', async () => {
      const sm1 = new SettingsManager();
      await sm1.setLookbackDays(60);

      await new Promise((r) => setTimeout(r, 50));

      SettingsManager.initializeWithFilePath(settingsPath);
      const sm2 = new SettingsManager();
      expect(await sm2.getLookbackDays()).toBe(60);
    });

    it('accepts all valid lookback options', async () => {
      const sm = new SettingsManager();
      const validDays = [7, 14, 30, 60, 90];

      for (const days of validDays) {
        await sm.setLookbackDays(days);
        expect(await sm.getLookbackDays()).toBe(days);
      }
    });

    it('rejects an invalid lookback value', async () => {
      const sm = new SettingsManager();
      await expect(sm.setLookbackDays(20)).rejects.toThrow(/invalid/i);
    });
  });

  // ------------------------------------------------------------------ //
  // API Key Encryption & Storage                                        //
  // ------------------------------------------------------------------ //
  describe('API Key Encryption', () => {
    it('stores API key encrypted (raw storage differs from plaintext)', async () => {
      const sm = new SettingsManager();
      const plainKey = 'sk-ant-testapikey123';
      await sm.setApiKey('anthropic', plainKey);

      // getApiKey should return the original plaintext after decryption
      const retrieved = await sm.getApiKey('anthropic');
      expect(retrieved).toBe(plainKey);

      // But raw storage should contain encrypted form (base64 in test env)
      const raw = await sm.getRawStorage();
      const parsed = JSON.parse(raw);
      expect(parsed.apiKeys.anthropic).not.toBe(plainKey);
    });

    it('retrieves API key after simulated restart', async () => {
      const sm1 = new SettingsManager();
      await sm1.setApiKey('openai', 'sk-openai-test-key');

      await new Promise((r) => setTimeout(r, 50));

      SettingsManager.initializeWithFilePath(settingsPath);
      const sm2 = new SettingsManager();
      const retrieved = await sm2.getApiKey('openai');
      expect(retrieved).toBe('sk-openai-test-key');
    });
  });

  // ------------------------------------------------------------------ //
  // Multiple Providers                                                  //
  // ------------------------------------------------------------------ //
  describe('Multiple LLM Providers', () => {
    it('can store keys for multiple providers simultaneously', async () => {
      const sm = new SettingsManager();
      await sm.setApiKey('anthropic', 'sk-ant-multi-key');
      await sm.setApiKey('openai', 'sk-multi-openai-key');

      const configured = await sm.getConfiguredProviders();
      expect(configured).toContain('anthropic');
      expect(configured).toContain('openai');
      expect(configured.length).toBeGreaterThanOrEqual(2);
    });

    it('switches active provider and persists', async () => {
      const sm = new SettingsManager();
      await sm.setApiKey('anthropic', 'sk-ant-switch-key');
      await sm.setApiKey('openai', 'sk-openai-switch-key');

      await sm.setActiveProvider('anthropic');
      expect(await sm.getActiveProvider()).toBe('anthropic');

      await sm.setActiveProvider('openai');
      expect(await sm.getActiveProvider()).toBe('openai');
    });

    it('persists active provider across new instances', async () => {
      const sm1 = new SettingsManager();
      await sm1.setApiKey('anthropic', 'sk-ant-persist');
      await sm1.setApiKey('openai', 'sk-openai-persist');
      await sm1.setActiveProvider('openai');

      await new Promise((r) => setTimeout(r, 50));

      SettingsManager.initializeWithFilePath(settingsPath);
      const sm2 = new SettingsManager();
      expect(await sm2.getActiveProvider()).toBe('openai');
    });

    it('refuses to set active provider that is not configured', async () => {
      const sm = new SettingsManager();
      await expect(sm.setActiveProvider('google')).rejects.toThrow(/not configured/i);
    });
  });

  // ------------------------------------------------------------------ //
  // API Key Validation                                                  //
  // ------------------------------------------------------------------ //
  describe('API Key Validation', () => {
    it('rejects invalid OpenAI key format', async () => {
      const sm = new SettingsManager();
      const result = await sm.validateApiKey('openai', 'bad-key');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects invalid Anthropic key format', async () => {
      const sm = new SettingsManager();
      const result = await sm.validateApiKey('anthropic', 'invalid-no-prefix');
      expect(result.valid).toBe(false);
    });

    it('accepts valid OpenAI key format', async () => {
      const sm = new SettingsManager();
      const result = await sm.validateApiKey('openai', 'sk-valid-openai-key-123');
      expect(result.valid).toBe(true);
    });

    it('accepts valid Anthropic key format', async () => {
      const sm = new SettingsManager();
      const result = await sm.validateApiKey('anthropic', 'sk-ant-valid-key-456');
      expect(result.valid).toBe(true);
    });

    it('accepts valid Google key format', async () => {
      const sm = new SettingsManager();
      const result = await sm.validateApiKey('google', 'AIza-some-google-key');
      expect(result.valid).toBe(true);
    });

    it('setApiKey rejects invalid key and does not store it', async () => {
      const sm = new SettingsManager();
      await expect(sm.setApiKey('openai', 'not-a-real-key')).rejects.toThrow(/invalid/i);
      const stored = await sm.getApiKey('openai');
      expect(stored).toBeNull();
    });
  });

  // ------------------------------------------------------------------ //
  // Reset to Defaults                                                   //
  // ------------------------------------------------------------------ //
  describe('Settings Reset', () => {
    it('resets all settings to defaults', async () => {
      const sm = new SettingsManager();
      await sm.setProcessingInterval(120);
      await sm.setLookbackDays(90);
      await sm.setApiKey('anthropic', 'sk-ant-to-reset');

      await sm.resetAllSettings();

      expect(await sm.getProcessingInterval()).toBe(30);
      expect(await sm.getLookbackDays()).toBe(30);
      expect(await sm.getActiveProvider()).toBeNull();
      expect(await sm.getConfiguredProviders()).toEqual([]);
    });
  });

  // ------------------------------------------------------------------ //
  // OAuth Token Persistence                                             //
  // ------------------------------------------------------------------ //
  describe('OAuth Token Persistence', () => {
    // TokenManager requires a GmailClient; we provide a minimal stub.
    const stubGmailClient = {
      getProfile: async () => ({ emailAddress: 'test@example.com' }),
    } as any;

    it('stores and retrieves OAuth tokens in encrypted form', async () => {
      const tm = new TokenManager(stubGmailClient);
      const tokens: OAuthTokens = {
        access_token: 'ya29.test-access-token',
        refresh_token: '1//test-refresh-token',
        expiry_date: new Date(Date.now() + 3600000),
      };

      await tm.setTokens(tokens);

      const retrieved = await tm.getStoredTokens();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.access_token).toBe('ya29.test-access-token');
      expect(retrieved!.refresh_token).toBe('1//test-refresh-token');
    });

    it('persists tokens across new instances (static storage)', async () => {
      const tm1 = new TokenManager(stubGmailClient);
      const tokens: OAuthTokens = {
        access_token: 'ya29.persist-access',
        refresh_token: '1//persist-refresh',
        expiry_date: new Date(Date.now() + 3600000),
      };
      await tm1.setTokens(tokens);

      // New instance shares static storage
      const tm2 = new TokenManager(stubGmailClient);
      const retrieved = await tm2.getStoredTokens();
      expect(retrieved).not.toBeNull();
      expect(retrieved!.access_token).toBe('ya29.persist-access');
    });

    it('raw storage is not plaintext', async () => {
      const tm = new TokenManager(stubGmailClient);
      await tm.setTokens({
        access_token: 'plaintext-secret',
        refresh_token: 'refresh-secret',
        expiry_date: new Date(Date.now() + 3600000),
      });

      const raw = await tm.getRawStorage();
      expect(raw).not.toContain('plaintext-secret');
      expect(raw).not.toContain('refresh-secret');
    });
  });

  // ------------------------------------------------------------------ //
  // Configuration Export                                                //
  // ------------------------------------------------------------------ //
  describe('Configuration Export', () => {
    it('exports settings without sensitive keys', async () => {
      const sm = new SettingsManager();
      await sm.setProcessingInterval(60);
      await sm.setLookbackDays(14);
      await sm.setApiKey('anthropic', 'sk-ant-export-test');

      const exported = await sm.exportSettings();

      expect(exported.processingInterval).toBe(60);
      expect(exported.lookbackDays).toBe(14);
      // exportSettings should NOT leak API keys
      const exportedStr = JSON.stringify(exported);
      expect(exportedStr).not.toContain('sk-ant-export-test');
    });
  });

  // ------------------------------------------------------------------ //
  // Settings Resilience                                                 //
  // ------------------------------------------------------------------ //
  describe('Settings Resilience', () => {
    // ---------------------------------------------------------------- //
    // Settings persistence with existing data                           //
    // Tests that loadFromDisk() correctly reads pre-existing settings  //
    // files and preserves all key-value pairs (including unknown keys). //
    // Note: SettingsManager has no version or migration logic -- these  //
    // tests verify JSON round-trip loading and forward-compatible       //
    // key-value storage, NOT schema migration.                         //
    // ---------------------------------------------------------------- //
    describe('Settings persistence with existing data', () => {
      it('loads settings from an existing file on disk', async () => {
        // Write a settings file with known values
        const existingSettings = {
          settings: { processingInterval: 60, lookbackDays: 14 },
          apiKeys: {},
          activeProvider: null,
          providerValidationStatus: {},
        };
        fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2), 'utf-8');

        // Reload from disk -- SettingsManager should load the values
        SettingsManager.initializeWithFilePath(settingsPath);
        const sm = new SettingsManager();

        // Values from the existing file should be loaded
        expect(await sm.getProcessingInterval()).toBe(60);
        expect(await sm.getLookbackDays()).toBe(14);
      });

      it('preserves unknown keys when loading existing settings', async () => {
        // Simulate a settings file with extra/unknown fields
        const settingsWithExtras = {
          settings: {
            processingInterval: 120,
            lookbackDays: 90,
            onboarding_complete: true,
            customPreference: 'someValue',
          },
          apiKeys: {},
          activeProvider: null,
          providerValidationStatus: {},
        };
        fs.writeFileSync(settingsPath, JSON.stringify(settingsWithExtras, null, 2), 'utf-8');

        SettingsManager.initializeWithFilePath(settingsPath);
        const sm = new SettingsManager();

        // All values including unknown keys should be preserved
        expect(await sm.getProcessingInterval()).toBe(120);
        expect(await sm.getLookbackDays()).toBe(90);
        expect(await sm.get('onboarding_complete')).toBe(true);
        expect(await sm.get('customPreference')).toBe('someValue');
      });
    });

    // ---------------------------------------------------------------- //
    // Corrupted settings recovery                                      //
    // ---------------------------------------------------------------- //
    describe('Corrupted settings recovery', () => {
      it('falls back to defaults when settings are corrupted', async () => {
        // Write invalid JSON to the settings file
        fs.writeFileSync(settingsPath, '{ "settings": { "processingInterval": "not a number" }, "apiKeys": "broken', 'utf-8');

        // Reloading should not crash -- should fall back to defaults
        SettingsManager.initializeWithFilePath(settingsPath);
        const sm = new SettingsManager();

        // Defaults should be returned since the file was unreadable
        expect(await sm.getProcessingInterval()).toBe(30);
        expect(await sm.getLookbackDays()).toBe(30);
      });

      it('recovers from missing required fields', async () => {
        // Write a partial settings file missing lookbackDays
        const partialSettings = {
          settings: { processingInterval: 60 },
          apiKeys: {},
          activeProvider: null,
          providerValidationStatus: {},
        };
        fs.writeFileSync(settingsPath, JSON.stringify(partialSettings, null, 2), 'utf-8');

        SettingsManager.initializeWithFilePath(settingsPath);
        const sm = new SettingsManager();

        // Present field should be loaded
        expect(await sm.getProcessingInterval()).toBe(60);
        // Missing field should fall back to default
        expect(await sm.getLookbackDays()).toBe(30);
      });

      it('handles empty settings store', async () => {
        // Ensure no settings file exists
        if (fs.existsSync(settingsPath)) {
          fs.unlinkSync(settingsPath);
        }

        // Reinitialize without any existing file
        SettingsManager.initializeWithFilePath(settingsPath);
        const sm = new SettingsManager();

        // All defaults should be returned
        expect(await sm.getProcessingInterval()).toBe(30);
        expect(await sm.getLookbackDays()).toBe(30);
        expect(await sm.getActiveProvider()).toBeNull();
        expect(await sm.getConfiguredProviders()).toEqual([]);
      });
    });

    // ---------------------------------------------------------------- //
    // Validation                                                       //
    // ---------------------------------------------------------------- //
    describe('Validation', () => {
      it('rejects invalid setting values with clear error', async () => {
        const sm = new SettingsManager();

        // Invalid interval (not in the allowed list)
        await expect(sm.setProcessingInterval(0)).rejects.toThrow(/Invalid processing interval/);

        // Invalid lookback days
        await expect(sm.setLookbackDays(0)).rejects.toThrow(/Invalid lookback days/);
      });

      it('rejects out-of-range values', async () => {
        const sm = new SettingsManager();

        // Negative numbers
        await expect(sm.setProcessingInterval(-1)).rejects.toThrow(/Invalid processing interval/);
        await expect(sm.setLookbackDays(-5)).rejects.toThrow(/Invalid lookback days/);

        // Extremely large values not in the allowed list
        await expect(sm.setProcessingInterval(99999)).rejects.toThrow(/Invalid processing interval/);
        await expect(sm.setLookbackDays(365)).rejects.toThrow(/Invalid lookback days/);
      });

      it('preserves valid settings when one invalid value is rejected', async () => {
        const sm = new SettingsManager();

        // Set valid values first
        await sm.setProcessingInterval(60);
        await sm.setLookbackDays(14);

        // Now try to set an invalid value -- it should throw
        await expect(sm.setProcessingInterval(99999)).rejects.toThrow(/Invalid processing interval/);

        // The previously valid values should still be intact
        expect(await sm.getProcessingInterval()).toBe(60);
        expect(await sm.getLookbackDays()).toBe(14);

        // Similarly, set a valid interval then try invalid lookback
        await sm.setProcessingInterval(120);
        await expect(sm.setLookbackDays(100)).rejects.toThrow(/Invalid lookback days/);

        // Interval should have been updated, lookback should remain the last valid value
        expect(await sm.getProcessingInterval()).toBe(120);
        expect(await sm.getLookbackDays()).toBe(14);
      });
    });

    // ---------------------------------------------------------------- //
    // Settings reset                                                   //
    // ---------------------------------------------------------------- //
    describe('Settings reset', () => {
      it('resets all settings including arbitrary custom keys', async () => {
        const sm = new SettingsManager();
        await sm.setProcessingInterval(120);
        await sm.setLookbackDays(90);
        await sm.setApiKey('anthropic', 'sk-ant-reset-resilience');
        await sm.setActiveProvider('anthropic');
        await sm.set('customKey', 'customValue');

        await sm.resetAllSettings();

        expect(await sm.getProcessingInterval()).toBe(30);
        expect(await sm.getLookbackDays()).toBe(30);
        expect(await sm.getActiveProvider()).toBeNull();
        expect(await sm.getConfiguredProviders()).toEqual([]);
        expect(await sm.get('customKey')).toBeNull();
      });

      it('reset is idempotent', async () => {
        const sm = new SettingsManager();
        await sm.setProcessingInterval(1440);
        await sm.setLookbackDays(7);

        // Reset once
        await sm.resetAllSettings();
        const intervalAfterFirst = await sm.getProcessingInterval();
        const lookbackAfterFirst = await sm.getLookbackDays();

        // Reset again
        await sm.resetAllSettings();
        const intervalAfterSecond = await sm.getProcessingInterval();
        const lookbackAfterSecond = await sm.getLookbackDays();

        // Results should be identical
        expect(intervalAfterFirst).toBe(intervalAfterSecond);
        expect(lookbackAfterFirst).toBe(lookbackAfterSecond);
        expect(intervalAfterSecond).toBe(30);
        expect(lookbackAfterSecond).toBe(30);
      });
    });
  });
});
