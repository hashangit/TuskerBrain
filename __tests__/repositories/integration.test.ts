import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TuskerBrainDatabase } from '../../database';
import {
  EmailRepository,
  TopicsRepository,
  DealsRepository,
  TimelineRepository,
  SummariesRepository,
  LabelsRepository,
  createRepositories,
  type Repositories,
} from '@core/repositories';

describe('Repository Integration Tests', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('TopicsRepository', () => {
    it('should create and find topics', async () => {
      const topic = await repos.topics.create({
        id: 'topic_1',
        name: 'Banking',
        fullPath: 'Banking',
      });

      expect(topic.id).toBe('topic_1');
      expect(topic.name).toBe('Banking');
    });

    it('should find topics by full path', async () => {
      await repos.topics.create({
        id: 'topic_1',
        name: 'Chase',
        fullPath: 'Banking/Chase',
      });

      const found = await repos.topics.findByFullPath('Banking/Chase');

      expect(found).toBeDefined();
      expect(found?.name).toBe('Chase');
    });

    it('should support hierarchical topics', async () => {
      const parent = await repos.topics.create({
        id: 'parent',
        name: 'Banking',
        fullPath: 'Banking',
      });

      const child = await repos.topics.create({
        id: 'child',
        parentId: 'parent',
        name: 'Chase',
        fullPath: 'Banking/Chase',
      });

      const children = await repos.topics.findChildren('parent');
      expect(children.length).toBe(1);
      expect(children[0].name).toBe('Chase');
    });

    it('should link emails to topics', async () => {
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'test@chase.com',
        senderDomain: 'chase.com',
        receivedAt: new Date(),
      });

      await repos.topics.create({
        id: 'topic_1',
        name: 'Banking',
        fullPath: 'Banking',
      });

      await repos.topics.linkEmail('email_1', 'topic_1', 0.9);

      const topics = await repos.topics.findTopicsForEmail('email_1');
      expect(topics.length).toBe(1);
      expect(topics[0].confidenceScore).toBe(0.9);
    });

    it('should manage topic summaries', async () => {
      // Create emails first (required for foreign key constraint)
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'test1@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });
      await repos.emails.create({
        id: 'email_2',
        threadId: 't2',
        senderEmail: 'test2@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await repos.topics.create({
        id: 'topic_1',
        name: 'Test',
        fullPath: 'Test',
      });

      const summary = await repos.topics.upsertSummary(
        'topic_1',
        'This is a test summary',
        5,
        'email_1'
      );

      expect(summary.summary).toBe('This is a test summary');
      expect(summary.wordCount).toBe(5);
      expect(summary.updateCount).toBe(1);

      // Update should increment count
      const updated = await repos.topics.upsertSummary(
        'topic_1',
        'Updated summary',
        2,
        'email_2'
      );

      expect(updated.updateCount).toBe(2);
    });
  });

  describe('DealsRepository', () => {
    it('should create and find deals', async () => {
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'deals@amazon.com',
        senderDomain: 'amazon.com',
        receivedAt: new Date(),
      });

      const deal = await repos.deals.create({
        id: 'deal_1',
        emailId: 'email_1',
        dealTitle: '50% Off Electronics',
        brandName: 'Amazon',
        dealCode: 'SAVE50',
        isActive: true,
      });

      expect(deal.dealTitle).toBe('50% Off Electronics');
      expect(deal.isActive).toBe(true);
    });

    it('should find deals by brand', async () => {
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'deals@amazon.com',
        senderDomain: 'amazon.com',
        receivedAt: new Date(),
      });

      await repos.deals.create({
        id: 'deal_1',
        emailId: 'email_1',
        dealTitle: 'Deal 1',
        brandName: 'Amazon',
      });

      const deals = await repos.deals.findByBrand('Amazon');
      expect(deals.length).toBe(1);
    });

    it('should find active deals', async () => {
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'deals@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await repos.deals.create({
        id: 'deal_1',
        emailId: 'email_1',
        dealTitle: 'Active Deal',
        isActive: true,
      });

      await repos.deals.create({
        id: 'deal_2',
        emailId: 'email_1',
        dealTitle: 'Inactive Deal',
        isActive: false,
      });

      const activeDeals = await repos.deals.findActive();
      expect(activeDeals.length).toBe(1);
      expect(activeDeals[0].dealTitle).toBe('Active Deal');
    });

    it('should deactivate deals', async () => {
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await repos.deals.create({
        id: 'deal_1',
        emailId: 'email_1',
        dealTitle: 'Test Deal',
        isActive: true,
      });

      await repos.deals.deactivate('deal_1');

      const deal = await repos.deals.findById('deal_1');
      expect(deal?.isActive).toBe(false);
    });
  });

  describe('TimelineRepository', () => {
    it('should create and find timeline updates', async () => {
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      const update = await repos.timeline.create({
        id: 'tu_1',
        emailId: 'email_1',
        title: 'Project Update',
        priority: 'high',
        actionItem: true,
      });

      expect(update.title).toBe('Project Update');
      expect(update.priority).toBe('high');
      expect(update.actionItem).toBe(true);
    });

    it('should find high priority updates', async () => {
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await repos.timeline.create({
        id: 'tu_1',
        emailId: 'email_1',
        title: 'High Priority',
        priority: 'high',
      });

      await repos.timeline.create({
        id: 'tu_2',
        emailId: 'email_1',
        title: 'Low Priority',
        priority: 'low',
      });

      const highPriority = await repos.timeline.findHighPriority();
      expect(highPriority.length).toBe(1);
    });

    it('should find updates with action items', async () => {
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await repos.timeline.create({
        id: 'tu_1',
        emailId: 'email_1',
        title: 'Has Action Item',
        actionItem: true,
      });

      await repos.timeline.create({
        id: 'tu_2',
        emailId: 'email_1',
        title: 'No Action Item',
        actionItem: false,
      });

      const actionItems = await repos.timeline.findActionItems();
      expect(actionItems.length).toBe(1);
    });
  });

  describe('SummariesRepository', () => {
    it('should create and find sender summaries', async () => {
      const summary = await repos.summaries.upsertSenderSummary({
        senderDomain: 'amazon.com',
        summary: 'Amazon sends promotional emails',
        wordCount: 4,
      });

      expect(summary.senderDomain).toBe('amazon.com');
      expect(summary.wordCount).toBe(4);
    });

    it('should update existing summaries', async () => {
      await repos.summaries.upsertSenderSummary({
        senderDomain: 'amazon.com',
        summary: 'Initial summary',
      });

      const updated = await repos.summaries.upsertSenderSummary({
        senderDomain: 'amazon.com',
        summary: 'Updated summary',
      });

      expect(updated.updateCount).toBe(2);
    });

    it('should find recently updated summaries', async () => {
      await repos.summaries.upsertSenderSummary({
        senderDomain: 'recent.com',
        summary: 'Recent summary',
      });

      const recent = await repos.summaries.getRecentlyUpdated(1);
      expect(recent.length).toBe(1);
    });
  });

  describe('LabelsRepository', () => {
    it('should create and find labels', async () => {
      const label = await repos.labels.create({
        id: 'label_1',
        name: 'TuskerBrain/Processed',
        type: 'user',
      });

      expect(label.name).toBe('TuskerBrain/Processed');
    });

    it('should find labels by name', async () => {
      await repos.labels.create({
        id: 'label_1',
        name: 'TuskerBrain/Test',
        type: 'user',
      });

      const found = await repos.labels.findByName('TuskerBrain/Test');

      expect(found).toBeDefined();
      expect(found?.name).toBe('TuskerBrain/Test');
    });

    it('should link labels to emails', async () => {
      await repos.emails.create({
        id: 'email_1',
        threadId: 't1',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        receivedAt: new Date(),
      });

      await repos.labels.create({
        id: 'label_1',
        name: 'TuskerBrain/Test',
        type: 'user',
      });

      await repos.labels.linkLabelsToEmail('email_1', ['label_1']);

      const labels = await repos.labels.findLabelsForEmail('email_1');
      expect(labels.length).toBe(1);
    });
  });
});
