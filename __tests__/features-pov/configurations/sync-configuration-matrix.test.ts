import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { EmailFixtures } from '@fixtures/email-fixtures';

/**
 * Scenario: Sync Configuration Matrix
 *
 * Tests various combinations of sync interval and lookback period
 * configurations to ensure they work correctly together.
 *
 * Configuration Matrix:
 * - Sync intervals: 15min, 30min, 1hr, 2hr, daily
 * - Lookback periods: 7, 14, 30, 60, 90 days
 */
describe('Scenario: Sync Configuration Matrix', () => {
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

  describe('Sync Interval Configurations', () => {
    it('15-minute sync interval processes new emails quickly', async () => {
      // Given: 15-minute interval
      await app.configureSyncInterval(15);
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      // When: New email arrives
      const newEmail = await gmail.seedEmail({
        subject: 'New Email',
        body: 'Fresh content',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // And: Wait for next sync (under 15 minutes)
      await app.waitForNextSync();

      // Then: Email is processed
      const processed = await app.getEmailFromTimeline(newEmail.id);
      expect(processed).toBeDefined();
    });

    it('1-hour sync interval checks less frequently', async () => {
      // Given: 1-hour interval
      await app.configureSyncInterval(60);
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      // When: Checking sync schedule
      const syncStatus = await app.getSyncStatus();

      // Then: Next sync is scheduled for ~1 hour
      const expectedNextSync = Date.now() + 60 * 60 * 1000;
      expect(syncStatus.nextSync).toBeCloseTo(expectedNextSync, -4);
    });

    it('Daily sync interval is valid configuration', async () => {
      // When: Setting daily interval
      await app.configureSyncInterval(1440);

      // Then: Configuration is accepted
      const settings = await app.getSettings();
      expect(settings.syncInterval).toBe(1440);
    });
  });

  describe('Lookback Period Configurations', () => {
    it('7-day lookback only processes recent emails with AI', async () => {
      // Given: 7-day lookback
      await app.configureLookbackDays(7);
      await gmail.seedEmail({
        subject: 'Old Email',
        body: 'Content from 10 days ago',
        category: 'primary',
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await gmail.seedEmail({
        subject: 'Recent Email',
        body: 'Content from 3 days ago',
        category: 'primary',
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      });

      // When: Initial sync runs
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      // Then: Only recent email is AI-processed
      const timeline = await app.getTimeline();
      const recentEmail = timeline.find(e => e.subject === 'Recent Email');
      const oldEmail = timeline.find(e => e.subject === 'Old Email');

      expect(recentEmail?.aiProcessed).toBe(true);
      expect(oldEmail?.aiProcessed).toBe(false);
    });

    it('90-day lookback processes older emails with AI', async () => {
      // Given: 90-day lookback
      await app.configureLookbackDays(90);
      await gmail.seedEmail({
        subject: 'Email from 60 days ago',
        body: 'Old content',
        category: 'primary',
        date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
      });

      // When: Initial sync runs
      await app.connectGmail(gmail.credentials);
      await app.waitForInitialSync();

      // Then: Old email is AI-processed
      const timeline = await app.getTimeline();
      const oldEmail = timeline.find(e => e.subject.includes('60 days'));
      expect(oldEmail?.aiProcessed).toBe(true);
    });
  });

  describe('Configuration Combinations', () => {
    it('15min sync + 30day lookback works together', async () => {
      // When: Setting combination
      await app.configureSyncInterval(15);
      await app.configureLookbackDays(30);

      // Then: Both are saved
      const settings = await app.getSettings();
      expect(settings.syncInterval).toBe(15);
      expect(settings.lookbackDays).toBe(30);
    });

    it('1hr sync + 90day lookback works together', async () => {
      // When: Setting combination
      await app.configureSyncInterval(60);
      await app.configureLookbackDays(90);

      // Then: Both are saved
      const settings = await app.getSettings();
      expect(settings.syncInterval).toBe(60);
      expect(settings.lookbackDays).toBe(90);
    });
  });

  describe('Configuration Persistence', () => {
    it('Sync configuration persists across app restarts', async () => {
      // Given: Specific configuration
      await app.configureSyncInterval(30);
      await app.configureLookbackDays(45);

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();

      // Then: Configuration is preserved
      const settings = await app.getSettings();
      expect(settings.syncInterval).toBe(30);
      expect(settings.lookbackDays).toBe(45);
    });
  });

  describe('Default Values', () => {
    it('Default sync interval is applied when not specified', async () => {
      // Given: Fresh app without explicit interval
      await app.clearSettings();

      // When: Getting settings
      const settings = await app.getSettings();

      // Then: Default is applied
      expect(settings.syncInterval).toBeDefined();
      expect(settings.syncInterval).toBeGreaterThan(0);
    });

    it('Default lookback period is applied when not specified', async () => {
      // Given: Fresh app without explicit lookback
      await app.clearSettings();

      // When: Getting settings
      const settings = await app.getSettings();

      // Then: Default is applied
      expect(settings.lookbackDays).toBeDefined();
      expect(settings.lookbackDays).toBeGreaterThan(0);
    });
  });
});
