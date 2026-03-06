import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Onboarding Flow
 *
 * Design Spec Reference: Lines 1162-1166
 *
 * As a new user, I want a guided setup experience that helps me:
 * 1. Connect my Gmail account
 * 2. Set my preferences (lookback period, sync interval)
 * 3. Configure my LLM provider and API key
 * 4. Start processing my emails
 */
describe('Feature: Onboarding', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch({ freshInstall: true });
    gmail = await GmailTestAccount.connect();
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Welcome Screen', () => {
    it('User sees welcome screen on first launch', async () => {
      // Given: Fresh install
      await app.clearAllData();

      // When: User launches app
      await app.launch();

      // Then: Welcome screen is shown
      const currentScreen = await app.getCurrentScreen();
      expect(currentScreen.name).toBe('onboarding-welcome');
      expect(currentScreen.content).toMatch(/welcome|get started/i);
    });

    it('User sees "Connect Gmail" button prominently', async () => {
      // When: User views welcome screen
      const welcomeScreen = await app.getCurrentScreen();

      // Then: Connect Gmail button is visible
      expect(welcomeScreen.buttons).toContainEqual(
        expect.objectContaining({
          text: expect.stringMatching(/connect.*gmail/i),
          primary: true,
        })
      );
    });

    it('User sees app benefits before connecting', async () => {
      // When: User views welcome screen
      const content = await app.getScreenContent();

      // Then: Key benefits are explained
      expect(content).toMatch(/automatically|ai|clean|inbox/i);
    });
  });

  describe('Gmail Connection Step', () => {
    it('User can initiate Gmail OAuth flow', async () => {
      // Given: User is on welcome screen
      await app.navigateToOnboardingStep('welcome');

      // When: User clicks "Connect Gmail"
      const result = await app.clickConnectGmail();

      // Then: OAuth flow is initiated
      expect(result.oauthUrl).toContain('accounts.google.com');
      expect(result.oauthUrl).toContain('gmail.readonly');
      expect(result.oauthUrl).toContain('gmail.modify');
    });

    it('User sees success message after completing OAuth', async () => {
      // Given: User has authorized Gmail access
      await app.completeOAuthFlow(gmail.credentials);

      // When: OAuth completes
      const currentScreen = await app.getCurrentScreen();

      // Then: Success is shown
      expect(currentScreen.content).toMatch(/connected|success/i);
    });

    it('User sees their Gmail email address after connecting', async () => {
      // Given: Gmail is connected
      await app.completeOAuthFlow(gmail.credentials);

      // When: User views the screen
      const content = await app.getScreenContent();

      // Then: Their email is shown
      expect(content).toContain(gmail.emailAddress);
    });

    it('User sees error message if OAuth fails', async () => {
      // Given: User starts OAuth
      await app.navigateToOnboardingStep('gmail-connect');

      // When: OAuth fails (user denies access)
      await app.simulateOAuthFailure('access_denied');

      // Then: Clear error is shown
      const currentScreen = await app.getCurrentScreen();
      expect(currentScreen.content).toMatch(/denied|permission|try again/i);
      expect(currentScreen.buttons).toContainEqual(
        expect.objectContaining({
          text: expect.stringMatching(/try again|retry/i),
        })
      );
    });
  });

  describe('Preferences Step', () => {
    it('User can select lookback period after connecting Gmail', async () => {
      // Given: Gmail is connected
      await app.completeOAuthFlow(gmail.credentials);
      await app.proceedToNextOnboardingStep();

      // When: User sees preferences screen
      const currentScreen = await app.getCurrentScreen();
      expect(currentScreen.name).toBe('onboarding-preferences');

      // Then: Lookback options are available
      const lookbackOptions = await app.getLookbackOptions();
      expect(lookbackOptions).toContainEqual(
        expect.objectContaining({ value: 7, label: expect.stringMatching(/7.*day/i) })
      );
      expect(lookbackOptions).toContainEqual(
        expect.objectContaining({ value: 30, label: expect.stringMatching(/30.*day/i) })
      );
      expect(lookbackOptions).toContainEqual(
        expect.objectContaining({ value: 90, label: expect.stringMatching(/90.*day/i) })
      );
    });

    it('User can select sync interval', async () => {
      // Given: User is on preferences screen
      await app.completeOAuthFlow(gmail.credentials);
      await app.proceedToNextOnboardingStep();

      // When: User sees sync interval options
      const syncOptions = await app.getSyncIntervalOptions();

      // Then: Common intervals are available
      expect(syncOptions).toContainEqual(
        expect.objectContaining({ value: 15, label: expect.stringMatching(/15.*min/i) })
      );
      expect(syncOptions).toContainEqual(
        expect.objectContaining({ value: 30, label: expect.stringMatching(/30.*min/i) })
      );
      expect(syncOptions).toContainEqual(
        expect.objectContaining({ value: 60, label: expect.stringMatching(/1.*hour/i) })
      );
    });

    it('User sees explanation of what each option means', async () => {
      // Given: User is on preferences screen
      await app.completeOAuthFlow(gmail.credentials);
      await app.proceedToNextOnboardingStep();

      // When: User views preferences
      const content = await app.getScreenContent();

      // Then: Explanations are provided
      expect(content).toMatch(/lookback|process|email|previous/i);
    });

    it('User can proceed with default preferences', async () => {
      // Given: User is on preferences screen
      await app.completeOAuthFlow(gmail.credentials);
      await app.proceedToNextOnboardingStep();

      // When: User clicks Continue without changing defaults
      await app.clickContinue();

      // Then: Proceeds to next step with default values
      const currentScreen = await app.getCurrentScreen();
      expect(currentScreen.name).toBe('onboarding-llm');

      const settings = await app.getSettings();
      expect(settings.lookbackDays).toBeDefined(); // Has default
      expect(settings.syncInterval).toBeDefined(); // Has default
    });
  });

  describe('LLM Provider Step', () => {
    it('User can select their preferred LLM provider', async () => {
      // Given: User is on LLM configuration screen
      await app.navigateToOnboardingStep('llm');

      // When: User sees provider options
      const providers = await app.getAvailableProviders();

      // Then: Major providers are available
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('google');
    });

    it('User can enter their API key', async () => {
      // Given: User selected a provider
      await app.navigateToOnboardingStep('llm');
      await app.selectProvider('anthropic');

      // When: User sees API key input
      const currentScreen = await app.getCurrentScreen();
      expect(currentScreen.hasApiKeyInput).toBe(true);

      // And: Enters their key
      await app.enterApiKey('sk-ant-test-key-12345');

      // Then: Key is accepted (masked)
      const maskedKey = await app.getMaskedApiKey();
      expect(maskedKey).toMatch(/sk-ant-\*+/);
    });

    it('User sees API key is validated before proceeding', async () => {
      // Given: User enters API key
      await app.navigateToOnboardingStep('llm');
      await app.selectProvider('openai');
      await app.enterApiKey('sk-test-key');

      // When: User clicks Validate/Save
      const result = await app.validateApiKey();

      // Then: Validation occurs
      expect(result.isValid).toBe(true);
    });

    it('User sees error if API key is invalid', async () => {
      // Given: User enters invalid key
      await app.navigateToOnboardingStep('llm');
      await app.selectProvider('openai');
      await app.enterApiKey('invalid-key');

      // When: Validation runs
      const result = await app.validateApiKey();

      // Then: Clear error is shown
      expect(result.isValid).toBe(false);
      expect(result.error).toMatch(/invalid|incorrect|unauthorized/i);
    });

    it('User sees pricing/usage information', async () => {
      // Given: User is on LLM screen
      await app.navigateToOnboardingStep('llm');

      // When: User views the screen
      const content = await app.getScreenContent();

      // Then: Pricing info or usage estimate is shown
      expect(content).toMatch(/usage|cost|estimate|\$|token/i);
    });
  });

  describe('Start Processing Step', () => {
    it('User sees summary of their configuration before starting', async () => {
      // Given: User completed all steps
      await app.completeOAuthFlow(gmail.credentials);
      await app.configurePreferences({ lookbackDays: 30, syncInterval: 30 });
      await app.configureLLM({ provider: 'anthropic', apiKey: 'test-key' });
      await app.proceedToNextOnboardingStep();

      // When: User sees final screen
      const content = await app.getScreenContent();

      // Then: Configuration summary is shown
      expect(content).toMatch(/30.*day/i); // Lookback
      expect(content).toMatch(/30.*min/i); // Sync interval
      expect(content).toMatch(/anthropic/i); // Provider
    });

    it('User can start processing with "Start Now" button', async () => {
      // Given: User is on final onboarding screen
      await app.navigateToOnboardingStep('complete');

      // When: User clicks Start
      await app.clickStartProcessing();

      // Then: Processing begins
      const syncStatus = await app.getSyncStatus();
      expect(syncStatus.status).toMatch(/syncing|processing/i);

      // And: User is taken to main app
      const currentScreen = await app.getCurrentScreen();
      expect(currentScreen.name).toBe('timeline');
    });

    it('User sees progress immediately after starting', async () => {
      // Given: User just started processing
      await app.completeOnboarding({
        gmail: gmail.credentials,
        preferences: { lookbackDays: 30, syncInterval: 30 },
        llm: { provider: 'anthropic', apiKey: 'test-key' },
      });

      // When: Processing starts
      await app.clickStartProcessing();

      // Then: Progress is visible
      const progress = await app.getProcessingProgress();
      expect(progress).toBeDefined();
      expect(progress.status).toMatch(/processing|syncing/i);
    });
  });

  describe('Onboarding Completion', () => {
    it('User does not see onboarding again after completion', async () => {
      // Given: User completed onboarding
      await app.completeOnboarding({
        gmail: gmail.credentials,
        preferences: { lookbackDays: 30, syncInterval: 30 },
        llm: { provider: 'anthropic', apiKey: 'test-key' },
      });

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: User goes directly to main app
      const currentScreen = await app.getCurrentScreen();
      expect(currentScreen.name).not.toBe('onboarding-welcome');
      expect(currentScreen.name).toBe('timeline');
    });

    it('User can access onboarding again from settings if needed', async () => {
      // Given: App is running
      await app.launch();

      // When: User navigates to settings
      await app.navigateTo('settings');

      // Then: Option to reconfigure exists
      const settingsContent = await app.getScreenContent();
      expect(settingsContent).toMatch(/reconfigure|setup|connect/i);
    });

    it('User sees "Skip" option during onboarding to defer configuration', async () => {
      // Given: User is on LLM step
      await app.navigateToOnboardingStep('llm');

      // When: User views the screen
      const buttons = await app.getScreenButtons();

      // Then: Skip option is available
      expect(buttons).toContainEqual(
        expect.objectContaining({
          text: expect.stringMatching(/skip|later/i),
        })
      );
    });
  });

  describe('Onboarding Recovery', () => {
    it('User can resume onboarding if they quit mid-way', async () => {
      // Given: User started but didn't complete onboarding
      await app.clearAllData();
      await app.launch();
      await app.completeOAuthFlow(gmail.credentials);
      // Quit before finishing
      await app.shutdown();

      // When: User relaunches
      app = await TuskerBrainApp.launch();

      // Then: User resumes where they left off
      const currentScreen = await app.getCurrentScreen();
      expect(currentScreen.name).toBe('onboarding-preferences'); // Not welcome
    });

    it('User sees their Gmail still connected when resuming', async () => {
      // Given: User connected Gmail but quit
      await app.clearAllData();
      await app.launch();
      await app.completeOAuthFlow(gmail.credentials);
      await app.shutdown();

      // When: User relaunches
      app = await TuskerBrainApp.launch();

      // Then: Gmail connection is remembered
      const content = await app.getScreenContent();
      expect(content).toContain(gmail.emailAddress);
    });
  });
});
