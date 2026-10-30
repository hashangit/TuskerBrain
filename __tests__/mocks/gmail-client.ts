import type { GmailClient, ListMessagesOptions, ListMessagesResponse } from '@domain/sync/sync';

/**
 * Mock Gmail client for testing
 */
export class MockGmailClient implements GmailClient {
  private emails: Map<string, any> = new Map();
  private processedEmailIds: Set<string> = new Set();

  constructor() {
    this.emails = new Map();
  }

  /**
   * Seed emails for testing
   */
  seedEmails(emails: Array<{ id: string; subject?: string }>): void {
    this.emails.clear();
    emails.forEach((email) => {
      this.emails.set(email.id, {
        id: email.id,
        threadId: `thread-${email.id}`,
        payload: {
          headers: [
            { name: 'From', value: `sender@example.com` },
            { name: 'Subject', value: email.subject || 'Subject' },
          ],
        },
        snippet: 'Test email snippet',
        internalDate: Date.now().toString(),
      });
    });
  }

  async listMessages(options?: ListMessagesOptions): Promise<ListMessagesResponse> {
    let messages = Array.from(this.emails.values()).map((email) => ({
      id: email.id,
      threadId: `thread-${email.id}`,
    }));

    // Filter out already processed emails if specified
    if (options?.startHistoryId) {
      // In a real implementation, this would filter based on historyId
      // For tests, we just filter out processed emails
      messages = messages.filter((m) => !this.processedEmailIds.has(m.id));
    }

    const maxResults = options?.maxResults ?? 100;
    const limited = messages.slice(0, maxResults);

    return {
      messages: limited,
      nextPageToken: undefined,
      historyId: `history-${Date.now()}`,
    };
  }

  async getMessage(id: string): Promise<any> {
    return this.emails.get(id) || null;
  }

  async modifyMessage(messageId: string, modifications: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any> {
    return {};
  }

  async listLabels(): Promise<any> {
    return { labels: [] };
  }

  async createLabel(name: string): Promise<any> {
    return { id: `label-${name}`, name };
  }

  async getProfile(): Promise<{ emailAddress?: string; historyId?: string; messagesTotal?: number }> {
    return {
      emailAddress: 'test@example.com',
      historyId: 'initial-history-123',
      messagesTotal: this.emails.size,
    };
  }

  /**
   * Mark emails as processed (for filtering tests)
   */
  markProcessed(emailIds: string[]): void {
    emailIds.forEach((id) => this.processedEmailIds.add(id));
  }
}
