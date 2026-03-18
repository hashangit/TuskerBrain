import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Scenario: Fresh Install Journey
 *
 * Tests the complete user journey from fresh install through
 * successful email processing.
 *
 * Journey Steps:
 * 1. App launch with no existing data
 * 2. Welcome/onboarding screen
 * 3. Gmail connection
 * 4. LLM configuration
 * 5. Initial sync
 * 6. First processed email visible
 */
describe('Scenario: Fresh Install Journey', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  afterAll(async () => {
    if (app) await app.shutdown();
    if (gmail) await gmail.disconnect();
  });

  describe('Fresh Install Detection', () => {
    it('App detects fresh install state', async () => {
      // Given: Complete fresh state
      app = await TuskerBrainApp.launch({ freshInstall: true });

      // When: Checking app state
      const state = await app.getAppState();

      // Then: Fresh install is detected
      expect(state.isFreshInstall).toBe(true);
      expect(state.hasExistingData).toBe(false);
    });

    it('User sees welcome screen on fresh install', async () => {
      // Given: Fresh install
      app = await TuskerBrainApp.launch({ freshInstall: true });

      // When: App launches
      const screen = await app.getCurrentScreen();

      // Then: Welcome screen is shown
      expect(screen.name).toBe('onboarding-welcome');
    });
  });

  describe('Onboarding Flow', () => {
    it('User completes Gmail connection step', async () => {
      // Given: Fresh install at welcome screen
      app = await TuskerBrainApp.launch({ freshInstall: true });
      gmail = await GmailTestAccount.connect();

      // When: User connects Gmail
      await app.completeOAuthFlow(gmail.credentials);

      // Then: Gmail is connected
      const connectionStatus = await app.getGmailConnectionStatus();
      expect(connectionStatus.connected).toBe(true);
      expect(connectionStatus.email).toBe(gmail.emailAddress);
    });

    it('User configures LLM provider', async () => {
      // Given: Gmail connected
      app = await TuskerBrainApp.launch({ freshInstall: true });
      gmail = await GmailTestAccount.connect();
      await app.completeOAuthFlow(gmail.credentials);

      // When: User configures LLM
      await app.configureLLM({
        provider: 'anthropic',
        apiKey: process.env.TEST_LLM_API_KEY!,
      });

      // Then: LLM is configured
      const llmStatus = await app.getLLMStatus();
      expect(llmStatus.configured).toBe(true);
      expect(llmStatus.provider).toBe('anthropic');
    });

    it('User sets sync preferences', async () => {
      // Given: LLM configured
      app = await TuskerBrainApp.launch({ freshInstall: true });
      gmail = await GmailTestAccount.connect();
      await app.completeOAuthFlow(gmail.credentials);
      await app.configureLLM({
        provider: 'anthropic',
        apiKey: process.env.TEST_LLM_API_KEY!,
      });

      // When: User sets preferences
      await app.configurePreferences({
        lookbackDays: 30,
        syncInterval: 30,
      });

      // Then: Preferences are saved
      const settings = await app.getSettings();
      expect(settings.lookbackDays).toBe(30);
      expect(settings.syncInterval).toBe(30);
    });
  });

  describe('Initial Sync', () => {
    it('Initial sync starts automatically after onboarding', async () => {
      // Given: Onboarding complete
      app = await TuskerBrainApp.launch({ freshInstall: true });
      gmail = await GmailTestAccount.connect();
      await app.completeOnboarding({
        gmail: gmail.credentials,
        llm: { provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! },
        preferences: { lookbackDays: 30, syncInterval: 30 },
      });

      // When: Checking sync status
      const syncStatus = await app.getSyncStatus();

      // Then: Sync has started
      expect(syncStatus.status).toMatch(/syncing|processing|running/i);
    });

    it('User sees progress during initial sync', async () => {
      // Given: Sync in progress
      app = await TuskerBrainApp.launch({ freshInstall: true });
      gmail = await GmailTestAccount.connect();
      await gmail.seedInbox({ count: 100, mix: true });
      await app.completeOnboarding({
        gmail: gmail.credentials,
        llm: { provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! },
        preferences: { lookbackDays: 30, syncInterval: 30 },
      });

      // When: User views progress
      const progress = await app.getBackfillProgress();

      // Then: Progress is visible
      expect(progress).toBeDefined();
      expect(progress.percentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('First Processed Email', () => {
    it('User sees first email in timeline after processing', async () => {
      // Given: Fresh install with email
      app = await TuskerBrainApp.launch({ freshInstall: true });
      gmail = await GmailTestAccount.connect();

      const email = await gmail.seedEmail({
        subject: 'Welcome to TuskerBrain',
        body: 'This is your first email to be processed.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      await app.completeOnboarding({
        gmail: gmail.credentials,
        llm: { provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! },
        preferences: { lookbackDays: 30, syncInterval: 30 },
      });

      await app.waitForInitialSync();

      // When: User views timeline
      const timeline = await app.getTimeline();

      // Then: Email is visible
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline.some(e => e.id === email.id)).toBe(true);
    });

    it('First email has topic and summary extracted', async () => {
      // Given: First email processed
      app = await TuskerBrainApp.launch({ freshInstall: true });
      gmail = await GmailTestAccount.connect();

      const email = await gmail.seedEmail({
        subject: 'Project Alpha Update',
        body: 'The project is progressing well. We completed the first milestone.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      await app.completeOnboarding({
        gmail: gmail.credentials,
        llm: { provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! },
        preferences: { lookbackDays: 30, syncInterval: 30 },
      });

      await app.waitForJobQueueCompletion();

      // When: Viewing processed email
      const processed = await app.getEmailFromTimeline(email.id);

      // Then: Email has extracted data
      expect(processed.topic).toBeDefined();
      expect(processed.summary).toBeDefined();
    });
  });

  describe('Journey Completion', () => {
    it('User sees timeline as main screen after completing journey', async () => {
      // Given: Journey complete
      app = await TuskerBrainApp.launch({ freshInstall: true });
      gmail = await GmailTestAccount.connect();
      await app.completeOnboarding({
        gmail: gmail.credentials,
        llm: { provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! },
        preferences: { lookbackDays: 30, syncInterval: 30 },
      });

      await app.waitForInitialSync();

      // When: User views main screen
      const screen = await app.getCurrentScreen();

      // Then: Timeline is shown
      expect(screen.name).toBe('timeline');
    });

    it('Onboarding does not show again after completion', async () => {
      // Given: Journey complete and app restarted
      app = await TuskerBrainApp.launch({ freshInstall: true });
      gmail = await GmailTestAccount.connect();
      await app.completeOnboarding({
        gmail: gmail.credentials,
        llm: { provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! },
        preferences: { lookbackDays: 30, syncInterval: 30 },
      });

      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // When: Checking screen
      const screen = await app.getCurrentScreen();

      // Then: Welcome screen not shown
      expect(screen.name).not.toBe('onboarding-welcome');
    });
  });
});
