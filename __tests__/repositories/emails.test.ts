import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailRepository, type CreateEmailData } from '@core/repositories/emails';
import type { Email } from '@core/types/email';
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

describe('EmailRepository', () => {
  let repo: EmailRepository;
  let db: TuskerBrainDatabase;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repo = new EmailRepository(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('create', () => {
    it('should create an email record', async () => {
      const data = createTestEmail();
      const result = await repo.create(data);

      expect(result.id).toBe(data.id);
      expect(result.senderEmail).toBe(data.senderEmail);
      expect(result.isProcessed).toBe(false);
    });

    it('should set default values', async () => {
      const data = createTestEmail();
      const result = await repo.create(data);

      expect(result.isImportant).toBe(false);
      expect(result.isRead).toBe(false);
      expect(result.isArchived).toBe(false);
    });
  });

  describe('findById', () => {
    it('should find an email by ID', async () => {
      const data = createTestEmail();
      await repo.create(data);

      const result = await repo.findById(data.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(data.id);
    });

    it('should return null for non-existent email', async () => {
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByThreadId', () => {
    it('should find emails by thread ID', async () => {
      await repo.create(createTestEmail({ id: 'e1', threadId: 'thread1' }));
      await repo.create(createTestEmail({ id: 'e2', threadId: 'thread1' }));
      await repo.create(createTestEmail({ id: 'e3', threadId: 'thread2' }));

      const results = await repo.findByThreadId('thread1');

      expect(results.length).toBe(2);
    });
  });

  describe('findBySenderDomain', () => {
    it('should find emails by sender domain', async () => {
      await repo.create(createTestEmail({ senderDomain: 'amazon.com' }));
      await repo.create(createTestEmail({ senderDomain: 'amazon.com' }));
      await repo.create(createTestEmail({ senderDomain: 'google.com' }));

      const results = await repo.findBySenderDomain('amazon.com');

      expect(results.length).toBe(2);
    });

    it('should respect limit parameter', async () => {
      await repo.create(createTestEmail({ senderDomain: 'test.com' }));
      await repo.create(createTestEmail({ senderDomain: 'test.com' }));
      await repo.create(createTestEmail({ senderDomain: 'test.com' }));

      const results = await repo.findBySenderDomain('test.com', 2);

      expect(results.length).toBe(2);
    });
  });

  describe('findUnprocessed', () => {
    it('should find unprocessed emails', async () => {
        await repo.create(createTestEmail({ id: 'unprocessed' }));
        await repo.create(createTestEmail({ id: 'processed' }));
        await repo.markProcessed('processed');

        const results = await repo.findUnprocessed();

        expect(results.length).toBe(1);
        expect(results[0].id).toBe('unprocessed');
      });
  });

  describe('findByType', () => {
    it('should find emails by type', async () => {
        await repo.create(createTestEmail({ id: 'e1', emailType: 'promotional' }));
        await repo.create(createTestEmail({ id: 'e2', emailType: 'promotional' }));
        await repo.create(createTestEmail({ id: 'e3', emailType: 'regular' }));

        const results = await repo.findByType('promotional');

        expect(results.length).toBe(2);
      });
  });

  describe('update', () => {
    it('should update an email', async () => {
      const data = createTestEmail();
      await repo.create(data);

      const result = await repo.update(data.id, {
        emailType: 'updates',
        isArchived: true,
      });

      expect(result?.emailType).toBe('updates');
      expect(result?.isArchived).toBe(true);
    });

    it('should return null for non-existent email', async () => {
      const result = await repo.update('nonexistent', { emailType: 'regular' });
      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should update existing email state without read-then-write repository calls', async () => {
      const original = createTestEmail({
        id: 'upsert_existing',
        subject: 'Original Subject',
        gmailCategory: 'updates',
        isImportant: true,
      });
      await repo.create(original);

      const processedAt = new Date('2026-01-02T03:04:05.000Z');
      const findByIdSpy = vi.spyOn(repo, 'findById');
      const updateSpy = vi.spyOn(repo, 'update');
      const createSpy = vi.spyOn(repo, 'create');

      await repo.upsert({
        ...original,
        subject: 'Changed Subject',
        gmailCategory: 'promotions',
        isImportant: false,
        isRead: true,
        isArchived: true,
        isDeleted: true,
        isProcessed: true,
        processedAt,
      } as Email);

      expect(findByIdSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();

      findByIdSpy.mockRestore();
      updateSpy.mockRestore();
      createSpy.mockRestore();

      const result = await repo.findById(original.id);
      expect(result?.subject).toBe('Original Subject');
      expect(result?.gmailCategory).toBe('promotions');
      expect(result?.isImportant).toBe(false);
      expect(result?.isRead).toBe(true);
      expect(result?.isArchived).toBe(true);
      expect(result?.isDeleted).toBe(true);
      expect(result?.isProcessed).toBe(true);
      expect(result?.processedAt?.getTime()).toBe(processedAt.getTime());
    });
  });

  describe('markProcessed', () => {
    it('should mark an email as processed', async () => {
      const data = createTestEmail();
      await repo.create(data);

      await repo.markProcessed(data.id);

      const result = await repo.findById(data.id);
      expect(result?.isProcessed).toBe(true);
      expect(result?.processedAt).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete an email', async () => {
      const data = createTestEmail();
      await repo.create(data);

      await repo.delete(data.id);

      const result = await repo.findById(data.id);
      expect(result).toBeNull();
    });
  });

  describe('countByType', () => {
    it('should count emails by type', async () => {
      await repo.create(createTestEmail({ emailType: 'promotional' }));
      await repo.create(createTestEmail({ emailType: 'promotional' }));
      await repo.create(createTestEmail({ emailType: 'regular' }));

      const counts = await repo.countByType();

      expect(counts['promotional']).toBe(2);
      expect(counts['regular']).toBe(1);
    });
  });

  describe('count', () => {
    it('should count all emails', async () => {
      await repo.create(createTestEmail());
      await repo.create(createTestEmail());

      const count = await repo.count();

      expect(count).toBe(2);
    });
  });
});
