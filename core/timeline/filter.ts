import type { TimelineUpdate, TimelineFilterOptions, Priority } from '@core/types/timeline';

/**
 * Timeline filtering and sorting utility.
 */
export class TimelineFilter {
  /**
   * Apply filters to a list of timeline updates.
   */
  apply(updates: TimelineUpdate[], options: TimelineFilterOptions): TimelineUpdate[] {
    let result = [...updates];

    // Filter by email type
    if (options.emailType) {
      result = result.filter((u) => u.emailType === options.emailType);
    }

    // Filter by topic (supports parent topic matching)
    if (options.topic) {
      result = result.filter((u) => {
        if (!u.topic) return false;
        // Match exact or parent topic
        return u.topic === options.topic || u.topic.startsWith(options.topic + '/');
      });
    }

    // Filter by sender domain (case-insensitive)
    if (options.senderDomain) {
      const domain = options.senderDomain.toLowerCase();
      result = result.filter((u) => 
        u.senderDomain?.toLowerCase() === domain
      );
    }

    // Filter by priority
    if (options.priority) {
      result = result.filter((u) => u.priority === options.priority);
    }

    // Filter by date range
    if (options.dateRange) {
      if (options.dateRange.start) {
        result = result.filter((u) => u.createdAt >= options.dateRange.start!);
      }
      if (options.dateRange.end) {
        result = result.filter((u) => u.createdAt <= options.dateRange.end!);
      }
    }

    return result;
  }

  /**
   * Sort updates chronologically.
   */
  sort(updates: TimelineUpdate[], options?: { order: 'asc' | 'desc' }): TimelineUpdate[] {
    const order = options?.order ?? 'desc';
    return [...updates].sort((a, b) => {
      const diff = a.createdAt.getTime() - b.createdAt.getTime();
      return order === 'asc' ? diff : -diff;
    });
  }

  /**
   * Group updates by topic.
   */
  groupByTopic(updates: TimelineUpdate[]): Record<string, TimelineUpdate[]> {
    const groups: Record<string, TimelineUpdate[]> = {};

    for (const update of updates) {
      const topic = update.topic || 'Uncategorized';
      if (!groups[topic]) {
        groups[topic] = [];
      }
      groups[topic].push(update);
    }

    // Sort each group chronologically (most recent first)
    for (const topic of Object.keys(groups)) {
      groups[topic].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    return groups;
  }

  /**
   * Generate Gmail link for an update.
   */
  generateGmailLink(update: TimelineUpdate): string {
    const baseUrl = 'https://mail.google.com/mail/u/0/';
    if (update.threadId) {
      return `${baseUrl}#inbox/${update.threadId}`;
    }
    return `${baseUrl}#inbox/${update.emailId}`;
  }

  /**
   * Serialize filter state for URL.
   */
  serialize(filters: TimelineFilterOptions): string {
    const params = new URLSearchParams();

    if (filters.emailType) {
      params.set('emailType', filters.emailType);
    }
    if (filters.priority) {
      params.set('priority', filters.priority);
    }
    if (filters.topic) {
      params.set('topic', filters.topic);
    }
    if (filters.senderDomain) {
      params.set('senderDomain', filters.senderDomain);
    }

    return params.toString();
  }

  /**
   * Deserialize filter state from URL.
   */
  deserialize(queryString: string): TimelineFilterOptions {
    const params = new URLSearchParams(queryString);
    const validEmailTypes = ['regular', 'updates', 'social', 'promotional'];
    const validPriorities: Priority[] = ['high', 'medium', 'low'];

    const filters: TimelineFilterOptions = {};

    const emailType = params.get('emailType');
    if (emailType && validEmailTypes.includes(emailType)) {
      filters.emailType = emailType;
    }

    const priority = params.get('priority') as Priority;
    if (priority && validPriorities.includes(priority)) {
      filters.priority = priority;
    }

    const topic = params.get('topic');
    if (topic) {
      filters.topic = decodeURIComponent(topic);
    }

    const senderDomain = params.get('senderDomain');
    if (senderDomain) {
      filters.senderDomain = senderDomain;
    }

    return filters;
  }
}
