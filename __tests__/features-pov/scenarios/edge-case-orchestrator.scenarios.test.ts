import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { createRepositories, type Repositories } from '@core/repositories';
import { GmailSyncManager, type GmailClient } from '@core/gmail/sync';
import { TopicLabeler } from '@core/labeling/labeler';
import type { Email } from '@core/types/email';

const MIGRATION_PATH = path.join(__dirname, '../../../database/migrations/0000_initial.sql');

function createMockGmailClient(overrides?: Partial<GmailClient>): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({ messages: [{ id: 'msg1' }], nextPageToken: undefined }),
    getMessage: vi.fn().mockResolvedValue({
      id: 'test',
      threadId: 'thread-1',
      snippet: 'Test',
      internalDate: Date.now().toString(),
      payload: {
        headers: [
          { name: 'From', value: 's@e.com' },
          { name: 'Subject', value: 'Test' },
        ],
      },
    }),
    modifyMessage: vi.fn().mockResolvedValue({}),
    getProfile: vi.fn().mockResolvedValue({ emailAddress: 'user@gmail.com', historyId: '001' }),
    ...overrides,
  };
}

describe('Scenario: Edge Case Orchestrator', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let mockGmailClient: GmailClient;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.execSql(fs.readFileSync(MIGRATION_PATH, 'utf-8'));
    repos = createRepositories(db);
    mockGmailClient = createMockGmailClient();
  });

  afterEach(async () => {
    await db.close();
  });

  // ── Duplicate Emails ───────────────────────────────────────────────

  describe('Duplicate Emails', () => {
    it('should reject creating an email with the same ID twice (DB PRIMARY KEY constraint)', async () => {
      const emailData = {
        id: 'dup-email-1',
        threadId: 'thread-dup',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        subject: 'Duplicate Test',
        snippet: 'This is duplicate content.',
        receivedAt: new Date(),
      };

      // First create succeeds
      const first = await repos.emails.create(emailData);
      expect(first.id).toBe('dup-email-1');

      // Second create with same ID should error (PRIMARY KEY violation)
      await expect(repos.emails.create(emailData)).rejects.toThrow();
    });

    it('should allow two emails with different IDs but same content', async () => {
      const base = {
        threadId: 'thread-dup',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        subject: 'Duplicate Test',
        snippet: 'This is duplicate content.',
        receivedAt: new Date(),
      };

      const email1 = await repos.emails.create({ id: 'dup-a', ...base });
      const email2 = await repos.emails.create({ id: 'dup-b', ...base });

      // Both stored — different IDs means different rows
      expect(email1.id).toBe('dup-a');
      expect(email2.id).toBe('dup-b');

      const count = await repos.emails.count();
      expect(count).toBe(2);
    });
  });

  // ── Malformed Content ──────────────────────────────────────────────

  describe('Malformed Content', () => {
    it('should store email with HTML in snippet without crashing', async () => {
      const htmlSnippet = '<html><body><p>Content with <b>bold</b> and <a href="http://evil.com">link</a></p></body></html>';

      const email = await repos.emails.create({
        id: 'html-snippet',
        threadId: 'thread-html',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        subject: 'HTML Email',
        snippet: htmlSnippet,
        receivedAt: new Date(),
      });

      // The snippet is stored as-is (no sanitization at repo layer)
      expect(email.snippet).toBe(htmlSnippet);
      expect(email.snippet).toContain('<html>');
    });

    it('should handle email with null/missing subject', async () => {
      const email = await repos.emails.create({
        id: 'no-subject',
        threadId: 'thread-nosubject',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        subject: undefined, // missing subject
        snippet: 'Email with no subject line.',
        receivedAt: new Date(),
      });

      // Subject stored as null
      expect(email.subject).toBeNull();

      // Can retrieve it back
      const found = await repos.emails.findById('no-subject');
      expect(found).not.toBeNull();
      expect(found!.subject).toBeNull();
    });

    it('should store email with very long snippet (10000+ chars)', async () => {
      const longSnippet = 'A'.repeat(12000);

      const email = await repos.emails.create({
        id: 'very-long',
        threadId: 'thread-long',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        subject: 'Long Email',
        snippet: longSnippet,
        receivedAt: new Date(),
      });

      // Full snippet stored without truncation
      expect(email.snippet).toBe(longSnippet);
      expect(email.snippet!.length).toBe(12000);

      // Verify round-trip
      const found = await repos.emails.findById('very-long');
      expect(found!.snippet!.length).toBe(12000);
    });
  });

  // ── Unicode and Special Characters ─────────────────────────────────

  describe('Unicode and Special Characters', () => {
    it('should store and retrieve email with emojis in subject and snippet', async () => {
      const email = await repos.emails.create({
        id: 'emoji-test',
        threadId: 'thread-emoji',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        subject: 'Party Time 🎉🚀🎊',
        snippet: 'Great news! 🚀 We did it! 🎊 Check this out 🎁',
        receivedAt: new Date(),
      });

      expect(email.subject).toContain('🎉');
      expect(email.subject).toContain('🚀');
      expect(email.snippet).toContain('🎊');

      // Verify round-trip from DB
      const found = await repos.emails.findById('emoji-test');
      expect(found!.subject).toContain('🎉');
      expect(found!.snippet).toContain('🚀');
    });

    it('should store and retrieve email with non-Latin characters (CJK, Arabic, Cyrillic)', async () => {
      const email = await repos.emails.create({
        id: 'unicode-test',
        threadId: 'thread-unicode',
        senderEmail: 'test@test.com',
        senderDomain: 'test.com',
        subject: 'Multi-language 你好 مرحبا Привет',
        snippet: 'Japanese: こんにちは. Arabic: مرحبا. Russian: Привет.',
        receivedAt: new Date(),
      });

      expect(email.subject).toContain('你好');
      expect(email.subject).toContain('مرحبا');
      expect(email.subject).toContain('Привет');

      // Round-trip check — Japanese is in the snippet, not the subject
      const found = await repos.emails.findById('unicode-test');
      expect(found!.subject).toContain('مرحبا');
      expect(found!.snippet).toContain('こんにちは');
      expect(found!.snippet).toContain('Привет');
    });
  });

  // ── Timezone Handling ──────────────────────────────────────────────

  describe('Timezone Handling', () => {
    it('should preserve receivedAt timestamp from Gmail internalDate via processEmail', async () => {
      // Simulate Gmail returning an internalDate in UTC
      const utcTimestamp = new Date('2024-01-15T10:00:00Z').getTime();
      const mockClient = createMockGmailClient({
        getMessage: vi.fn().mockResolvedValue({
          id: 'tz-email',
          threadId: 'thread-tz',
          snippet: 'Timezone test',
          internalDate: utcTimestamp.toString(),
          payload: {
            headers: [
              { name: 'From', value: 'sender@utc.com' },
              { name: 'Subject', value: 'Timezone Test' },
            ],
          },
        }),
      });

      const syncManager = new GmailSyncManager(mockClient);
      const email = await syncManager.processEmail('tz-email');

      expect(email).not.toBeNull();
      // receivedAt should match the UTC timestamp exactly
      expect(email!.receivedAt.getTime()).toBe(utcTimestamp);
    });
  });

  // ── Email Threading ────────────────────────────────────────────────

  describe('Email Threading', () => {
    it('should group multiple emails by threadId', async () => {
      const threadId = 'thread-abc';

      await repos.emails.create({
        id: 'thread-msg-1',
        threadId,
        senderEmail: 'a@test.com',
        senderDomain: 'test.com',
        subject: 'Project Discussion',
        snippet: 'Starting the discussion.',
        receivedAt: new Date('2024-01-01T10:00:00Z'),
      });

      await repos.emails.create({
        id: 'thread-msg-2',
        threadId,
        senderEmail: 'b@test.com',
        senderDomain: 'test.com',
        subject: 'Re: Project Discussion',
        snippet: 'Reply to the discussion.',
        receivedAt: new Date('2024-01-02T10:00:00Z'),
      });

      const thread = await repos.emails.findByThreadId(threadId);

      expect(thread.length).toBe(2);
      // Ordered by receivedAt DESC (most recent first)
      expect(thread[0].id).toBe('thread-msg-2');
      expect(thread[1].id).toBe('thread-msg-1');
    });

    it('should handle deeply nested thread (3+ emails in same threadId)', async () => {
      const threadId = 'deep-thread';

      await repos.emails.create({
        id: 'deep-1',
        threadId,
        senderEmail: 'a@test.com',
        senderDomain: 'test.com',
        subject: 'Original',
        snippet: 'Original message.',
        receivedAt: new Date('2024-01-01T10:00:00Z'),
      });

      await repos.emails.create({
        id: 'deep-2',
        threadId,
        senderEmail: 'b@test.com',
        senderDomain: 'test.com',
        subject: 'Re: Original',
        snippet: 'First reply.',
        receivedAt: new Date('2024-01-02T10:00:00Z'),
      });

      await repos.emails.create({
        id: 'deep-3',
        threadId,
        senderEmail: 'a@test.com',
        senderDomain: 'test.com',
        subject: 'Re: Original',
        snippet: 'Second reply.',
        receivedAt: new Date('2024-01-03T10:00:00Z'),
      });

      const thread = await repos.emails.findByThreadId(threadId);

      expect(thread.length).toBe(3);
      // DESC order: most recent first
      expect(thread[0].id).toBe('deep-3');
      expect(thread[2].id).toBe('deep-1');
    });
  });

  // ── Sender Edge Cases ──────────────────────────────────────────────

  describe('Sender Edge Cases', () => {
    it('should parse malformed From header with special characters via processEmail', async () => {
      const mockClient = createMockGmailClient({
        getMessage: vi.fn().mockResolvedValue({
          id: 'special-sender',
          threadId: 'thread-sender',
          snippet: 'Content',
          internalDate: Date.now().toString(),
          payload: {
            headers: [
              { name: 'From', value: "\"O'Brien, John\" <john@test.com>" },
              { name: 'Subject', value: 'Test' },
            ],
          },
        }),
      });

      const syncManager = new GmailSyncManager(mockClient);
      const email = await syncManager.processEmail('special-sender');

      expect(email).not.toBeNull();
      expect(email!.senderEmail).toBe("\"O'Brien, John\" <john@test.com>");
      expect(email!.senderName).toContain("O'Brien");
      expect(email!.senderDomain).toBe('test.com');
    });

    it('should handle From header with no sender name (email only)', async () => {
      const mockClient = createMockGmailClient({
        getMessage: vi.fn().mockResolvedValue({
          id: 'no-name-sender',
          threadId: 'thread-noname',
          snippet: 'Content',
          internalDate: Date.now().toString(),
          payload: {
            headers: [
              { name: 'From', value: 'noreply@company.com' },
              { name: 'Subject', value: 'No Name' },
            ],
          },
        }),
      });

      const syncManager = new GmailSyncManager(mockClient);
      const email = await syncManager.processEmail('no-name-sender');

      expect(email).not.toBeNull();
      // extractName falls back to part before @ when no angle-bracket format
      expect(email!.senderName).toBe('noreply');
      expect(email!.senderDomain).toBe('company.com');
    });

    it('should classify topic for email with empty senderDomain', async () => {
      const labeler = new TopicLabeler();

      const email: Email = {
        id: 'no-domain',
        threadId: 'thread-nodomain',
        senderEmail: 'noreply',
        senderName: null,
        senderDomain: '',
        subject: 'Test',
        snippet: 'Content.',
        receivedAt: new Date(),
      };

      // Should not throw — TopicLabeler should handle empty domain
      const result = await labeler.classifyTopic(email);
      expect(result).toBeDefined();
      expect(result.parentTopic).toBeDefined();
      expect(result.childTopic).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });
});
