import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TuskerBrainDatabase } from '../../database/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { GmailLabelManager } from '@core/labeling/manager';
import type { Email } from '@core/types/email';

// ---------------------------------------------------------------------------
// GmailClient mock — tracks label creation and message modifications
// ---------------------------------------------------------------------------

interface MockGmailLabel {
  id: string;
  name: string;
}

/**
 * Creates a mock GmailClient that tracks calls to the Gmail API.
 * Only external HTTP calls are mocked; all internal logic is real.
 */
function createMockGmailClient() {
  const existingLabels: Map<string, MockGmailLabel> = new Map();
  const createdLabels: Array<{ name: string; id: string }> = [];
  const modifiedMessages: Array<{
    emailId: string;
    addLabelIds: string[];
    removeLabelIds?: string[];
  }> = [];
  let labelIdCounter = 100;

  const generateLabelId = () => {
    labelIdCounter++;
    return `Label_${labelIdCounter}`;
  };

  return {
    // -- GmailClient interface methods --

    async listLabels() {
      return {
        labels: Array.from(existingLabels.values()).map((l) => ({
          id: l.id,
          name: l.name,
        })),
      };
    },

    async createLabel(name: string) {
      const existing = existingLabels.get(name);
      if (existing) {
        // Simulate Gmail 409 conflict
        const err: any = new Error('Label already exists');
        err.code = 409;
        throw err;
      }
      const label: MockGmailLabel = { id: generateLabelId(), name };
      existingLabels.set(name, label);
      createdLabels.push({ name, id: label.id });
      return { id: label.id, name: label.name };
    },

    async modifyMessage(
      messageId: string,
      modifications: { addLabelIds?: string[]; removeLabelIds?: string[] }
    ) {
      modifiedMessages.push({
        emailId: messageId,
        addLabelIds: modifications.addLabelIds ?? [],
        removeLabelIds: modifications.removeLabelIds ?? [],
      });
      return {};
    },

    // -- Test helpers --

    /** Pre-seed a label as if it already exists in Gmail. */
    seedLabel(name: string, id?: string) {
      const label: MockGmailLabel = { id: id ?? generateLabelId(), name };
      existingLabels.set(name, label);
    },

    /** Get all labels that were created via createLabel (not pre-seeded). */
    getCreatedLabels() {
      return [...createdLabels];
    },

    /** Get the order in which labels were created. */
    getCreationOrder() {
      return createdLabels.map((l) => l.name);
    },

    /** Get all modifyMessage calls. */
    getModifiedMessages() {
      return [...modifiedMessages];
    },

    /** Find a label by name from the "Gmail" store. */
    findLabelByName(name: string): MockGmailLabel | undefined {
      return existingLabels.get(name);
    },

    /** Reset all tracked state between tests. */
    reset() {
      existingLabels.clear();
      createdLabels.length = 0;
      modifiedMessages.length = 0;
      labelIdCounter = 100;
    },
  };
}

type MockGmailClient = ReturnType<typeof createMockGmailClient>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Feature Tests
// ---------------------------------------------------------------------------

describe('Feature: Gmail Label Sync', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let mockClient: MockGmailClient;
  let labelManager: GmailLabelManager;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);

    mockClient = createMockGmailClient();
    // GmailLabelManager expects a GmailClient-compatible object
    labelManager = new GmailLabelManager(mockClient as any);
  });

  afterEach(async () => {
    mockClient.reset();
    await db.close();
  });

  // ---------------------------------------------------------------------------
  // User Story: Label creation for new topics
  // ---------------------------------------------------------------------------
  describe('Label creation for new topics', () => {
    it('creates TuskerBrain/Topic/Parent/Child label hierarchy when new topic is created', async () => {
      // Apply labels via real GmailLabelManager with mocked Gmail API
      const labelIds = await labelManager.applyTopicLabels(
        'email-1',
        'Banking',
        'Chase'
      );

      // Gmail API was called to create the hierarchy
      const creationOrder = mockClient.getCreationOrder();
      expect(creationOrder).toContain('TuskerBrain/Topic/Banking');
      expect(creationOrder).toContain('TuskerBrain/Topic/Banking/Chase');

      // Parent label was created before child label
      const parentIdx = creationOrder.indexOf('TuskerBrain/Topic/Banking');
      const childIdx = creationOrder.indexOf('TuskerBrain/Topic/Banking/Chase');
      expect(parentIdx).toBeLessThan(childIdx);

      // Message was modified with the child label
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(1);
      expect(modifications[0].emailId).toBe('email-1');
      expect(modifications[0].addLabelIds).toEqual(labelIds);
    });

    it('creates parent label before child label', async () => {
      // Use a topic that requires both parent and child creation
      await labelManager.ensureTopicLabels('Shopping', 'Amazon');

      const creationOrder = mockClient.getCreationOrder();

      // Parent path must appear before child path
      const parentIdx = creationOrder.indexOf('TuskerBrain/Topic/Shopping');
      const childIdx = creationOrder.indexOf('TuskerBrain/Topic/Shopping/Amazon');

      expect(parentIdx).toBeGreaterThan(-1);
      expect(childIdx).toBeGreaterThan(-1);
      expect(parentIdx).toBeLessThan(childIdx);
    });

    it('reuses existing Gmail labels instead of creating duplicates', async () => {
      // Pre-seed labels as if they already exist in Gmail
      mockClient.seedLabel('TuskerBrain/Topic/Banking', 'Label_10');
      mockClient.seedLabel('TuskerBrain/Topic/Banking/Chase', 'Label_11');

      // Apply labels — should not create duplicates
      await labelManager.applyTopicLabels('email-1', 'Banking', 'Chase');

      // No new labels should have been created
      const createdLabels = mockClient.getCreatedLabels();
      expect(createdLabels).toHaveLength(0);

      // Message should still be modified with the existing label ID
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(1);
      expect(modifications[0].addLabelIds).toContain('Label_11');
    });
  });

  // ---------------------------------------------------------------------------
  // User Story: Label creation for new senders
  // ---------------------------------------------------------------------------
  describe('Label creation for new senders', () => {
    it('creates TuskerBrain/Sender/domain label for new sender domain', async () => {
      const labelId = await labelManager.applySenderLabel('email-1', 'chase.com');

      // Verify the correct label was created
      const createdLabels = mockClient.getCreatedLabels();
      expect(createdLabels).toHaveLength(1);
      expect(createdLabels[0].name).toBe('TuskerBrain/Sender/chase.com');

      // Verify message was modified
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(1);
      expect(modifications[0].emailId).toBe('email-1');
      expect(modifications[0].addLabelIds).toContain(labelId);
    });

    it('reuses existing sender labels', async () => {
      // Pre-seed the sender label
      mockClient.seedLabel('TuskerBrain/Sender/example.com', 'Label_50');

      // Apply sender label — should reuse existing
      const labelId = await labelManager.applySenderLabel('email-1', 'example.com');

      expect(labelId).toBe('Label_50');

      // No new labels created
      const createdLabels = mockClient.getCreatedLabels();
      expect(createdLabels).toHaveLength(0);

      // Message still modified with existing label
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(1);
      expect(modifications[0].addLabelIds).toContain('Label_50');
    });
  });

  // ---------------------------------------------------------------------------
  // User Story: Processed label
  // ---------------------------------------------------------------------------
  describe('Processed label', () => {
    it('applies TuskerBrain/Processed label to processed emails', async () => {
      const labelId = await labelManager.applyProcessedLabel('email-processed-1');

      // Verify Processed label was created
      const createdLabels = mockClient.getCreatedLabels();
      const processedLabels = createdLabels.filter(
        (l) => l.name === 'TuskerBrain/Processed'
      );
      expect(processedLabels).toHaveLength(1);

      // Verify message was modified
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(1);
      expect(modifications[0].emailId).toBe('email-processed-1');
      expect(modifications[0].addLabelIds).toContain(labelId);
    });

    it('tracks which emails have been labeled', async () => {
      // Process two emails
      await labelManager.applyProcessedLabel('email-a');
      await labelManager.applyProcessedLabel('email-b');

      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(2);

      // Both emails should have the Processed label applied
      const processedLabelId = modifications[0].addLabelIds[0];
      expect(modifications[1].addLabelIds[0]).toBe(processedLabelId);

      const emailIds = modifications.map((m) => m.emailId);
      expect(emailIds).toContain('email-a');
      expect(emailIds).toContain('email-b');
    });
  });

  // ---------------------------------------------------------------------------
  // User Story: Label hierarchy integrity
  // ---------------------------------------------------------------------------
  describe('Label hierarchy integrity', () => {
    it('ensures TuskerBrain parent label exists before creating children', async () => {
      // GmailLabelManager.ensureTopicLabels creates the parent path
      // (TuskerBrain/Topic/{Parent}) before the child path
      // (TuskerBrain/Topic/{Parent}/{Child}).
      // Gmail uses "/" as hierarchy separator — the parent label must
      // be created first so the child can nest under it.

      // Start with no labels at all
      await labelManager.ensureTopicLabels('Health', 'Fitbit');

      const creationOrder = mockClient.getCreationOrder();

      // The manager creates exactly two labels:
      // 1. TuskerBrain/Topic/Health (parent)
      // 2. TuskerBrain/Topic/Health/Fitbit (child)
      const healthIdx = creationOrder.indexOf('TuskerBrain/Topic/Health');
      const fitbitIdx = creationOrder.indexOf('TuskerBrain/Topic/Health/Fitbit');

      expect(healthIdx).toBeGreaterThan(-1);
      expect(fitbitIdx).toBeGreaterThan(-1);

      // Parent must be created before child
      expect(healthIdx).toBeLessThan(fitbitIdx);
    });

    it('handles Gmail API errors when creating labels', async () => {
      // Override createLabel to throw a non-retryable error
      const originalCreateLabel = mockClient.createLabel.bind(mockClient);
      mockClient.createLabel = async function (_name: string) {
        throw new Error('Gmail API error: Permission denied');
      };

      // Should propagate the error rather than silently swallowing it
      await expect(
        labelManager.applyTopicLabels('email-error-1', 'Banking', 'Chase')
      ).rejects.toThrow('Gmail API error: Permission denied');

      // No messages should have been modified
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling: Rate limiting, conflicts, and name normalization
  // ---------------------------------------------------------------------------
  describe('Error handling', () => {
    it('retries with exponential backoff on 429 rate-limit errors', async () => {
      const attemptsPerLabel: Record<string, number[]> = {};

      // Override createLabel to fail with 429 twice per label, then succeed
      const originalCreateLabel = mockClient.createLabel.bind(mockClient);
      mockClient.createLabel = async function (name: string) {
        if (!attemptsPerLabel[name]) attemptsPerLabel[name] = [];
        attemptsPerLabel[name].push(Date.now());

        // Fail first 2 attempts for each label name
        if (attemptsPerLabel[name].length <= 2) {
          const err: any = new Error('Rate limit exceeded');
          err.code = 429;
          throw err;
        }
        return originalCreateLabel(name);
      };

      // Use fake timers to control setTimeout inside withRetry
      vi.useFakeTimers();
      const labelIdsPromise = labelManager.applyTopicLabels(
        'email-ratelimit-1',
        'Finance',
        'Taxes'
      );

      // Advance time to let exponential backoff proceed:
      // Each label retries: attempt 1 (fail), backoff 1s, attempt 2 (fail), backoff 2s, attempt 3 (success)
      // Two labels in sequence: parent (3 attempts) then child (3 attempts)
      await vi.advanceTimersByTimeAsync(10000);

      const labelIds = await labelIdsPromise;
      vi.useRealTimers();

      // Both parent and child labels retried and eventually succeeded
      const parentAttempts = attemptsPerLabel['TuskerBrain/Topic/Finance'];
      const childAttempts = attemptsPerLabel['TuskerBrain/Topic/Finance/Taxes'];
      expect(parentAttempts).toHaveLength(3); // 2 failures + 1 success
      expect(childAttempts).toHaveLength(3);

      // Verify backoff: delay between attempts should increase
      const parentDelay1 = parentAttempts[1] - parentAttempts[0];
      const parentDelay2 = parentAttempts[2] - parentAttempts[1];
      expect(parentDelay2).toBeGreaterThan(parentDelay1);

      expect(labelIds).toBeDefined();
      expect(labelIds.length).toBeGreaterThan(0);

      // The label was eventually created
      const createdLabels = mockClient.getCreatedLabels();
      const names = createdLabels.map((l) => l.name);
      expect(names).toContain('TuskerBrain/Topic/Finance/Taxes');

      // Message was modified with the label
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(1);
      expect(modifications[0].emailId).toBe('email-ratelimit-1');
    });

    it('retries on errors with "rate limit" in the message (no code)', async () => {
      const attemptCount = { value: 0 };

      const originalCreateLabel = mockClient.createLabel.bind(mockClient);
      mockClient.createLabel = async function (name: string) {
        attemptCount.value++;
        if (attemptCount.value === 1) {
          throw new Error('Gmail API rate limit hit');
        }
        return originalCreateLabel(name);
      };

      vi.useFakeTimers();
      const promise = labelManager.applySenderLabel('email-rl-2', 'test.com');
      await vi.advanceTimersByTimeAsync(2000);
      const labelId = await promise;
      vi.useRealTimers();

      // Retried once and succeeded on second attempt
      expect(attemptCount.value).toBe(2);
      expect(labelId).toBeDefined();
    });

    it('throws after exhausting all retries on persistent 429', async () => {
      const originalCreateLabel = mockClient.createLabel.bind(mockClient);
      mockClient.createLabel = async function (_name: string) {
        const err: any = new Error('Rate limit exceeded');
        err.code = 429;
        throw err;
      };

      vi.useFakeTimers();
      // Use .catch to prevent unhandled rejection while timers advance
      const promise = labelManager.applyProcessedLabel('email-exhaust-1').catch((e) => {
        return e as Error;
      });

      // Advance past all retry delays (1s + 2s + 4s = 7s total)
      await vi.advanceTimersByTimeAsync(10000);

      const result = await promise;
      vi.useRealTimers();
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe('Rate limit exceeded');
    });

    it('recovers from 409 conflict by fetching the existing label', async () => {
      // Seed a label in Gmail that the GmailLabelManager does NOT know about.
      // The mock's createLabel already throws 409 when a seeded label exists.
      // The manager should call loadCache (listLabels) which returns the seeded
      // labels, then find the existing label in the refreshed cache.
      mockClient.seedLabel('TuskerBrain/Processed', 'Label_EXISTING');

      // Clear the labelManager's cache so it doesn't know about the seeded label
      // (simulate a fresh manager instance where cache is empty but label exists in Gmail)
      labelManager = new GmailLabelManager(mockClient as any);

      const labelId = await labelManager.applyProcessedLabel('email-conflict-1');

      // Should have recovered by fetching the existing label
      expect(labelId).toBe('Label_EXISTING');

      // Message was still modified correctly
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(1);
      expect(modifications[0].emailId).toBe('email-conflict-1');
      expect(modifications[0].addLabelIds).toContain('Label_EXISTING');
    });

    it('caches the existing label after 409 conflict recovery', async () => {
      // Seed label, create fresh manager
      mockClient.seedLabel('TuskerBrain/Sender/acme.com', 'Label_CACHED');
      labelManager = new GmailLabelManager(mockClient as any);

      // First call triggers 409, recovers via cache refresh
      const id1 = await labelManager.applySenderLabel('email-cache-1', 'acme.com');
      expect(id1).toBe('Label_CACHED');

      // Reset the created labels tracker to detect if createLabel is called again
      const createdBefore = mockClient.getCreatedLabels().length;

      // Second call should NOT trigger createLabel at all — the label is now cached
      const id2 = await labelManager.applySenderLabel('email-cache-2', 'acme.com');
      expect(id2).toBe('Label_CACHED');

      const createdAfter = mockClient.getCreatedLabels().length;
      expect(createdAfter).toBe(createdBefore); // No new createLabel calls

      // Both emails modified
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(2);
    });

    it('normalizes special characters in label names', async () => {
      // The normalizeName method is called on the child portion of topic labels.
      // It replaces special chars with dashes and truncates.

      // Test 1: special characters replaced with dashes
      await labelManager.ensureTopicLabels('Tech', 'C++ & Rust/Go');

      const createdLabels = mockClient.getCreatedLabels();
      const names = createdLabels.map((l) => l.name);

      // Special chars (/, &, +) should be replaced with dashes in the child portion
      // Note: normalizeName runs on the child string before constructing the path
      expect(names).toContain('TuskerBrain/Topic/Tech');
      // The child part "C++ & Rust/Go" gets normalized: ++ is not in the regex,
      // but & and / are replaced with dashes, then multiple dashes collapsed
      const childLabel = createdLabels.find(
        (l) => l.name.startsWith('TuskerBrain/Topic/Tech/')
      );
      expect(childLabel).toBeDefined();
      // Verify no raw / or & in the child portion after "Tech/"
      const childPart = childLabel!.name.replace('TuskerBrain/Topic/Tech/', '');
      expect(childPart).not.toMatch(/[&/]/);
    });

    it('truncates very long label names to 100 characters', async () => {
      // Create a child name that, when combined with the prefix, produces a very long name
      const longChild = 'A'.repeat(150); // 150 chars, well over the 100 char limit

      await labelManager.ensureTopicLabels('Parent', longChild);

      const createdLabels = mockClient.getCreatedLabels();
      const childLabel = createdLabels.find(
        (l) => l.name.startsWith('TuskerBrain/Topic/Parent/')
      );
      expect(childLabel).toBeDefined();

      // The normalized name portion (after TuskerBrain/Topic/Parent/) should be <= 100 chars
      const childPart = childLabel!.name.replace('TuskerBrain/Topic/Parent/', '');
      expect(childPart.length).toBeLessThanOrEqual(100);
    });

    it('handles multiple consecutive spaces by collapsing dashes', async () => {
      // Spaces are not in the regex, but special chars between words could produce
      // multiple consecutive dashes after replacement
      await labelManager.ensureTopicLabels('Test', 'foo&&&bar');

      const createdLabels = mockClient.getCreatedLabels();
      const childLabel = createdLabels.find(
        (l) => l.name.startsWith('TuskerBrain/Topic/Test/')
      );
      expect(childLabel).toBeDefined();

      const childPart = childLabel!.name.replace('TuskerBrain/Topic/Test/', '');
      // "foo&&&bar" -> each & replaced with "-" -> "foo---bar" -> collapsed to "foo-bar"
      expect(childPart).toBe('foo-bar');
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: Full labeling workflow with database tracking
  // ---------------------------------------------------------------------------
  describe('Full labeling workflow with database tracking', () => {
    it('applies all label types to a single email and tracks them locally', async () => {
      const email = makeEmail({
        id: 'workflow-email-1',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase',
        senderDomain: 'chase.com',
        subject: 'Your Statement Is Ready',
        snippet: 'Your Chase monthly statement.',
        receivedAt: new Date(),
      });

      // Insert email into DB
      await insertEmail(repos, email);

      // Apply all labels via GmailLabelManager with a known topic
      const labelIds = await labelManager.applyAllLabels(email.id, {
        topic: { parent: 'Banking', child: 'Chase' },
        senderDomain: email.senderDomain,
        processed: true,
      });

      expect(labelIds.length).toBeGreaterThanOrEqual(3);

      // Verify Gmail API received a single modifyMessage call with all labels
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(1);
      expect(modifications[0].addLabelIds.length).toBeGreaterThanOrEqual(3);

      // Now store the label records in the local database
      for (const created of mockClient.getCreatedLabels()) {
        await repos.labels.create({
          id: created.id,
          name: created.name,
          type: 'user',
          labelType: created.name.startsWith('TuskerBrain/Topic/')
            ? 'topic'
            : created.name.startsWith('TuskerBrain/Sender/')
              ? 'sender'
              : 'processed',
        });
      }

      // Link labels to email in local DB
      await repos.labels.linkLabelsToEmail(email.id, labelIds);

      // Verify labels are retrievable from the database
      const dbLabels = await repos.labels.getLabelsForEmail(email.id);
      const labelNames = dbLabels.map((l) => l.name);

      expect(labelNames).toContain('TuskerBrain/Topic/Banking/Chase');
      expect(labelNames).toContain('TuskerBrain/Sender/chase.com');
      expect(labelNames).toContain('TuskerBrain/Processed');
    });

    it('labels multiple emails from same domain without creating duplicate Gmail labels', async () => {
      const email1 = makeEmail({
        id: 'dup-email-1',
        senderDomain: 'chase.com',
        senderName: 'Chase',
        subject: 'Statement Ready',
        receivedAt: new Date('2024-01-01'),
      });
      const email2 = makeEmail({
        id: 'dup-email-2',
        senderDomain: 'chase.com',
        senderName: 'Chase',
        subject: 'Payment Confirmed',
        receivedAt: new Date('2024-01-15'),
      });

      await insertEmail(repos, email1);
      await insertEmail(repos, email2);

      // Label first email
      await labelManager.applyAllLabels(email1.id, {
        topic: { parent: 'Banking', child: 'Chase' },
        senderDomain: email1.senderDomain,
        processed: true,
      });

      // Label second email (labels already exist from first call)
      await labelManager.applyAllLabels(email2.id, {
        topic: { parent: 'Banking', child: 'Chase' },
        senderDomain: email2.senderDomain,
        processed: true,
      });

      // Gmail API should have been called to create labels only once each
      const createdLabels = mockClient.getCreatedLabels();
      const uniqueLabelNames = new Set(createdLabels.map((l) => l.name));

      // No duplicates — each label name created only once
      expect(uniqueLabelNames.size).toBe(createdLabels.length);

      // Both emails should have been modified
      const modifications = mockClient.getModifiedMessages();
      expect(modifications).toHaveLength(2);
      expect(modifications[0].emailId).toBe('dup-email-1');
      expect(modifications[1].emailId).toBe('dup-email-2');
    });
  });
});
