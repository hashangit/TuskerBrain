import { describe, it, expect } from 'vitest';
import { TimelineFilter } from '@domain/timeline/filter';
import type { TimelineUpdate } from '@foundations/types/timeline';

/**
 * Design Spec Reference: Lines 879-915
 *
 * Timeline Filtering:
 * - Filters by email type (regular, updates, social, deals)
 * - Filters by topic
 * - Filters by sender domain
 * - Filters by priority
 * - Filters by date range
 * - Combines multiple filters with AND logic
 * - Shows email link that opens in Gmail
 * - Consolidates updates under same topic (visual grouping)
 */
describe('Timeline Filtering', () => {
  // Sample timeline updates for testing
  const createMockUpdates = (): TimelineUpdate[] => [
    {
      id: '1',
      emailId: 'email-1',
      title: 'Bank Statement Ready',
      description: 'Your January statement is available',
      priority: 'medium',
      sentiment: 'neutral',
      emailType: 'updates',
      topic: 'Banking/Chase',
      senderDomain: 'chase.com',
      createdAt: new Date('2024-01-20'),
    },
    {
      id: '2',
      emailId: 'email-2',
      title: '50% Off Electronics',
      description: 'Limited time offer',
      priority: 'low',
      sentiment: 'positive',
      emailType: 'promotional',
      topic: 'Shopping/Amazon',
      senderDomain: 'amazon.com',
      createdAt: new Date('2024-01-19'),
    },
    {
      id: '3',
      emailId: 'email-3',
      title: 'Project Alpha Review',
      description: 'Action required by Friday',
      priority: 'high',
      sentiment: 'neutral',
      emailType: 'regular',
      topic: 'Projects/Client-ABC',
      senderDomain: 'client-abc.com',
      createdAt: new Date('2024-01-18'),
    },
    {
      id: '4',
      emailId: 'email-4',
      title: 'New Connection',
      description: 'John endorsed you',
      priority: 'low',
      sentiment: 'positive',
      emailType: 'social',
      topic: 'Professional/LinkedIn',
      senderDomain: 'linkedin.com',
      createdAt: new Date('2024-01-17'),
    },
    {
      id: '5',
      emailId: 'email-5',
      title: 'Payment Received',
      description: 'Your payment was processed',
      priority: 'medium',
      sentiment: 'positive',
      emailType: 'updates',
      topic: 'Banking/Chase',
      senderDomain: 'chase.com',
      createdAt: new Date('2024-01-16'),
    },
  ];

  describe('Filter by Email Type', () => {
    it('should filter to show only updates emails', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { emailType: 'updates' });

      expect(result.every((u) => u.emailType === 'updates')).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should filter to show only promotional emails', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { emailType: 'promotional' });

      expect(result.every((u) => u.emailType === 'promotional')).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should filter to show only social emails', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { emailType: 'social' });

      expect(result.every((u) => u.emailType === 'social')).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should filter to show only regular emails', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { emailType: 'regular' });

      expect(result.every((u) => u.emailType === 'regular')).toBe(true);
      expect(result.length).toBe(1);
    });
  });

  describe('Filter by Topic', () => {
    it('should filter by exact topic path', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { topic: 'Banking/Chase' });

      expect(result.every((u) => u.topic === 'Banking/Chase')).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should filter by parent topic (all children)', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { topic: 'Banking' });

      expect(result.every((u) => u.topic?.startsWith('Banking'))).toBe(true);
    });

    it('should return empty array for non-existent topic', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { topic: 'NonExistent/Topic' });

      expect(result.length).toBe(0);
    });
  });

  describe('Filter by Sender Domain', () => {
    it('should filter by sender domain', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { senderDomain: 'chase.com' });

      expect(result.every((u) => u.senderDomain === 'chase.com')).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should be case-insensitive for domain', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { senderDomain: 'CHASE.COM' });

      expect(result.length).toBe(2);
    });
  });

  describe('Filter by Priority', () => {
    it('should filter to show only high priority', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { priority: 'high' });

      expect(result.every((u) => u.priority === 'high')).toBe(true);
      expect(result.length).toBe(1);
    });

    it('should filter to show only medium priority', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { priority: 'medium' });

      expect(result.every((u) => u.priority === 'medium')).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should filter to show only low priority', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, { priority: 'low' });

      expect(result.every((u) => u.priority === 'low')).toBe(true);
      expect(result.length).toBe(2);
    });
  });

  describe('Filter by Date Range', () => {
    it('should filter by start date only', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, {
        dateRange: { start: new Date('2024-01-18') },
      });

      expect(result.every((u) => u.createdAt >= new Date('2024-01-18'))).toBe(true);
    });

    it('should filter by end date only', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, {
        dateRange: { end: new Date('2024-01-18') },
      });

      expect(result.every((u) => u.createdAt <= new Date('2024-01-18'))).toBe(true);
    });

    it('should filter by date range (both start and end)', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, {
        dateRange: {
          start: new Date('2024-01-17'),
          end: new Date('2024-01-19'),
        },
      });

      expect(result.length).toBe(3); // 17, 18, 19
    });
  });

  describe('Combined Filters (AND Logic)', () => {
    it('should combine topic and priority filters', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, {
        topic: 'Banking/Chase',
        priority: 'medium',
      });

      expect(result.every((u) => u.topic === 'Banking/Chase' && u.priority === 'medium')).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should combine sender domain and date range', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, {
        senderDomain: 'chase.com',
        dateRange: { start: new Date('2024-01-16'), end: new Date('2024-01-17') },
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('5');
    });

    it('should combine email type and priority', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, {
        emailType: 'updates',
        priority: 'medium',
      });

      expect(result.length).toBe(2);
      expect(result.every((u) => u.emailType === 'updates')).toBe(true);
      expect(result.every((u) => u.priority === 'medium')).toBe(true);
    });

    it('should return empty when filters exclude all', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, {
        emailType: 'promotional',
        priority: 'high', // No promotional emails are high priority
      });

      expect(result.length).toBe(0);
    });

    it('should apply three filters together', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const result = filter.apply(updates, {
        emailType: 'updates',
        senderDomain: 'chase.com',
        dateRange: { start: new Date('2024-01-20') },
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });
  });

  describe('Gmail Link Generation', () => {
    it('should generate Gmail link for email', () => {
      const filter = new TimelineFilter();
      const update = createMockUpdates()[0];

      const gmailLink = filter.generateGmailLink(update);

      expect(gmailLink).toContain('mail.google.com');
      expect(gmailLink).toContain(update.emailId);
    });

    it('should generate Gmail link for thread', () => {
      const filter = new TimelineFilter();
      const update: TimelineUpdate = {
        id: '1',
        emailId: 'email-1',
        threadId: 'thread-123',
        title: 'Test',
        description: 'Test',
        priority: 'medium',
        createdAt: new Date(),
      };

      const gmailLink = filter.generateGmailLink(update);

      expect(gmailLink).toContain('mail.google.com');
      expect(gmailLink).toContain('thread-123');
    });
  });

  describe('Visual Grouping by Topic', () => {
    it('should group updates by topic', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const grouped = filter.groupByTopic(updates);

      expect(grouped['Banking/Chase'].length).toBe(2);
      expect(grouped['Shopping/Amazon'].length).toBe(1);
      expect(grouped['Projects/Client-ABC'].length).toBe(1);
    });

    it('should sort groups by most recent update', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const grouped = filter.groupByTopic(updates);
      const sortedTopics = Object.keys(grouped).sort((a, b) => {
        const aLatest = grouped[a].reduce(
          (max, u) => (u.createdAt > max ? u.createdAt : max),
          grouped[a][0].createdAt
        );
        const bLatest = grouped[b].reduce(
          (max, u) => (u.createdAt > max ? u.createdAt : max),
          grouped[b][0].createdAt
        );
        return bLatest.getTime() - aLatest.getTime();
      });

      expect(sortedTopics[0]).toBe('Banking/Chase'); // Has most recent (Jan 20)
    });

    it('should maintain chronological order within group', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const grouped = filter.groupByTopic(updates);
      const chaseUpdates = grouped['Banking/Chase'];

      expect(chaseUpdates[0].createdAt >= chaseUpdates[1].createdAt).toBe(true);
    });
  });

  describe('Sorting', () => {
    it('should sort updates chronologically by default (most recent first)', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const sorted = filter.sort(updates);

      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i].createdAt >= sorted[i + 1].createdAt).toBe(true);
      }
    });

    it('should sort updates oldest first when specified', () => {
      const filter = new TimelineFilter();
      const updates = createMockUpdates();

      const sorted = filter.sort(updates, { order: 'asc' });

      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i].createdAt <= sorted[i + 1].createdAt).toBe(true);
      }
    });
  });

  describe('Filter State Persistence', () => {
    it('should serialize filter state for URL', () => {
      const filter = new TimelineFilter();
      const filters = {
        emailType: 'updates',
        priority: 'high',
        topic: 'Banking/Chase',
      };

      const serialized = filter.serialize(filters);

      expect(serialized).toContain('emailType=updates');
      expect(serialized).toContain('priority=high');
      expect(serialized).toContain('topic=Banking%2FChase');
    });

    it('should deserialize filter state from URL', () => {
      const filter = new TimelineFilter();
      const queryString = 'emailType=updates&priority=high&topic=Banking%2FChase';

      const deserialized = filter.deserialize(queryString);

      expect(deserialized.emailType).toBe('updates');
      expect(deserialized.priority).toBe('high');
      expect(deserialized.topic).toBe('Banking/Chase');
    });

    it('should ignore invalid filter parameters', () => {
      const filter = new TimelineFilter();
      const queryString = 'emailType=invalid&priority=high&unknown=value';

      const deserialized = filter.deserialize(queryString);

      expect(deserialized.emailType).toBeUndefined();
      expect(deserialized.priority).toBe('high');
      expect(deserialized.unknown).toBeUndefined();
    });
  });
});
