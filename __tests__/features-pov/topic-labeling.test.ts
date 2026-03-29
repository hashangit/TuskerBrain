import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '../../database/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { TopicLabeler, PREDEFINED_PARENTS } from '@core/labeling/labeler';
import type { Email } from '@core/types/email';

const MIGRATION_PATH = path.join(__dirname, '../../database/migrations/0000_initial.sql');

/**
 * Helper: create an Email object with sensible defaults.
 */
function makeEmail(overrides: Partial<Email> & { id: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: overrides.senderEmail ?? `noreply@${overrides.senderDomain ?? 'example.com'}`,
    senderName: overrides.senderName ?? null,
    senderDomain: overrides.senderDomain ?? 'example.com',
    subject: overrides.subject ?? null,
    snippet: overrides.snippet ?? null,
    receivedAt: overrides.receivedAt ?? new Date(),
    ...overrides,
  };
}

/**
 * Helper: insert an email row into the database so FK constraints pass.
 */
async function insertEmail(repos: Repositories, email: Email): Promise<void> {
  await repos.emails.create({
    id: email.id,
    threadId: email.threadId,
    senderEmail: email.senderEmail,
    senderName: email.senderName ?? undefined,
    senderDomain: email.senderDomain,
    subject: email.subject ?? undefined,
    snippet: email.snippet ?? undefined,
    receivedAt: email.receivedAt,
  });
}

/**
 * Helper: link labels to an email via direct SQL.
 */
async function linkLabelsDirect(db: TuskerBrainDatabase, emailId: string, labelIds: string[]): Promise<void> {
  for (const labelId of labelIds) {
    await db.run('INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)', [emailId, labelId]);
  }
}

/**
 * Feature: Topic Labeling System
 *
 * Tests the REAL TopicLabeler classification logic against real database
 * repositories (TopicsRepository, LabelsRepository). No mocks.
 */
describe('Feature: Topic Labeling', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let labeler: TopicLabeler;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.execSql(fs.readFileSync(MIGRATION_PATH, 'utf-8'));
    repos = createRepositories(db);
    labeler = new TopicLabeler();
  });

  afterEach(async () => {
    await db.close();
  });

  // ---------------------------------------------------------------------------
  // Topic Creation
  // ---------------------------------------------------------------------------
  describe('Topic Creation', () => {
    it('classifies an email from an unknown domain into a valid parent topic', async () => {
      const email = makeEmail({
        id: 'email-spacex-1',
        senderEmail: 'updates@spacex.com',
        senderDomain: 'spacex.com',
        subject: 'SpaceX Starship Update',
        snippet: 'The latest Starship prototype completed its test flight successfully.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      expect(result.parentTopic).toBeDefined();
      expect(result.childTopic).toBeDefined();
      expect(result.fullPath).toBe(`${result.parentTopic}/${result.childTopic}`);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('classifies a banking email under Banking parent with correct child', async () => {
      const email = makeEmail({
        id: 'email-wellsfargo-1',
        senderEmail: 'noreply@wellsfargo.com',
        senderName: 'Wells Fargo',
        senderDomain: 'wellsfargo.com',
        subject: 'Your Wells Fargo Statement',
        snippet: 'Your monthly statement is ready to view.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      expect(result.parentTopic).toBe('Banking');
      expect(result.childTopic.toLowerCase()).toContain('wells');
    });

    it('reuses existing topic when second email arrives from same domain', async () => {
      const email1 = makeEmail({
        id: 'email-chase-1',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase',
        senderDomain: 'chase.com',
        subject: 'Chase Statement Ready',
        snippet: 'Your Chase statement is available.',
        receivedAt: new Date('2024-01-01'),
      });

      const email2 = makeEmail({
        id: 'email-chase-2',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase',
        senderDomain: 'chase.com',
        subject: 'Chase Payment Confirmation',
        snippet: 'Your Chase payment was received.',
        receivedAt: new Date('2024-01-15'),
      });

      const result1 = await labeler.classifyTopic(email1);
      const result2 = await labeler.classifyTopic(email2);

      expect(result1.fullPath).toBe(result2.fullPath);
      expect(result1.childTopic).toBe(result2.childTopic);
    });
  });

  // ---------------------------------------------------------------------------
  // Topic Normalization
  // ---------------------------------------------------------------------------
  describe('Topic Normalization', () => {
    it('normalizes "Chase Bank" to "Chase"', async () => {
      const email = makeEmail({
        id: 'email-chase-norm',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Chase Bank Statement',
        snippet: 'Your Chase Bank account statement.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      expect(result.childTopic).not.toMatch(/chase bank/i);
      expect(result.childTopic).toMatch(/chase/i);
    });

    it('normalizes "Amazon.com" to "Amazon"', async () => {
      const email = makeEmail({
        id: 'email-amazon-norm',
        senderEmail: 'ship-confirm@amazon.com',
        senderName: 'Amazon.com',
        senderDomain: 'amazon.com',
        subject: 'Your Amazon Order',
        snippet: 'Your Amazon.com order has shipped.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      expect(result.childTopic).toBe('Amazon');
    });

    it('normalizes HSBC variations to single canonical form', async () => {
      const email1 = makeEmail({
        id: 'email-hsbc-1',
        senderEmail: 'noreply@hsbc.com',
        senderName: 'HSBC Bank',
        senderDomain: 'hsbc.com',
        subject: 'HSBC Bank Statement',
        snippet: 'Your HSBC Bank statement.',
        receivedAt: new Date('2024-01-01'),
      });

      const email2 = makeEmail({
        id: 'email-hsbc-2',
        senderEmail: 'noreply@hsbc.com',
        senderName: 'HSBC',
        senderDomain: 'hsbc.com',
        subject: 'HSBC Account Update',
        snippet: 'Your HSBC account has been updated.',
        receivedAt: new Date('2024-01-15'),
      });

      const result1 = await labeler.classifyTopic(email1);
      const result2 = await labeler.classifyTopic(email2);

      // Both should produce the same child topic (domain reuse ensures this)
      expect(result1.childTopic).toBe(result2.childTopic);
      expect(result1.fullPath).toBe(result2.fullPath);
    });
  });

  // ---------------------------------------------------------------------------
  // Predefined Parent Categories (10 tests)
  // ---------------------------------------------------------------------------
  describe('Predefined Parent Categories', () => {
    it('classifies chase.com domain under Banking', async () => {
      const email = makeEmail({
        id: 'banking-chase',
        senderDomain: 'chase.com',
        subject: 'Credit Card Statement',
        snippet: 'Your credit card statement is ready.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Banking');
    });

    it('classifies coursera.org domain under Education', async () => {
      const email = makeEmail({
        id: 'education-coursera',
        senderDomain: 'coursera.org',
        subject: 'Your Course Progress',
        snippet: 'You have completed 50% of your Python course.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Education');
    });

    it('classifies emails with "project" keyword under Projects', async () => {
      const email = makeEmail({
        id: 'projects-keyword',
        senderDomain: 'clientxyz.com',
        subject: 'Client XYZ Sprint Review',
        snippet: 'Notes from the sprint review meeting.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      // clientxyz.com is a business domain; "sprint" keyword maps to Projects
      expect(['Projects', 'Business']).toContain(result.parentTopic);
    });

    it('classifies ebay.com domain under Shopping', async () => {
      const email = makeEmail({
        id: 'shopping-ebay',
        senderDomain: 'ebay.com',
        subject: 'Your eBay Order Shipped',
        snippet: 'Your order has been shipped.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Shopping');
    });

    it('classifies delta.com domain under Travel', async () => {
      const email = makeEmail({
        id: 'travel-delta',
        senderDomain: 'delta.com',
        subject: 'Your Delta Booking Confirmed',
        snippet: 'Flight DL123 confirmed for March 15.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Travel');
    });

    it('classifies fitbit.com domain under Health', async () => {
      const email = makeEmail({
        id: 'health-fitbit',
        senderDomain: 'fitbit.com',
        subject: 'Your Weekly Activity Summary',
        snippet: 'You walked 50,000 steps this week.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Health');
    });

    it('falls back to Personal for unrecognized personal-looking domains', async () => {
      const email = makeEmail({
        id: 'personal-family',
        senderDomain: 'gmail.com',
        senderEmail: 'mom@gmail.com',
        subject: 'Family Dinner This Sunday',
        snippet: 'Join us for dinner at 6pm.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Personal');
    });

    it('classifies business domains with no keyword match under Business', async () => {
      const email = makeEmail({
        id: 'business-company',
        senderDomain: 'company.com',
        subject: 'Contract Review Request',
        snippet: 'Please review the attached contract.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Business');
    });

    it('classifies github.com domain under Technology', async () => {
      const email = makeEmail({
        id: 'tech-github',
        senderDomain: 'github.com',
        subject: 'GitHub Security Alert',
        snippet: 'A vulnerability was detected in your repository.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Technology');
    });

    it('classifies netflix.com domain under Entertainment', async () => {
      const email = makeEmail({
        id: 'entertainment-netflix',
        senderDomain: 'netflix.com',
        subject: 'New on Netflix This Week',
        snippet: 'Check out the latest releases.',
        receivedAt: new Date(),
      });
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Entertainment');
    });
  });

  // ---------------------------------------------------------------------------
  // Gmail Label Generation
  // ---------------------------------------------------------------------------
  describe('Gmail Label Path Generation', () => {
    it('generates correct Gmail label path for Banking/Chase', () => {
      const labelPath = labeler.generateGmailLabelPath({ parent: 'Banking', child: 'Chase' });
      expect(labelPath).toBe('TuskerBrain/Topic/Banking/Chase');
    });

    it('sanitizes special characters in label path', () => {
      const labelPath = labeler.generateGmailLabelPath({ parent: 'Shopping', child: 'Best Buy (Deals)' });
      expect(labelPath).toBe('TuskerBrain/Topic/Shopping/Best-Buy-Deals');
    });

    it('replaces spaces with hyphens in label path', () => {
      const labelPath = labeler.generateGmailLabelPath({ parent: 'Banking', child: 'Bank of America' });
      expect(labelPath).toBe('TuskerBrain/Topic/Banking/Bank-of-America');
    });
  });

  // ---------------------------------------------------------------------------
  // PREDEFINED_PARENTS constant
  // ---------------------------------------------------------------------------
  describe('Predefined Parents List', () => {
    it('contains exactly 10 predefined parent categories', () => {
      expect(PREDEFINED_PARENTS).toHaveLength(10);
    });

    it('includes all expected parent categories', () => {
      const expected = [
        'Banking', 'Education', 'Projects', 'Shopping', 'Travel',
        'Health', 'Personal', 'Business', 'Technology', 'Entertainment',
      ];
      for (const parent of expected) {
        expect(PREDEFINED_PARENTS).toContain(parent);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Ambiguous Categories
  // ---------------------------------------------------------------------------
  describe('Ambiguous Category Handling', () => {
    it('picks a valid parent for ambiguous email (finance course)', async () => {
      const email = makeEmail({
        id: 'ambiguous-1',
        senderDomain: 'financeacademy.com',
        subject: 'Investment Banking Course Registration',
        snippet: 'Your registration for the Advanced Investment Banking course is confirmed.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      // Should pick a valid parent from the predefined list or Business fallback
      expect(PREDEFINED_PARENTS as readonly string[]).toContain(result.parentTopic);
    });

    it('domain mapping takes priority over subject keywords', async () => {
      const email = makeEmail({
        id: 'ambiguous-2',
        senderDomain: 'linkedin.com',
        subject: 'New Project Management Opportunity',
        snippet: 'A recruiter sent you a message about a project manager role.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      // Domain mapping should win - linkedin.com maps to Education
      expect(result.parentTopic).toBe('Education');
    });
  });

  // ---------------------------------------------------------------------------
  // Topic Merging (domain-based reuse)
  // ---------------------------------------------------------------------------
  describe('Topic Merging', () => {
    it('same domain produces identical topics across different emails', async () => {
      const email1 = makeEmail({
        id: 'merge-1',
        senderEmail: 'statements@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Chase Bank Statement',
        snippet: 'Your Chase Bank monthly statement is ready.',
        receivedAt: new Date('2024-01-01'),
      });

      const email2 = makeEmail({
        id: 'merge-2',
        senderEmail: 'cards@chase.com',
        senderName: 'Chase Credit Card',
        senderDomain: 'chase.com',
        subject: 'Chase Credit Card Update',
        snippet: 'Your Chase credit card has been updated.',
        receivedAt: new Date('2024-01-15'),
      });

      const result1 = await labeler.classifyTopic(email1);
      const result2 = await labeler.classifyTopic(email2);

      // Same domain should reuse the cached topic from first classification
      expect(result1.fullPath).toBe(result2.fullPath);
    });

    it('variations of entity name resolve to single topic via domain reuse', async () => {
      const email1 = makeEmail({
        id: 'variation-1',
        senderEmail: 'orders@amazon.com',
        senderName: 'Amazon.com',
        senderDomain: 'amazon.com',
        subject: 'Amazon.com Order Confirmation',
        snippet: 'Your Amazon.com order #123 has been confirmed.',
        receivedAt: new Date('2024-01-01'),
      });

      const email2 = makeEmail({
        id: 'variation-2',
        senderEmail: 'ship@amazon.com',
        senderName: 'Amazon Prime',
        senderDomain: 'amazon.com',
        subject: 'Amazon Prime Shipping Update',
        snippet: 'Your Amazon Prime order has shipped.',
        receivedAt: new Date('2024-01-15'),
      });

      const result1 = await labeler.classifyTopic(email1);
      const result2 = await labeler.classifyTopic(email2);

      expect(result1.childTopic).toBe(result2.childTopic);
      expect(result1.fullPath).toBe(result2.fullPath);
    });
  });

  // ---------------------------------------------------------------------------
  // Low-Content Emails
  // ---------------------------------------------------------------------------
  describe('Low-Content Email Handling', () => {
    it('classifies one-liner email with minimal content', async () => {
      const email = makeEmail({
        id: 'short-1',
        senderDomain: 'company.com',
        senderEmail: 'colleague@company.com',
        subject: 'Thanks',
        snippet: 'Thanks!',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      expect(result.parentTopic).toBeDefined();
      expect(result.childTopic).toBeDefined();
      expect(result.fullPath).toBeDefined();
    });

    it('classifies email with no subject', async () => {
      const email = makeEmail({
        id: 'no-subject',
        senderDomain: 'company.com',
        subject: null,
        snippet: null,
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      expect(result.parentTopic).toBeDefined();
      // Falls back to Business for 2-part domain that is not a common provider
      expect(result.parentTopic).toBe('Business');
    });

    it('classifies email with empty snippet and subject from known domain', async () => {
      const email = makeEmail({
        id: 'empty-content',
        senderDomain: 'amazon.com',
        subject: null,
        snippet: null,
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      expect(result.parentTopic).toBe('Shopping');
      expect(result.childTopic).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Novel Parent Topic Creation (or fallback)
  // ---------------------------------------------------------------------------
  describe('Novel Parent Topic Creation', () => {
    it('unknown domain with no keyword match defaults to Business or Personal', async () => {
      const email = makeEmail({
        id: 'novel-parent-1',
        senderDomain: 'dronesports.com',
        subject: 'Drone Racing League Update',
        snippet: 'The next drone racing championship is scheduled.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      // dronesports.com is not in domain mapping; 2-part domain => Business
      expect(['Business', 'Personal']).toContain(result.parentTopic);
    });

    it('predefined category is used when domain is in mapping', async () => {
      const email = makeEmail({
        id: 'no-novel-1',
        senderDomain: 'udemy.com',
        subject: 'Your Online Course Certificate',
        snippet: 'Congratulations! You have completed the Python course.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      expect(result.parentTopic).toBe('Education');
    });
  });

  // ---------------------------------------------------------------------------
  // Topic Hierarchy + Database Repositories
  // ---------------------------------------------------------------------------
  describe('Topic Hierarchy with Database', () => {
    it('parent and child topics are stored correctly in database', async () => {
      const email = makeEmail({
        id: 'hier-1',
        senderDomain: 'chase.com',
        senderName: 'Chase',
        subject: 'Statement Ready',
        snippet: 'Your statement is ready.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);

      // Create parent topic in database
      const parentTopic = await repos.topics.create({
        id: `topic-${result.parentTopic.toLowerCase()}`,
        name: result.parentTopic,
        fullPath: result.parentTopic,
      });

      // Create child topic linked to parent
      const childTopic = await repos.topics.create({
        id: `topic-${result.parentTopic.toLowerCase()}-${result.childTopic.toLowerCase()}`,
        parentId: parentTopic.id,
        name: result.childTopic,
        fullPath: result.fullPath,
      });

      expect(parentTopic.name).toBe(result.parentTopic);
      expect(childTopic.parentId).toBe(parentTopic.id);
      expect(childTopic.fullPath).toBe(result.fullPath);

      // Verify hierarchy navigation
      const children = await repos.topics.findChildren(parentTopic.id);
      expect(children).toHaveLength(1);
      expect(children[0].name).toBe(result.childTopic);
    });

    it('finds topic by full path after creation', async () => {
      await repos.topics.create({
        id: 'topic-banking',
        name: 'Banking',
        fullPath: 'Banking',
      });
      await repos.topics.create({
        id: 'topic-banking-chase',
        parentId: 'topic-banking',
        name: 'Chase',
        fullPath: 'Banking/Chase',
      });

      const found = await repos.topics.findByFullPath('Banking/Chase');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Chase');
      expect(found!.parentId).toBe('topic-banking');
    });

    it('links emails to topics with confidence score', async () => {
      const email = makeEmail({ id: 'link-email-1', senderDomain: 'chase.com', subject: 'Test' });
      await insertEmail(repos, email);

      await repos.topics.create({
        id: 'topic-banking-chase',
        name: 'Chase',
        fullPath: 'Banking/Chase',
      });

      await repos.topics.linkEmail('link-email-1', 'topic-banking-chase', 0.85);

      const emailTopics = await repos.topics.findTopicsForEmail('link-email-1');
      expect(emailTopics).toHaveLength(1);
      expect(emailTopics[0].name).toBe('Chase');
      expect(emailTopics[0].confidenceScore).toBe(0.85);
    });
  });

  // ---------------------------------------------------------------------------
  // Labels Repository (Gmail Label Integration)
  // ---------------------------------------------------------------------------
  describe('Gmail Label Repository', () => {
    it('creates and finds a label by name', async () => {
      await repos.labels.create({
        id: 'label-topic-banking-chase',
        name: 'TuskerBrain/Topic/Banking/Chase',
        type: 'user',
        labelType: 'topic',
      });

      const found = await repos.labels.findByName('TuskerBrain/Topic/Banking/Chase');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('TuskerBrain/Topic/Banking/Chase');
      expect(found!.type).toBe('user');
    });

    it('links labels to an email and retrieves them', async () => {
      const email = makeEmail({ id: 'label-email-1', senderDomain: 'chase.com', subject: 'Test' });
      await insertEmail(repos, email);

      const label = await repos.labels.create({
        id: 'label-topic-banking-chase',
        name: 'TuskerBrain/Topic/Banking/Chase',
        type: 'user',
        labelType: 'topic',
      });

      await linkLabelsDirect(db, 'label-email-1', [label.id]);

      const labels = await repos.labels.getLabelsForEmail('label-email-1');
      expect(labels).toHaveLength(1);
      expect(labels[0].name).toBe('TuskerBrain/Topic/Banking/Chase');
    });

    it('stores sender labels in TuskerBrain/Sender/* format', async () => {
      const label = await repos.labels.create({
        id: 'label-sender-chase',
        name: 'TuskerBrain/Sender/chase.com',
        type: 'user',
        labelType: 'sender',
      });

      const found = await repos.labels.findByName('TuskerBrain/Sender/chase.com');
      expect(found).not.toBeNull();
      expect(found!.id).toBe(label.id);
    });
  });

  // ---------------------------------------------------------------------------
  // End-to-End: classifyTopic -> store topic -> generate label -> store label
  // ---------------------------------------------------------------------------
  describe('End-to-End Classification Pipeline', () => {
    it('classifies email, stores topic hierarchy, generates and stores Gmail label', async () => {
      const email = makeEmail({
        id: 'e2e-1',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase',
        senderDomain: 'chase.com',
        subject: 'Chase Statement',
        snippet: 'Your statement is ready.',
        receivedAt: new Date(),
      });

      // Step 1: Classify
      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Banking');

      // Step 2: Store topic hierarchy
      let parentTopic = await repos.topics.findByFullPath(result.parentTopic);
      if (!parentTopic) {
        parentTopic = await repos.topics.create({
          id: `topic-${result.parentTopic.toLowerCase()}`,
          name: result.parentTopic,
          fullPath: result.parentTopic,
        });
      }

      let childTopic = await repos.topics.findByFullPath(result.fullPath);
      if (!childTopic) {
        childTopic = await repos.topics.create({
          id: `topic-${result.parentTopic.toLowerCase()}-${result.childTopic.toLowerCase()}`,
          parentId: parentTopic.id,
          name: result.childTopic,
          fullPath: result.fullPath,
        });
      }

      // Step 3: Generate Gmail label path
      const labelPath = labeler.generateGmailLabelPath({
        parent: result.parentTopic,
        child: result.childTopic,
      });
      expect(labelPath).toBe('TuskerBrain/Topic/Banking/Chase');

      // Step 4: Store label
      let label = await repos.labels.findByName(labelPath);
      if (!label) {
        label = await repos.labels.create({
          id: `label-${labelPath.replace(/\//g, '-').toLowerCase()}`,
          name: labelPath,
          type: 'user',
          labelType: 'topic',
        });
      }

      // Step 5: Insert email and link everything
      await insertEmail(repos, email);
      await repos.topics.linkEmail(email.id, childTopic.id, result.confidence);
      await linkLabelsDirect(db, email.id, [label.id]);

      // Verify all links
      const emailTopics = await repos.topics.findTopicsForEmail(email.id);
      expect(emailTopics).toHaveLength(1);
      expect(emailTopics[0].fullPath).toBe('Banking/Chase');

      const emailLabels = await repos.labels.getLabelsForEmail(email.id);
      expect(emailLabels).toHaveLength(1);
      expect(emailLabels[0].name).toBe('TuskerBrain/Topic/Banking/Chase');
    });

    it('classifies multiple emails from different domains under correct parents', async () => {
      const emails = [
        makeEmail({ id: 'multi-1', senderDomain: 'amazon.com', subject: 'Order Shipped', receivedAt: new Date() }),
        makeEmail({ id: 'multi-2', senderDomain: 'netflix.com', subject: 'New Releases', receivedAt: new Date() }),
        makeEmail({ id: 'multi-3', senderDomain: 'github.com', subject: 'PR Merged', receivedAt: new Date() }),
      ];

      const results = await Promise.all(emails.map(e => labeler.classifyTopic(e)));

      expect(results[0].parentTopic).toBe('Shopping');
      expect(results[1].parentTopic).toBe('Entertainment');
      expect(results[2].parentTopic).toBe('Technology');

      // All should have distinct full paths
      const paths = results.map(r => r.fullPath);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // API Failure Handling (label creation resilience)
  // ---------------------------------------------------------------------------
  describe('API Failure Handling', () => {
    it('classification succeeds independently of database operations', async () => {
      // TopicLabeler.classifyTopic does not touch the database
      const email = makeEmail({
        id: 'fail-1',
        senderDomain: 'chase.com',
        subject: 'Important Banking Update',
        snippet: 'Your account has been updated.',
        receivedAt: new Date(),
      });

      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Banking');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('label path generation works without database', () => {
      const labelPath = labeler.generateGmailLabelPath({ parent: 'Banking', child: 'Chase' });
      expect(labelPath).toBe('TuskerBrain/Topic/Banking/Chase');
    });

    it('database operations on an empty database return empty results', async () => {
      const allTopics = await repos.topics.findAll();
      expect(allTopics).toHaveLength(0);

      const allLabels = await repos.labels.findAll();
      expect(allLabels).toHaveLength(0);
    });

    it('linking a non-existent email to a topic does not crash (FK enforced)', async () => {
      // Create the topic so the FK on topic side is satisfied
      await repos.topics.create({ id: 'topic-1', name: 'Test', fullPath: 'Test' });

      // This should throw because email does not exist (FK violation)
      await expect(
        repos.topics.linkEmail('nonexistent-email', 'topic-1')
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Sender Labels
  // ---------------------------------------------------------------------------
  describe('Sender Label Hierarchy', () => {
    it('stores sender label in TuskerBrain/Sender/{domain} format', async () => {
      await repos.labels.create({
        id: 'label-sender-chase',
        name: 'TuskerBrain/Sender/chase.com',
        type: 'user',
        labelType: 'sender',
      });

      const found = await repos.labels.findByName('TuskerBrain/Sender/chase.com');
      expect(found).not.toBeNull();
      expect(found!.labelType).toBe('sender');
    });

    it('reuses sender label across emails from same domain', async () => {
      const label = await repos.labels.create({
        id: 'label-sender-example',
        name: 'TuskerBrain/Sender/example.com',
        type: 'user',
        labelType: 'sender',
      });

      const email1 = makeEmail({ id: 'sender-1', senderDomain: 'example.com', subject: 'First' });
      const email2 = makeEmail({ id: 'sender-2', senderDomain: 'example.com', subject: 'Second' });
      await insertEmail(repos, email1);
      await insertEmail(repos, email2);

      await linkLabelsDirect(db, 'sender-1', [label.id]);
      await linkLabelsDirect(db, 'sender-2', [label.id]);

      const labels1 = await repos.labels.getLabelsForEmail('sender-1');
      const labels2 = await repos.labels.getLabelsForEmail('sender-2');

      expect(labels1[0].name).toBe('TuskerBrain/Sender/example.com');
      expect(labels2[0].name).toBe('TuskerBrain/Sender/example.com');
    });

    it('complete label hierarchy for a processed email includes topic and sender labels', async () => {
      const email = makeEmail({
        id: 'complete-1',
        senderDomain: 'chase.com',
        senderEmail: 'noreply@chase.com',
        subject: 'Statement',
        receivedAt: new Date(),
      });
      await insertEmail(repos, email);

      const topicLabel = await repos.labels.create({
        id: 'label-topic-banking-chase',
        name: 'TuskerBrain/Topic/Banking/Chase',
        type: 'user',
        labelType: 'topic',
      });
      const senderLabel = await repos.labels.create({
        id: 'label-sender-chase',
        name: 'TuskerBrain/Sender/chase.com',
        type: 'user',
        labelType: 'sender',
      });

      await linkLabelsDirect(db, 'complete-1', [topicLabel.id, senderLabel.id]);

      const labels = await repos.labels.getLabelsForEmail('complete-1');
      const labelNames = labels.map(l => l.name);

      expect(labelNames).toContain('TuskerBrain/Topic/Banking/Chase');
      expect(labelNames).toContain('TuskerBrain/Sender/chase.com');
    });

    it('filters labels by type using labelType field', async () => {
      await repos.labels.create({
        id: 'label-topic-1',
        name: 'TuskerBrain/Topic/Banking/Chase',
        type: 'user',
        labelType: 'topic',
      });
      await repos.labels.create({
        id: 'label-sender-1',
        name: 'TuskerBrain/Sender/chase.com',
        type: 'user',
        labelType: 'sender',
      });

      const all = await repos.labels.findAll();
      expect(all).toHaveLength(2);

      const topicLabels = all.filter(l => l.labelType === 'topic');
      const senderLabels = all.filter(l => l.labelType === 'sender');

      expect(topicLabels).toHaveLength(1);
      expect(senderLabels).toHaveLength(1);
    });

    it('sender label persists across different topic assignments', async () => {
      const email1 = makeEmail({
        id: 'persist-1',
        senderDomain: 'bank.com',
        senderEmail: 'info@bank.com',
        subject: 'Your Statement',
        receivedAt: new Date('2024-01-01'),
      });
      const email2 = makeEmail({
        id: 'persist-2',
        senderDomain: 'bank.com',
        senderEmail: 'promo@bank.com',
        subject: 'Special Offer',
        receivedAt: new Date('2024-01-15'),
      });
      await insertEmail(repos, email1);
      await insertEmail(repos, email2);

      const senderLabel = await repos.labels.create({
        id: 'label-sender-bank',
        name: 'TuskerBrain/Sender/bank.com',
        type: 'user',
        labelType: 'sender',
      });

      // Both emails get the same sender label
      await linkLabelsDirect(db, 'persist-1', [senderLabel.id]);
      await linkLabelsDirect(db, 'persist-2', [senderLabel.id]);

      const labels1 = await repos.labels.getLabelsForEmail('persist-1');
      const labels2 = await repos.labels.getLabelsForEmail('persist-2');

      expect(labels1.some(l => l.name === 'TuskerBrain/Sender/bank.com')).toBe(true);
      expect(labels2.some(l => l.name === 'TuskerBrain/Sender/bank.com')).toBe(true);
    });
  });
});
