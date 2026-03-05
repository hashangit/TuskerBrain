import { describe, it, expect, beforeEach } from 'vitest';
import { TopicLabeler, PREDEFINED_PARENTS } from '@core/labeling/labeler';
import type { Email } from '@core/types/email';

describe('Topic Labeling System', () => {
  let labeler: TopicLabeler;

  beforeEach(() => {
    labeler = new TopicLabeler();
  });

  describe('Predefined Parent Categories', () => {
    it('should have predefined parent categories', () => {
      expect(PREDEFINED_PARENTS).toContain('Banking');
      expect(PREDEFINED_PARENTS).toContain('Education');
      expect(PREDEFINED_PARENTS).toContain('Projects');
      expect(PREDEFINED_PARENTS).toContain('Shopping');
      expect(PREDEFINED_PARENTS).toContain('Travel');
      expect(PREDEFINED_PARENTS).toContain('Health');
      expect(PREDEFINED_PARENTS).toContain('Personal');
      expect(PREDEFINED_PARENTS).toContain('Business');
      expect(PREDEFINED_PARENTS).toContain('Technology');
      expect(PREDEFINED_PARENTS).toContain('Entertainment');
    });
  });

  describe('Topic Classification', () => {
    it('should classify banking email under Banking parent', async () => {
      const email: Partial<Email> = {
        id: 'email-1',
        threadId: 'thread-1',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Your January Statement is Ready',
        snippet: 'Your January 2024 statement is now available...',
        receivedAt: new Date(),
      };

      const result = await labeler.classifyTopic(email as Email);

      expect(result.parentTopic).toBe('Banking');
      expect(result.childTopic).toMatch(/chase/i);
      expect(result.fullPath).toBe('Banking/Chase');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify education email under Education parent', async () => {
      const email: Partial<Email> = {
        id: 'email-2',
        threadId: 'thread-2',
        senderEmail: 'notifications@udemy.com',
        senderName: 'Udemy',
        senderDomain: 'udemy.com',
        subject: 'New Course: Advanced TypeScript',
        snippet: 'Check out our new course on advanced TypeScript patterns...',
        receivedAt: new Date(),
      };

      const result = await labeler.classifyTopic(email as Email);

      expect(result.parentTopic).toBe('Education');
      expect(result.childTopic).toMatch(/udemy/i);
      expect(result.fullPath).toBe('Education/Udemy');
    });

    it('should classify project email under Projects parent', async () => {
      const email: Partial<Email> = {
        id: 'email-3',
        threadId: 'thread-3',
        senderEmail: 'john@client-abc.com',
        senderName: 'John from Client ABC',
        senderDomain: 'client-abc.com',
        subject: 'Re: Project Alpha - Sprint Review',
        snippet: 'Hi team, Just wanted to follow up on Project Alpha...',
        receivedAt: new Date(),
      };

      const result = await labeler.classifyTopic(email as Email);

      expect(result.parentTopic).toBe('Projects');
      expect(result.childTopic).toMatch(/client.*abc|alpha/i);
    });

    it('should match to existing topic when similar', async () => {
      // First email creates the topic
      const email1: Partial<Email> = {
        id: 'email-4',
        threadId: 'thread-4',
        senderEmail: 'noreply@chase.com',
        senderName: 'Chase Bank',
        senderDomain: 'chase.com',
        subject: 'Statement Ready',
        snippet: 'Your statement is ready...',
        receivedAt: new Date(),
      };

      await labeler.classifyTopic(email1 as Email);

      // Second similar email should match existing
      const email2: Partial<Email> = {
        id: 'email-5',
        threadId: 'thread-5',
        senderEmail: 'alerts@chase.com',
        senderName: 'Chase',
        senderDomain: 'chase.com',
        subject: 'Payment Confirmation',
        snippet: 'Your payment was received...',
        receivedAt: new Date(),
      };

      const result = await labeler.classifyTopic(email2 as Email);

      expect(result.fullPath).toBe('Banking/Chase');
    });

    it('should create new parent for unrecognized category', async () => {
      const email: Partial<Email> = {
        id: 'email-6',
        threadId: 'thread-6',
        senderEmail: 'info@local-gym.com',
        senderName: 'Local Gym',
        senderDomain: 'local-gym.com',
        subject: 'Your Membership Renewal',
        snippet: 'Your gym membership is due for renewal...',
        receivedAt: new Date(),
      };

      const result = await labeler.classifyTopic(email as Email);

      expect(result.parentTopic).toBeDefined();
      expect(result.childTopic).toBeDefined();
      expect(result.fullPath).toBeDefined();
    });
  });

  describe('Topic Normalization', () => {
    it('should normalize similar topic names', async () => {
      const variations = ['Chase Bank', 'Chase', 'JPMorgan Chase', 'Chase Credit Card'];

      const results = await Promise.all(
        variations.map((name) => {
          const email: Partial<Email> = {
            id: `email-${Math.random()}`,
            threadId: 'thread-1',
            senderEmail: `noreply@${name.toLowerCase().replace(/\s+/g, '')}.com`,
            senderName: name,
            senderDomain: `${name.toLowerCase().replace(/\s+/g, '')}.com`,
            subject: 'Test',
            snippet: 'Test content',
            receivedAt: new Date(),
          };
          return labeler.classifyTopic(email as Email);
        })
      );

      // All variations should normalize to same child topic
      const childTopics = results.map((r) => r.childTopic);
      const uniqueChildTopics = [...new Set(childTopics)];
      expect(uniqueChildTopics.length).toBe(1);
    });
  });

  describe('Gmail Label Path Generation', () => {
    it('should generate correct Gmail label path', () => {
      const topic = { parent: 'Banking', child: 'Chase' };
      const labelPath = labeler.generateGmailLabelPath(topic);

      expect(labelPath).toBe('TuskerBrain/Topic/Banking/Chase');
    });

    it('should handle special characters in topic names', () => {
      const topic = { parent: 'Projects', child: 'Client-ABC (2024)' };
      const labelPath = labeler.generateGmailLabelPath(topic);

      expect(labelPath).toMatch(/^TuskerBrain\/Topic\/Projects\/Client-ABC/);
      expect(labelPath).not.toContain('(');
      expect(labelPath).not.toContain(')');
    });
  });
});
