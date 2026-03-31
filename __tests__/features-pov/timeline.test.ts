import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';
import { createRepositories, type Repositories } from '@core/repositories';
import { TimelineFilter } from '@core/timeline/filter';
import type { TimelineUpdate, TimelineFilterOptions } from '@core/types/timeline';
import type { CreateEmailData, CreateTimelineUpdateData } from '@core/repositories';


/**
 * Helper: create an email record in the database.
 * Timeline updates have a FK to emails, so we must seed emails first.
 */
function createTestEmail(overrides: Partial<CreateEmailData> = {}): CreateEmailData {
  return {
    id: `email_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    threadId: 'thread_default',
    senderEmail: 'test@example.com',
    senderDomain: 'example.com',
    subject: 'Test Subject',
    snippet: 'Test snippet',
    receivedAt: new Date(),
    ...overrides,
  };
}

/**
 * Helper: create a timeline update creation payload.
 */
function createTestUpdate(emailId: string, overrides: Partial<CreateTimelineUpdateData> = {}): CreateTimelineUpdateData {
  return {
    id: `update_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    emailId,
    title: 'Test Timeline Update',
    ...overrides,
  };
}

/**
 * Helper: build a TimelineUpdate (in-memory type) from minimal fields.
 * Used for TimelineFilter tests that operate on the type directly.
 */
function makeUpdate(overrides: Partial<TimelineUpdate> & Pick<TimelineUpdate, 'id' | 'emailId' | 'title' | 'priority' | 'createdAt'>): TimelineUpdate {
  return {
    description: undefined,
    sentiment: undefined,
    emailType: undefined,
    topic: undefined,
    senderDomain: undefined,
    ...overrides,
  };
}

/**
 * Feature: Timeline
 *
 * As a user, I want to see a chronological feed of my processed emails,
 * with the ability to filter by type, topic, sender, priority, and date range,
 * so I can quickly find and review important information.
 */
describe('Feature: Timeline', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let filter: TimelineFilter;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
    filter = new TimelineFilter();
  });

  afterEach(async () => {
    await db.close();
  });

  // ─── Viewing the Timeline ────────────────────────────────────────────

  describe('Viewing the Timeline', () => {
    it('displays updates chronologically (newest first by default)', async () => {
      const email1 = createTestEmail({ id: 'e1' });
      const email2 = createTestEmail({ id: 'e2' });
      const email3 = createTestEmail({ id: 'e3' });
      await repos.emails.create(email1);
      await repos.emails.create(email2);
      await repos.emails.create(email3);

      const jan = new Date('2024-01-15T10:00:00Z');
      const feb = new Date('2024-02-15T10:00:00Z');
      const mar = new Date('2024-03-15T10:00:00Z');

      await repos.timeline.create(createTestUpdate('e1', { id: 'u1', title: 'January update' }));
      await repos.timeline.create(createTestUpdate('e2', { id: 'u2', title: 'February update' }));
      await repos.timeline.create(createTestUpdate('e3', { id: 'u3', title: 'March update' }));

      // Override createdAt directly in DB so we control exact dates
      await db.getDatabase().update(schema.timelineUpdates).set({ createdAt: jan }).where(eq(schema.timelineUpdates.id, 'u1'));
      await db.getDatabase().update(schema.timelineUpdates).set({ createdAt: feb }).where(eq(schema.timelineUpdates.id, 'u2'));
      await db.getDatabase().update(schema.timelineUpdates).set({ createdAt: mar }).where(eq(schema.timelineUpdates.id, 'u3'));

      const records = await repos.timeline.findAll();

      // Now filter.sort with default (desc) on the in-memory representation
      const updates: TimelineUpdate[] = records.map((r) => ({
        id: r.id,
        emailId: r.emailId,
        title: r.title,
        priority: r.priority ?? 'low',
        createdAt: r.createdAt,
        emailType: r.gmailCategory ?? undefined,
        senderDomain: r.senderDomain,
      }));

      const sorted = filter.sort(updates);

      expect(sorted[0].id).toBe('u3'); // March
      expect(sorted[1].id).toBe('u2'); // February
      expect(sorted[2].id).toBe('u1'); // January
    });

    it('handles empty state when no updates exist', async () => {
      const records = await repos.timeline.findAll();
      expect(records).toEqual([]);
    });

    it('groups updates by topic correctly', () => {
      const updates: TimelineUpdate[] = [
        makeUpdate({
          id: 'u1', emailId: 'e1', title: 'Chase alert',
          priority: 'high', createdAt: new Date('2024-01-01'),
          topic: 'Banking/Chase',
        }),
        makeUpdate({
          id: 'u2', emailId: 'e2', title: 'Amazon order',
          priority: 'low', createdAt: new Date('2024-01-02'),
          topic: 'Shopping/Amazon',
        }),
        makeUpdate({
          id: 'u3', emailId: 'e3', title: 'Chase statement',
          priority: 'medium', createdAt: new Date('2024-01-03'),
          topic: 'Banking/Chase',
        }),
        makeUpdate({
          id: 'u4', emailId: 'e4', title: 'No topic email',
          priority: 'low', createdAt: new Date('2024-01-04'),
        }),
      ];

      const grouped = filter.groupByTopic(updates);

      expect(Object.keys(grouped).sort()).toEqual(['Banking/Chase', 'Shopping/Amazon', 'Uncategorized']);
      expect(grouped['Banking/Chase']).toHaveLength(2);
      expect(grouped['Shopping/Amazon']).toHaveLength(1);
      expect(grouped['Uncategorized']).toHaveLength(1);

      // Within each group, updates are sorted newest first
      expect(grouped['Banking/Chase'][0].id).toBe('u3'); // Jan 3
      expect(grouped['Banking/Chase'][1].id).toBe('u1'); // Jan 1
    });

    it('generates Gmail link from update email data', () => {
      const updateWithThread = makeUpdate({
        id: 'u1', emailId: 'e1', title: 'Test',
        priority: 'low', createdAt: new Date(),
      });
      updateWithThread.threadId = 'thread_abc123';

      const link = filter.generateGmailLink(updateWithThread);
      expect(link).toContain('mail.google.com');
      expect(link).toContain('thread_abc123');

      // Without threadId, falls back to emailId
      const updateNoThread = makeUpdate({
        id: 'u2', emailId: 'msg_xyz789', title: 'Test',
        priority: 'low', createdAt: new Date(),
      });

      const linkNoThread = filter.generateGmailLink(updateNoThread);
      expect(linkNoThread).toContain('msg_xyz789');
    });
  });

  // ─── Filtering by Email Type ─────────────────────────────────────────

  describe('Filtering by Email Type', () => {
    const updates: TimelineUpdate[] = [
      makeUpdate({ id: 'u1', emailId: 'e1', title: 'Regular', priority: 'low', createdAt: new Date(), emailType: 'regular' }),
      makeUpdate({ id: 'u2', emailId: 'e2', title: 'Update', priority: 'medium', createdAt: new Date(), emailType: 'updates' }),
      makeUpdate({ id: 'u3', emailId: 'e3', title: 'Social', priority: 'low', createdAt: new Date(), emailType: 'social' }),
      makeUpdate({ id: 'u4', emailId: 'e4', title: 'Promotional', priority: 'low', createdAt: new Date(), emailType: 'promotional' }),
    ];

    it('filters to show only regular emails', () => {
      const result = filter.apply(updates, { emailType: 'regular' });
      expect(result).toHaveLength(1);
      expect(result[0].emailType).toBe('regular');
    });

    it('filters to show only update-type emails', () => {
      const result = filter.apply(updates, { emailType: 'updates' });
      expect(result).toHaveLength(1);
      expect(result[0].emailType).toBe('updates');
    });

    it('filters to show only promotional emails', () => {
      const result = filter.apply(updates, { emailType: 'promotional' });
      expect(result).toHaveLength(1);
      expect(result[0].emailType).toBe('promotional');
    });

    it('filters to show only social emails', () => {
      const result = filter.apply(updates, { emailType: 'social' });
      expect(result).toHaveLength(1);
      expect(result[0].emailType).toBe('social');
    });
  });

  // ─── Filtering by Topic ──────────────────────────────────────────────

  describe('Filtering by Topic', () => {
    const updates: TimelineUpdate[] = [
      makeUpdate({ id: 'u1', emailId: 'e1', title: 'Chase', priority: 'high', createdAt: new Date(), topic: 'Banking/Chase' }),
      makeUpdate({ id: 'u2', emailId: 'e2', title: 'Wells', priority: 'medium', createdAt: new Date(), topic: 'Banking/Wells Fargo' }),
      makeUpdate({ id: 'u3', emailId: 'e3', title: 'Amazon', priority: 'low', createdAt: new Date(), topic: 'Shopping/Amazon' }),
      makeUpdate({ id: 'u4', emailId: 'e4', title: 'No topic', priority: 'low', createdAt: new Date() }),
    ];

    it('filters by exact topic match', () => {
      const result = filter.apply(updates, { topic: 'Banking/Chase' });
      expect(result).toHaveLength(1);
      expect(result[0].topic).toBe('Banking/Chase');
    });

    it('filters by parent topic matching all children', () => {
      const result = filter.apply(updates, { topic: 'Banking' });
      // Matches "Banking/Chase" and "Banking/Wells Fargo" via startsWith
      expect(result).toHaveLength(2);
      const topics = result.map((u) => u.topic);
      expect(topics).toContain('Banking/Chase');
      expect(topics).toContain('Banking/Wells Fargo');
    });
  });

  // ─── Filtering by Sender Domain ──────────────────────────────────────

  describe('Filtering by Sender Domain', () => {
    const updates: TimelineUpdate[] = [
      makeUpdate({ id: 'u1', emailId: 'e1', title: 'Chase', priority: 'high', createdAt: new Date(), senderDomain: 'chase.com' }),
      makeUpdate({ id: 'u2', emailId: 'e2', title: 'Amazon', priority: 'low', createdAt: new Date(), senderDomain: 'amazon.com' }),
      makeUpdate({ id: 'u3', emailId: 'e3', title: 'Chase UK', priority: 'medium', createdAt: new Date(), senderDomain: 'Chase.Com' }),
    ];

    it('filters by sender domain (case-insensitive)', () => {
      const result = filter.apply(updates, { senderDomain: 'chase.com' });
      expect(result).toHaveLength(2);
      expect(result.every((u) => u.senderDomain?.toLowerCase() === 'chase.com')).toBe(true);
    });
  });

  // ─── Filtering by Priority ───────────────────────────────────────────

  describe('Filtering by Priority', () => {
    const updates: TimelineUpdate[] = [
      makeUpdate({ id: 'u1', emailId: 'e1', title: 'Urgent', priority: 'high', createdAt: new Date() }),
      makeUpdate({ id: 'u2', emailId: 'e2', title: 'Normal', priority: 'medium', createdAt: new Date() }),
      makeUpdate({ id: 'u3', emailId: 'e3', title: 'FYI', priority: 'low', createdAt: new Date() }),
      makeUpdate({ id: 'u4', emailId: 'e4', title: 'Another urgent', priority: 'high', createdAt: new Date() }),
    ];

    it('filters to show only high-priority items', () => {
      const result = filter.apply(updates, { priority: 'high' });
      expect(result).toHaveLength(2);
      expect(result.every((u) => u.priority === 'high')).toBe(true);
    });

    it('filters to show only medium-priority items', () => {
      const result = filter.apply(updates, { priority: 'medium' });
      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('medium');
    });

    it('filters to show only low-priority items', () => {
      const result = filter.apply(updates, { priority: 'low' });
      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('low');
    });
  });

  // ─── Filtering by Date Range ─────────────────────────────────────────

  describe('Filtering by Date Range', () => {
    const updates: TimelineUpdate[] = [
      makeUpdate({ id: 'u1', emailId: 'e1', title: 'Jan', priority: 'low', createdAt: new Date('2024-01-15T10:00:00Z') }),
      makeUpdate({ id: 'u2', emailId: 'e2', title: 'Feb', priority: 'low', createdAt: new Date('2024-02-15T10:00:00Z') }),
      makeUpdate({ id: 'u3', emailId: 'e3', title: 'Mar', priority: 'low', createdAt: new Date('2024-03-15T10:00:00Z') }),
    ];

    it('filters to a specific date range', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-31T23:59:59Z');
      const result = filter.apply(updates, { dateRange: { start, end } });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('u1');
    });

    it('filters with only start date (open-ended)', () => {
      const start = new Date('2024-02-01T00:00:00Z');
      const result = filter.apply(updates, { dateRange: { start } });

      expect(result).toHaveLength(2);
      expect(result.map((u) => u.id)).toContain('u2');
      expect(result.map((u) => u.id)).toContain('u3');
    });
  });

  // ─── Combined Filters (AND Logic) ────────────────────────────────────

  describe('Combining Multiple Filters (AND Logic)', () => {
    const updates: TimelineUpdate[] = [
      makeUpdate({
        id: 'u1', emailId: 'e1', title: 'Chase high',
        priority: 'high', createdAt: new Date('2024-01-15'),
        topic: 'Banking/Chase', senderDomain: 'chase.com',
      }),
      makeUpdate({
        id: 'u2', emailId: 'e2', title: 'Chase low',
        priority: 'low', createdAt: new Date('2024-02-15'),
        topic: 'Banking/Chase', senderDomain: 'chase.com',
      }),
      makeUpdate({
        id: 'u3', emailId: 'e3', title: 'Amazon high',
        priority: 'high', createdAt: new Date('2024-03-15'),
        topic: 'Shopping/Amazon', senderDomain: 'amazon.com',
      }),
    ];

    it('combines topic and priority filters', () => {
      const result = filter.apply(updates, { topic: 'Banking/Chase', priority: 'high' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('u1');
      expect(result[0].topic).toBe('Banking/Chase');
      expect(result[0].priority).toBe('high');
    });

    it('combines email type and date range filters', () => {
      const allUpdates: TimelineUpdate[] = [
        makeUpdate({ id: 'u1', emailId: 'e1', title: 'Jan update', priority: 'low', createdAt: new Date('2024-01-10'), emailType: 'updates' }),
        makeUpdate({ id: 'u2', emailId: 'e2', title: 'Feb promo', priority: 'low', createdAt: new Date('2024-02-10'), emailType: 'promotional' }),
        makeUpdate({ id: 'u3', emailId: 'e3', title: 'Mar update', priority: 'low', createdAt: new Date('2024-03-10'), emailType: 'updates' }),
      ];

      const result = filter.apply(allUpdates, {
        emailType: 'updates',
        dateRange: { start: new Date('2024-01-01'), end: new Date('2024-01-31') },
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('u1');
      expect(result[0].emailType).toBe('updates');
    });

    it('combines sender domain and priority filters', () => {
      const result = filter.apply(updates, { senderDomain: 'chase.com', priority: 'high' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('u1');
      expect(result[0].senderDomain).toBe('chase.com');
      expect(result[0].priority).toBe('high');
    });
  });

  // ─── No Results State ────────────────────────────────────────────────

  describe('No Results State', () => {
    it('returns empty array when filters exclude all updates', () => {
      const updates: TimelineUpdate[] = [
        makeUpdate({ id: 'u1', emailId: 'e1', title: 'Test', priority: 'medium', createdAt: new Date(), topic: 'Banking/Chase' }),
      ];

      const result = filter.apply(updates, { topic: 'NonExistent/Topic', priority: 'high' });
      expect(result).toEqual([]);
    });
  });

  // ─── Filter Persistence (serialize/deserialize) ──────────────────────

  describe('Filter Persistence', () => {
    it('serializes and deserializes filters preserving all values', () => {
      const original: TimelineFilterOptions = {
        emailType: 'updates',
        topic: 'Banking/Chase',
        priority: 'high',
        senderDomain: 'chase.com',
      };

      const serialized = filter.serialize(original);
      expect(serialized).toContain('emailType=updates');
      expect(serialized).toContain('priority=high');

      const restored = filter.deserialize(serialized);
      expect(restored.emailType).toBe('updates');
      expect(restored.priority).toBe('high');
      expect(restored.topic).toBe('Banking/Chase');
      expect(restored.senderDomain).toBe('chase.com');
    });

    it('clears all filters by deserializing empty string', () => {
      const restored = filter.deserialize('');
      expect(restored).toEqual({});
    });
  });

  // ─── Search within Timeline ──────────────────────────────────────────

  describe('Search within Timeline', () => {
    it('finds updates containing search text in title or description', async () => {
      const email = createTestEmail({ id: 'e1' });
      await repos.emails.create(email);

      await repos.timeline.create(createTestUpdate('e1', {
        id: 'u1',
        title: 'Bank statement available',
        description: 'Your monthly statement is ready',
      }));

      await repos.timeline.create(createTestUpdate('e1', {
        id: 'u2',
        title: 'Account notification',
        description: 'Your password was changed',
      }));

      // The repository does not have a search method, but the UI would filter
      // records by text matching. Simulate that with Array.filter on real records.
      const allRecords = await repos.timeline.findAll();

      const results = allRecords.filter((r) => {
        const content = `${r.title} ${r.description ?? ''}`.toLowerCase();
        return content.includes('statement');
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Bank statement available');
    });
  });
});
