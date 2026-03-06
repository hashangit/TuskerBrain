import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Inbox Manager
 *
 * Design Spec Reference: Lines 80-114
 *
 * As a user, I want my emails to be automatically managed based on their type and age,
 * so that my inbox stays clean without manual intervention.
 *
 * Business Rules:
 * | Email Type    | Age < 1 month | Age 1-6 months | Age > 6 months | Age > 2 years |
 * |---------------|---------------|----------------|----------------|---------------|
 * | Regular       | Process with AI| Process with AI| Archive        | Archive       |
 * | Updates       | Process with AI| Archive        | Archive        | Archive       |
 * | Social        | Process with AI| Delete         | Delete         | Archive       |
 * | Promotional   | Extract Deals | Delete         | Delete         | Archive       |
 */
describe('Feature: Inbox Manager', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    gmail = await GmailTestAccount.connect();
    await app.connectGmail(gmail.credentials);
    await app.configureLLM({ provider: 'anthropic', apiKey: process.env.TEST_LLM_API_KEY! });
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Initial Cleanup (Phase 1: No AI)', () => {
    it('User sees old promotional emails deleted immediately after first sync', async () => {
      // Given: User has promotional emails older than 1 month
      const oldPromoEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Flash Sale - 50% Off!',
        body: 'Limited time offer. Expires soon!',
        category: 'promotions',
        date: '2024-11-01', // 2 months ago
      });

      // When: User runs initial sync
      await app.runInitialSync({ lookbackDays: 90 });

      // Then: Old promotional email is deleted from Gmail
      const emailInGmail = await gmail.getEmail(oldPromoEmail.id);
      expect(emailInGmail).toBeNull(); // Deleted
    });

    it('User sees old social emails deleted after first sync', async () => {
      // Given: User has social emails older than 1 month
      const oldSocialEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Someone endorsed you',
        body: 'You received a new endorsement.',
        category: 'social',
        date: '2024-12-01', // 2+ months ago
      });

      // When: User runs initial sync
      await app.runInitialSync({ lookbackDays: 90 });

      // Then: Old social email is deleted
      const emailInGmail = await gmail.getEmail(oldSocialEmail.id);
      expect(emailInGmail).toBeNull();
    });

    it('User sees old update emails archived (not deleted) after first sync', async () => {
      // Given: User has update emails older than 1 month
      const oldUpdateEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your statement is ready',
        body: 'Your monthly statement is available.',
        category: 'updates',
        date: '2024-11-15', // 2+ months ago
      });

      // When: User runs initial sync
      await app.runInitialSync({ lookbackDays: 90 });

      // Then: Old update email is archived (in All Mail, not Inbox)
      const emailInGmail = await gmail.getEmail(oldUpdateEmail.id);
      expect(emailInGmail).toBeDefined(); // Still exists
      expect(emailInGmail.labels).not.toContain('INBOX'); // Archived
    });

    it('User sees any email older than 2 years archived (never deleted)', async () => {
      // Given: User has very old emails of all types
      const veryOldPromo = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Very old promo',
        body: 'Ancient promotional content',
        category: 'promotions',
        date: '2021-01-01', // 3+ years ago
      });

      // When: User runs initial sync
      await app.runInitialSync({ lookbackDays: 90 });

      // Then: Very old emails are archived, not deleted
      const emailInGmail = await gmail.getEmail(veryOldPromo.id);
      expect(emailInGmail).toBeDefined(); // Still exists
      expect(emailInGmail.labels).not.toContain('INBOX'); // Archived
    });

    it('User sees their inbox cleaned up within minutes of first sync', async () => {
      // Given: User has 100+ emails of various types and ages
      await gmail.seedInboxWithMixedEmails({ count: 100 });

      const startTime = Date.now();

      // When: User runs initial sync
      await app.runInitialSync({ lookbackDays: 30 });

      const duration = Date.now() - startTime;

      // Then: Cleanup completes quickly (no AI needed for this phase)
      expect(duration).toBeLessThan(5 * 60 * 1000); // Under 5 minutes

      // And: User sees immediate inbox reduction
      const inboxStats = await gmail.getInboxStats();
      expect(inboxStats.unreadCount).toBeLessThan(50); // Significant reduction
    });
  });

  describe('AI Processing (Phase 2: Gradual Backfill)', () => {
    it('User sees recent regular emails processed with extracted information', async () => {
      // Given: User has a recent regular email
      const recentEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Project Alpha - Action Required by Friday',
        body: 'Please review the attached proposal and provide your feedback by Friday EOD.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // When: AI processing runs
      await app.processEmailsWithinBackfill(recentEmail.id);

      // Then: User can see extracted information in the app
      const processedEmail = await app.getEmailFromTimeline(recentEmail.id);

      expect(processedEmail).toMatchObject({
        title: expect.stringContaining('Project Alpha'),
        actionItem: true,
        actionItemTitle: expect.stringContaining('review'),
        priority: 'high',
        followUpDate: expect.any(String),
      });
    });

    it('User sees recent promotional emails with extracted deals', async () => {
      // Given: User has a recent promotional email with a deal
      const promoEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: '50% Off Electronics - Today Only!',
        body: 'Use code SAVE50 at checkout. Minimum purchase $100. Expires midnight.',
        category: 'promotions',
        date: new Date().toISOString(),
      });

      // When: AI processing runs
      await app.processEmailsWithinBackfill(promoEmail.id);

      // Then: User can see the deal in their deals list
      const deal = await app.getDealFromEmail(promoEmail.id);

      expect(deal).toMatchObject({
        title: expect.stringContaining('50%'),
        promoCode: 'SAVE50',
        minimumPurchase: '$100',
        isActive: true,
      });
    });

    it('User sees progress indicator during backfill: "Processing day 15 of 30..."', async () => {
      // Given: User configured 30-day lookback
      await app.configureLookbackDays(30);

      // When: Backfill starts
      const backfillPromise = app.runBackfill();

      // Then: User sees progress updates
      const progressUpdates = await app.captureProgressUpdates();

      expect(progressUpdates).toContainEqual(
        expect.stringMatching(/Processing day \d+ of 30/)
      );

      await backfillPromise;
    });

    it('User can pause and resume backfill processing', async () => {
      // Given: Backfill is in progress
      await app.configureLookbackDays(30);
      const backfillPromise = app.runBackfill();

      // When: User pauses
      await app.pauseBackfill();
      const pausedState = await app.getBackfillState();

      // Then: Processing is paused
      expect(pausedState.status).toBe('paused');

      // When: User resumes
      await app.resumeBackfill();

      // Then: Processing continues from where it left off
      const resumedState = await app.getBackfillState();
      expect(resumedState.status).toBe('running');
      expect(resumedState.currentDay).toBe(pausedState.currentDay);

      await backfillPromise;
    });
  });

  describe('Incremental Sync (Phase 3)', () => {
    it('User sees new emails processed automatically on configured interval', async () => {
      // Given: App is configured with 30-minute sync interval
      await app.configureSyncInterval(30);

      // When: New email arrives in Gmail
      const newEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'New Update',
        body: 'This is a new email that arrived.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // And: Sync interval passes
      await app.waitForNextSync();

      // Then: New email appears in timeline
      const timelineEmail = await app.getEmailFromTimeline(newEmail.id);
      expect(timelineEmail).toBeDefined();
    });

    it('User sees only new emails processed (not all emails every time)', async () => {
      // Given: Initial sync has completed
      await app.runInitialSync({ lookbackDays: 30 });
      const initialProcessedCount = await app.getTotalProcessedCount();

      // When: 5 new emails arrive
      for (let i = 0; i < 5; i++) {
        await gmail.sendEmail({
          to: 'me@test.com',
          subject: `New Email ${i}`,
          body: `Content ${i}`,
          category: 'primary',
          date: new Date().toISOString(),
        });
      }

      await app.waitForNextSync();

      // Then: Only 5 new emails were processed
      const finalProcessedCount = await app.getTotalProcessedCount();
      expect(finalProcessedCount - initialProcessedCount).toBe(5);
    });

    it('User sees previously processed emails skipped (no duplicate processing)', async () => {
      // Given: An email has been processed
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Already Processed',
        body: 'This email was already processed.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      await app.processEmail(email.id);
      const firstProcessTime = (await app.getEmailProcessingRecord(email.id)).processedAt;

      // When: Sync runs again
      await app.waitForNextSync();

      // Then: Email was not processed again
      const record = await app.getEmailProcessingRecord(email.id);
      expect(record.processedAt).toEqual(firstProcessTime);
      expect(record.processCount).toBe(1);
    });
  });

  describe('Gmail Label Application', () => {
    it('User can see TuskerBrain labels in Gmail to filter emails', async () => {
      // Given: User processes an email
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Bank Statement Ready',
        body: 'Your Chase statement is available.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      await app.processEmail(email.id);

      // When: User opens Gmail
      const gmailEmail = await gmail.getEmail(email.id);

      // Then: Email has TuskerBrain labels applied
      expect(gmailEmail.labels).toContain('TuskerBrain/Processed');
      expect(gmailEmail.labels).toContain('TuskerBrain/Topic/Banking/Chase');
    });

    it('User sees email marked as read in Gmail after processing', async () => {
      // Given: User has an unread email
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Unread Email',
        body: 'This is unread.',
        category: 'primary',
        isRead: false,
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(email.id);

      // Then: Email is marked as read in Gmail
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail.isRead).toBe(true);
    });
  });
});
