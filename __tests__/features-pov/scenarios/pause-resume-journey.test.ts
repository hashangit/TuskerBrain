import { describe, it, expect } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { EmailFixtures } from '@fixtures/email-fixtures';

/**
 * Scenario: Pause and Resume Journey
 *
 * Tests the user's ability to pause backfill processing
 * and resume from where they left off.
 *
 * Business Rules:
 * - Pause preserves current progress
 * - Resume continues from paused position
 * - State is persisted across app restarts
 */
describe('Scenario: Pause and Resume Journey', () => {
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

  describe('Pause Functionality', () => {
    it('User can pause backfill at any point', async () => {
      // Given: Backfill is running
      await app.configureLookbackDays(30);
      await gmail.seedInbox({ count: 100, mix: true });
      await app.startBackfill();
      await app.waitForBackfillProgress(10);

      // When: User pauses
      await app.pauseBackfill();

      // Then: Backfill is paused
      const state = await app.getBackfillState();
      expect(state.status).toBe('paused');
      expect(state.currentDay).toBeGreaterThanOrEqual(10);
    });

    it('Paused backfill does not process more emails', async () => {
      // Given: Backfill is paused
      await app.pauseBackfill();
      const pausedAt = (await app.getBackfillState()).currentDay;

      // When: Time passes
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Then: No progress made
      const state = await app.getBackfillState();
      expect(state.currentDay).toBe(pausedAt);
    });
  });

  describe('Resume Functionality', () => {
    it('User can resume paused backfill', async () => {
      // Given: Backfill is paused
      await app.configureLookbackDays(30);
      await app.startBackfill();
      await app.waitForBackfillProgress(5);
      await app.pauseBackfill();
      const pausedDay = (await app.getBackfillState()).currentDay;

      // When: User resumes
      await app.resumeBackfill();

      // Then: Backfill continues from paused position
      const state = await app.getBackfillState();
      expect(state.status).toMatch(/running|in.progress/i);

      await app.waitForBackfillProgress(pausedDay + 5);
      const newState = await app.getBackfillState();
      expect(newState.currentDay).toBeGreaterThan(pausedDay);
    });

    it('Resume continues with correct day order', async () => {
      // Given: Paused at day 15
      await app.configureLookbackDays(30);
      await app.startBackfill();
      await app.waitForBackfillProgress(15);
      await app.pauseBackfill();

      // When: Resuming
      await app.resumeBackfill();

      // Then: Processing continues with day 16, not restarting
      const progress = await app.captureBackfillProgress();
      expect(progress.some(p => /Processing day 16 of 30/.test(p))).toBe(true);
    });
  });

  describe('Persist Pause State', () => {
    it('Paused state persists across app restart', async () => {
      // Given: Backfill paused at specific point
      await app.configureLookbackDays(30);
      await app.startBackfill();
      await app.waitForBackfillProgress(12);
      await app.pauseBackfill();
      const pausedDay = (await app.getBackfillState()).currentDay;

      // When: App restarts
      await app.shutdown();
      app = await TuskerBrainApp.launch();
      await app.connectGmail(gmail.credentials);

      // Then: State is preserved
      const state = await app.getBackfillState();
      expect(state.status).toBe('paused');
      expect(state.currentDay).toBe(pausedDay);
    });
  });

  describe('UI During Pause', () => {
    it('User sees paused state in UI with resume button', async () => {
      // Given: Backfill is paused
      await app.pauseBackfill();

      // When: User views the app
      const ui = await app.getBackfillUI();

      // Then: UI shows paused state
      expect(ui.status).toMatch(/paused/i);
      expect(ui.resumeButton).toBe(true);
      expect(ui.pauseButton).toBe(false);
    });
  });
});
