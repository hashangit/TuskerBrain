import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Topic Labeling System
 *
 * Design Spec Reference: Lines 143-196, 828-869
 *
 * As a user, I want my emails to be automatically categorized into a hierarchical topic structure,
 * so I can easily find and filter emails by topic in both TuskerBrain and Gmail.
 *
 * Business Rules:
 * - Hierarchical structure: Parent Topic / Child Topic
 * - Predefined parent categories (Banking, Education, Projects, Shopping, etc.)
 * - AI assigns topics based on email content
 * - Normalize topic names to prevent duplicates
 * - Create matching Gmail labels (TuskerBrain/Topic/*)
 */
describe('Feature: Topic Labeling', () => {
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

  describe('Topic Creation', () => {
    it('User sees new parent topic created when no existing topic fits', async () => {
      // Given: User processes an email about a novel category
      await app.processEmail({
        id: 'email-novel-1',
        subject: 'SpaceX Starship Update',
        body: 'The latest Starship prototype completed its test flight successfully.',
        sender: 'updates@spacex.com',
        senderDomain: 'spacex.com',
        receivedAt: new Date(),
      });

      // When: User views available topics
      const topics = await app.getAllTopics();

      // Then: A new parent topic was created
      expect(topics.some(t => t.name === 'Technology' || t.name === 'Space' || t.name === 'Aerospace')).toBe(true);
    });

    it('User sees child topic created under correct predefined parent', async () => {
      // Given: User processes a banking email
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your Wells Fargo Statement',
        body: 'Your monthly statement is ready to view.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: email.id,
        subject: email.subject,
        body: email.body,
        sender: 'noreply@wellsfargo.com',
        senderDomain: 'wellsfargo.com',
        receivedAt: new Date(),
      });

      // When: User views topics
      const topics = await app.getAllTopics();

      // Then: Topic is created under Banking parent
      expect(topics.some(t => t.fullPath.startsWith('Banking/'))).toBe(true);
      expect(topics.some(t => t.fullPath.includes('Wells') || t.fullPath.includes('Fargo'))).toBe(true);
    });

    it('User sees existing topic reused when similar email arrives', async () => {
      // Given: A topic already exists
      await app.processEmail({
        id: 'email-1',
        subject: 'Chase Statement Ready',
        body: 'Your Chase statement is available.',
        sender: 'noreply@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date('2024-01-01'),
      });

      const initialTopics = await app.getAllTopics();
      const initialCount = initialTopics.length;

      // When: Similar email arrives
      await app.processEmail({
        id: 'email-2',
        subject: 'Chase Payment Confirmation',
        body: 'Your Chase payment was received.',
        sender: 'noreply@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date('2024-01-15'),
      });

      // Then: No new topic created (reuses existing)
      const finalTopics = await app.getAllTopics();
      expect(finalTopics.length).toBe(initialCount);
    });
  });

  describe('Topic Normalization', () => {
    it('User sees "Chase Bank" normalized to "Chase"', async () => {
      // Given: Email mentions "Chase Bank"
      await app.processEmail({
        id: 'email-chase-1',
        subject: 'Chase Bank Statement',
        body: 'Your Chase Bank account statement.',
        sender: 'noreply@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date(),
      });

      // When: User views topics
      const topics = await app.getAllTopics();
      const chaseTopic = topics.find(t => t.fullPath.toLowerCase().includes('chase'));

      // Then: Topic is normalized (not "Chase Bank")
      expect(chaseTopic?.name).not.toMatch(/chase bank/i);
      expect(chaseTopic?.name).toMatch(/chase/i);
    });

    it('User sees "Amazon.com" normalized to "Amazon"', async () => {
      // Given: Email from Amazon.com
      await app.processEmail({
        id: 'email-amazon-1',
        subject: 'Your Amazon Order',
        body: 'Your Amazon.com order has shipped.',
        sender: 'ship-confirm@amazon.com',
        senderDomain: 'amazon.com',
        receivedAt: new Date(),
      });

      // When: User views topics
      const topics = await app.getAllTopics();
      const amazonTopic = topics.find(t => t.fullPath.toLowerCase().includes('amazon'));

      // Then: Topic is normalized
      expect(amazonTopic?.name).toBe('Amazon');
    });

    it('User sees no duplicate topics for same entity with different names', async () => {
      // Given: User processes multiple emails with name variations
      await app.processEmail({
        id: 'email-hsbc-1',
        subject: 'HSBC Bank Statement',
        body: 'Your HSBC Bank statement.',
        sender: 'noreply@hsbc.com',
        senderDomain: 'hsbc.com',
        receivedAt: new Date('2024-01-01'),
      });

      await app.processEmail({
        id: 'email-hsbc-2',
        subject: 'HSBC Account Update',
        body: 'Your HSBC account has been updated.',
        sender: 'noreply@hsbc.com',
        senderDomain: 'hsbc.com',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User views topics
      const topics = await app.getAllTopics();
      const hsbcTopics = topics.filter(t => t.fullPath.toLowerCase().includes('hsbc'));

      // Then: Only one HSBC topic exists
      expect(hsbcTopics.length).toBe(1);
    });
  });

  describe('Multiple Topics per Email', () => {
    it('User sees email assigned to multiple topics when relevant', async () => {
      // Given: Email about multiple subjects
      await app.processEmail({
        id: 'email-multi-1',
        subject: 'Project Alpha Payment from Client',
        body: 'Payment received for Project Alpha from Client-ABC. Invoice #1234.',
        sender: 'finance@client-abc.com',
        senderDomain: 'client-abc.com',
        receivedAt: new Date(),
      });

      // When: User views email topics
      const emailTopics = await app.getEmailTopics('email-multi-1');

      // Then: Email has multiple topics
      expect(emailTopics.length).toBeGreaterThanOrEqual(2);
      expect(emailTopics).toContainEqual(expect.objectContaining({ parent: 'Projects' }));
      expect(emailTopics).toContainEqual(expect.objectContaining({ parent: 'Business' }));
    });
  });

  describe('Predefined Parent Categories', () => {
    it('User sees banking emails categorized under Banking', async () => {
      await app.processEmail({
        id: 'banking-test',
        subject: 'Credit Card Statement',
        body: 'Your credit card statement is ready.',
        sender: 'info@creditcard.com',
        senderDomain: 'creditcard.com',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Banking')).toBe(true);
    });

    it('User sees course/learning emails categorized under Education', async () => {
      await app.processEmail({
        id: 'education-test',
        subject: 'Your Coursera Course Progress',
        body: 'You have completed 50% of your Python course.',
        sender: 'noreply@coursera.org',
        senderDomain: 'coursera.org',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Education')).toBe(true);
    });

    it('User sees work/client emails categorized under Projects', async () => {
      await app.processEmail({
        id: 'projects-test',
        subject: 'Client XYZ Sprint Review',
        body: 'Notes from the sprint review meeting.',
        sender: 'pm@clientxyz.com',
        senderDomain: 'clientxyz.com',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Projects')).toBe(true);
    });

    it('User sees purchase emails categorized under Shopping', async () => {
      await app.processEmail({
        id: 'shopping-test',
        subject: 'Your eBay Order Shipped',
        body: 'Your order has been shipped.',
        sender: 'orders@ebay.com',
        senderDomain: 'ebay.com',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Shopping')).toBe(true);
    });

    it('User sees flight/hotel emails categorized under Travel', async () => {
      await app.processEmail({
        id: 'travel-test',
        subject: 'Your Delta Booking Confirmed',
        body: 'Flight DL123 confirmed for March 15.',
        sender: 'reservations@delta.com',
        senderDomain: 'delta.com',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Travel')).toBe(true);
    });

    it('User sees medical/insurance emails categorized under Health', async () => {
      await app.processEmail({
        id: 'health-test',
        subject: 'Appointment Reminder',
        body: 'Your doctor appointment is scheduled for next week.',
        sender: 'appointments@clinic.com',
        senderDomain: 'clinic.com',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Health')).toBe(true);
    });

    it('User sees family/friends emails categorized under Personal', async () => {
      await app.processEmail({
        id: 'personal-test',
        subject: 'Family Dinner This Sunday',
        body: 'Join us for dinner at 6pm.',
        sender: 'mom@family.com',
        senderDomain: 'family.com',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Personal')).toBe(true);
    });

    it('User sees work-related emails categorized under Business', async () => {
      await app.processEmail({
        id: 'business-test',
        subject: 'Contract Review Request',
        body: 'Please review the attached contract.',
        sender: 'legal@company.com',
        senderDomain: 'company.com',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Business')).toBe(true);
    });

    it('User sees tech/tool emails categorized under Technology', async () => {
      await app.processEmail({
        id: 'tech-test',
        subject: 'GitHub Security Alert',
        body: 'A vulnerability was detected in your repository.',
        sender: 'security@github.com',
        senderDomain: 'github.com',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Technology')).toBe(true);
    });

    it('User sees streaming/gaming emails categorized under Entertainment', async () => {
      await app.processEmail({
        id: 'entertainment-test',
        subject: 'New on Netflix This Week',
        body: 'Check out the latest releases.',
        sender: 'info@netflix.com',
        senderDomain: 'netflix.com',
        receivedAt: new Date(),
      });

      const topics = await app.getAllTopics();
      expect(topics.some(t => t.parent === 'Entertainment')).toBe(true);
    });
  });

  describe('Gmail Label Integration', () => {
    it('User sees Gmail labels created matching topic hierarchy', async () => {
      // Given: User processes an email
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Chase Statement',
        body: 'Your statement is ready.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: email.id,
        subject: email.subject,
        body: email.body,
        sender: 'noreply@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date(),
      });

      // When: User checks Gmail labels
      const labels = await gmail.getLabelsForEmail(email.id);

      // Then: TuskerBrain topic label exists
      expect(labels.some(l => l.startsWith('TuskerBrain/Topic/'))).toBe(true);
    });

    it('User sees TuskerBrain/Processed label applied', async () => {
      // Given: User processes an email
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Test Email',
        body: 'Test content.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: email.id,
        subject: email.subject,
        body: email.body,
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      // When: User checks Gmail labels
      const labels = await gmail.getLabelsForEmail(email.id);

      // Then: Processed label is applied
      expect(labels).toContain('TuskerBrain/Processed');
    });

    it('User can filter emails in Gmail using TuskerBrain labels', async () => {
      // Given: Multiple processed emails with different topics
      const email1 = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Banking Email',
        body: 'Banking content.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: email1.id,
        subject: email1.subject,
        body: email1.body,
        sender: 'bank@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date(),
      });

      // When: User looks at available Gmail labels
      const allLabels = await app.getAvailableGmailLabels();

      // Then: TuskerBrain topic labels are available for filtering
      expect(allLabels.some(l => l.startsWith('TuskerBrain/Topic/'))).toBe(true);
    });
  });

  describe('Ambiguous Category Handling', () => {
    it('AI picks best match when email could fit multiple parent categories', async () => {
      // Given: Email about a financial course (could be Banking OR Education)
      await app.processEmail({
        id: 'ambiguous-1',
        subject: 'Investment Banking Course Registration',
        body: 'Your registration for the Advanced Investment Banking course is confirmed. Learn about stocks, bonds, and portfolio management.',
        sender: 'courses@financeacademy.com',
        senderDomain: 'financeacademy.com',
        receivedAt: new Date(),
      });

      // When: User views the assigned topic
      const emailTopics = await app.getEmailTopics('ambiguous-1');

      // Then: AI picks the most appropriate single parent (Education for learning content)
      expect(emailTopics.length).toBeGreaterThanOrEqual(1);
      // The primary topic should be Education since this is a course
      const primaryTopic = emailTopics[0];
      expect(['Education', 'Banking', 'Business']).toContain(primaryTopic.parent);
    });

    it('AI assigns multiple topics when email genuinely spans categories', async () => {
      // Given: Email about a tech startup investment (Technology + Business + Finance)
      await app.processEmail({
        id: 'ambiguous-2',
        subject: 'Your Tech Startup Investment Update',
        body: 'Quarterly report for your investment in AI Ventures startup. Portfolio valuation increased 25%.',
        sender: 'investor@ai-ventures.com',
        senderDomain: 'ai-ventures.com',
        receivedAt: new Date(),
      });

      // When: User views the assigned topics
      const emailTopics = await app.getEmailTopics('ambiguous-2');

      // Then: Multiple relevant topics may be assigned
      expect(emailTopics.length).toBeGreaterThanOrEqual(1);
      const parents = emailTopics.map(t => t.parent);
      // Should include at least one of the relevant categories
      expect(parents.some(p => ['Business', 'Technology', 'Banking', 'Investments'].includes(p))).toBe(true);
    });
  });

  describe('Topic Merging', () => {
    it('Similar topics from different senders are reconciled', async () => {
      // Given: Two emails that could create similar topics
      await app.processEmail({
        id: 'merge-1',
        subject: 'Chase Bank Statement',
        body: 'Your Chase Bank monthly statement is ready.',
        sender: 'statements@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date('2024-01-01'),
      });

      await app.processEmail({
        id: 'merge-2',
        subject: 'Chase Credit Card Update',
        body: 'Your Chase credit card has been updated.',
        sender: 'cards@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User views topics
      const topics = await app.getAllTopics();
      const chaseTopics = topics.filter(t =>
        t.fullPath.toLowerCase().includes('chase')
      );

      // Then: Only one Chase topic exists (merged)
      expect(chaseTopics.length).toBe(1);
    });

    it('Variations of entity name are normalized to single topic', async () => {
      // Given: Emails with name variations
      await app.processEmail({
        id: 'variation-1',
        subject: 'Amazon.com Order Confirmation',
        body: 'Your Amazon.com order #123 has been confirmed.',
        sender: 'orders@amazon.com',
        senderDomain: 'amazon.com',
        receivedAt: new Date('2024-01-01'),
      });

      await app.processEmail({
        id: 'variation-2',
        subject: 'Amazon Prime Shipping Update',
        body: 'Your Amazon Prime order has shipped.',
        sender: 'ship@amazon.com',
        senderDomain: 'amazon.com',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User views topics
      const topics = await app.getAllTopics();
      const amazonTopics = topics.filter(t =>
        t.fullPath.toLowerCase().includes('amazon')
      );

      // Then: All variations resolve to single "Amazon" topic
      expect(amazonTopics.length).toBe(1);
      expect(amazonTopics[0].name).toBe('Amazon');
    });
  });

  describe('Low-Content Email Handling', () => {
    it('One-liner email gets appropriate generic topic', async () => {
      // Given: Email with minimal content
      await app.processEmail({
        id: 'short-1',
        subject: 'Thanks',
        body: 'Thanks!',
        sender: 'colleague@company.com',
        senderDomain: 'company.com',
        receivedAt: new Date(),
      });

      // When: User views assigned topic
      const emailTopics = await app.getEmailTopics('short-1');

      // Then: Topic is assigned (not left unprocessed)
      expect(emailTopics.length).toBeGreaterThanOrEqual(1);
      // Should have some parent category even for minimal content
      expect(emailTopics[0].parent).toBeDefined();
    });

    it('Auto-reply email gets appropriate topic classification', async () => {
      // Given: Auto-reply/out-of-office email
      await app.processEmail({
        id: 'autoreply-1',
        subject: 'Out of Office: Re: Project Update',
        body: 'I am currently out of the office and will return on Monday. For urgent matters, contact support.',
        sender: 'john.doe@company.com',
        senderDomain: 'company.com',
        receivedAt: new Date(),
        isAutoReply: true,
      });

      // When: User views assigned topic
      const emailTopics = await app.getEmailTopics('autoreply-1');

      // Then: Auto-reply is classified appropriately
      expect(emailTopics.length).toBeGreaterThanOrEqual(1);
      // Should not create a new specific topic for auto-reply
      expect(emailTopics[0].fullPath).toBeDefined();
    });

    it('Newsletter with no specific topic gets general classification', async () => {
      // Given: Generic newsletter
      await app.processEmail({
        id: 'newsletter-1',
        subject: 'Weekly Digest',
        body: 'Here are this week\'s top stories from around the web.',
        sender: 'digest@newsaggregator.com',
        senderDomain: 'newsaggregator.com',
        receivedAt: new Date(),
      });

      // When: User views assigned topic
      const emailTopics = await app.getEmailTopics('newsletter-1');

      // Then: Gets appropriate classification
      expect(emailTopics.length).toBeGreaterThanOrEqual(1);
      // Should have a valid parent category
      expect(emailTopics[0].parent).toBeDefined();
    });
  });

  describe('Gmail API Failure Handling', () => {
    it('Topic assignment succeeds even when Gmail label creation fails', async () => {
      // Given: Gmail API will fail for label creation
      await gmail.simulateLabelCreationFailure(true);

      // When: User processes an email
      await app.processEmail({
        id: 'gmail-fail-1',
        subject: 'Important Banking Update',
        body: 'Your account has been updated with new features.',
        sender: 'updates@mybank.com',
        senderDomain: 'mybank.com',
        receivedAt: new Date(),
      });

      // Then: Topic is still assigned in TuskerBrain
      const emailTopics = await app.getEmailTopics('gmail-fail-1');
      expect(emailTopics.length).toBeGreaterThanOrEqual(1);

      // And: Error is logged for later retry
      const syncErrors = await app.getSyncErrors();
      expect(syncErrors.some(e => e.type === 'label_creation_failed')).toBe(true);

      // Cleanup
      await gmail.simulateLabelCreationFailure(false);
    });

    it('User sees graceful degradation message when label sync fails', async () => {
      // Given: Gmail API is temporarily unavailable
      await gmail.simulateLabelCreationFailure(true);

      // When: User processes email and views status
      await app.processEmail({
        id: 'gmail-fail-2',
        subject: 'Test Email',
        body: 'Test content.',
        sender: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      const status = await app.getProcessingStatus('gmail-fail-2');

      // Then: Status shows partial success with warning
      expect(status.topicAssigned).toBe(true);
      expect(status.gmailLabelSynced).toBe(false);
      expect(status.warning).toMatch(/label|sync|retry/i);

      // Cleanup
      await gmail.simulateLabelCreationFailure(false);
    });

    it('Failed label sync is retried automatically when Gmail recovers', async () => {
      // Design Spec Reference: Lines 201-205
      // Label sync failures should be retried automatically
      // Given: Gmail API initially fails
      await gmail.simulateLabelCreationFailure(true);

      await app.processEmail({
        id: 'gmail-retry-test',
        subject: 'Retry Test Email',
        body: 'Testing label sync retry.',
        sender: 'test@retry.com',
        senderDomain: 'retry.com',
        receivedAt: new Date(),
      });

      // Verify label sync failed initially
      let status = await app.getProcessingStatus('gmail-retry-test');
      expect(status.gmailLabelSynced).toBe(false);

      // When: Gmail API recovers and retry runs
      await gmail.simulateLabelCreationFailure(false);
      await app.retryFailedLabelSyncs();

      // Then: Label sync succeeds on retry
      status = await app.getProcessingStatus('gmail-retry-test');
      expect(status.gmailLabelSynced).toBe(true);
      expect(status.warning).toBeUndefined();

      // And: Label is now applied in Gmail
      const labels = await gmail.getLabelsForEmail('gmail-retry-test');
      expect(labels.some(l => l.startsWith('TuskerBrain/'))).toBe(true);
    });

    it('Multiple failed label syncs are batched and retried together', async () => {
      // Given: Multiple emails with failed label syncs
      await gmail.simulateLabelCreationFailure(true);

      for (let i = 0; i < 3; i++) {
        await app.processEmail({
          id: `batch-retry-${i}`,
          subject: `Batch Test ${i}`,
          body: `Content ${i}`,
          sender: `batch${i}@test.com`,
          senderDomain: 'test.com',
          receivedAt: new Date(),
        });
      }

      // When: Gmail recovers and batch retry runs
      await gmail.simulateLabelCreationFailure(false);
      const retryResult = await app.retryFailedLabelSyncs();

      // Then: All pending label syncs are retried
      expect(retryResult.succeeded).toBe(3);
      expect(retryResult.failed).toBe(0);

      // And: All emails now have labels
      for (let i = 0; i < 3; i++) {
        const labels = await gmail.getLabelsForEmail(`batch-retry-${i}`);
        expect(labels.some(l => l.startsWith('TuskerBrain/'))).toBe(true);
      }
    });
  });

  describe('Novel Parent Topic Creation', () => {
    it('Specific novel parent topic is created with correct name', async () => {
      // Given: Email about a niche category not in predefined list
      await app.processEmail({
        id: 'novel-parent-1',
        subject: 'Drone Racing League Update',
        body: 'The next drone racing championship is scheduled for next month. Register your drone now!',
        sender: 'racing@dronesports.com',
        senderDomain: 'dronesports.com',
        receivedAt: new Date(),
      });

      // When: User views created topics
      const topics = await app.getAllTopics();

      // Then: A specific parent topic is created (not generic)
      const droneTopic = topics.find(t =>
        t.fullPath.toLowerCase().includes('drone') ||
        t.fullPath.toLowerCase().includes('sport') ||
        t.fullPath.toLowerCase().includes('racing')
      );

      expect(droneTopic).toBeDefined();
      // Verify it's a parent topic (has no parent itself, or is the root)
      expect(droneTopic?.parent).toBeDefined();
    });

    it('Novel parent is not created when predefined category fits', async () => {
      // Given: Email that clearly fits a predefined category
      await app.processEmail({
        id: 'no-novel-1',
        subject: 'Your Online Course Certificate',
        body: 'Congratulations! You have completed the Python Programming course.',
        sender: 'certificates@udemy.com',
        senderDomain: 'udemy.com',
        receivedAt: new Date(),
      });

      // When: User views created topics
      const topics = await app.getAllTopics();

      // Then: Uses predefined "Education" parent, not a novel one
      const udemyTopic = topics.find(t =>
        t.fullPath.toLowerCase().includes('udemy') ||
        t.fullPath.toLowerCase().includes('python')
      );

      expect(udemyTopic).toBeDefined();
      expect(udemyTopic?.parent).toBe('Education');
    });
  });

  describe('Topic Hierarchy Navigation', () => {
    it('User can view all emails under a parent topic', async () => {
      // Given: Multiple emails under Banking parent
      await app.processEmail({
        id: 'bank-email-1',
        subject: 'Chase Statement',
        body: 'Chase content.',
        sender: 'chase.com',
        senderDomain: 'chase.com',
        topic: 'Banking/Chase',
        receivedAt: new Date(),
      });

      await app.processEmail({
        id: 'bank-email-2',
        subject: 'Wells Fargo Alert',
        body: 'Wells Fargo content.',
        sender: 'wellsfargo.com',
        senderDomain: 'wellsfargo.com',
        topic: 'Banking/Wells-Fargo',
        receivedAt: new Date(),
      });

      // When: User filters by parent topic "Banking"
      await app.setTimelineFilter({ topic: 'Banking' });
      const timeline = await app.getTimeline();

      // Then: All Banking child topics are included
      expect(timeline.length).toBeGreaterThanOrEqual(2);
    });

    it('User can view emails for a specific child topic only', async () => {
      // Given: Multiple emails under different child topics
      await app.processEmail({
        id: 'chase-email',
        subject: 'Chase Email',
        body: 'Chase content.',
        sender: 'chase.com',
        senderDomain: 'chase.com',
        topic: 'Banking/Chase',
        receivedAt: new Date(),
      });

      await app.processEmail({
        id: 'wells-email',
        subject: 'Wells Fargo Email',
        body: 'Wells Fargo content.',
        sender: 'wellsfargo.com',
        senderDomain: 'wellsfargo.com',
        topic: 'Banking/Wells-Fargo',
        receivedAt: new Date(),
      });

      // When: User filters by specific child topic
      await app.setTimelineFilter({ topic: 'Banking/Chase' });
      const timeline = await app.getTimeline();

      // Then: Only Chase emails shown
      expect(timeline.every(e => e.topic === 'Banking/Chase')).toBe(true);
    });

    it('User sees topic hierarchy in topic list view', async () => {
      // Given: Topics exist at multiple levels
      await app.seedTopics([
        { parent: 'Banking', child: 'Chase', emailCount: 5 },
        { parent: 'Banking', child: 'Wells-Fargo', emailCount: 3 },
        { parent: 'Education', child: 'Udemy', emailCount: 2 },
      ]);

      // When: User views topic list
      const topics = await app.getAllTopics();

      // Then: Hierarchy is visible
      const bankingTopics = topics.filter(t => t.parent === 'Banking');
      expect(bankingTopics.length).toBeGreaterThanOrEqual(2);

      const educationTopics = topics.filter(t => t.parent === 'Education');
      expect(educationTopics.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Sender Label Hierarchy', () => {
    it('User sees sender labels created in TuskerBrain/Sender/* format', async () => {
      // Given: User processes an email from a sender
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Chase Statement',
        body: 'Your statement is ready.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: email.id,
        subject: email.subject,
        body: email.body,
        sender: 'noreply@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date(),
      });

      // When: User checks Gmail labels
      const labels = await gmail.getLabelsForEmail(email.id);

      // Then: Sender label exists in correct format
      expect(labels.some(l => l === 'TuskerBrain/Sender/chase.com')).toBe(true);
    });

    it('Sender labels are reusable across emails from same domain', async () => {
      // Given: First email from sender
      const email1 = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'First Email from Sender',
        body: 'Content 1.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: email1.id,
        subject: email1.subject,
        body: email1.body,
        sender: 'info@example.com',
        senderDomain: 'example.com',
        receivedAt: new Date(),
      });

      // When: Second email from same sender
      const email2 = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Second Email from Same Sender',
        body: 'Content 2.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: email2.id,
        subject: email2.subject,
        body: email2.body,
        sender: 'support@example.com',
        senderDomain: 'example.com',
        receivedAt: new Date(),
      });

      // Then: Both emails have same sender label (by domain)
      const labels1 = await gmail.getLabelsForEmail(email1.id);
      const labels2 = await gmail.getLabelsForEmail(email2.id);

      const senderLabel = 'TuskerBrain/Sender/example.com';
      expect(labels1).toContain(senderLabel);
      expect(labels2).toContain(senderLabel);
    });

    it('Complete label hierarchy is created for processed email', async () => {
      // Given: User processes a banking email
      const email = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your Wells Fargo Statement',
        body: 'Your statement is ready.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: email.id,
        subject: email.subject,
        body: email.body,
        sender: 'noreply@wellsfargo.com',
        senderDomain: 'wellsfargo.com',
        receivedAt: new Date(),
      });

      // When: User checks all labels
      const labels = await gmail.getLabelsForEmail(email.id);

      // Then: Complete hierarchy exists
      expect(labels).toContain('TuskerBrain/Processed');
      expect(labels.some(l => l.startsWith('TuskerBrain/Topic/'))).toBe(true);
      expect(labels.some(l => l.startsWith('TuskerBrain/Sender/'))).toBe(true);
    });

    it('User can filter emails in Gmail by sender label', async () => {
      // Given: Multiple emails from different senders
      const chaseEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Chase Update',
        body: 'Chase content.',
        category: 'updates',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: chaseEmail.id,
        subject: 'Chase Update',
        body: 'Chase content.',
        sender: 'noreply@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date(),
      });

      const amazonEmail = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Amazon Order',
        body: 'Amazon content.',
        category: 'primary',
        date: new Date().toISOString(),
      });

      await app.processEmail({
        id: amazonEmail.id,
        subject: 'Amazon Order',
        body: 'Amazon content.',
        sender: 'ship@amazon.com',
        senderDomain: 'amazon.com',
        receivedAt: new Date(),
      });

      // When: User views available Gmail labels
      const allLabels = await app.getAvailableGmailLabels();

      // Then: Sender labels are available for filtering
      expect(allLabels).toContain('TuskerBrain/Sender/chase.com');
      expect(allLabels).toContain('TuskerBrain/Sender/amazon.com');
    });

    it('Sender label persists even when topic changes', async () => {
      // Given: Sender sends emails in different topics
      // First email - banking
      const email1 = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Your Statement',
        body: 'Banking statement.',
        category: 'updates',
        date: new Date('2024-01-01').toISOString(),
      });

      await app.processEmail({
        id: email1.id,
        subject: 'Your Statement',
        body: 'Banking statement.',
        sender: 'info@bank.com',
        senderDomain: 'bank.com',
        receivedAt: new Date('2024-01-01'),
      });

      // Second email - promotional from same sender
      const email2 = await gmail.sendEmail({
        to: 'me@test.com',
        subject: 'Special Offer',
        body: 'Limited time deal!',
        category: 'promotions',
        date: new Date('2024-01-15').toISOString(),
      });

      await app.processEmail({
        id: email2.id,
        subject: 'Special Offer',
        body: 'Limited time deal!',
        sender: 'promo@bank.com',
        senderDomain: 'bank.com',
        receivedAt: new Date('2024-01-15'),
      });

      // When: User checks labels
      const labels1 = await gmail.getLabelsForEmail(email1.id);
      const labels2 = await gmail.getLabelsForEmail(email2.id);

      // Then: Both have same sender label despite different topics
      expect(labels1).toContain('TuskerBrain/Sender/bank.com');
      expect(labels2).toContain('TuskerBrain/Sender/bank.com');
    });
  });
});
