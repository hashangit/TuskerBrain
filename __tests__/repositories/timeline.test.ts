import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TimelineRepository, type CreateTimelineUpdateData } from '@core/repositories/timeline';
import { EmailRepository, type CreateEmailData } from '@core/repositories/emails';
import { TuskerBrainDatabase } from '../../database';

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

      // These are the properties we want to add
      expect(result).toHaveProperty('senderDomain', 'amazon.com');
      expect(result).toHaveProperty('gmailCategory', 'Shopping');
      expect(result).toHaveProperty('senderEmail', emailData.senderEmail);
    });
  });
});
