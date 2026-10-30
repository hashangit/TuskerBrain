import type { Email } from '@foundations/types/email';

export interface SummaryResult {
  summary: string;
  wordCount: number;
  paragraphCount: number;
  paragraphs: string[];
  updateCount: number;
  lastEmailId?: string;
}

export class SummaryGenerator {
  private readonly MAX_WORDS = 500;
  private readonly MIN_PARAGRAPHS = 3;
  private readonly MAX_PARAGRAPHS = 4;

  /**
   * Generates a rolling summary for a topic based on emails.
   */
  async generateTopicSummary(
    topicPath: string,
    emails: Email[],
    existingSummary?: string
  ): Promise<SummaryResult> {
    if (emails.length === 0) {
      return this.createEmptySummary();
    }

    // Sort emails by date (newest first)
    const sortedEmails = [...emails].sort(
      (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()
    );

    // Extract topic name from path
    const topicName = topicPath.split('/').pop() || topicPath;

    // Build summary sections
    const sections = this.buildSummarySections(sortedEmails, topicName, existingSummary);

    // Combine into paragraphs
    const paragraphs = this.combineIntoParagraphs(sections, sortedEmails.length);

    // Ensure word limit
    const trimmedParagraphs = this.enforceWordLimit(paragraphs);

    // Final result
    const summary = trimmedParagraphs.join('\n\n');

    return {
      summary,
      wordCount: this.countWords(summary),
      paragraphCount: trimmedParagraphs.length,
      paragraphs: trimmedParagraphs,
      updateCount: emails.length,
      lastEmailId: sortedEmails[0]?.id,
    };
  }

  /**
   * Generates a summary for a sender domain.
   */
  async generateSenderSummary(
    senderDomain: string,
    emails: Email[],
    existingSummary?: string
  ): Promise<SummaryResult> {
    if (emails.length === 0) {
      return this.createEmptySummary();
    }

    // Sort emails by date (newest first)
    const sortedEmails = [...emails].sort(
      (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime()
    );

    // Extract sender name from first email
    const senderName = sortedEmails[0].senderName || senderDomain;

    // Build summary sections
    const sections = this.buildSummarySections(sortedEmails, senderName, existingSummary);

    // Combine into paragraphs
    const paragraphs = this.combineIntoParagraphs(sections, sortedEmails.length);

    // Ensure word limit
    const trimmedParagraphs = this.enforceWordLimit(paragraphs);

    // Final result
    const summary = trimmedParagraphs.join('\n\n');

    return {
      summary,
      wordCount: this.countWords(summary),
      paragraphCount: trimmedParagraphs.length,
      paragraphs: trimmedParagraphs,
      updateCount: emails.length,
      lastEmailId: sortedEmails[0]?.id,
    };
  }

  private createEmptySummary(): SummaryResult {
    return {
      summary: '',
      wordCount: 0,
      paragraphCount: 0,
      paragraphs: [],
      updateCount: 0,
    };
  }

  private buildSummarySections(
    emails: Email[],
    topicName: string,
    existingSummary?: string
  ): {
    overview: string;
    recentUpdates: string[];
    keyThemes: string[];
    olderContext: string[];
  } {
    const overview = this.generateOverview(topicName, emails);
    const recentUpdates = this.extractRecentUpdates(emails.slice(0, 5));
    const keyThemes = this.extractKeyThemes(emails);
    const olderContext = existingSummary
      ? this.extractOlderContext(existingSummary)
      : this.extractOlderContextFromEmails(emails.slice(5));

    return { overview, recentUpdates, keyThemes, olderContext };
  }

  private generateOverview(topicName: string, emails: Email[]): string {
    const totalEmails = emails.length;
    const dateRange = this.getDateRange(emails);

    // Get unique senders
    const uniqueSenders = [...new Set(emails.map((e) => e.senderName || e.senderDomain))];

    // Get common subject patterns

    const activityLevel = this.determineActivityLevel(emails);

    let overview = `${topicName} has received ${totalEmails} email${totalEmails > 1 ? 's' : ''} ${dateRange}. `;

    if (uniqueSenders.length <= 3) {
      overview += `Primary contact${uniqueSenders.length > 1 ? 's' : ''}: ${uniqueSenders.slice(0, 3).join(', ')}. `;
    }

    overview += `${activityLevel}.`;

    return overview;
  }

  private extractRecentUpdates(emails: Email[]): string[] {
    return emails.map((email) => {
      const subject = email.subject || 'Update';
      const snippet = (email.snippet || '').substring(0, 100);
      const date = this.formatDate(email.receivedAt);

      return `${subject} (${date}): ${snippet}`;
    });
  }

  private extractKeyThemes(emails: Email[]): string[] {
    const themes: Map<string, number> = new Map();

    // Common patterns to look for
    const patterns = [
      { pattern: /statement|balance|payment/i, theme: 'Financial updates' },
      { pattern: /order|shipping|delivery/i, theme: 'Orders and deliveries' },
      { pattern: /meeting|schedule|calendar/i, theme: 'Meetings and scheduling' },
      { pattern: /project|milestone|deadline/i, theme: 'Project updates' },
      { pattern: /offer|deal|discount|sale/i, theme: 'Promotions' },
      { pattern: /security|alert|warning/i, theme: 'Security alerts' },
      { pattern: /newsletter|update|news/i, theme: 'News and updates' },
    ];

    for (const email of emails) {
      const content = `${email.subject} ${email.snippet}`.toLowerCase();

      for (const { pattern, theme } of patterns) {
        if (pattern.test(content)) {
          themes.set(theme, (themes.get(theme) || 0) + 1);
        }
      }
    }

    // Return top themes
    return [...themes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([theme]) => theme);
  }

  private extractOlderContext(existingSummary: string): string[] {
    // Extract key points from existing summary
    const sentences = existingSummary.split(/[.!?]+/).filter((s) => s.trim().length > 20);

    // Return last 2-3 sentences as context
    return sentences.slice(-3).map((s) => s.trim());
  }

  private extractOlderContextFromEmails(emails: Email[]): string[] {
    if (emails.length === 0) return [];

    // Summarize older emails more briefly
    const olderCount = emails.length;
    const dateRange = this.getDateRange(emails);

    return [`Earlier activity (${dateRange}) includes ${olderCount} additional email${olderCount > 1 ? 's' : ''}.`];
  }

  private combineIntoParagraphs(
    sections: {
      overview: string;
      recentUpdates: string[];
      keyThemes: string[];
      olderContext: string[];
    },
    emailCount: number
  ): string[] {
    const paragraphs: string[] = [];

    // Paragraph 1: Overview (always first)
    paragraphs.push(sections.overview);

    // Paragraph 2: Key themes and patterns
    if (sections.keyThemes.length > 0) {
      paragraphs.push(
        `Common themes include: ${sections.keyThemes.join(', ')}.`
      );
    } else {
      // Default paragraph if no themes detected
      paragraphs.push(
        `This topic has accumulated ${emailCount} email${emailCount > 1 ? 's' : ''} over time.`
      );
    }

    // Paragraph 3: Recent updates
    if (sections.recentUpdates.length > 0) {
      const recentText = sections.recentUpdates
        .slice(0, 3)
        .map((u) => u.split(':')[0]) // Just subjects
        .join('; ');
      paragraphs.push(`Recent activity: ${recentText}.`);
    } else {
      // Default paragraph if no recent updates
      paragraphs.push(`No recent updates available for this topic.`);
    }

    // Paragraph 4: Older context (optional)
    if (sections.olderContext.length > 0) {
      paragraphs.push(sections.olderContext.join(' '));
    }

    return paragraphs;
  }

  private enforceWordLimit(paragraphs: string[]): string[] {
    let totalWords = 0;
    const result: string[] = [];

    for (const paragraph of paragraphs) {
      const words = this.countWords(paragraph);

      if (totalWords + words <= this.MAX_WORDS) {
        result.push(paragraph);
        totalWords += words;
      } else {
        // Truncate this paragraph to fit
        const remainingWords = this.MAX_WORDS - totalWords;
        if (remainingWords > 20) {
          const truncated = this.truncateToWords(paragraph, remainingWords);
          result.push(truncated);
        }
        break;
      }
    }

    // Ensure minimum paragraphs (always at least 3)
    while (result.length < this.MIN_PARAGRAPHS) {
      result.push('No additional details available.');
    }

    // Ensure maximum paragraphs
    return result.slice(0, this.MAX_PARAGRAPHS);
  }

  private truncateToWords(text: string, maxWords: number): string {
    const words = text.split(/\s+/);
    if (words.length <= maxWords) return text;

    const truncated = words.slice(0, maxWords - 1).join(' ');
    return `${truncated}...`;
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }

  private getDateRange(emails: Email[]): string {
    if (emails.length === 0) return '';

    const newest = emails[0].receivedAt;
    const oldest = emails[emails.length - 1].receivedAt;

    const newestDate = this.formatDate(newest);
    const oldestDate = this.formatDate(oldest);

    if (newestDate === oldestDate) {
      return `on ${newestDate}`;
    }

    return `from ${oldestDate} to ${newestDate}`;
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }

  private determineActivityLevel(emails: Email[]): string {
    if (emails.length === 0) return 'No activity';

    const now = new Date();
    const newestEmail = emails[0].receivedAt;
    const diffMs = now.getTime() - newestEmail.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 1) return 'Activity level: High (recent emails)';
    if (diffDays <= 7) return 'Activity level: Moderate (this week)';
    if (diffDays <= 30) return 'Activity level: Low (this month)';

    return 'Activity level: Inactive (no recent emails)';
  }
}
