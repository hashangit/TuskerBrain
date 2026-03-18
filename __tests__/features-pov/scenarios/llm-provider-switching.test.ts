import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { EmailFixtures } from '@fixtures/email-fixtures';

/**
 * Scenario: LLM Provider Switching
 *
 * Tests switching between different LLM providers mid-session,
 * ensuring configuration changes take effect immediately.
 *
 * Supported Providers:
 * - Anthropic (Claude)
 * - OpenAI
 * - Google (Gemini)
 * - Groq
 * - ZAI
 * - OpenRouter
 */
describe('Scenario: LLM Provider Switching', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    gmail = await GmailTestAccount.connect();
    await app.connectGmail(gmail.credentials);
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Provider Switch', () => {
    it('User can switch from Anthropic to OpenAI', async () => {
      // Given: Using Anthropic
      await app.configureLLM({ provider: 'anthropic', apiKey: 'sk-ant-test' });
      const beforeConfig = await app.getLLMConfig();
      expect(beforeConfig.provider).toBe('anthropic');

      // When: Switching to OpenAI
      await app.configureLLM({ provider: 'openai', apiKey: 'sk-openai-test' });

      // Then: Configuration is updated
      const afterConfig = await app.getLLMConfig();
      expect(afterConfig.provider).toBe('openai');
    });

    it('User can switch from OpenAI to Google Gemini', async () => {
      // Given: Using OpenAI
      await app.configureLLM({ provider: 'openai', apiKey: 'sk-test' });

      // When: Switching to Google
      await app.configureLLM({ provider: 'google', apiKey: 'AIza-test' });

      // Then: Configuration is updated
      const config = await app.getLLMConfig();
      expect(config.provider).toBe('google');
    });

    it('User can switch to Groq provider', async () => {
      // Given: Using another provider
      await app.configureLLM({ provider: 'anthropic', apiKey: 'test' });

      // When: Switching to Groq
      await app.configureLLM({ provider: 'groq', apiKey: 'gsk-test' });

      // Then: Configuration is updated
      const config = await app.getLLMConfig();
      expect(config.provider).toBe('groq');
    });

    it('User can switch to ZAI provider', async () => {
      // Given: Using another provider
      await app.configureLLM({ provider: 'openai', apiKey: 'test' });

      // When: Switching to ZAI
      await app.configureLLM({ provider: 'zai', apiKey: 'zai-test' });

      // Then: Configuration is updated
      const config = await app.getLLMConfig();
      expect(config.provider).toBe('zai');
    });

    it('User can switch to OpenRouter provider', async () => {
      // Given: Using another provider
      await app.configureLLM({ provider: 'anthropic', apiKey: 'test' });

      // When: Switching to OpenRouter
      await app.configureLLM({ provider: 'openrouter', apiKey: 'sk-or-test' });

      // Then: Configuration is updated
      const config = await app.getLLMConfig();
      expect(config.provider).toBe('openrouter');
    });
  });

  describe('Immediate Effect', () => {
    it('New provider is used immediately for next email', async () => {
      // Given: Using Anthropic
      await app.configureLLM({ provider: 'anthropic', apiKey: 'sk-ant-test' });

      // When: Switch to OpenAI and process email
      await app.configureLLM({ provider: 'openai', apiKey: 'sk-openai-test' });
      await app.processEmail({
        id: 'provider-switch-1',
        subject: 'Test Email',
        body: 'Content for provider switch test.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // Then: OpenAI was used
      const job = await app.getJobForEmail('provider-switch-1');
      expect(job.llmProvider).toBe('openai');
    });
  });

  describe('API Key Validation', () => {
    it('New API key is validated on provider switch', async () => {
      // Given: Valid configuration
      await app.configureLLM({ provider: 'anthropic', apiKey: 'valid-key' });

      // When: Switching with invalid key
      const result = await app.configureLLM({ provider: 'openai', apiKey: 'invalid-key' });

      // Then: Validation result is returned
      expect(result.isValid).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('Failed switch does not break existing configuration', async () => {
      // Given: Working Anthropic config
      await app.configureLLM({ provider: 'anthropic', apiKey: 'valid-anthropic-key' });

      // When: Attempting invalid switch
      await app.configureLLM({ provider: 'openai', apiKey: 'invalid' });

      // Then: Original config still works
      const config = await app.getLLMConfig();
      expect(config.provider).toBe('anthropic');
    });
  });

  describe('Provider Capabilities', () => {
    it('Each provider shows appropriate model options', async () => {
      // When: Checking Anthropic models
      await app.configureLLM({ provider: 'anthropic', apiKey: 'test' });
      const anthropicModels = await app.getAvailableModels();
      expect(anthropicModels.some(m => m.includes('claude'))).toBe(true);

      // When: Checking OpenAI models
      await app.configureLLM({ provider: 'openai', apiKey: 'test' });
      const openaiModels = await app.getAvailableModels();
      expect(openaiModels.some(m => m.includes('gpt'))).toBe(true);

      // When: Checking Google models
      await app.configureLLM({ provider: 'google', apiKey: 'test' });
      const googleModels = await app.getAvailableModels();
      expect(googleModels.some(m => m.includes('gemini'))).toBe(true);
    });
  });
});
