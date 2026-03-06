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
});
