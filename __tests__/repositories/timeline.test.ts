import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TimelineRepository, type CreateTimelineUpdateData } from '@core/repositories/timeline';
import { EmailRepository, type CreateEmailData } from '@core/repositories/emails';
import { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';

function createTestEmail(overrides: Partial<CreateEmailData> = {}): CreateEmailData {
  return {
    id: `email_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    threadId: 'thread_1',
    senderEmail: 'test@example.com',
    senderDomain: 'example.com',
    subject: 'Test Subject',
    snippet: 'Test snippet',
    receivedAt: new Date(),
    ...overrides,
  };
}

function createTestTimelineUpdate(emailId: string, overrides: Partial<CreateTimelineUpdateData> = {}): CreateTimelineUpdateData {
  return {
    id: `update_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    emailId,
    title: 'Test Timeline Update',
    ...overrides,
  };
}

describe('TimelineRepository', () => {
  let timelineRepo: TimelineRepository;
  let emailRepo: EmailRepository;
  let db: TuskerBrainDatabase;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    timelineRepo = new TimelineRepository(db);
    emailRepo = new EmailRepository(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('findAll', () => {
    it('should find timeline updates and include sender info', async () => {
      const emailData = createTestEmail({
        senderDomain: 'amazon.com',
        gmailCategory: 'Shopping',
      });
      await emailRepo.create(emailData);

      const updateData = createTestTimelineUpdate(emailData.id, {
        title: 'Amazon Order Shipped',
      });
      await timelineRepo.create(updateData);

      const results = await timelineRepo.findAll();

      expect(results.length).toBe(1);
      const result = results[0];
      expect(result.id).toBe(updateData.id);
      expect(result.title).toBe(updateData.title);

      expect(result).toHaveProperty('senderDomain', 'amazon.com');
      expect(result).toHaveProperty('gmailCategory', 'Shopping');
      expect(result).toHaveProperty('senderEmail', emailData.senderEmail);
    });

    it('should join with topics and include topic fullPath', async () => {
      const emailData = createTestEmail();
      await emailRepo.create(emailData);

      const updateData = createTestTimelineUpdate(emailData.id);
      await timelineRepo.create(updateData);

      // Create a topic
      const [topic] = await db.getDatabase()
        .insert(schema.topics)
        .values({
          id: 'topic_1',
          name: 'Orders',
          fullPath: 'Shopping/Orders',
        })
        .returning();

      // Link email to topic
      await db.getDatabase()
        .insert(schema.emailTopics)
        .values({
          emailId: emailData.id,
          topicId: topic.id,
        });

      const results = await timelineRepo.findAll();

      expect(results.length).toBe(1);
      expect(results[0].topic).toEqual({
        primary: 'Shopping/Orders',
        count: 1,
        all: ['Shopping/Orders'],
      });
    });
  });

  describe('findTimelineEntries', () => {
    it('returns paginated email timeline entries with optional enrichment', async () => {
      const newestEmail = createTestEmail({
        id: 'newest',
        threadId: 'thread_newest',
        senderEmail: 'newest@example.com',
        senderDomain: 'example.com',
        subject: 'Newest email',
        snippet: 'Newest snippet',
        receivedAt: new Date('2026-04-25T12:00:00Z'),
      });
      const enrichedEmail = createTestEmail({
        id: 'enriched',
        threadId: 'thread_enriched',
        senderEmail: 'enriched@example.com',
        senderDomain: 'example.com',
        subject: 'Enriched email',
        snippet: 'Enriched snippet',
        receivedAt: new Date('2026-04-25T11:00:00Z'),
      });
      const olderEmail = createTestEmail({
        id: 'older',
        threadId: 'thread_older',
        senderEmail: 'older@example.com',
        senderDomain: 'example.com',
        subject: 'Older email',
        snippet: 'Older snippet',
        receivedAt: new Date('2026-04-25T10:00:00Z'),
      });

      await emailRepo.create(olderEmail);
      await emailRepo.create(enrichedEmail);
      await emailRepo.create(newestEmail);
      await timelineRepo.create(createTestTimelineUpdate(enrichedEmail.id, {
        id: 'update_enriched',
        title: 'Enriched title',
        priority: 'high',
      }));

      const result = await timelineRepo.findTimelineEntries({ limit: 2, offset: 0 });

      expect(result.total).toBe(3);
      expect(result.entries).toHaveLength(2);
      expect(result.entries.map((entry) => entry.emailId)).toEqual(['enriched', 'newest']);
      expect(result.entries[0]).toMatchObject({
        id: 'update_enriched',
        emailId: 'enriched',
        title: 'Enriched title',
        priority: 'high',
        isProcessed: true,
      });
      expect(result.entries[1]).toMatchObject({
        emailId: 'newest',
        title: 'Newest email',
        isProcessed: false,
      });
    });
  });

  describe('getWeekSenders', () => {
    it('should use calendar week (Sunday to Saturday)', async () => {
      // Wednesday, May 15, 2024
      const startDate = new Date('2024-05-15T12:00:00Z');
      
      // Sunday, May 12, 2024 (Start of week)
      const sunday = new Date('2024-05-12T10:00:00Z');
      // Saturday, May 18, 2024 (End of week)
      const saturday = new Date('2024-05-18T10:00:00Z');
      // Previous Saturday, May 11, 2024 (Outside week)
      const prevSaturday = new Date('2024-05-11T10:00:00Z');
      // Next Sunday, May 19, 2024 (Outside week)
      const nextSunday = new Date('2024-05-19T10:00:00Z');

      const email1 = createTestEmail({ id: 'e1', senderDomain: 'inside.com' });
      const email2 = createTestEmail({ id: 'e2', senderDomain: 'outside.com' });
      await emailRepo.create(email1);
      await emailRepo.create(email2);

      // Within week
      await db.getDatabase().insert(schema.timelineUpdates).values({
        id: 'u1',
        emailId: 'e1',
        title: 'Inside 1',
        createdAt: sunday,
      });
      await db.getDatabase().insert(schema.timelineUpdates).values({
        id: 'u2',
        emailId: 'e1',
        title: 'Inside 2',
        createdAt: saturday,
      });

      // Outside week
      await db.getDatabase().insert(schema.timelineUpdates).values({
        id: 'u3',
        emailId: 'e2',
        title: 'Outside 1',
        createdAt: prevSaturday,
      });
      await db.getDatabase().insert(schema.timelineUpdates).values({
        id: 'u4',
        emailId: 'e2',
        title: 'Outside 2',
        createdAt: nextSunday,
      });

      const results = await timelineRepo.getWeekSenders(startDate);

      expect(results.length).toBe(1);
      expect(results[0].domain).toBe('inside.com');
      expect(results[0].count).toBe(2);
    });
  });
});
