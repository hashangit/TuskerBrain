import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Scenario: LLM Provider Matrix
 *
 * Tests all supported LLM providers to ensure consistent behavior
 * across different AI backends.
 *
 * Supported Providers:
 * - Anthropic (Claude)
 * - OpenAI (GPT)
 * - Google (Gemini)
 * - Groq
 * - ZAI
 * - OpenRouter
 */
describe('Scenario: LLM Provider Matrix', () => {
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

  describe('Anthropic (Claude)', () => {
    it('Processes email with Claude successfully', async () => {
      // Given: Anthropic configured
      await app.configureLLM({
        provider: 'anthropic',
        apiKey: process.env.TEST_ANTHROPIC_KEY!,
      });

      // When: Processing email
      await app.processEmail({
        id: 'anthropic-test',
        subject: 'Project Update',
        body: 'The project is on track for delivery next week.',
        sender: 'client@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: Email processed successfully
      const email = await app.getEmail('anthropic-test');
      expect(email.topic).toBeDefined();
      expect(email.summary).toBeDefined();
    });
  });

  describe('OpenAI (GPT)', () => {
    it('Processes email with GPT successfully', async () => {
      // Given: OpenAI configured
      await app.configureLLM({
        provider: 'openai',
        apiKey: process.env.TEST_OPENAI_KEY!,
      });

      // When: Processing email
      await app.processEmail({
        id: 'openai-test',
        subject: 'Meeting Tomorrow',
        body: 'Let\'s meet at 3pm to discuss the proposal.',
        sender: 'colleague@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: Email processed successfully
      const email = await app.getEmail('openai-test');
      expect(email.topic).toBeDefined();
    });
  });

  describe('Google (Gemini)', () => {
    it('Processes email with Gemini successfully', async () => {
      // Given: Google configured
      await app.configureLLM({
        provider: 'google',
        apiKey: process.env.TEST_GOOGLE_KEY!,
      });

      // When: Processing email
      await app.processEmail({
        id: 'gemini-test',
        subject: 'Budget Review',
        body: 'Please review the attached budget for Q2.',
        sender: 'finance@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: Email processed successfully
      const email = await app.getEmail('gemini-test');
      expect(email.topic).toBeDefined();
    });
  });

  describe('Groq', () => {
    it('Processes email with Groq successfully', async () => {
      // Given: Groq configured
      await app.configureLLM({
        provider: 'groq',
        apiKey: process.env.TEST_GROQ_KEY!,
      });

      // When: Processing email
      await app.processEmail({
        id: 'groq-test',
        subject: 'Quick Update',
        body: 'Just a quick update on the project status.',
        sender: 'team@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: Email processed successfully
      const email = await app.getEmail('groq-test');
      expect(email.topic).toBeDefined();
    });
  });

  describe('ZAI', () => {
    it('Processes email with ZAI successfully', async () => {
      // Given: ZAI configured
      await app.configureLLM({
        provider: 'zai',
        apiKey: process.env.TEST_ZAI_KEY!,
      });

      // When: Processing email
      await app.processEmail({
        id: 'zai-test',
        subject: 'Invoice Received',
        body: 'Invoice #1234 for $500 is ready for payment.',
        sender: 'billing@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: Email processed successfully
      const email = await app.getEmail('zai-test');
      expect(email.topic).toBeDefined();
    });
  });

  describe('OpenRouter', () => {
    it('Processes email with OpenRouter successfully', async () => {
      // Given: OpenRouter configured
      await app.configureLLM({
        provider: 'openrouter',
        apiKey: process.env.TEST_OPENROUTER_KEY!,
      });

      // When: Processing email
      await app.processEmail({
        id: 'openrouter-test',
        subject: 'Newsletter',
        body: 'Weekly newsletter with updates and news.',
        sender: 'news@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: Email processed successfully
      const email = await app.getEmail('openrouter-test');
      expect(email.topic).toBeDefined();
    });
  });

  describe('Provider Consistency', () => {
    it('All providers extract similar topic structure', async () => {
      // Given: Same email content
      const emailContent = {
        subject: 'Chase Statement Ready',
        body: 'Your January statement shows a balance of $2,450.',
        sender: 'noreply@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date(),
      };

      const providers = ['anthropic', 'openai', 'google'];
      const topics: string[] = [];

      for (const provider of providers) {
        const key = process.env[`TEST_${provider.toUpperCase()}_KEY`];
        if (!key) continue;

        await app.configureLLM({ provider, apiKey: key });
        await app.processEmail({
          ...emailContent,
          id: `consistency-${provider}`,
        });
      }

      await app.waitForJobQueueCompletion();

      // When: Comparing topics
      for (const provider of providers) {
        const key = process.env[`TEST_${provider.toUpperCase()}_KEY`];
        if (!key) continue;

        const email = await app.getEmail(`consistency-${provider}`);
        topics.push(email.topic);
      }

      // Then: All providers identify banking-related topic
      topics.forEach(topic => {
        expect(topic.toLowerCase()).toMatch(/banking|chase|finance/);
      });
    });

    it('All providers identify action items consistently', async () => {
      // Given: Email with clear action item
      const emailContent = {
        subject: 'Action Required: Review Document',
        body: 'Please review the attached document by Friday EOD.',
        sender: 'manager@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      };

      const providers = ['anthropic', 'openai'];
      const hasActionItems: boolean[] = [];

      for (const provider of providers) {
        const key = process.env[`TEST_${provider.toUpperCase()}_KEY`];
        if (!key) continue;

        await app.configureLLM({ provider, apiKey: key });
        await app.processEmail({
          ...emailContent,
          id: `action-${provider}`,
        });
      }

      await app.waitForJobQueueCompletion();

      // When: Checking action items
      for (const provider of providers) {
        const key = process.env[`TEST_${provider.toUpperCase()}_KEY`];
        if (!key) continue;

        const email = await app.getEmail(`action-${provider}`);
        hasActionItems.push(email.hasActionItem);
      }

      // Then: All providers identify action item
      hasActionItems.forEach(hasAction => {
        expect(hasAction).toBe(true);
      });
    });
  });

  describe('Provider Fallback', () => {
    it('System can fallback to secondary provider on failure', async () => {
      // Given: Primary provider configured with fallback
      await app.configureLLM({
        provider: 'anthropic',
        apiKey: 'invalid-key',
        fallback: {
          provider: 'openai',
          apiKey: process.env.TEST_OPENAI_KEY!,
        },
      });

      // When: Processing email (primary will fail)
      await app.processEmail({
        id: 'fallback-test',
        subject: 'Test',
        body: 'Content.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await app.waitForJobQueueCompletion();

      // Then: Fallback was used
      const job = await app.getJobForEmail('fallback-test');
      expect(job.usedFallback).toBe(true);
      expect(job.llmProvider).toBe('openai');
    });
  });
});
