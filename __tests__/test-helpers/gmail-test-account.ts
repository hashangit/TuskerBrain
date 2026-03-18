/**
 * GmailTestAccount - Test helper for Gmail integration tests
 *
 * Provides a mock or real Gmail account for testing.
 */

interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  category?: 'primary' | 'promotions' | 'social' | 'updates';
  sender?: string;
  senderName?: string;
  date?: string | Date;
  isRead?: boolean;
  isImportant?: boolean;
}

interface Email {
  id: string;
  threadId: string;
  subject: string;
  body: string;
  sender: string;
  senderName?: string;
  category?: string;
  receivedAt: Date;
  isRead: boolean;
  isImportant: boolean;
  labels: string[];
}

interface InboxStats {
  total: number;
  unreadCount: number;
}

// Global registry for mock accounts
const mockRegistry = new Map<string, GmailTestAccount>();

export class GmailTestAccount {
  private emails: Map<string, Email> = new Map();
  private emailAddress: string = 'test@gmail.com';
  private _credentials: { accessToken: string; refreshToken: string } | null = null;
  private isRateLimited: boolean = false;
  private isNetworkDown: boolean = false;
  private isTemporaryOutage: boolean = false;

  private constructor() {}

  static async connect(): Promise<GmailTestAccount> {
    const account = new GmailTestAccount();
    // Register in global mock registry
    mockRegistry.set(account.emailAddress, account);
    return account;
  }

  static getMockByEmail(email: string): GmailTestAccount | undefined {
    return mockRegistry.get(email);
  }

  async disconnect(): Promise<void> {
    this.emails.clear();
  }

  get credentials(): { accessToken: string; refreshToken: string; emailAddress: string } {
    return {
      accessToken: this._credentials?.accessToken || 'mock-access-token',
      refreshToken: this._credentials?.refreshToken || 'mock-refresh-token',
      emailAddress: this.emailAddress,
    };
  }

  // ===== Email Operations =====

  async sendEmail(options: EmailOptions): Promise<Email> {
    if (this.isRateLimited) {
      throw new Error('Rate limit exceeded');
    }

    if (this.isNetworkDown) {
      throw new Error('Network error');
    }

    const email: Email = {
      id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      threadId: `thread-${Date.now()}`,
      subject: options.subject,
      body: options.body,
      sender: options.sender || 'sender@test.com',
      senderName: options.senderName,
      category: options.category,
      receivedAt: new Date(options.date || Date.now()),
      isRead: options.isRead ?? false,
      isImportant: options.isImportant ?? false,
      labels: ['INBOX'], // All new emails start in inbox
    };

    this.emails.set(email.id, email);
    return email;
  }

  async getEmail(id: string): Promise<Email | null> {
    return this.emails.get(id) || null;
  }

  async deleteEmail(id: string): Promise<void> {
    this.emails.delete(id);
  }

  async archiveEmail(id: string): Promise<void> {
    const email = this.emails.get(id);
    if (email) {
      email.labels = email.labels.filter(l => l !== 'INBOX');
    }
  }

  async modifyEmail(id: string, modifications: Partial<Email>): Promise<void> {
    const email = this.emails.get(id);
    if (email) {
      Object.assign(email, modifications);
    }
  }

  // ===== Inbox Operations =====

  async seedInbox(options: { count: number; mix?: boolean }): Promise<void> {
    const categories = ['primary', 'promotions', 'social', 'updates'] as const;

    for (let i = 0; i < options.count; i++) {
      const category = options.mix
        ? categories[i % categories.length]
        : 'primary';

      await this.sendEmail({
        to: 'me@test.com',
        subject: `Test Email ${i}`,
        body: `This is test email number ${i}`,
        category,
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // Spread over days
      });
    }
  }

  async seedInboxWithMixedEmails(options: { count: number }): Promise<void> {
    await this.seedInbox({ ...options, mix: true });
  }

  async seedEmail(options: EmailOptions & { simulatedExpiry?: Date }): Promise<Email> {
    return this.sendEmail(options);
  }

  async getInboxCount(): Promise<number> {
    return Array.from(this.emails.values()).filter(
      e => e.labels.includes('INBOX')
    ).length;
  }

  async getInboxStats(): Promise<InboxStats> {
    const emails = Array.from(this.emails.values());
    const inboxEmails = emails.filter(e => e.labels.includes('INBOX'));
    return {
      total: emails.length,
      unreadCount: inboxEmails.filter(e => !e.isRead).length,
    };
  }

  // ===== Labels =====

  async getLabelsForEmail(emailId: string): Promise<string[]> {
    const email = this.emails.get(emailId);
    return email?.labels || [];
  }

  async addLabelToEmail(emailId: string, label: string): Promise<void> {
    const email = this.emails.get(emailId);
    if (email && !email.labels.includes(label)) {
      email.labels.push(label);
    }
  }

  // ===== Simulation =====

  simulateRateLimit(): void {
    this.isRateLimited = true;
  }

  simulateNetworkFailure(): void {
    this.isNetworkDown = true;
  }

  simulateNetworkInterruption(): void {
    this.isNetworkDown = true;
  }

  simulateTemporaryOutage(): void {
    this.isTemporaryOutage = true;
  }

  simulateNetworkError(): void {
    this.isNetworkDown = true;
  }

  simulateLabelCreationFailure(): void {
    // Simulate Gmail API label creation failure
    this.isTemporaryOutage = true;
  }

  invalidateRefreshToken(): void {
    // Simulate token revocation
    this._credentials = null;
  }

  setTokenExpiry(expired: boolean): void {
    // Simulate token expiry state
    if (expired) {
      this._credentials = null;
    }
  }

  recoverNetwork(): void {
    this.isNetworkDown = false;
    this.isTemporaryOutage = false;
  }

  // ===== Clear =====

  clearAll(): void {
    this.emails.clear();
    this.isRateLimited = false;
    this.isNetworkDown = false;
    this.isTemporaryOutage = false;
  }
}
