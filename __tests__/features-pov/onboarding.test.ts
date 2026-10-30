import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { SettingsManager } from '@capabilities/settings/manager';
import { TokenManager, type OAuthTokens } from '@capabilities/gmail/token-manager';
import type { GmailClient } from '@domain/sync/sync';
import { LLMProviderManager } from '@capabilities/llm/provider-manager';
import { getAvailableProviders } from '@capabilities/llm/provider';
import type { ProviderName } from '@capabilities/llm/provider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock GmailClient for TokenManager tests. */
function createMockGmailClient(): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({ messages: [], resultSizeEstimate: 0 }),
    getMessage: vi.fn().mockResolvedValue({}),
    getProfile: vi.fn().mockResolvedValue({ emailAddress: 'user@test.com' }),
    modifyMessage: vi.fn().mockResolvedValue({}),
  } as unknown as GmailClient;
}

/** Build valid OAuthTokens for testing. */
function createTestTokens(overrides: Partial<OAuthTokens> = {}): OAuthTokens {
  return {
    access_token: 'ya29.test-access-token-abc123',
    refresh_token: '1//test-refresh-token-xyz',
    expiry_date: new Date(Date.now() + 3600000), // 1 hour from now
    ...overrides,
  };
}

/** Valid API keys per provider for testing. */
const VALID_API_KEYS: Record<string, string> = {
  openai: 'sk-openai-test-key-1234567890',
  anthropic: 'sk-ant-anthropic-test-key-1234567890',
  google: 'AIzaGoogleTestKey1234567890',
};

/** Invalid API keys per provider for testing. */
const INVALID_API_KEYS: Record<string, string> = {
  openai: 'invalid-no-prefix',
  anthropic: 'sk-wrong-prefix-test',
  google: '123StartsWithNumber',
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
let settingsPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-test-'));
  settingsPath = path.join(tmpDir, 'settings.json');
  SettingsManager.initializeWithFilePath(settingsPath);
  // Reset TokenManager static state between tests
  (TokenManager as any).persistentTokens = null;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  // Reset SettingsManager static state
  (SettingsManager as any).initialized = false;
  (SettingsManager as any).persistentSettings = new Map();
  (SettingsManager as any).persistentApiKeys = new Map();
  (SettingsManager as any).persistentActiveProvider = null;
  (SettingsManager as any).persistentProviderValidationStatus = new Map();
  (SettingsManager as any).settingsPath = null;
  (SettingsManager as any).savePending = false;
});

// ---------------------------------------------------------------------------
// Feature: Onboarding
// ---------------------------------------------------------------------------

describe('Feature: Onboarding', () => {

  // -------------------------------------------------------------------------
  // 1. First-Launch Detection
  // -------------------------------------------------------------------------
  describe('First-Launch Detection', () => {
    it('onboarding_complete defaults to false on fresh install', async () => {
      const settings = new SettingsManager();

      const isComplete = await settings.get<boolean>('onboarding_complete');

      expect(isComplete).toBe(false);
    });

    it('detects fresh install by absence of settings file', async () => {
      // Settings file does not exist yet (only the tmp dir exists)
      expect(fs.existsSync(settingsPath)).toBe(false);

      const settings = new SettingsManager();
      const isComplete = await settings.get<boolean>('onboarding_complete');

      // Even without a file, defaults to false
      expect(isComplete).toBe(false);
    });

    it('detects completed onboarding after setting onboarding_complete', async () => {
      const settings = new SettingsManager();
      await settings.set('onboarding_complete', true);

      // Allow debounced save to complete
      await new Promise(r => setTimeout(r, 50));

      const isComplete = await settings.get<boolean>('onboarding_complete');
      expect(isComplete).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Gmail Connection: TokenManager stores tokens
  // -------------------------------------------------------------------------
  describe('Gmail Connection', () => {
    it('stores and retrieves OAuth tokens', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);
      const tokens = createTestTokens();

      await tokenManager.setTokens(tokens);
      const stored = await tokenManager.getStoredTokens();

      expect(stored).not.toBeNull();
      expect(stored!.access_token).toBe(tokens.access_token);
      expect(stored!.refresh_token).toBe(tokens.refresh_token);
    });

    it('returns null when no tokens are stored', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      const stored = await tokenManager.getStoredTokens();

      expect(stored).toBeNull();
    });

    it('preserves token expiry date through storage cycle', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);
      const expiryDate = new Date('2026-12-31T23:59:59.999Z');
      const tokens = createTestTokens({ expiry_date: expiryDate });

      await tokenManager.setTokens(tokens);
      const stored = await tokenManager.getStoredTokens();

      expect(stored!.expiry_date.getTime()).toBe(expiryDate.getTime());
    });

    it('validates tokens against Gmail API', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      // With tokens set, validation should call getProfile
      await tokenManager.setTokens(createTestTokens());
      const isValid = await tokenManager.validateTokens();

      expect(isValid).toBe(true);
      expect(gmailClient.getProfile).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Preferences: sync interval + lookback persisted
  // -------------------------------------------------------------------------
  describe('Preferences', () => {
    it('persists sync interval (processing interval)', async () => {
      const settings = new SettingsManager();

      await settings.setProcessingInterval(60);

      expect(await settings.getProcessingInterval()).toBe(60);
    });

    it('persists lookback days', async () => {
      const settings = new SettingsManager();

      await settings.setLookbackDays(60);

      expect(await settings.getLookbackDays()).toBe(60);
    });

    it('uses default processing interval of 30 minutes', async () => {
      const settings = new SettingsManager();

      const interval = await settings.getProcessingInterval();

      expect(interval).toBe(30);
    });

    it('uses default lookback days of 30', async () => {
      const settings = new SettingsManager();

      const days = await settings.getLookbackDays();

      expect(days).toBe(30);
    });

    it('rejects invalid processing interval values', async () => {
      const settings = new SettingsManager();

      await expect(settings.setProcessingInterval(999)).rejects.toThrow(
        /Invalid processing interval/
      );
    });

    it('rejects invalid lookback days values', async () => {
      const settings = new SettingsManager();

      await expect(settings.setLookbackDays(999)).rejects.toThrow(
        /Invalid lookback days/
      );
    });

    it('accepts all valid processing intervals', async () => {
      const settings = new SettingsManager();
      const validIntervals = [15, 30, 60, 120, 1440];

      for (const interval of validIntervals) {
        await settings.setProcessingInterval(interval);
        expect(await settings.getProcessingInterval()).toBe(interval);
      }
    });

    it('accepts all valid lookback days', async () => {
      const settings = new SettingsManager();
      const validDays = [7, 14, 30, 60, 90];

      for (const days of validDays) {
        await settings.setLookbackDays(days);
        expect(await settings.getLookbackDays()).toBe(days);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. LLM Provider: select and configure (openai/anthropic/google only)
  // -------------------------------------------------------------------------
  describe('LLM Provider', () => {
    it('lists only supported providers: openai, anthropic, google', () => {
      const providers = getAvailableProviders();

      expect(providers).toEqual(['openai', 'anthropic', 'google']);
      expect(providers).not.toContain('zai');
      expect(providers).not.toContain('openrouter');
      expect(providers).not.toContain('groq');
    });

    it('validates correct API key format for openai', async () => {
      const settings = new SettingsManager();

      const result = await settings.validateApiKey('openai', VALID_API_KEYS.openai);

      expect(result.valid).toBe(true);
    });

    it('validates correct API key format for anthropic', async () => {
      const settings = new SettingsManager();

      const result = await settings.validateApiKey('anthropic', VALID_API_KEYS.anthropic);

      expect(result.valid).toBe(true);
    });

    it('validates correct API key format for google', async () => {
      const settings = new SettingsManager();

      const result = await settings.validateApiKey('google', VALID_API_KEYS.google);

      expect(result.valid).toBe(true);
    });

    it('rejects invalid API key format for openai', async () => {
      const settings = new SettingsManager();

      const result = await settings.validateApiKey('openai', INVALID_API_KEYS.openai);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid.*API key format/i);
    });

    it('rejects invalid API key format for anthropic', async () => {
      const settings = new SettingsManager();

      const result = await settings.validateApiKey('anthropic', INVALID_API_KEYS.anthropic);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid.*API key format/i);
    });

    it('rejects invalid API key format for google', async () => {
      const settings = new SettingsManager();

      const result = await settings.validateApiKey('google', INVALID_API_KEYS.google);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Invalid.*API key format/i);
    });

    it('stores API key for a provider and returns it decrypted', async () => {
      const settings = new SettingsManager();

      await settings.setApiKey('openai', VALID_API_KEYS.openai);
      const retrieved = await settings.getApiKey('openai');

      expect(retrieved).toBe(VALID_API_KEYS.openai);
    });

    it('tracks configured providers', async () => {
      const settings = new SettingsManager();

      await settings.setApiKey('openai', VALID_API_KEYS.openai);
      await settings.setApiKey('anthropic', VALID_API_KEYS.anthropic);

      const configured = await settings.getConfiguredProviders();

      expect(configured).toContain('openai');
      expect(configured).toContain('anthropic');
      expect(configured).not.toContain('google');
    });

    it('sets and retrieves active provider', async () => {
      const settings = new SettingsManager();

      await settings.setApiKey('anthropic', VALID_API_KEYS.anthropic);
      await settings.setActiveProvider('anthropic');

      const active = await settings.getActiveProvider();

      expect(active).toBe('anthropic');
    });

    it('rejects setting active provider that is not configured', async () => {
      const settings = new SettingsManager();

      await expect(settings.setActiveProvider('openai')).rejects.toThrow(
        /Provider openai is not configured/
      );
    });

    it('rejects storing invalid API key via setApiKey', async () => {
      const settings = new SettingsManager();

      await expect(settings.setApiKey('openai', INVALID_API_KEYS.openai)).rejects.toThrow(
        /Invalid API key/
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Start Processing: settings trigger sync readiness
  // -------------------------------------------------------------------------
  describe('Start Processing', () => {
    it('full onboarding configuration is present after all steps', async () => {
      const settings = new SettingsManager();

      // Simulate full onboarding
      await settings.setProcessingInterval(30);
      await settings.setLookbackDays(30);
      await settings.setApiKey('anthropic', VALID_API_KEYS.anthropic);
      await settings.setActiveProvider('anthropic');
      await settings.set('onboarding_complete', true);

      // Verify everything is set
      expect(await settings.getProcessingInterval()).toBe(30);
      expect(await settings.getLookbackDays()).toBe(30);
      expect(await settings.getActiveProvider()).toBe('anthropic');
      expect(await settings.get<boolean>('onboarding_complete')).toBe(true);
    });

    it('can export settings after onboarding', async () => {
      const settings = new SettingsManager();

      await settings.setProcessingInterval(60);
      await settings.setLookbackDays(90);

      const exported = await settings.exportSettings();

      expect(exported.processingInterval).toBe(60);
      expect(exported.lookbackDays).toBe(90);
      expect(exported.version).toBe('1.0');
    });

    it('processing interval and lookback are ready for sync', async () => {
      const settings = new SettingsManager();

      // Defaults should be usable for processing
      const interval = await settings.getProcessingInterval();
      const lookback = await settings.getLookbackDays();

      expect(interval).toBeGreaterThan(0);
      expect(lookback).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Completion: onboardingComplete=true persists
  // -------------------------------------------------------------------------
  describe('Completion', () => {
    it('onboarding_complete persists to disk', async () => {
      const settings = new SettingsManager();
      await settings.set('onboarding_complete', true);

      // Allow debounced save to complete
      await new Promise(r => setTimeout(r, 50));

      // Read raw file to verify persistence
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.settings.onboarding_complete).toBe(true);
    });

    it('new SettingsManager instance reads persisted onboarding state', async () => {
      const settings1 = new SettingsManager();
      await settings1.set('onboarding_complete', true);

      // Allow save
      await new Promise(r => setTimeout(r, 50));

      // Simulate app restart: re-initialize from disk
      SettingsManager.initializeWithFilePath(settingsPath);
      const settings2 = new SettingsManager();

      const isComplete = await settings2.get<boolean>('onboarding_complete');
      expect(isComplete).toBe(true);
    });

    it('resetAllSettings clears onboarding_complete', async () => {
      const settings = new SettingsManager();
      await settings.set('onboarding_complete', true);
      await settings.resetAllSettings();

      const isComplete = await settings.get<boolean>('onboarding_complete');
      expect(isComplete).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 7. API Key Security: encrypted storage, not plaintext
  // -------------------------------------------------------------------------
  describe('API Key Security', () => {
    it('API key is not stored in plaintext in memory storage', async () => {
      const settings = new SettingsManager();
      await settings.setApiKey('openai', VALID_API_KEYS.openai);

      // Raw storage should contain the encrypted form, not the plaintext key
      const raw = await settings.getRawStorage();
      const parsed = JSON.parse(raw);

      // The stored value should differ from the plaintext key
      expect(parsed.apiKeys.openai).not.toBe(VALID_API_KEYS.openai);
    });

    it('API key survives encrypt-decrypt round trip', async () => {
      const settings = new SettingsManager();

      await settings.setApiKey('anthropic', VALID_API_KEYS.anthropic);
      const retrieved = await settings.getApiKey('anthropic');

      // Should get the original key back after decrypt
      expect(retrieved).toBe(VALID_API_KEYS.anthropic);
    });

    it('getApiKey returns null for unconfigured provider', async () => {
      const settings = new SettingsManager();

      const key = await settings.getApiKey('google');

      expect(key).toBeNull();
    });

    it('TokenManager encrypts tokens in storage', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);
      const tokens = createTestTokens();

      await tokenManager.setTokens(tokens);

      // Raw storage should not contain plaintext tokens
      const raw = await tokenManager.getRawStorage();
      const parsed = JSON.parse(raw);

      expect(parsed.access_token).not.toBe(tokens.access_token);
      expect(parsed.refresh_token).not.toBe(tokens.refresh_token);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Config Persistence: settings survive new SettingsManager instance
  // -------------------------------------------------------------------------
  describe('Config Persistence', () => {
    it('settings survive app restart via file persistence', async () => {
      // First session: configure everything
      const settings1 = new SettingsManager();
      await settings1.setProcessingInterval(60);
      await settings1.setLookbackDays(90);
      await settings1.setApiKey('openai', VALID_API_KEYS.openai);
      await settings1.setActiveProvider('openai');

      // Allow debounced save
      await new Promise(r => setTimeout(r, 50));

      // Simulate restart: re-initialize from the same file
      SettingsManager.initializeWithFilePath(settingsPath);
      const settings2 = new SettingsManager();

      expect(await settings2.getProcessingInterval()).toBe(60);
      expect(await settings2.getLookbackDays()).toBe(90);
      expect(await settings2.getApiKey('openai')).toBe(VALID_API_KEYS.openai);
      expect(await settings2.getActiveProvider()).toBe('openai');
    });

    it('partial configuration is preserved across instances', async () => {
      // Only set preferences, not LLM
      const settings1 = new SettingsManager();
      await settings1.setProcessingInterval(15);
      await settings1.setLookbackDays(7);

      // Allow save
      await new Promise(r => setTimeout(r, 50));

      // New instance should see partial config
      SettingsManager.initializeWithFilePath(settingsPath);
      const settings2 = new SettingsManager();

      expect(await settings2.getProcessingInterval()).toBe(15);
      expect(await settings2.getLookbackDays()).toBe(7);
      expect(await settings2.getConfiguredProviders()).toEqual([]);
    });

    it('import and export settings round-trip', async () => {
      const settings = new SettingsManager();
      await settings.setProcessingInterval(120);
      await settings.setLookbackDays(60);

      const exported = await settings.exportSettings();

      // Reset and re-import
      await settings.resetAllSettings();
      await settings.importSettings(exported);

      expect(await settings.getProcessingInterval()).toBe(120);
      expect(await settings.getLookbackDays()).toBe(60);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Skip Onboarding: can skip and still have defaults
  // -------------------------------------------------------------------------
  describe('Skip Onboarding', () => {
    it('defaults are usable when onboarding is not completed', async () => {
      const settings = new SettingsManager();
      // Do NOT set onboarding_complete

      // Defaults should still provide usable values
      const interval = await settings.getProcessingInterval();
      const lookback = await settings.getLookbackDays();

      expect(interval).toBe(30);
      expect(lookback).toBe(30);
    });

    it('no providers configured when onboarding is skipped', async () => {
      const settings = new SettingsManager();

      const configured = await settings.getConfiguredProviders();
      const active = await settings.getActiveProvider();

      expect(configured).toEqual([]);
      expect(active).toBeNull();
    });

    it('can configure later after skipping', async () => {
      const settings = new SettingsManager();

      // "Skip" onboarding -- do nothing

      // Later, configure a provider
      await settings.setApiKey('google', VALID_API_KEYS.google);
      await settings.setActiveProvider('google');

      const configured = await settings.getConfiguredProviders();
      expect(configured).toContain('google');

      const active = await settings.getActiveProvider();
      expect(active).toBe('google');
    });
  });

  // -------------------------------------------------------------------------
  // 10. OAuth Timeout: token expiry handled
  // -------------------------------------------------------------------------
  describe('OAuth Timeout', () => {
    it('detects expired token', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      const expiredTokens = createTestTokens({
        expiry_date: new Date(Date.now() - 1000), // 1 second ago
      });

      const isExpired = tokenManager.isTokenExpired(expiredTokens.expiry_date);
      expect(isExpired).toBe(true);
    });

    it('does not flag valid token as expired', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      const validTokens = createTestTokens({
        expiry_date: new Date(Date.now() + 3600000), // 1 hour from now
      });

      const isExpired = tokenManager.isTokenExpired(validTokens.expiry_date);
      expect(isExpired).toBe(false);
    });

    it('detects token needing refresh (within buffer)', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      // Token expires in 3 minutes (within 5 minute buffer)
      const nearExpiryTokens = createTestTokens({
        expiry_date: new Date(Date.now() + 3 * 60 * 1000),
      });

      const shouldRefresh = tokenManager.shouldRefreshToken(nearExpiryTokens.expiry_date);
      expect(shouldRefresh).toBe(true);
    });

    it('does not refresh token far from expiry', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      const farFromExpiry = createTestTokens({
        expiry_date: new Date(Date.now() + 3600000), // 1 hour
      });

      const shouldRefresh = tokenManager.shouldRefreshToken(farFromExpiry.expiry_date);
      expect(shouldRefresh).toBe(false);
    });

    it('handles token revocation by clearing stored tokens', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);

      await tokenManager.setTokens(createTestTokens());

      // Simulate revocation
      await tokenManager.handleRevocation();

      const stored = await tokenManager.getStoredTokens();
      expect(stored).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 11. Onboarding Recovery: can resume incomplete onboarding
  // -------------------------------------------------------------------------
  describe('Onboarding Recovery', () => {
    it('can resume onboarding when incomplete: onboarding_complete is false', async () => {
      const settings = new SettingsManager();

      // Partial setup: preferences only, no provider
      await settings.setProcessingInterval(15);
      await settings.setLookbackDays(7);

      // Allow save
      await new Promise(r => setTimeout(r, 50));

      // New instance (simulating app restart)
      SettingsManager.initializeWithFilePath(settingsPath);
      const settings2 = new SettingsManager();

      // Onboarding should be detected as incomplete
      const isComplete = await settings2.get<boolean>('onboarding_complete');
      expect(isComplete).toBe(false);

      // But partial config should be preserved
      expect(await settings2.getProcessingInterval()).toBe(15);
      expect(await settings2.getLookbackDays()).toBe(7);
    });

    it('can complete remaining steps after partial recovery', async () => {
      const settings = new SettingsManager();

      // Partial: set preferences
      await settings.setProcessingInterval(60);
      await settings.setLookbackDays(90);
      await new Promise(r => setTimeout(r, 50));

      // Restart
      SettingsManager.initializeWithFilePath(settingsPath);
      const settings2 = new SettingsManager();

      // Complete remaining steps
      await settings2.setApiKey('openai', VALID_API_KEYS.openai);
      await settings2.setActiveProvider('openai');
      await settings2.set('onboarding_complete', true);
      await new Promise(r => setTimeout(r, 50));

      // Verify full configuration
      SettingsManager.initializeWithFilePath(settingsPath);
      const settings3 = new SettingsManager();

      expect(await settings3.getProcessingInterval()).toBe(60);
      expect(await settings3.getLookbackDays()).toBe(90);
      expect(await settings3.getActiveProvider()).toBe('openai');
      expect(await settings3.get<boolean>('onboarding_complete')).toBe(true);
    });

    it('preserves tokens when onboarding is incomplete', async () => {
      const gmailClient = createMockGmailClient();
      const tokenManager = new TokenManager(gmailClient);
      const tokens = createTestTokens();

      await tokenManager.setTokens(tokens);

      // Create new TokenManager instance (simulates restart with same static state)
      const tokenManager2 = new TokenManager(gmailClient);
      const stored = await tokenManager2.getStoredTokens();

      // TokenManager uses static persistence, so tokens survive
      expect(stored).not.toBeNull();
      expect(stored!.access_token).toBe(tokens.access_token);
    });
  });

  // -------------------------------------------------------------------------
  // Back Navigation: preferences can be re-modified
  // -------------------------------------------------------------------------
  describe('Back Navigation', () => {
    it('preferences can be changed after initial selection', async () => {
      const settings = new SettingsManager();

      // Set initial preferences
      await settings.setProcessingInterval(15);
      await settings.setLookbackDays(7);

      // Go back and change
      await settings.setProcessingInterval(120);
      await settings.setLookbackDays(90);

      expect(await settings.getProcessingInterval()).toBe(120);
      expect(await settings.getLookbackDays()).toBe(90);
    });

    it('active provider can be switched to another configured provider', async () => {
      const settings = new SettingsManager();

      // Configure two providers
      await settings.setApiKey('openai', VALID_API_KEYS.openai);
      await settings.setApiKey('anthropic', VALID_API_KEYS.anthropic);

      // Select first
      await settings.setActiveProvider('openai');
      expect(await settings.getActiveProvider()).toBe('openai');

      // Switch to second
      await settings.setActiveProvider('anthropic');
      expect(await settings.getActiveProvider()).toBe('anthropic');
    });

    it('provider validation status is tracked', async () => {
      const settings = new SettingsManager();

      // No validation status initially
      const initial = await settings.getProviderValidationStatus('openai');
      expect(initial).toBeNull();

      // Set validation status
      await settings.setProviderValidationStatus('openai', true);
      const status = await settings.getProviderValidationStatus('openai');

      expect(status).not.toBeNull();
      expect(status!.isValid).toBe(true);
      expect(status!.timestamp).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // LLM Provider Manager integration
  // -------------------------------------------------------------------------
  describe('LLMProviderManager', () => {
    it('lists providers with status information', async () => {
      const settings = new SettingsManager();
      const manager = new LLMProviderManager(settings);

      const providers = await manager.listProviders();

      expect(providers).toHaveLength(3);
      expect(providers.map(p => p.id)).toEqual(['openai', 'anthropic', 'google']);
      // None configured initially
      providers.forEach(p => {
        expect(p.isConfigured).toBe(false);
      });
    });

    it('shows configured status after setting API key', async () => {
      const settings = new SettingsManager();
      const manager = new LLMProviderManager(settings);

      await manager.setProvider('anthropic', VALID_API_KEYS.anthropic);

      const providers = await manager.listProviders();
      const anthropic = providers.find(p => p.id === 'anthropic');

      expect(anthropic!.isConfigured).toBe(true);
    });

    it('rejects invalid API key via setProvider', async () => {
      const settings = new SettingsManager();
      const manager = new LLMProviderManager(settings);

      await expect(
        manager.setProvider('openai', INVALID_API_KEYS.openai)
      ).rejects.toThrow(/Invalid.*API key format/);
    });

    it('display names are human-readable', async () => {
      const settings = new SettingsManager();
      const manager = new LLMProviderManager(settings);

      const providers = await manager.listProviders();

      const names = providers.map(p => p.name);
      expect(names).toContain('OpenAI');
      expect(names).toContain('Anthropic');
      expect(names).toContain('Google AI');
    });
  });

  // -------------------------------------------------------------------------
  // Settings reset
  // -------------------------------------------------------------------------
  describe('Settings Reset', () => {
    it('resetAllSettings restores defaults', async () => {
      const settings = new SettingsManager();

      await settings.setProcessingInterval(1440);
      await settings.setLookbackDays(90);
      await settings.set('onboarding_complete', true);
      await settings.setApiKey('openai', VALID_API_KEYS.openai);

      await settings.resetAllSettings();

      expect(await settings.getProcessingInterval()).toBe(30);
      expect(await settings.getLookbackDays()).toBe(30);
      expect(await settings.get<boolean>('onboarding_complete')).toBe(false);
      expect(await settings.getApiKey('openai')).toBeNull();
    });

    it('resetSetting restores individual setting to default', async () => {
      const settings = new SettingsManager();

      await settings.setProcessingInterval(120);
      await settings.resetSetting('processingInterval');

      expect(await settings.getProcessingInterval()).toBe(30);
    });

    it('reset throws for unknown setting', async () => {
      const settings = new SettingsManager();

      await expect(settings.resetSetting('unknownSetting')).rejects.toThrow(
        /Unknown setting/
      );
    });
  });
});
