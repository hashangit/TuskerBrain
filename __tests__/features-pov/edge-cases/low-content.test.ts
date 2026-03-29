import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { SummaryGenerator } from '@core/summaries/generator';
import { TopicLabeler } from '@core/labeling/labeler';
import { extractUpdate, extractDeal } from '@core/workflows/nodes/extract';
import type { Email } from '@core/types/email';

/**
 * Feature: Low-Content Email Handling
 *
 * As a user, I want the system to gracefully handle emails with minimal content
 * (thank-yous, auto-replies, empty bodies, generic newsletters) so that
 * processing never crashes and even low-signal emails get reasonable classification.
 *
 * Business Rules:
 * - One-liner emails get a topic assignment and summary
 * - Auto-replies are processed without crashing, extractUpdate returns null
 * - Empty/null subject and snippet don't crash any component
 * - Generic newsletters get classified and summarized
 *
 * RULES:
 * - Every test calls REAL production code.
 * - SummaryGenerator, TopicLabeler, extractUpdate, extractDeal are NOT mocked.
 * - No LLM calls required -- all use deterministic logic.
 * - In-memory SQLite with migration schema.
 *
 * Infrastructure note:
 * db.getSqlite().exec(migrationSql) is used instead of db.initialize() because
 * drizzle's migrator cannot handle multi-statement SQL files. This is the only
 * workaround -- it creates the exact same schema.
 */

const MIGRATION_PATH = path.join(__dirname, '../../../database/migrations/0000_initial.sql');

/** Helper: create an Email object with sensible defaults. */
function makeEmail(overrides: Partial<Email> & { id: string }): Email {
  return {
    threadId: `thread-${overrides.id}`,
    senderEmail: 'sender@example.com',
    senderName: 'Sender',
    senderDomain: 'example.com',
    subject: 'Some subject',
    snippet: 'Some snippet text.',
    receivedAt: new Date('2024-06-15'),
    ...overrides,
  };
}

describe('Feature: Low-Content Emails', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let summaryGenerator: SummaryGenerator;
  let topicLabeler: TopicLabeler;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf-8');
    db.getSqlite().exec(migrationSql);
    repos = createRepositories(db);
    summaryGenerator = new SummaryGenerator();
    topicLabeler = new TopicLabeler();
  });

  afterEach(async () => {
    await db.close();
  });

  // --- Thank-You Email ---

  describe('Thank-you email ("Thanks!")', () => {
    it('TopicLabeler classifies a one-liner thank-you email', async () => {
      // Given: A minimal thank-you email
      const email = makeEmail({
        id: 'thankyou-1',
        subject: 'Thanks',
        snippet: 'Thanks!',
        senderEmail: 'colleague@company.com',
        senderName: 'John Colleague',
        senderDomain: 'company.com',
      });

      // When: TopicLabeler classifies it
      const result = await topicLabeler.classifyTopic(email);

      // Then: It gets a valid topic (company.com is a 2-part domain -> Business)
      expect(result.parentTopic).toBeDefined();
      expect(result.childTopic).toBeDefined();
      expect(result.fullPath).toContain('/');
      expect(result.parentTopic).toBe('Business');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('SummaryGenerator produces a valid summary for a thank-you email', async () => {
      // Given: A thank-you email in a topic
      const email = makeEmail({
        id: 'thankyou-2',
        subject: 'Thanks',
        snippet: 'Thanks!',
        senderEmail: 'colleague@company.com',
        senderName: 'John',
        senderDomain: 'company.com',
      });

      // When: Summary is generated
      const result = await summaryGenerator.generateTopicSummary('Business/Company', [email]);

      // Then: Summary is produced (not empty, not crashing)
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      expect(result.updateCount).toBe(1);
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('extractUpdate returns null for a bare thank-you without update keywords', async () => {
      // Given: A plain thank-you email
      const email = makeEmail({
        id: 'thankyou-3',
        subject: 'Thanks',
        snippet: 'Thanks!',
        senderEmail: 'colleague@company.com',
        senderDomain: 'company.com',
      });

      // When: extractUpdate processes it
      const result = await extractUpdate(email);

      // Then: No update extracted -- "Thanks!" has no update keywords
      expect(result).toBeNull();
    });

    it('extractDeal returns null -- no deal keywords in a thank-you', async () => {
      // Given: A thank-you email
      const email = makeEmail({
        id: 'thankyou-4',
        subject: 'Thanks',
        snippet: 'Thanks!',
        senderEmail: 'colleague@company.com',
        senderDomain: 'company.com',
      });

      // When: extractDeal processes it
      const result = await extractDeal(email);

      // Then: Not a deal
      expect(result).toBeNull();
    });

    it('thank-you email is persisted and retrievable from the database', async () => {
      // Given: A thank-you email
      const email = makeEmail({
        id: 'thankyou-db',
        subject: 'Thanks',
        snippet: 'Thanks!',
        senderEmail: 'colleague@company.com',
        senderDomain: 'company.com',
      });

      // When: Stored in the repository
      await repos.emails.create({
        id: email.id,
        threadId: email.threadId,
        senderEmail: email.senderEmail,
        senderName: email.senderName || undefined,
        senderDomain: email.senderDomain,
        subject: email.subject || undefined,
        snippet: email.snippet || undefined,
        receivedAt: email.receivedAt,
      });

      // Then: Can be retrieved
      const stored = await repos.emails.findById(email.id);
      expect(stored).toBeDefined();
      expect(stored!.id).toBe('thankyou-db');
      expect(stored!.subject).toBe('Thanks');
    });
  });

  // --- Auto-Reply Email ---

  describe('Auto-reply email ("Out of Office")', () => {
    it('TopicLabeler classifies an out-of-office auto-reply', async () => {
      // Given: An OOO auto-reply
      const email = makeEmail({
        id: 'ooo-1',
        subject: 'Out of Office: Re: Your Email',
        snippet: 'I am currently out of the office and will return on Monday. For urgent matters, please contact support.',
        senderEmail: 'john.doe@company.com',
        senderName: 'John Doe',
        senderDomain: 'company.com',
      });

      // When: TopicLabeler classifies it
      const result = await topicLabeler.classifyTopic(email);

      // Then: Gets a valid classification
      expect(result.parentTopic).toBeDefined();
      expect(result.childTopic).toBeDefined();
      expect(result.fullPath).toContain('/');
    });

    it('SummaryGenerator handles auto-reply without crashing', async () => {
      // Given: An auto-reply email
      const email = makeEmail({
        id: 'ooo-2',
        subject: 'Out of Office: Re: Your Email',
        snippet: 'I am currently out of the office and will return on Monday.',
        senderEmail: 'john.doe@company.com',
        senderName: 'John Doe',
        senderDomain: 'company.com',
      });

      // When: Summary is generated
      const result = await summaryGenerator.generateSenderSummary('company.com', [email]);

      // Then: Summary is produced without error
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      expect(result.updateCount).toBe(1);
    });

    it('extractUpdate does not crash on an OOO auto-reply', async () => {
      // Given: Auto-reply email (no update keywords)
      const email = makeEmail({
        id: 'ooo-3',
        subject: 'Out of Office: Re: Lunch',
        snippet: 'I am currently out of the office and will return on Monday.',
        senderEmail: 'john.doe@company.com',
        senderDomain: 'company.com',
      });

      // When: extractUpdate processes it
      const result = await extractUpdate(email);

      // Then: No crash -- returns null (no matching update keywords)
      expect(result).toBeNull();
    });

    it('auto-reply email is stored and retrieved without error', async () => {
      // Given: An auto-reply email
      const email = makeEmail({
        id: 'ooo-db',
        subject: 'Out of Office: Re: Your Email',
        snippet: 'I am currently out of the office and will return on Monday.',
        senderEmail: 'john.doe@company.com',
        senderDomain: 'company.com',
      });

      // When: Stored in the repository
      await repos.emails.create({
        id: email.id,
        threadId: email.threadId,
        senderEmail: email.senderEmail,
        senderName: email.senderName || undefined,
        senderDomain: email.senderDomain,
        subject: email.subject || undefined,
        snippet: email.snippet || undefined,
        receivedAt: email.receivedAt,
      });

      // Then: Can be retrieved without error
      const stored = await repos.emails.findById(email.id);
      expect(stored).toBeDefined();
      expect(stored!.subject).toBe('Out of Office: Re: Your Email');
    });
  });

  // --- Empty Body Email ---

  describe('Empty body email (null subject/snippet)', () => {
    it('TopicLabeler handles null subject and null snippet without crashing', async () => {
      // Given: An email with null subject and null snippet
      const email = makeEmail({
        id: 'empty-1',
        subject: null,
        snippet: null,
        senderEmail: 'sender@example.com',
        senderDomain: 'example.com',
      });

      // When: TopicLabeler classifies it
      const result = await topicLabeler.classifyTopic(email);

      // Then: It doesn't crash and returns a valid result
      expect(result.parentTopic).toBeDefined();
      expect(result.childTopic).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('SummaryGenerator handles empty email array via createEmptySummary', async () => {
      // Given: No emails for a topic
      const emails: Email[] = [];

      // When: Summary is generated
      const result = await summaryGenerator.generateTopicSummary('Personal/Misc', emails);

      // Then: Returns an empty summary (not a crash)
      expect(result.summary).toBe('');
      expect(result.wordCount).toBe(0);
      expect(result.paragraphCount).toBe(0);
      expect(result.paragraphs).toEqual([]);
      expect(result.updateCount).toBe(0);
    });

    it('SummaryGenerator handles email with null subject and snippet', async () => {
      // Given: An email with null subject/snippet
      const email = makeEmail({
        id: 'empty-2',
        subject: null,
        snippet: null,
        senderEmail: 'sender@example.com',
        senderDomain: 'example.com',
      });

      // When: Summary is generated with this email
      const result = await summaryGenerator.generateTopicSummary('Personal/Example', [email]);

      // Then: Doesn't crash, produces some summary
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
    });

    it('extractUpdate handles null subject and snippet without crashing', async () => {
      // Given: An email with null subject and snippet
      const email = makeEmail({
        id: 'empty-3',
        subject: null,
        snippet: null,
        senderEmail: 'sender@example.com',
        senderDomain: 'example.com',
      });

      // When: extractUpdate processes it
      const result = await extractUpdate(email);

      // Then: No crash -- returns null (no keywords to match)
      expect(result).toBeNull();
    });

    it('extractDeal handles null subject and snippet without crashing', async () => {
      // Given: An email with null subject and snippet
      const email = makeEmail({
        id: 'empty-4',
        subject: null,
        snippet: null,
        senderEmail: 'sender@example.com',
        senderDomain: 'example.com',
      });

      // When: extractDeal processes it
      const result = await extractDeal(email);

      // Then: No crash -- returns null
      expect(result).toBeNull();
    });

    it('email with null subject/snippet is persisted and retrievable', async () => {
      // Given: An email with null content
      const email = makeEmail({
        id: 'empty-db',
        subject: null,
        snippet: null,
        senderEmail: 'sender@example.com',
        senderDomain: 'example.com',
      });

      // When: Stored in the repository
      await repos.emails.create({
        id: email.id,
        threadId: email.threadId,
        senderEmail: email.senderEmail,
        senderDomain: email.senderDomain,
        receivedAt: email.receivedAt,
      });

      // Then: Can be retrieved
      const stored = await repos.emails.findById(email.id);
      expect(stored).toBeDefined();
      expect(stored!.id).toBe('empty-db');
    });
  });

  // --- Generic Newsletter ---

  describe('Generic newsletter ("Weekly Update")', () => {
    it('TopicLabeler classifies a generic newsletter', async () => {
      // Given: A minimal weekly newsletter
      const email = makeEmail({
        id: 'newsletter-1',
        subject: 'Weekly Update',
        snippet: 'Here are this week\'s updates.',
        senderEmail: 'news@aggregator.com',
        senderName: 'Aggregator News',
        senderDomain: 'aggregator.com',
      });

      // When: TopicLabeler classifies it
      const result = await topicLabeler.classifyTopic(email);

      // Then: Gets a valid classification
      expect(result.parentTopic).toBeDefined();
      expect(result.childTopic).toBeDefined();
      expect(result.fullPath).toContain('/');
      // aggregator.com is a 2-part domain not in common providers -> Business
      expect(result.parentTopic).toBe('Business');
    });

    it('SummaryGenerator produces a summary for a generic newsletter', async () => {
      // Given: A newsletter email
      const email = makeEmail({
        id: 'newsletter-2',
        subject: 'Weekly Update',
        snippet: 'Here are this week\'s updates.',
        senderEmail: 'news@aggregator.com',
        senderName: 'Aggregator News',
        senderDomain: 'aggregator.com',
      });

      // When: Summary is generated
      const result = await summaryGenerator.generateSenderSummary('aggregator.com', [email]);

      // Then: A valid summary is produced
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
      expect(result.updateCount).toBe(1);
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('extractUpdate detects the "update" keyword in newsletter subject', async () => {
      // Given: A newsletter with "Weekly Update" subject
      const email = makeEmail({
        id: 'newsletter-3',
        subject: 'Weekly Update',
        snippet: 'Here are this week\'s updates.',
        senderEmail: 'news@aggregator.com',
        senderDomain: 'aggregator.com',
      });

      // When: extractUpdate processes it
      const result = await extractUpdate(email);

      // Then: It detects "update" keyword and extracts an update
      expect(result).not.toBeNull();
      expect(result!.title).toBeDefined();
      expect(result!.priority).toBeDefined();
    });

    it('extractDeal returns null for a non-promotional newsletter', async () => {
      // Given: A generic newsletter with no deal keywords
      const email = makeEmail({
        id: 'newsletter-4',
        subject: 'Weekly Update',
        snippet: 'Here are this week\'s updates. Nothing promotional about this.',
        senderEmail: 'news@aggregator.com',
        senderDomain: 'aggregator.com',
      });

      // When: extractDeal processes it
      const result = await extractDeal(email);

      // Then: No deal extracted
      expect(result).toBeNull();
    });

    it('newsletter is persisted with topic classification in the database', async () => {
      // Given: A newsletter email
      const email = makeEmail({
        id: 'newsletter-db',
        subject: 'Weekly Update',
        snippet: 'Here are this week\'s updates.',
        senderEmail: 'news@aggregator.com',
        senderName: 'Aggregator News',
        senderDomain: 'aggregator.com',
      });

      // When: Email is stored and classified
      await repos.emails.create({
        id: email.id,
        threadId: email.threadId,
        senderEmail: email.senderEmail,
        senderName: email.senderName || undefined,
        senderDomain: email.senderDomain,
        subject: email.subject || undefined,
        snippet: email.snippet || undefined,
        receivedAt: email.receivedAt,
      });

      const classification = await topicLabeler.classifyTopic(email);

      // Create the topic hierarchy
      const parts = classification.fullPath.split('/');
      const parentName = parts[0];
      const childName = parts[parts.length - 1];
      const parent = await repos.topics.create({
        id: `topic-${parentName}`,
        name: parentName,
        fullPath: parentName,
      });
      const topic = await repos.topics.create({
        id: `topic-${classification.fullPath}`,
        parentId: parent.id,
        name: childName,
        fullPath: classification.fullPath,
      });
      await repos.topics.linkEmail(email.id, topic.id);

      // Then: Email and topic are linked
      const stored = await repos.emails.findById(email.id);
      expect(stored).toBeDefined();
      expect(stored!.subject).toBe('Weekly Update');

      const linkedEmailIds = await repos.topics.findEmailsForTopic(topic.id);
      expect(linkedEmailIds.length).toBe(1);
      expect(linkedEmailIds[0]).toBe('newsletter-db');
    });
  });
});
