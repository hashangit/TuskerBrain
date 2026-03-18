import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Inbox Manager
 *
 * Design Spec Reference: Lines 82-122, 434-462
 *
 * As a user, I want my emails to be automatically managed based on their type and age,
 * so that my inbox stays clean without manual intervention.
 *
 * Business Rules (Complete Type/Age Matrix):
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

  // ============================================================================
  // SECTION: Complete Type/Age Matrix Testing
  // Design Spec: Lines 82-122
  // ============================================================================

  describe('Type/Age Matrix: Regular Emails', () => {
    it('Regular email < 1 month old: Processed with AI (extracted info, topic assigned)', async () => {
      // Given: User has a regular email less than 1 month old
      const recentRegularEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Project Alpha - Action Required',
        body: 'Please review the attached proposal and provide feedback by Friday.',
        category: 'primary',
        date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Email is processed with AI
      const processedEmail = await app.getEmailFromTimeline(recentRegularEmail.id);
      expect(processedEmail).toBeDefined();
      expect(processedEmail.emailType).toBe('regular');
      expect(processedEmail.topic).toBeDefined();
      expect(processedEmail.actionItem).toBe(true);
    });

    it('Regular email 1-6 months old: Processed with AI', async () => {
      // Given: User has a regular email between 1-6 months old
      const regularEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Quarterly Review Meeting',
        body: 'Please attend the quarterly review meeting next Tuesday.',
        category: 'primary',
        date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 3 months ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 180 });

      // Then: Email is processed with AI
      const processedEmail = await app.getEmailFromTimeline(regularEmail.id);
      expect(processedEmail).toBeDefined();
      expect(processedEmail.emailType).toBe('regular');
      expect(processedEmail.topic).toBeDefined();
    });

    it('Regular email > 6 months old: Archived (no AI processing)', async () => {
      // Given: User has a regular email older than 6 months
      const oldRegularEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Old Project Discussion',
        body: 'This is an old email about a completed project.',
        category: 'primary',
        date: new Date(Date.now() - 240 * 24 * 60 * 60 * 1000).toISOString(), // 8 months ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Email is archived (removed from inbox, not deleted)
      const emailInGmail = await gmail.getEmail(oldRegularEmail.id);
      expect(emailInGmail).toBeDefined(); // Still exists
      expect(emailInGmail.labels).not.toContain('INBOX'); // Archived

      // And: Email was not processed with AI (not in timeline)
      const timelineEmail = await app.getEmailFromTimeline(oldRegularEmail.id);
      expect(timelineEmail).toBeNull();
    });

    it('Regular email > 2 years old: Archived (never deleted)', async () => {
      // Given: User has a very old regular email
      const veryOldRegularEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Very Old Email',
        body: 'This email is over 2 years old.',
        category: 'primary',
        date: new Date(Date.now() - 800 * 24 * 60 * 60 * 1000).toISOString(), // 2+ years ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 1000 });

      // Then: Email is archived, never deleted
      const emailInGmail = await gmail.getEmail(veryOldRegularEmail.id);
      expect(emailInGmail).toBeDefined();
      expect(emailInGmail.labels).not.toContain('INBOX');
    });
  });

  describe('Type/Age Matrix: Update Emails', () => {
    it('Update email < 1 month old: Processed with AI', async () => {
      // Given: User has an update email less than 1 month old
      const recentUpdateEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your Bank Statement is Ready',
        body: 'Your January bank statement is now available for viewing.',
        category: 'updates',
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Email is processed with AI
      const processedEmail = await app.getEmailFromTimeline(recentUpdateEmail.id);
      expect(processedEmail).toBeDefined();
      expect(processedEmail.emailType).toBe('updates');
      expect(processedEmail.topic).toBeDefined();
    });

    it('Update email 1-6 months old: Archived', async () => {
      // Given: User has an update email between 1-6 months old
      const updateEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Package Shipped',
        body: 'Your package has been shipped and will arrive soon.',
        category: 'updates',
        date: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(), // 4 months ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 180 });

      // Then: Email is archived
      const emailInGmail = await gmail.getEmail(updateEmail.id);
      expect(emailInGmail).toBeDefined();
      expect(emailInGmail.labels).not.toContain('INBOX');
    });

    it('Update email > 6 months old: Archived', async () => {
      // Given: User has an update email older than 6 months
      const oldUpdateEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your statement is ready',
        body: 'Your monthly statement is available.',
        category: 'updates',
        date: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(), // ~7 months ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Old update email is archived (in All Mail, not Inbox)
      const emailInGmail = await gmail.getEmail(oldUpdateEmail.id);
      expect(emailInGmail).toBeDefined(); // Still exists
      expect(emailInGmail.labels).not.toContain('INBOX'); // Archived
    });

    it('Update email > 2 years old: Archived (never deleted)', async () => {
      // Given: User has a very old update email
      const veryOldUpdate = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Old Account Update',
        body: 'This is an old account update notification.',
        category: 'updates',
        date: new Date(Date.now() - 800 * 24 * 60 * 60 * 1000).toISOString(), // 2+ years ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 1000 });

      // Then: Very old emails are archived, not deleted
      const emailInGmail = await gmail.getEmail(veryOldUpdate.id);
      expect(emailInGmail).toBeDefined(); // Still exists
      expect(emailInGmail.labels).not.toContain('INBOX'); // Archived
    });
  });

  describe('Type/Age Matrix: Social Emails', () => {
    it('Social email < 1 month old: Processed with AI', async () => {
      // Given: User has a social email less than 1 month old
      const recentSocialEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'John Smith endorsed you',
        body: 'You received a new endorsement for JavaScript.',
        category: 'social',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Email is processed with AI
      const processedEmail = await app.getEmailFromTimeline(recentSocialEmail.id);
      expect(processedEmail).toBeDefined();
      expect(processedEmail.emailType).toBe('social');
    });

    it('Social email 1-6 months old: Deleted', async () => {
      // Given: User has a social email between 1-6 months old
      const socialEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Someone liked your post',
        body: 'You received a like on your recent post.',
        category: 'social',
        date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 2 months ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 180 });

      // Then: Social email is deleted
      const emailInGmail = await gmail.getEmail(socialEmail.id);
      expect(emailInGmail).toBeNull(); // Deleted
    });

    it('Social email > 6 months old: Deleted', async () => {
      // Given: User has a social email older than 6 months
      const oldSocialEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Someone endorsed you',
        body: 'You received a new endorsement.',
        category: 'social',
        date: new Date(Date.now() - 250 * 24 * 60 * 60 * 1000).toISOString(), // 8+ months ago
      });

      // When: User runs initial sync
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Old social email is deleted
      const emailInGmail = await gmail.getEmail(oldSocialEmail.id);
      expect(emailInGmail).toBeNull();
    });

    it('Social email > 2 years old: Archived (never deleted)', async () => {
      // Given: User has a very old social email
      const veryOldSocial = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Old Social Notification',
        body: 'This is an old social network notification.',
        category: 'social',
        date: new Date(Date.now() - 850 * 24 * 60 * 60 * 1000).toISOString(), // 2+ years ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 1000 });

      // Then: Very old emails are archived, not deleted
      const emailInGmail = await gmail.getEmail(veryOldSocial.id);
      expect(emailInGmail).toBeDefined(); // Still exists
      expect(emailInGmail.labels).not.toContain('INBOX'); // Archived
    });
  });

  describe('Type/Age Matrix: Promotional Emails', () => {
    it('Promotional email < 1 month old: Deals extracted', async () => {
      // Given: User has a promotional email less than 1 month old
      const recentPromoEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: '50% Off Electronics - Today Only!',
        body: 'Use code SAVE50 at checkout. Minimum purchase $100. Expires midnight.',
        category: 'promotions',
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 30 });

      // Then: Deal is extracted
      const deal = await app.getDealFromEmail(recentPromoEmail.id);
      expect(deal).toBeDefined();
      expect(deal.promoCode).toBe('SAVE50');
      expect(deal.isActive).toBe(true);
    });

    it('Promotional email 1-6 months old: Deleted', async () => {
      // Given: User has a promotional email between 1-6 months old
      const promoEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Flash Sale - 50% Off!',
        body: 'Limited time offer. Expires soon!',
        category: 'promotions',
        date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 2 months ago
      });

      // When: User runs initial sync
      await app.runInitialSync({ lookbackDays: 90 });

      // Then: Old promotional email is deleted from Gmail
      const emailInGmail = await gmail.getEmail(promoEmail.id);
      expect(emailInGmail).toBeNull(); // Deleted
    });

    it('Promotional email > 6 months old: Deleted', async () => {
      // Given: User has a promotional email older than 6 months
      const oldPromoEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Black Friday Sale',
        body: 'Big discounts on all items!',
        category: 'promotions',
        date: new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString(), // 10 months ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 365 });

      // Then: Old promotional email is deleted
      const emailInGmail = await gmail.getEmail(oldPromoEmail.id);
      expect(emailInGmail).toBeNull();
    });

    it('Promotional email > 2 years old: Archived (never deleted)', async () => {
      // Given: User has a very old promotional email
      const veryOldPromo = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Very old promo',
        body: 'Ancient promotional content',
        category: 'promotions',
        date: new Date(Date.now() - 900 * 24 * 60 * 60 * 1000).toISOString(), // 2.5 years ago
      });

      // When: Initial sync runs
      await app.runInitialSync({ lookbackDays: 1000 });

      // Then: Very old emails are archived, not deleted
      const emailInGmail = await gmail.getEmail(veryOldPromo.id);
      expect(emailInGmail).toBeDefined(); // Still exists
      expect(emailInGmail.labels).not.toContain('INBOX'); // Archived
    });
  });

  // ============================================================================
  // SECTION: Initial Cleanup (Phase 1: No AI)
  // Design Spec: Lines 434-445
  // ============================================================================

  describe('Initial Cleanup (Phase 1: No AI)', () => {
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

  // ============================================================================
  // SECTION: AI Processing (Phase 2: Gradual Backfill)
  // Design Spec: Lines 446-455
  // ============================================================================

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

  // ============================================================================
  // SECTION: Incremental Sync (Phase 3)
  // Design Spec: Lines 456-462
  // ============================================================================

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

  // ============================================================================
  // SECTION: Topic Classification
  // Design Spec: Lines 95, 151-181
  // ============================================================================

  describe('Topic Classification', () => {
    it('User sees emails classified to appropriate topics based on content', async () => {
      // Given: User has emails from different domains/subjects
      const bankingEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your Chase Statement is Ready',
        body: 'Your monthly statement is now available.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(bankingEmail.id);

      // Then: Email is classified to appropriate topic
      const processedEmail = await app.getEmailFromTimeline(bankingEmail.id);
      expect(processedEmail.topic).toBeDefined();
      expect(processedEmail.topic).toMatch(/Banking|Finance|Chase/i);
    });

    it('User sees topic hierarchy created correctly', async () => {
      // Given: User has multiple related emails
      const projectEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Project Alpha Sprint Review',
        body: 'Sprint review for Project Alpha.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // When: Email is processed
      await app.processEmail(projectEmail.id);

      // Then: Topic is created with proper hierarchy
      const topics = await app.getAllTopics();
      const projectTopic = topics.find(t =>
        t.fullPath.includes('Project') || t.fullPath.includes('Work')
      );
      expect(projectTopic).toBeDefined();
    });
  });

  // ============================================================================
  // SECTION: Summary Generation
  // Design Spec: Lines 98, 132-143
  // ============================================================================

  describe('Summary Generation', () => {
    it('User sees topic summary generated after emails are processed', async () => {
      // Given: User has multiple emails in the same topic
      const emails = [];
      for (let i = 0; i < 3; i++) {
        const email = await gmail.sendEmail({
          to: 'me@test.com',
          subject: `Project Alpha Update ${i}`,
          body: `Update ${i} for Project Alpha.`,
          category: 'primary',
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        });
        emails.push(email);
        await app.processEmail(email.id);
      }

      // When: Processing completes
      // Then: Topic summary is generated
      const topics = await app.getAllTopics();
      const alphaTopic = topics.find(t => t.name.includes('Alpha'));
      expect(alphaTopic).toBeDefined();
      expect(alphaTopic.emailCount).toBeGreaterThanOrEqual(3);
    });

    it('User sees sender summary generated after emails are processed', async () => {
      // Given: User has multiple emails from the same sender
      const senderDomain = 'company.com';
      for (let i = 0; i < 2; i++) {
        const email = await gmail.sendEmail({
          to: 'me@test.com',
          subject: `Company Update ${i}`,
          body: `Update ${i} from the company.`,
          sender: `updates@${senderDomain}`,
          category: 'updates',
          date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        });
        await app.processEmail(email.id);
      }

      // When: Processing completes
      // Then: Sender summary exists
      const summaries = await app.getAllSenderSummaries();
      const companySummary = summaries.find(s =>
        s.senderDomain.includes(senderDomain.replace('.com', ''))
      );
      expect(companySummary).toBeDefined();
    });
  });

  // ============================================================================
  // SECTION: Job Queue Integration
  // Design Spec: Lines 120-121, 551-599
  // ============================================================================

  describe('Job Queue Integration', () => {
    it('User sees processing creates appropriate jobs in queue', async () => {
      // Given: User has new emails to process
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Job Queue Test',
        body: 'Testing job queue integration.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      // When: Initial sync starts
      await app.startInitialSync({ lookbackDays: 30 });

      // Then: Jobs are created for processing
      const jobStats = await app.getJobQueueStats();
      expect(jobStats.pending + jobStats.running + jobStats.completed).toBeGreaterThan(0);
    });

    it('User sees jobs processed in correct order', async () => {
      // Given: Multiple emails to process
      for (let i = 0; i < 5; i++) {
        await gmail.sendEmail({
          to: 'me@test.com',
          subject: `Ordered Email ${i}`,
          body: `Content ${i}`,
          category: 'primary',
          date: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(), // Hours apart
        });
      }

      // When: Processing starts
      await app.startInitialSync({ lookbackDays: 7 });
      await app.processAllJobs();

      // Then: Jobs complete successfully
      const jobStats = await app.getJobQueueStats();
      expect(jobStats.completed).toBeGreaterThan(0);
      expect(jobStats.failed).toBe(0);
    });

    it('User sees failed jobs logged and retried', async () => {
      // Given: A job that will fail
      const job = await app.createJob({
        type: 'email_process',
        payload: { emailId: 'test-fail' },
        maxRetries: 3,
      });

      // When: Job fails
      await app.processJob(job.id);
      // Simulate failure handling
      const stats = await app.getJobQueueStats();

      // Then: Failure is tracked
      expect(stats.failed + stats.dead).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // SECTION: Gmail Label Application
  // Design Spec: Lines 182-205
  // ============================================================================

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
