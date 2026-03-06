import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TuskerBrainApp } from '@test-helpers/app';
import { GmailTestAccount } from '@test-helpers/gmail-test-account';

/**
 * Feature: Timeline
 *
 * Design Spec Reference: Lines 116-123, 879-915
 *
 * As a user, I want to see a chronological feed of my processed emails,
 * with the ability to filter by type, topic, sender, priority, and date range,
 * so I can quickly find and review important information.
 */
describe('Feature: Timeline', () => {
  let app: TuskerBrainApp;
  let gmail: GmailTestAccount;

  beforeAll(async () => {
    app = await TuskerBrainApp.launch();
    gmail = await GmailTestAccount.connect();
    await app.connectGmail(gmail.credentials);
    await app.seedTimelineWithTestData();
  });

  afterAll(async () => {
    await app.shutdown();
    await gmail.disconnect();
  });

  describe('Viewing the Timeline', () => {
    it('User sees updates displayed chronologically (most recent first)', async () => {
      // Given: User has processed emails from different dates
      // When: User opens the timeline
      const timeline = await app.getTimeline();

      // Then: Updates are sorted by date (newest first)
      for (let i = 0; i < timeline.length - 1; i++) {
        expect(timeline[i].receivedAt >= timeline[i + 1].receivedAt).toBe(true);
      }
    });

    it('User sees empty state message when no updates exist', async () => {
      // Given: User has no processed emails
      await app.clearTimeline();

      // When: User opens the timeline
      const timeline = await app.getTimeline();

      // Then: User sees helpful empty state message
      expect(timeline.isEmpty).toBe(true);
      expect(timeline.emptyMessage).toMatch(/no updates|get started/i);
    });

    it('User sees visual grouping of updates by topic', async () => {
      // Given: User has multiple emails in the same topic
      // When: User views the timeline
      const timeline = await app.getTimeline();

      // Then: Updates are visually grouped by topic
      const bankingGroup = timeline.getGroupedByTopic('Banking/Chase');
      expect(bankingGroup.updates.length).toBeGreaterThan(1);
      expect(bankingGroup.isVisuallyGrouped).toBe(true);
    });

    it('User can click an update to open the original email in Gmail', async () => {
      // Given: User sees an update in the timeline
      const update = await app.getFirstTimelineUpdate();

      // When: User clicks "View in Gmail"
      const gmailLink = update.gmailLink;

      // Then: Link opens the correct Gmail thread
      expect(gmailLink).toContain('mail.google.com');
      expect(gmailLink).toContain(update.threadId);
    });
  });

  describe('Filtering by Email Type', () => {
    it('User can filter to show only regular emails', async () => {
      // When: User selects "Regular" filter
      await app.setTimelineFilter({ emailType: 'regular' });
      const timeline = await app.getTimeline();

      // Then: Only regular emails are shown
      expect(timeline.updates.every(u => u.emailType === 'regular')).toBe(true);
    });

    it('User can filter to show only updates', async () => {
      // When: User selects "Updates" filter
      await app.setTimelineFilter({ emailType: 'updates' });
      const timeline = await app.getTimeline();

      // Then: Only update-type emails are shown
      expect(timeline.updates.every(u => u.emailType === 'updates')).toBe(true);
    });

    it('User can filter to show only deals/promotional', async () => {
      // When: User selects "Deals" filter
      await app.setTimelineFilter({ emailType: 'promotional' });
      const timeline = await app.getTimeline();

      // Then: Only promotional emails with deals are shown
      expect(timeline.updates.every(u => u.emailType === 'promotional')).toBe(true);
    });

    it('User can filter to show only social emails', async () => {
      // When: User selects "Social" filter
      await app.setTimelineFilter({ emailType: 'social' });
      const timeline = await app.getTimeline();

      // Then: Only social emails are shown
      expect(timeline.updates.every(u => u.emailType === 'social')).toBe(true);
    });
  });

  describe('Filtering by Topic', () => {
    it('User can filter to show emails from a specific topic', async () => {
      // When: User selects "Banking/Chase" topic filter
      await app.setTimelineFilter({ topic: 'Banking/Chase' });
      const timeline = await app.getTimeline();

      // Then: Only emails from that topic are shown
      expect(timeline.updates.every(u => u.topic === 'Banking/Chase')).toBe(true);
    });

    it('User can filter to show all emails under a parent topic', async () => {
      // When: User selects "Banking" parent topic filter
      await app.setTimelineFilter({ topic: 'Banking' });
      const timeline = await app.getTimeline();

      // Then: All emails under Banking (any child) are shown
      expect(timeline.updates.every(u => u.topic.startsWith('Banking/'))).toBe(true);
    });

    it('User sees available topics in filter dropdown', async () => {
      // When: User opens topic filter
      const availableTopics = await app.getAvailableTopicFilters();

      // Then: All existing topics are listed
      expect(availableTopics).toContain('Banking/Chase');
      expect(availableTopics).toContain('Education/Udemy');
      expect(availableTopics).toContain('Projects/Client-ABC');
    });
  });

  describe('Filtering by Sender Domain', () => {
    it('User can filter to show emails from a specific sender domain', async () => {
      // When: User filters by sender "chase.com"
      await app.setTimelineFilter({ senderDomain: 'chase.com' });
      const timeline = await app.getTimeline();

      // Then: Only emails from chase.com are shown
      expect(timeline.updates.every(u => u.senderDomain === 'chase.com')).toBe(true);
    });
  });

  describe('Filtering by Priority', () => {
    it('User can filter to show only high-priority items', async () => {
      // When: User selects "High Priority" filter
      await app.setTimelineFilter({ priority: 'high' });
      const timeline = await app.getTimeline();

      // Then: Only high-priority updates are shown
      expect(timeline.updates.every(u => u.priority === 'high')).toBe(true);
    });

    it('User can filter to show only medium-priority items', async () => {
      // When: User selects "Medium Priority" filter
      await app.setTimelineFilter({ priority: 'medium' });
      const timeline = await app.getTimeline();

      // Then: Only medium-priority updates are shown
      expect(timeline.updates.every(u => u.priority === 'medium')).toBe(true);
    });

    it('User can filter to show only low-priority items', async () => {
      // When: User selects "Low Priority" filter
      await app.setTimelineFilter({ priority: 'low' });
      const timeline = await app.getTimeline();

      // Then: Only low-priority updates are shown
      expect(timeline.updates.every(u => u.priority === 'low')).toBe(true);
    });
  });

  describe('Filtering by Date Range', () => {
    it('User can filter to show emails from a specific date range', async () => {
      // When: User sets date range Jan 1-31, 2024
      await app.setTimelineFilter({
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31'),
        },
      });
      const timeline = await app.getTimeline();

      // Then: Only emails from that range are shown
      timeline.updates.forEach(update => {
        expect(update.receivedAt >= new Date('2024-01-01')).toBe(true);
        expect(update.receivedAt <= new Date('2024-01-31')).toBe(true);
      });
    });

    it('User can filter to show emails from last 7 days', async () => {
      // When: User selects "Last 7 days" quick filter
      await app.setTimelineFilter({ preset: 'last7days' });
      const timeline = await app.getTimeline();

      // Then: Only emails from last 7 days are shown
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      timeline.updates.forEach(update => {
        expect(update.receivedAt >= sevenDaysAgo).toBe(true);
      });
    });
  });

  describe('Combining Multiple Filters (AND Logic)', () => {
    it('User can combine topic and priority filters', async () => {
      // When: User filters by topic "Banking/Chase" AND priority "high"
      await app.setTimelineFilter({
        topic: 'Banking/Chase',
        priority: 'high',
      });
      const timeline = await app.getTimeline();

      // Then: Only emails matching BOTH criteria are shown
      timeline.updates.forEach(update => {
        expect(update.topic).toBe('Banking/Chase');
        expect(update.priority).toBe('high');
      });
    });

    it('User can combine email type and date range filters', async () => {
      // When: User filters by type "updates" AND date range
      await app.setTimelineFilter({
        emailType: 'updates',
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31'),
        },
      });
      const timeline = await app.getTimeline();

      // Then: Only updates from that date range are shown
      timeline.updates.forEach(update => {
        expect(update.emailType).toBe('updates');
        expect(update.receivedAt >= new Date('2024-01-01')).toBe(true);
        expect(update.receivedAt <= new Date('2024-01-31')).toBe(true);
      });
    });

    it('User can combine sender domain and priority filters', async () => {
      // When: User filters by sender "chase.com" AND priority "high"
      await app.setTimelineFilter({
        senderDomain: 'chase.com',
        priority: 'high',
      });
      const timeline = await app.getTimeline();

      // Then: Only high-priority emails from chase.com are shown
      timeline.updates.forEach(update => {
        expect(update.senderDomain).toBe('chase.com');
        expect(update.priority).toBe('high');
      });
    });

    it('User sees "No results" when filters exclude all emails', async () => {
      // When: User applies filters that match nothing
      await app.setTimelineFilter({
        topic: 'NonExistent/Topic',
        priority: 'high',
      });
      const timeline = await app.getTimeline();

      // Then: User sees "No results" message
      expect(timeline.isEmpty).toBe(true);
      expect(timeline.emptyMessage).toMatch(/no results|try adjusting/i);
    });
  });

  describe('Filter Persistence', () => {
    it('User sees their filters preserved when navigating away and back', async () => {
      // Given: User has set filters
      await app.setTimelineFilter({
        topic: 'Banking/Chase',
        priority: 'high',
      });

      // When: User navigates to Settings and back
      await app.navigateTo('settings');
      await app.navigateTo('timeline');

      // Then: Filters are still applied
      const activeFilters = await app.getActiveFilters();
      expect(activeFilters.topic).toBe('Banking/Chase');
      expect(activeFilters.priority).toBe('high');
    });

    it('User can clear all filters with one click', async () => {
      // Given: User has multiple filters applied
      await app.setTimelineFilter({
        topic: 'Banking/Chase',
        priority: 'high',
        emailType: 'updates',
      });

      // When: User clicks "Clear all filters"
      await app.clearAllFilters();

      // Then: All filters are removed
      const activeFilters = await app.getActiveFilters();
      expect(activeFilters).toEqual({});
    });
  });

  describe('Search within Timeline', () => {
    it('User can search for text within timeline updates', async () => {
      // When: User searches for "statement"
      await app.searchTimeline('statement');
      const results = await app.getTimeline();

      // Then: Only updates containing "statement" are shown
      results.updates.forEach(update => {
        const content = `${update.title} ${update.description}`.toLowerCase();
        expect(content).toContain('statement');
      });
    });
  });
});
