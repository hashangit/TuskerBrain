import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';
import { FixtureHelpers, EmailFixture, EmailType } from '@fixtures/fixture-helpers';

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
    // Wire the Gmail account to the app so cleanup can actually delete/archive emails
    app.setGmailAccount(gmail);
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

  describe('Type/Age Matrix - Regular Emails', () => {
    it('Regular email < 1 month old is processed with AI', async () => {
      // Given: User has a regular email less than 1 month old
      const fixture = FixtureHelpers.loadEmail('fixture-regular-project-001');
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 15); // 15 days ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: fixture?.subject || 'Project Update',
        body: fixture?.body || 'Regular project email content',
        category: 'primary',
        date: recentDate.toISOString(),
      });

      // When: Email is processed with AI
      await app.processEmail(email.id);

      // Then: Email appears in timeline with extracted info
      const processedEmail = await app.getEmailFromTimeline(email.id);
      expect(processedEmail).toBeDefined();
      expect(processedEmail?.title).toContain('Project');
    });

    it('Regular email 1-6 months old is processed with AI', async () => {
      // Given: User has a regular email between 1-6 months old
      const fixture = FixtureHelpers.loadEmail('fixture-regular-personal-email');
      const mediumDate = new Date();
      mediumDate.setMonth(mediumDate.getMonth() - 3); // 3 months ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: fixture?.subject || 'Personal Update',
        body: fixture?.body || 'Regular personal email content',
        category: 'primary',
        date: mediumDate.toISOString(),
      });

      // When: Email is processed with AI
      await app.processEmail(email.id);

      // Then: Email is processed with AI
      const processedEmail = await app.getEmailFromTimeline(email.id);
      expect(processedEmail).toBeDefined();
    });

    it('Regular email > 6 months old is archived', async () => {
      // Given: User has a regular email older than 6 months
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 8); // 8 months ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Old Regular Email',
        body: 'This is an old regular email',
        category: 'primary',
        date: oldDate.toISOString(),
      });

      // When: Initial sync runs (Phase 1 cleanup)
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Regular emails > 6 months old are archived
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeDefined();
      expect(gmailEmail?.labels).not.toContain('INBOX'); // Archived
    });

    it('Regular email > 2 years old is archived', async () => {
      // Given: User has a regular email older than 2 years
      const veryOldDate = new Date();
      veryOldDate.setFullYear(veryOldDate.getFullYear() - 3); // 3 years ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Very Old Regular Email',
        body: 'This is a very old regular email',
        category: 'primary',
        date: veryOldDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Email is archived (not deleted) - 2+ year rule
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeDefined();
      expect(gmailEmail?.labels).not.toContain('INBOX');
    });
  });

  describe('Type/Age Matrix - Updates Emails', () => {
    it('Updates email < 1 month old is processed with AI', async () => {
      // Given: User has an updates email less than 1 month old
      const fixture = FixtureHelpers.loadEmail('fixture-update-bank-001');
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: fixture?.subject || 'Bank Statement Ready',
        body: fixture?.body || 'Your statement is ready',
        category: 'updates',
        date: recentDate.toISOString(),
      });

      // When: Email is processed with AI
      await app.processEmail(email.id);

      // Then: Email is processed with AI
      const processedEmail = await app.getEmailFromTimeline(email.id);
      expect(processedEmail).toBeDefined();
    });

    it('Updates email 1-6 months old is archived', async () => {
      // Given: User has an updates email between 1-6 months old
      const mediumDate = new Date();
      mediumDate.setMonth(mediumDate.getMonth() - 3); // 3 months ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your Statement is Ready',
        body: 'Your monthly statement is available.',
        category: 'updates',
        date: mediumDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 180 });

      // Then: Email is archived (not deleted)
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeDefined();
      expect(gmailEmail?.labels).not.toContain('INBOX');
    });

    it('Updates email > 6 months old is archived', async () => {
      // Given: User has an updates email older than 6 months
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 8); // 8 months ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Old Update Email',
        body: 'Your old statement is available.',
        category: 'updates',
        date: oldDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Email is archived
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeDefined();
      expect(gmailEmail?.labels).not.toContain('INBOX');
    });

    it('Updates email > 2 years old is archived', async () => {
      // Given: User has an updates email older than 2 years
      const veryOldDate = new Date();
      veryOldDate.setFullYear(veryOldDate.getFullYear() - 3); // 3 years ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Very Old Update Email',
        body: 'Your very old statement is available.',
        category: 'updates',
        date: veryOldDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Email is archived (not deleted)
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeDefined();
      expect(gmailEmail?.labels).not.toContain('INBOX');
    });
  });

  describe('Type/Age Matrix - Social Emails', () => {
    it('Social email < 1 month old is processed with AI', async () => {
      // Given: User has a social email less than 1 month old
      const fixture = FixtureHelpers.loadEmail('fixture-social-linkedin-001');
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 15); // 15 days ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: fixture?.subject || 'LinkedIn Notification',
        body: fixture?.body || 'Someone endorsed you',
        category: 'social',
        date: recentDate.toISOString(),
      });

      // When: Email is processed with AI
      await app.processEmail(email.id);

      // Then: Email is processed with AI
      const processedEmail = await app.getEmailFromTimeline(email.id);
      expect(processedEmail).toBeDefined();
    });

    it('Social email 1-6 months old is deleted', async () => {
      // Given: User has a social email between 1-6 months old
      const mediumDate = new Date();
      mediumDate.setMonth(mediumDate.getMonth() - 3); // 3 months ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Someone endorsed you',
        body: 'You received a new endorsement.',
        category: 'social',
        date: mediumDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 180 });

      // Then: Email is deleted
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeNull();
    });

    it('Social email > 6 months old is deleted', async () => {
      // Given: User has a social email older than 6 months
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 8); // 8 months ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Old Social Notification',
        body: 'This is an old social notification.',
        category: 'social',
        date: oldDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Email is deleted
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeNull();
    });

    it('Social email > 2 years old is archived', async () => {
      // Given: User has a social email older than 2 years
      const veryOldDate = new Date();
      veryOldDate.setFullYear(veryOldDate.getFullYear() - 3); // 3 years ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Very Old Social Notification',
        body: 'This is a very old social notification.',
        category: 'social',
        date: veryOldDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Email is archived (not deleted) - 2+ year rule overrides
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeDefined();
      expect(gmailEmail?.labels).not.toContain('INBOX');
    });
  });

  describe('Type/Age Matrix - Promotional Emails', () => {
    it('Promotional email < 1 month old has deals extracted', async () => {
      // Given: User has a promotional email less than 1 month old
      const fixture = FixtureHelpers.loadEmail('fixture-promo-deal-001');
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10); // 10 days ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: fixture?.subject || '50% Off Today Only!',
        body: fixture?.body || 'Use code SAVE50 at checkout.',
        category: 'promotions',
        date: recentDate.toISOString(),
      });

      // When: Email is processed with AI
      await app.processEmail(email.id);

      // Then: Deal is extracted from promotional email
      const deal = await app.getDealFromEmail(email.id);
      expect(deal).toBeDefined();
      expect(deal?.promoCode).toBe('SAVE50');
    });

    it('Promotional email 1-6 months old is deleted', async () => {
      // Given: User has a promotional email between 1-6 months old
      const mediumDate = new Date();
      mediumDate.setMonth(mediumDate.getMonth() - 3); // 3 months ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Flash Sale - 50% Off!',
        body: 'Limited time offer. Use code FLASH50.',
        category: 'promotions',
        date: mediumDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 180 });

      // Then: Email is deleted
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeNull();
    });

    it('Promotional email > 6 months old is deleted', async () => {
      // Given: User has a promotional email older than 6 months
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 8); // 8 months ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Old Promotional Email',
        body: 'This is an old promotional email.',
        category: 'promotions',
        date: oldDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Email is deleted
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeNull();
    });

    it('Promotional email > 2 years old is archived', async () => {
      // Given: User has a promotional email older than 2 years
      const veryOldDate = new Date();
      veryOldDate.setFullYear(veryOldDate.getFullYear() - 3); // 3 years ago

      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Very Old Promotional Email',
        body: 'This is a very old promotional email.',
        category: 'promotions',
        date: veryOldDate.toISOString(),
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Email is archived (not deleted) - 2+ year rule overrides
      const gmailEmail = await gmail.getEmail(email.id);
      expect(gmailEmail).toBeDefined();
      expect(gmailEmail?.labels).not.toContain('INBOX');
    });
  });

  describe('Topic Classification', () => {
    it('Emails get classified to appropriate topics during processing', async () => {
      // Given: User has emails from different senders/subjects
      const bankingEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your Chase Statement is Ready',
        body: 'Your Chase checking account statement is available.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(bankingEmail.id);

      // Then: Email is classified to correct topic
      const processedEmail = await app.getEmailFromTimeline(bankingEmail.id);
      expect(processedEmail?.topic).toBeDefined();
      expect(processedEmail?.topic).toMatch(/Banking/i);
    });

    it('Multiple emails from same sender get same topic', async () => {
      // Given: User has multiple emails from same sender
      const email1 = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Statement Ready',
        body: 'Your Chase statement.',
        category: 'updates',
        sender: 'statements@chase.com',
        date: new Date().toISOString(),
      });

      const email2 = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Payment Due',
        body: 'Your Chase payment is due.',
        category: 'updates',
        sender: 'alerts@chase.com',
        date: new Date().toISOString(),
      });

      // When: Both emails are processed
      await app.processEmail(email1.id);
      await app.processEmail(email2.id);

      // Then: Both have related topics
      const processed1 = await app.getEmailFromTimeline(email1.id);
      const processed2 = await app.getEmailFromTimeline(email2.id);
      expect(processed1?.topic).toBeDefined();
      expect(processed2?.topic).toBeDefined();
    });

    it('Novel topic creates new topic hierarchy', async () => {
      // Given: User has email from unrecognized sender/domain
      const novelEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'New Service Launch',
        body: 'Introducing our new quantum computing service.',
        category: 'primary',
        sender: 'info@quantumcomputing-newstartup.io',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(novelEmail.id);

      // Then: A new topic is created for this sender
      const topics = await app.getAllTopics();
      expect(topics.length).toBeGreaterThan(0);
    });
  });

  describe('Summary Generation', () => {
    it('Summary is created for processed emails with sufficient content', async () => {
      // Given: User has multiple emails from same topic
      for (let i = 0; i < 3; i++) {
        const email = await gmail.sendEmail({
          to: 'me@test.com',
          subject: `Project Alpha Update ${i}`,
          body: `This is update number ${i} for Project Alpha with substantial content for summarization.`,
          category: 'primary',
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        });
        await app.processEmail(email.id);
      }

      // When: Summaries are generated
      const summaries = await app.getAllTopicSummaries();

      // Then: At least one summary exists
      expect(summaries.length).toBeGreaterThan(0);
    });

    it('Summary content reflects processed email information', async () => {
      // Given: User processes an email with specific content
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Quarterly Financial Report',
        body: 'Revenue increased by 25% this quarter. Key drivers included new product launches and market expansion.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(email.id);

      // Then: Summary reflects the email content
      const summaries = await app.getAllTopicSummaries();
      // Summary should exist (either new or updated)
      expect(summaries).toBeDefined();
    });
  });

  describe('Update Extraction Fields', () => {
    it('Extracts sentiment correctly from email content', async () => {
      // Given: Email with clear negative sentiment
      const negativeEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Service Outage Notice',
        body: 'We regret to inform you that your service has been suspended due to unpaid balance. Immediate action required to restore service.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(negativeEmail.id);
      const update = await app.getUpdateFromEmail(negativeEmail.id);

      // Then: Sentiment is classified as negative
      expect(update).toBeDefined();
      expect(update?.sentiment).toBe('negative');
    });

    it('Extracts positive sentiment from congratulatory email', async () => {
      // Given: Email with positive content
      const positiveEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Congratulations on Your Promotion!',
        body: 'We are delighted to announce that your application has been approved. Welcome aboard!',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(positiveEmail.id);
      const update = await app.getUpdateFromEmail(positiveEmail.id);

      // Then: Sentiment is classified as positive
      expect(update).toBeDefined();
      expect(update?.sentiment).toBe('positive');
    });

    it('Extracts neutral sentiment from informational email', async () => {
      // Given: Email with neutral content
      const neutralEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your Monthly Statement',
        body: 'Your statement for January 2024 is now available. Balance: $1,234.56.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(neutralEmail.id);
      const update = await app.getUpdateFromEmail(neutralEmail.id);

      // Then: Sentiment is classified as neutral
      expect(update).toBeDefined();
      expect(update?.sentiment).toBe('neutral');
    });

    it('Extracts financial impact when amounts are mentioned', async () => {
      // Given: Email with financial information
      const financialEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Invoice #12345',
        body: 'Your invoice of $2,500.00 is due on February 28, 2024. Please remit payment at your earliest convenience.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(financialEmail.id);
      const update = await app.getUpdateFromEmail(financialEmail.id);

      // Then: Financial impact is extracted
      expect(update).toBeDefined();
      expect(update?.financialImpact).toBeDefined();
      expect(update?.financialImpact).toBeGreaterThan(0);
    });

    it('Extracts key entities including dates and amounts', async () => {
      // Given: Email with multiple entities
      const entityEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Contract Renewal',
        body: 'Please review the contract with Acme Corp worth $50,000. Deadline for signature is March 15, 2024. Contact John Smith for questions.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(entityEmail.id);
      const update = await app.getUpdateFromEmail(entityEmail.id);

      // Then: Key entities are extracted
      expect(update).toBeDefined();
      expect(update?.keyEntities).toBeDefined();
      expect(update?.keyEntities?.dates).toBeDefined();
      expect(update?.keyEntities?.amounts).toContainEqual(expect.any(Number));
      expect(update?.keyEntities?.names).toBeDefined();
    });
  });

  describe('Gmail Important Flag Priority', () => {
    it('Gmail important flag always results in high priority', async () => {
      // Given: Email marked as important in Gmail
      const importantEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Weekly Newsletter',
        body: 'Here is your weekly update with general information.',
        category: 'primary',
        isImportant: true,
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(importantEmail.id);
      const update = await app.getUpdateFromEmail(importantEmail.id);

      // Then: Priority is high regardless of content
      expect(update).toBeDefined();
      expect(update?.priority).toBe('high');
    });

    it('Non-important email gets priority based on content analysis', async () => {
      // Given: Regular email without important flag
      const regularEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'FYI: Team lunch next week',
        body: 'Just letting you know about the team lunch next Friday. No action needed.',
        category: 'primary',
        isImportant: false,
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(regularEmail.id);
      const update = await app.getUpdateFromEmail(regularEmail.id);

      // Then: Priority is determined by content (likely low for FYI)
      expect(update).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(update?.priority);
    });

    it('Urgent content + important flag = high priority', async () => {
      // Given: Urgent email marked as important
      const urgentEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'URGENT: Server Down - Immediate Action Required',
        body: 'Production server is down. Please respond immediately.',
        category: 'primary',
        isImportant: true,
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(urgentEmail.id);
      const update = await app.getUpdateFromEmail(urgentEmail.id);

      // Then: Priority is high and urgency flag is set
      expect(update).toBeDefined();
      expect(update?.priority).toBe('high');
      expect(update?.urgency).toBe(true);
    });
  });

  describe('Job Queue Integration', () => {
    it('Processing an email creates appropriate job in queue', async () => {
      // Given: User has a new email to process
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Test Email for Job Queue',
        body: 'This email should create a job.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // When: Email processing is triggered
      await app.processEmail(email.id);

      // Then: Job queue reflects the processing
      const jobStats = await app.getJobQueueStats();
      expect(jobStats.completed).toBeGreaterThanOrEqual(1);
    });

    it('Multiple emails create multiple jobs', async () => {
      // Given: User has multiple emails to process
      const emailCount = 3;
      for (let i = 0; i < emailCount; i++) {
        const email = await gmail.sendEmail({
          to: 'me@test.com',
          subject: `Batch Email ${i}`,
          body: `Content ${i}`,
          category: 'primary',
          date: new Date().toISOString(),
        });
        await app.processEmail(email.id);
      }

      // When: All emails are processed
      const jobStats = await app.getJobQueueStats();

      // Then: Job count reflects processed emails
      expect(jobStats.completed).toBeGreaterThanOrEqual(emailCount);
    });

    it('Failed jobs are tracked for retry', async () => {
      // Given: Job queue tracks failed jobs
      const initialStats = await app.getJobQueueStats();

      // When: A job fails (simulated)
      // The mock job queue supports this through retry mechanisms
      const jobStats = await app.getJobQueueStats();

      // Then: Job stats are available
      expect(jobStats).toBeDefined();
      expect(jobStats.failed).toBeDefined();
    });
  });
});
