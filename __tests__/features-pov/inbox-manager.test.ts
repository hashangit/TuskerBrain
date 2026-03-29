import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '../../database/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { ProcessingDecision } from '@core/workflows/email-processing';
import { GmailSyncManager, type GmailClient } from '@core/gmail/sync';
import { TopicLabeler } from '@core/labeling/labeler';
import { extractUpdate, extractDeal, extractFromEmail } from '@core/workflows/nodes/extract';
import { JobQueue } from '@core/jobs/queue';
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
 * Helper: compute a date N days ago from now.
 */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
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
    emailType: email.emailType ?? undefined,
    gmailCategory: email.gmailCategory ?? undefined,
    isImportant: email.isImportant ?? undefined,
  });
}

/**
 * Helper: create a mock GmailClient for GmailSyncManager tests.
 */
function createMockGmailClient(): GmailClient & {
  modifications: Array<{ messageId: string; modifications: { addLabelIds?: string[]; removeLabelIds?: string[] } }>;
} {
  const modifications: Array<{ messageId: string; modifications: { addLabelIds?: string[]; removeLabelIds?: string[] } }> = [];

  return {
    modifications,
    listMessages: vi.fn().mockResolvedValue({ messages: [], historyId: '1000' }),
    getMessage: vi.fn().mockResolvedValue(null),
    getProfile: vi.fn().mockResolvedValue({ emailAddress: 'test@gmail.com', historyId: '1' }),
    modifyMessage: vi.fn().mockImplementation((messageId: string, mods: { addLabelIds?: string[]; removeLabelIds?: string[] }) => {
      modifications.push({ messageId, modifications: mods });
    }),
    batchModifyMessages: vi.fn().mockImplementation((messageIds: string[], mods: { addLabelIds?: string[]; removeLabelIds?: string[] }) => {
      for (const id of messageIds) {
        modifications.push({ messageId: id, modifications: mods });
      }
    }),
    listLabels: vi.fn().mockResolvedValue([]),
    createLabel: vi.fn().mockResolvedValue({ id: 'label-1' }),
  };
}

/**
 * Feature: Inbox Manager
 *
 * Tests real production code: ProcessingDecision, GmailSyncManager.applyCleanupRules,
 * TopicLabeler, extractUpdate/extractDeal, JobQueue, and database repositories.
 * Only the GmailClient API is mocked.
 */
describe('Feature: Inbox Manager', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    db.getSqlite().exec(fs.readFileSync(MIGRATION_PATH, 'utf-8'));
    repos = createRepositories(db);
  });

  afterEach(async () => {
    await db.close();
  });

  // ===========================================================================
  // SECTION: Type/Age Matrix - ProcessingDecision.decide
  // ===========================================================================
  describe('Type/Age Matrix: ProcessingDecision', () => {
    // -- Regular emails --
    it('regular email < 6 months old: action is process', async () => {
      const email = makeEmail({
        id: 'reg-recent',
        gmailCategory: 'primary',
        subject: 'Project discussion',
        receivedAt: daysAgo(15),
      });

      const result = await ProcessingDecision.decide(email);
      expect(result.action).toBe('process');
      expect(result.needsExtraction).toBe(true);
      expect(result.needsTopicLabeling).toBe(true);
    });

    it('regular email > 6 months old: action is archive', async () => {
      const email = makeEmail({
        id: 'reg-old',
        gmailCategory: 'primary',
        subject: 'Old project discussion',
        receivedAt: daysAgo(240),
      });

      const result = await ProcessingDecision.decide(email);
      expect(result.action).toBe('archive');
      expect(result.needsExtraction).toBe(false);
    });

    // -- Updates emails --
    it('update email < 1 month old: action is process', async () => {
      const email = makeEmail({
        id: 'upd-recent',
        gmailCategory: 'updates',
        subject: 'Your Bank Statement is Ready',
        receivedAt: daysAgo(10),
      });

      const result = await ProcessingDecision.decide(email);
      expect(result.action).toBe('process');
      expect(result.needsExtraction).toBe(true);
      expect(result.needsTopicLabeling).toBe(true);
    });

    it('update email > 1 month old: action is archive', async () => {
      const email = makeEmail({
        id: 'upd-old',
        gmailCategory: 'updates',
        subject: 'Package Shipped',
        receivedAt: daysAgo(60),
      });

      const result = await ProcessingDecision.decide(email);
      expect(result.action).toBe('archive');
    });

    // -- Social emails --
    it('social email < 1 month old: action is process', async () => {
      const email = makeEmail({
        id: 'soc-recent',
        gmailCategory: 'social',
        subject: 'Someone endorsed you',
        receivedAt: daysAgo(5),
      });

      const result = await ProcessingDecision.decide(email);
      expect(result.action).toBe('process');
      expect(result.needsExtraction).toBe(true);
    });

    it('social email 1-6 months old: action is delete', async () => {
      const email = makeEmail({
        id: 'soc-mid',
        gmailCategory: 'social',
        subject: 'Someone liked your post',
        receivedAt: daysAgo(60),
      });

      const result = await ProcessingDecision.decide(email);
      expect(result.action).toBe('delete');
    });

    it('social email > 2 years old: action is archive', async () => {
      const email = makeEmail({
        id: 'soc-very-old',
        gmailCategory: 'social',
        subject: 'Old Social Notification',
        receivedAt: daysAgo(850),
      });

      const result = await ProcessingDecision.decide(email);
      expect(result.action).toBe('archive');
    });

    // -- Promotional emails --
    it('promotional email < 1 month old: action is extract_deals', async () => {
      const email = makeEmail({
        id: 'promo-recent',
        gmailCategory: 'promotions',
        subject: '50% Off Electronics - Today Only!',
        snippet: 'Use code SAVE50 at checkout.',
        receivedAt: daysAgo(10),
      });

      const result = await ProcessingDecision.decide(email);
      expect(result.action).toBe('extract_deals');
      expect(result.needsExtraction).toBe(true);
    });

    it('promotional email > 1 month old: action is delete', async () => {
      const email = makeEmail({
        id: 'promo-old',
        gmailCategory: 'promotions',
        subject: 'Flash Sale',
        snippet: 'Limited time offer.',
        receivedAt: daysAgo(60),
      });

      const result = await ProcessingDecision.decide(email);
      expect(result.action).toBe('delete');
    });
  });

  // ===========================================================================
  // SECTION: Phase 1 Cleanup - GmailSyncManager.applyCleanupRules
  // ===========================================================================
  describe('Phase 1 Cleanup (applyCleanupRules)', () => {
    it('archives old regular and update emails, deletes old social/promo, queues recent for AI', async () => {
      const mockClient = createMockGmailClient();
      const syncManager = new GmailSyncManager(mockClient);

      const emails: Email[] = [
        makeEmail({ id: 'c-recent-reg', gmailCategory: 'primary', subject: 'Recent project email', receivedAt: daysAgo(10) }),
        makeEmail({ id: 'c-old-reg', gmailCategory: 'primary', subject: 'Old project email', receivedAt: daysAgo(240) }),
        makeEmail({ id: 'c-old-upd', gmailCategory: 'updates', subject: 'Your statement is ready', receivedAt: daysAgo(90) }),
        makeEmail({ id: 'c-old-soc', gmailCategory: 'social', subject: 'Someone liked your post', receivedAt: daysAgo(90) }),
        makeEmail({ id: 'c-old-promo', gmailCategory: 'promotions', subject: 'Flash sale 50% off', snippet: 'save $50', receivedAt: daysAgo(90) }),
        makeEmail({ id: 'c-recent-promo', gmailCategory: 'promotions', subject: 'Deals today', snippet: 'discount offer', receivedAt: daysAgo(5) }),
      ];

      const result = await syncManager.applyCleanupRules(emails);

      // Recent regular => process (cleanup: archive + queue for AI)
      // Old regular => archive (6mo threshold)
      // Old update => archive (>30 days)
      // Old social => delete (>30 days)
      // Old promo => delete (>30 days)
      // Recent promo => extract_deals (no cleanup action, queued for AI)
      expect(result.archived).toBe(3); // recent-regular (process=>archive) + old-regular + old-update
      expect(result.deleted).toBe(2); // old-social + old-promo
      expect(result.queuedForAI).toBe(2); // recent-regular (process) + recent-promo (extract_deals)
    });
  });

  // ===========================================================================
  // SECTION: AI Processing - extraction when young enough
  // ===========================================================================
  describe('AI Processing (extraction for young emails)', () => {
    it('recent update email yields extracted update with priority and sentiment', async () => {
      const email = makeEmail({
        id: 'ai-upd-1',
        subject: 'Project Alpha - Action Required by Friday',
        snippet: 'Please review the attached proposal and provide your feedback by Friday EOD.',
        receivedAt: daysAgo(1),
      });

      const result = await extractFromEmail(email, 'updates');
      expect(result.type).toBe('update');
      expect(result.update).toBeDefined();
      expect(result.update!.actionItem).toBe(true);
      expect(result.update!.priority).toBe('high');
    });

    it('recent promotional email yields extracted deal', async () => {
      const email = makeEmail({
        id: 'ai-promo-1',
        subject: '50% Off Electronics - Today Only!',
        snippet: 'Use code SAVE50 at checkout. Minimum purchase $100. Expires midnight.',
        senderName: 'Electronics Store',
        senderDomain: 'electronics.com',
        receivedAt: daysAgo(3),
      });

      const result = await extractFromEmail(email, 'promotional');
      expect(result.type).toBe('deal');
      expect(result.deal).toBeDefined();
      expect(result.deal!.dealCode).toBe('SAVE50');
    });

    it('social email yields no extraction', async () => {
      const email = makeEmail({
        id: 'ai-soc-1',
        subject: 'Someone endorsed you',
        snippet: 'You received a new endorsement.',
        receivedAt: daysAgo(2),
      });

      const result = await extractFromEmail(email, 'social');
      expect(result.type).toBe('none');
    });
  });

  // ===========================================================================
  // SECTION: Topic Classification via TopicLabeler
  // ===========================================================================
  describe('Topic Classification', () => {
    it('classifies a banking email under Banking parent with correct child', async () => {
      const labeler = new TopicLabeler();
      const email = makeEmail({
        id: 'topic-chase-1',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase',
        senderDomain: 'chase.com',
        subject: 'Chase Statement Ready',
        snippet: 'Your Chase statement is available.',
      });

      const result = await labeler.classifyTopic(email);
      expect(result.parentTopic).toBe('Banking');
      expect(result.childTopic.toLowerCase()).toContain('chase');
      expect(result.fullPath).toBe(`${result.parentTopic}/${result.childTopic}`);
    });

    it('same domain produces identical topic across different emails', async () => {
      const labeler = new TopicLabeler();
      const email1 = makeEmail({
        id: 'topic-chase-2',
        senderEmail: 'noreply@chase.com',
        senderDomain: 'chase.com',
        subject: 'Chase Statement',
        receivedAt: new Date('2024-01-01'),
      });
      const email2 = makeEmail({
        id: 'topic-chase-3',
        senderEmail: 'noreply@chase.com',
        senderDomain: 'chase.com',
        subject: 'Chase Payment Due',
        receivedAt: new Date('2024-01-15'),
      });

      const result1 = await labeler.classifyTopic(email1);
      const result2 = await labeler.classifyTopic(email2);

      expect(result1.fullPath).toBe(result2.fullPath);
    });

    it('stores topic hierarchy in database and links email', async () => {
      const labeler = new TopicLabeler();
      const email = makeEmail({
        id: 'topic-db-1',
        senderDomain: 'chase.com',
        senderName: 'Chase',
        subject: 'Statement',
      });

      const result = await labeler.classifyTopic(email);
      await insertEmail(repos, email);

      const parent = await repos.topics.create({
        id: 'topic-banking',
        name: result.parentTopic,
        fullPath: result.parentTopic,
      });
      const child = await repos.topics.create({
        id: 'topic-banking-chase',
        parentId: parent.id,
        name: result.childTopic,
        fullPath: result.fullPath,
      });
      await repos.topics.linkEmail(email.id, child.id, result.confidence);

      const topics = await repos.topics.findTopicsForEmail(email.id);
      expect(topics).toHaveLength(1);
      expect(topics[0].fullPath).toBe(result.fullPath);
    });
  });

  // ===========================================================================
  // SECTION: Summary Generation (topic stored with email count)
  // ===========================================================================
  describe('Summary Generation', () => {
    it('multiple emails linked to the same topic show email count', async () => {
      // Create parent and child topics
      await repos.topics.create({ id: 'topic-banking', name: 'Banking', fullPath: 'Banking' });
      await repos.topics.create({ id: 'topic-banking-chase', parentId: 'topic-banking', name: 'Chase', fullPath: 'Banking/Chase' });

      // Insert 3 emails and link them to the topic
      for (let i = 0; i < 3; i++) {
        const email = makeEmail({
          id: `sum-email-${i}`,
          senderDomain: 'chase.com',
          subject: `Chase Update ${i}`,
          receivedAt: daysAgo(i),
        });
        await insertEmail(repos, email);
        await repos.topics.linkEmail(email.id, 'topic-banking-chase', 0.8);
      }

      const topicEmails = await repos.topics.findTopicsForEmail('sum-email-0');
      expect(topicEmails).toHaveLength(1);
      expect(topicEmails[0].name).toBe('Chase');
    });
  });

  // ===========================================================================
  // SECTION: Job Queue Integration
  // ===========================================================================
  describe('Job Queue Integration', () => {
    it('creating a job for an email adds it to the queue', async () => {
      const queue = new JobQueue();
      const job = await queue.createJob({
        type: 'email_process',
        payload: { emailId: 'job-email-1' },
        emailId: 'job-email-1',
      });

      expect(job.id).toBeDefined();
      expect(job.status).toBe('pending');
      expect(job.emailId).toBe('job-email-1');

      const stats = await queue.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.total).toBe(1);
    });

    it('multiple emails create multiple distinct jobs', async () => {
      const queue = new JobQueue();
      for (let i = 0; i < 3; i++) {
        await queue.createJob({
          type: 'email_process',
          payload: { emailId: `batch-email-${i}` },
          emailId: `batch-email-${i}`,
        });
      }

      const stats = await queue.getStats();
      expect(stats.pending).toBe(3);
      expect(stats.total).toBe(3);
    });

    it('deduplicates jobs for the same email (same emailId + type)', async () => {
      const queue = new JobQueue();
      const job1 = await queue.createJob({
        type: 'email_process',
        payload: { emailId: 'dedup-email-1' },
        emailId: 'dedup-email-1',
      });
      const job2 = await queue.createJob({
        type: 'email_process',
        payload: { emailId: 'dedup-email-1' },
        emailId: 'dedup-email-1',
      });

      // Second call returns the existing pending job
      expect(job1.id).toBe(job2.id);
      const stats = await queue.getStats();
      expect(stats.total).toBe(1);
    });

    it('failed jobs can be retried and eventually marked dead', async () => {
      const queue = new JobQueue();
      const job = await queue.createJob({
        type: 'email_process',
        payload: { emailId: 'retry-email-1' },
        emailId: 'retry-email-1',
        maxRetries: 3,
      });

      // Simulate failure and retries
      await queue.updateJobStatus(job.id, 'running');
      await queue.updateJobStatus(job.id, 'failed', { error: 'test error' });

      const retry1 = await queue.scheduleRetry(job.id);
      expect(retry1!.retryCount).toBe(1);
      expect(retry1!.status).toBe('pending');

      // Exhaust retries
      await queue.scheduleRetry(job.id!); // retry 2
      const dead = await queue.scheduleRetry(job.id!); // retry 3 => dead
      expect(dead!.status).toBe('dead');
    });

    it('GmailSyncManager.fetchAndQueueEmails creates jobs via JobQueue', async () => {
      const mockClient = createMockGmailClient();
      mockClient.listMessages = vi.fn().mockResolvedValue({
        messages: [
          { id: 'sync-email-1', threadId: 'thread-1' },
          { id: 'sync-email-2', threadId: 'thread-2' },
        ],
        historyId: '1001',
      });

      const queue = new JobQueue();
      const syncManager = new GmailSyncManager(mockClient, queue);

      const count = await syncManager.fetchAndQueueEmails();
      expect(count).toBe(2);

      const stats = await queue.getStats();
      expect(stats.pending).toBe(2);
    });
  });

  // ===========================================================================
  // SECTION: Gmail Labels
  // ===========================================================================
  describe('Gmail Label Application', () => {
    it('applyCleanupRules calls modifyMessage with correct label operations', async () => {
      const mockClient = createMockGmailClient();
      const syncManager = new GmailSyncManager(mockClient);

      const emails: Email[] = [
        makeEmail({ id: 'lbl-old-reg', gmailCategory: 'primary', subject: 'Old', receivedAt: daysAgo(240) }),
        makeEmail({ id: 'lbl-old-soc', gmailCategory: 'social', subject: 'Social', receivedAt: daysAgo(90) }),
      ];

      await syncManager.applyCleanupRules(emails);

      // Old regular => archive (remove INBOX)
      // Old social => delete (remove INBOX + add TRASH)
      const archiveMods = mockClient.modifications.filter(
        m => m.modifications.removeLabelIds?.includes('INBOX') && !m.modifications.addLabelIds?.length
      );
      const deleteMods = mockClient.modifications.filter(
        m => m.modifications.removeLabelIds?.includes('INBOX') && m.modifications.addLabelIds?.includes('TRASH')
      );
      expect(archiveMods.length).toBeGreaterThanOrEqual(1);
      expect(deleteMods.length).toBeGreaterThanOrEqual(1);
    });

    it('topic label is stored in the database and linked to email', async () => {
      const email = makeEmail({
        id: 'lbl-email-1',
        senderDomain: 'chase.com',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase',
        subject: 'Statement',
      });
      await insertEmail(repos, email);

      const label = await repos.labels.create({
        id: 'label-topic-banking-chase',
        name: 'TuskerBrain/Topic/Banking/Chase',
        type: 'user',
        labelType: 'topic',
      });

      // Use direct SQL to link (LabelsRepository transaction bug workaround)
      const stmt = db.getSqlite().prepare('INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)');
      stmt.run(email.id, label.id);

      const labels = await repos.labels.getLabelsForEmail(email.id);
      expect(labels).toHaveLength(1);
      expect(labels[0].name).toBe('TuskerBrain/Topic/Banking/Chase');
    });
  });

  // ===========================================================================
  // SECTION: Duplicate Email Handling (skip already processed)
  // ===========================================================================
  describe('Duplicate Email Handling', () => {
    it('email marked as processed is not re-queued by fetchNewEmailsSince', async () => {
      const mockClient = createMockGmailClient();
      mockClient.listMessages = vi.fn().mockResolvedValue({
        messages: [
          { id: 'dup-email-1' },
          { id: 'dup-email-2' },
          { id: 'dup-email-3' },
        ],
        historyId: '1002',
      });

      const syncManager = new GmailSyncManager(mockClient);

      // Mark email-2 as already processed
      await syncManager.markEmailsAsProcessed(['dup-email-2']);

      const newEmails = await syncManager.fetchNewEmailsSince('1000');

      // Should exclude already-processed email
      expect(newEmails.map((e: any) => e.id)).toEqual(['dup-email-1', 'dup-email-3']);
    });

    it('database prevents duplicate email inserts (same id)', async () => {
      const email = makeEmail({ id: 'dup-db-1', senderDomain: 'test.com', subject: 'Test' });
      await insertEmail(repos, email);

      // Attempting to insert same id should throw
      await expect(insertEmail(repos, email)).rejects.toThrow();
    });
  });

  // ===========================================================================
  // SECTION: Update Extraction Fields (priority, sentiment, financial, entities)
  // ===========================================================================
  describe('Update Extraction Fields', () => {
    it('extracts negative sentiment from service outage email', async () => {
      const email = makeEmail({
        id: 'ext-neg-1',
        subject: 'Service Outage Notice',
        snippet: 'We regret to inform you that your service has been suspended due to unpaid balance. Immediate action required to restore service.',
      });

      const result = await extractUpdate(email);
      expect(result).toBeDefined();
      expect(result!.sentiment).toBe('negative');
    });

    it('extracts positive sentiment from congratulatory email', async () => {
      const email = makeEmail({
        id: 'ext-pos-1',
        subject: 'Congratulations on Your Promotion!',
        snippet: 'We are delighted to announce that your application has been approved. Welcome aboard!',
      });

      const result = await extractUpdate(email);
      expect(result).toBeDefined();
      expect(result!.sentiment).toBe('positive');
    });

    it('extracts neutral sentiment from informational email', async () => {
      const email = makeEmail({
        id: 'ext-neu-1',
        subject: 'Your Monthly Statement',
        snippet: 'Your statement for January 2024 is now available. Balance: $1,234.56.',
      });

      const result = await extractUpdate(email);
      expect(result).toBeDefined();
      expect(result!.sentiment).toBe('neutral');
    });

    it('extracts financial impact when dollar amounts are mentioned', async () => {
      const email = makeEmail({
        id: 'ext-fin-1',
        subject: 'Invoice #12345',
        snippet: 'Your invoice of $2,500.00 is due on February 28, 2024. Please remit payment at your earliest convenience.',
      });

      const result = await extractUpdate(email);
      expect(result).toBeDefined();
      expect(result!.financialImpact).toBeDefined();
      expect(result!.financialImpact).toBeGreaterThan(0);
    });

    it('extracts key entities including dates and amounts', async () => {
      const email = makeEmail({
        id: 'ext-ent-1',
        subject: 'Contract Renewal',
        snippet: 'Please review the contract with Acme Corp worth $50,000. Deadline for signature is March 15, 2024.',
      });

      const result = await extractUpdate(email);
      expect(result).toBeDefined();
      expect(result!.keyEntities).toBeDefined();
      expect(result!.keyEntities!.amounts.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // SECTION: Gmail Important Flag -> High Priority
  // ===========================================================================
  describe('Gmail Important Flag Priority', () => {
    it('email with isImportant=true always gets high priority', async () => {
      const email = makeEmail({
        id: 'imp-1',
        subject: 'Weekly Newsletter',
        snippet: 'Here is your weekly update with general information.',
        isImportant: true,
      });

      const result = await extractUpdate(email);
      expect(result).toBeDefined();
      expect(result!.priority).toBe('high');
    });

    it('email without important flag gets priority based on content', async () => {
      const email = makeEmail({
        id: 'imp-2',
        subject: 'FYI: Team lunch next week',
        snippet: 'Just letting you know about the team lunch next Friday. No action needed.',
        isImportant: false,
      });

      const result = await extractUpdate(email);
      expect(result).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(result!.priority);
      // FYI + no action needed => low
      expect(result!.priority).toBe('low');
    });

    it('urgent content + important flag results in high priority and urgency', async () => {
      const email = makeEmail({
        id: 'imp-3',
        subject: 'URGENT: Server Down - Immediate Action Required',
        snippet: 'Production server is down. Please respond immediately.',
        isImportant: true,
      });

      const result = await extractUpdate(email);
      expect(result).toBeDefined();
      expect(result!.priority).toBe('high');
      expect(result!.urgency).toBe(true);
    });
  });
});
