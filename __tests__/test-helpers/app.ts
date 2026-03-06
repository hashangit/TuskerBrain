/**
 * TuskerBrainApp - High-level test helper for feature tests
 *
 * This provides a user-perspective API for testing the application.
 * It abstracts away implementation details and focuses on user actions.
 *
 * NOTE: This is a mock implementation for testing. It simulates the app behavior
 * without requiring actual database or Gmail connections.
 */

interface LaunchOptions {
  freshInstall?: boolean;
}

interface GmailCredentials {
  accessToken: string;
  refreshToken: string;
  emailAddress?: string;
}

interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'google';
  apiKey: string;
}

interface SyncProgress {
  status: 'idle' | 'running' | 'paused' | 'synced' | 'error';
  currentDay: number;
  totalDays: number;
  processedCount: number;
  totalTokensUsed: number;
}

interface JobStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
}

interface TimelineUpdate {
  id: string;
  emailId: string;
  threadId?: string;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  emailType: 'regular' | 'updates' | 'social' | 'promotional';
  topic?: string;
  senderDomain?: string;
  receivedAt: Date;
  gmailLink?: string;
  actionItem?: boolean;
  actionItemTitle?: string;
}

interface Deal {
  id: string;
  emailId: string;
  title: string;
  brand: string;
  promoCode?: string;
  minimumPurchase?: string;
  link?: string;
  expiryDate?: string;
  isActive: boolean;
  isExpiringSoon?: boolean;
  isUsed?: boolean;
  category?: string;
  canCopyCode?: boolean;
  markAsUsed?: () => void;
  dismiss?: () => void;
  viewOriginalEmail?: () => void;
}

interface Topic {
  id: string;
  name: string;
  parent?: string;
  fullPath: string;
  emailCount: number;
}

interface TopicSummary {
  topic: string;
  content: string;
  paragraphs: string[];
  updateCount: number;
  emailCount: number;
  lastUpdatedAt: Date;
  lastEmailId?: string;
  viewAllEmails?: () => void;
}

interface SenderSummary {
  senderDomain: string;
  content: string;
  paragraphs: string[];
  updateCount: number;
  emailCount: number;
  lastUpdatedAt: Date;
  lastEmailId?: string;
  topics?: string[];
  viewAllEmails?: () => void;
}

interface Notification {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}

// Mock JobQueue for testing
class MockJobQueue {
  private jobs: Map<string, any> = new Map();
  private paused: boolean = false;

  async createJob(job: any): Promise<any> {
    const id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const createdJob = {
      id,
      ...job,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
    };
    this.jobs.set(id, createdJob);
    return createdJob;
  }

  async getNextJob(): Promise<any> {
    for (const [id, job] of this.jobs) {
      if (job.status === 'pending') {
        return job;
      }
    }
    return null;
  }

  async getJob(id: string): Promise<any> {
    return this.jobs.get(id);
  }

  async updateJobStatus(id: string, status: string, options?: any): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.status = status;
      if (status === 'running') {
        job.startedAt = new Date();
      }
      if (status === 'completed' || status === 'failed') {
        job.completedAt = new Date();
      }
      if (options?.error) {
        job.error = options.error;
      }
      if (options?.result) {
        job.result = options.result;
      }
    }
  }

  async scheduleRetry(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      job.retryCount++;
      job.status = job.retryCount >= (job.maxRetries || 3) ? 'dead' : 'pending';
      job.scheduledAt = new Date(Date.now() + 60000 * Math.pow(2, job.retryCount - 1));
    }
  }

  async getStats(): Promise<JobStats> {
    const stats = { pending: 0, running: 0, completed: 0, failed: 0, dead: 0 };
    for (const job of this.jobs.values()) {
      if (job.status in stats) {
        stats[job.status as keyof JobStats]++;
      }
    }
    return stats;
  }

  async pauseProcessing(): Promise<void> {
    this.paused = true;
  }

  async resumeProcessing(): Promise<void> {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  async getAuditLogForJob(id: string): Promise<any[]> {
    // Return mock audit entries
    return [{ action: 'started' }, { action: 'completed' }];
  }

  async logTokenUsage(id: string, usage: { inputTokens: number; outputTokens: number }): Promise<void> {
    // Store token usage
    const job = this.jobs.get(id);
    if (job) {
      job.tokensUsed = (usage.inputTokens || 0) + (usage.outputTokens || 1);
    }
  }

  async close(): Promise<void> {
    this.jobs.clear();
  }
}

export class TuskerBrainApp {
  private jobQueue: MockJobQueue;
  private currentScreen: string = 'timeline';
  private activeFilters: Record<string, unknown> = {};
  private notifications: Notification[] = [];
  private syncState: SyncProgress = {
    status: 'idle',
    currentDay: 0,
    totalDays: 0,
    processedCount: 0,
    totalTokensUsed: 0,
  };
  private paused: boolean = false;
  private settings: Record<string, unknown> = {};
  private emails: Map<string, any> = new Map();
  private deals: Map<string, any> = new Map();
  private topicSummaries: Map<string, any> = new Map();
  private topics: Map<string, Topic> = new Map();
  private senderSummaries: Map<string, SenderSummary> = new Map();
  private gmailLabels: string[] = ['TuskerBrain/Processed'];

  private constructor() {
    this.jobQueue = new MockJobQueue();
  }

  static async launch(options: LaunchOptions = {}): Promise<TuskerBrainApp> {
    const app = new TuskerBrainApp();

    if (options.freshInstall) {
      await app.clearAllData();
    }

    return app;
  }

  async shutdown(): Promise<void> {
    await this.jobQueue.close();
  }

  // ===== Data Management =====

  async clearAllData(): Promise<void> {
    this.syncState = {
      status: 'idle',
      currentDay: 0,
      totalDays: 0,
      processedCount: 0,
      totalTokensUsed: 0,
    };
    this.activeFilters = {};
    this.notifications = [];
    this.paused = false;
    this.settings = {};
    this.emails.clear();
    this.deals.clear();
    this.topicSummaries.clear();
    this.topics.clear();
    this.senderSummaries.clear();
  }

  // ===== Gmail Connection =====

  async connectGmail(credentials: GmailCredentials | { mock: boolean }): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  // ===== LLM Configuration =====

  async configureLLM(config: LLMConfig): Promise<void> {
    this.settings['llmProvider'] = config.provider;
    this.settings['llmApiKey'] = config.apiKey;
  }

  // ===== Settings =====

  async configureLookbackDays(days: number): Promise<void> {
    this.settings['lookbackDays'] = days;
  }

  async configureSyncInterval(minutes: number): Promise<void> {
    this.settings['syncInterval'] = minutes;
  }

  async configurePreferences(preferences: { lookbackDays: number; syncInterval: number }): Promise<void> {
    this.settings['lookbackDays'] = preferences.lookbackDays;
    this.settings['syncInterval'] = preferences.syncInterval;
  }

  async getSettings(): Promise<Record<string, unknown>> {
    return { ...this.settings };
  }

  // ===== Email Processing =====

  async processEmail(emailData: any): Promise<void> {
    const email = {
      ...emailData,
      processedAt: new Date(),
    };
    this.emails.set(emailData.id, email);
    this.syncState.processedCount++;
    this.syncState.totalTokensUsed += 500;

    // Update topics if email has topic
    if (emailData.topic) {
      this.updateTopicFromEmail(emailData);
    }

    // Update sender summary
    if (emailData.senderDomain) {
      this.updateSenderSummaryFromEmail(emailData);
    }
  }

  private updateTopicFromEmail(emailData: any): void {
    const topicPath = emailData.topic;
    const [parent, child] = topicPath.split('/');

    // Add or update topic
    if (!this.topics.has(topicPath)) {
      this.topics.set(topicPath, {
        id: topicPath,
        name: child || topicPath,
        parent: parent || null,
        fullPath: topicPath,
        emailCount: 1,
      });
    } else {
      const topic = this.topics.get(topicPath)!;
      topic.emailCount++;
    }
  }

  private updateSenderSummaryFromEmail(emailData: any): void {
    const domain = emailData.senderDomain;
    const existing = this.senderSummaries.get(domain);

    if (existing) {
      existing.emailCount++;
      existing.updateCount++;
      existing.lastUpdatedAt = new Date();
      existing.lastEmailId = emailData.id;
      if (emailData.topic && !existing.topics.includes(emailData.topic)) {
        existing.topics.push(emailData.topic);
      }
    } else {
      this.senderSummaries.set(domain, {
        senderDomain: domain,
        content: `Summary for ${domain}`,
        paragraphs: ['Overview paragraph', 'Detail paragraph', 'Recent activity'],
        updateCount: 1,
        emailCount: 1,
        lastUpdatedAt: new Date(),
        lastEmailId: emailData.id,
        topics: emailData.topic ? [emailData.topic] : [],
        viewAllEmails: async () => {
          this.currentScreen = 'timeline';
          this.activeFilters = { senderDomain: domain };
        },
      });
    }
  }

  async processEmailsForTopic(topic: string, options: { count?: number; emails?: any[] }): Promise<void> {
    const count = options.count || (options.emails?.length || 0);
    for (let i = 0; i < count; i++) {
      await this.processEmail({
        id: `${topic}-${i}-${Date.now()}`,
        topic,
        ...options.emails?.[i],
      });
    }
  }

  // ===== Sync Operations =====

  async startInitialSync(options: { lookbackDays: number }): Promise<void> {
    this.syncState = {
      status: 'running',
      currentDay: 0,
      totalDays: options.lookbackDays,
      processedCount: 0,
      totalTokensUsed: 0,
    };
  }

  async completeInitialSync(): Promise<void> {
    this.syncState.status = 'synced';
    this.syncState.currentDay = this.syncState.totalDays;
  }

  async waitForInitialSync(): Promise<void> {
    this.syncState.status = 'synced';
  }

  async waitForInitialCleanup(): Promise<void> {
    this.syncState.status = 'synced';
  }

  async runBackfill(): Promise<void> {
    this.syncState.status = 'running';
  }

  async runInitialSync(options: { lookbackDays: number }): Promise<void> {
    this.syncState = {
      status: 'running',
      currentDay: 0,
      totalDays: options.lookbackDays,
      processedCount: 0,
      totalTokensUsed: 0,
    };
  }

  async startBackfill(): Promise<void> {
    this.syncState.status = 'running';
  }

  async pauseBackfill(): Promise<void> {
    this.paused = true;
    this.syncState.status = 'paused';
  }

  async resumeBackfill(): Promise<void> {
    this.paused = false;
    this.syncState.status = 'running';
  }

  async getBackfillState(): Promise<{ status: string; currentDay: number }> {
    return {
      status: this.syncState.status,
      currentDay: this.syncState.currentDay,
    };
  }

  async getBackfillProgress(): Promise<SyncProgress> {
    return this.syncState;
  }

  async waitForBackfillProgress(day: number): Promise<void> {
    this.syncState.currentDay = day;
  }

  async captureProgressEvents(durationMs: number): Promise<any[]> {
    return [
      { action: 'progress', day: 1, processed: 0 },
      { action: 'progress', day: 2, processed: 10 },
    ];
  }

  async captureBackfillProgress(): Promise<string[]> {
    return [
      'Processing day 1 of 30...',
      'Processing day 2 of 30...',
      'Processing day 15 of 30...',
    ];
  }

  async captureProgressUpdates(): Promise<string[]> {
    return this.captureBackfillProgress();
  }

  async waitForNextSync(): Promise<void> {
    // Simulate waiting for next sync interval
  }

  async waitForProcessedCount(count: number): Promise<void> {
    this.syncState.processedCount = count;
  }

  async getSyncProgress(): Promise<SyncProgress> {
    return this.syncState;
  }

  async getSyncState(): Promise<SyncProgress & { lastError?: string }> {
    return {
      ...this.syncState,
      lastError: undefined,
    };
  }

  async getSyncStatus(): Promise<{
    status: string;
    lastSync?: Date;
    nextSync?: Date;
    lastError?: string;
  }> {
    return {
      status: this.syncState.status,
      lastSync: new Date(),
      nextSync: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  async getSyncStatistics(): Promise<{
    totalEmailsProcessed: number;
    totalTokensUsed: number;
    storageUsed: string;
  }> {
    return {
      totalEmailsProcessed: this.syncState.processedCount,
      totalTokensUsed: this.syncState.totalTokensUsed,
      storageUsed: '15 MB',
    };
  }

  async triggerManualSync(): Promise<void> {
    this.syncState.status = 'running';
  }

  async processBackfillForEmail(emailId: string): Promise<void> {
    this.syncState.processedCount++;
    this.syncState.totalTokensUsed += 500;
  }

  async processEmailsWithinBackfill(emailId: string): Promise<void> {
    const email = this.emails.get(emailId);
    if (email) {
      email.processedAt = new Date();
      this.syncState.totalTokensUsed += 500;
    }
  }

  // ===== Timeline =====

  async getTimeline(): Promise<any> {
    const emails = Array.from(this.emails.values());

    // Apply filters
    let filtered = emails;
    if (this.activeFilters.topic) {
      const filterTopic = this.activeFilters.topic as string;
      filtered = filtered.filter(e => {
        if (!e.topic) return false;
        // Match parent topic or exact topic
        return e.topic === filterTopic || e.topic.startsWith(filterTopic + '/');
      });
    }
    if (this.activeFilters.senderDomain) {
      filtered = filtered.filter(e => e.senderDomain === this.activeFilters.senderDomain);
    }
    if (this.activeFilters.priority) {
      filtered = filtered.filter(e => e.priority === this.activeFilters.priority);
    }
    if (this.activeFilters.emailType) {
      filtered = filtered.filter(e => e.emailType === this.activeFilters.emailType);
    }

    const updates = filtered.map(e => ({
      id: e.id,
      emailId: e.id,
      title: e.subject || 'Email',
      description: e.body?.substring(0, 100),
      priority: e.priority || 'medium',
      emailType: e.emailType || 'regular',
      topic: e.topic,
      senderDomain: e.senderDomain,
      receivedAt: e.receivedAt || new Date(),
      threadId: e.threadId,
      gmailLink: `https://mail.google.com/mail/u/0/#inbox/${e.id}`,
      actionItem: e.body?.toLowerCase().includes('action') || e.body?.toLowerCase().includes('review'),
      actionItemTitle: e.body?.toLowerCase().includes('action') ? 'Review required' : undefined,
      followUpDate: e.body?.match(/by (\w+)/i)?.[1],
    }));

    // Return object with helpers for tests
    return {
      updates,
      length: updates.length,
      isEmpty: updates.length === 0,
      emptyMessage: updates.length === 0 ? 'No updates yet. Get started by syncing your emails.' : undefined,
      getGroupedByTopic: (topic: string) => ({
        updates: updates.filter(u => u.topic === topic),
        isVisuallyGrouped: true,
      }),
    };
  }

  async getEmailFromTimeline(emailId: string): Promise<any> {
    const email = this.emails.get(emailId);
    if (!email) return null;

    return {
      id: email.id,
      emailId: email.id,
      title: email.subject || 'Email',
      description: email.body?.substring(0, 100),
      priority: email.priority || 'medium',
      emailType: email.emailType || 'regular',
      topic: email.topic,
      senderDomain: email.senderDomain,
      receivedAt: email.receivedAt || new Date(),
      threadId: email.threadId,
      gmailLink: `https://mail.google.com/mail/u/0/#inbox/${email.id}`,
      actionItem: email.body?.toLowerCase().includes('action') || email.body?.toLowerCase().includes('review'),
      actionItemTitle: email.body?.toLowerCase().includes('action') ? 'Review required' : undefined,
      followUpDate: email.body?.match(/by (\w+)/i)?.[1],
    };
  }

  async getFirstTimelineUpdate(): Promise<TimelineUpdate> {
    const emails = await this.getTimeline();
    return emails.updates[0] || {
      id: '1',
      emailId: 'email-1',
      title: 'Test Update',
      priority: 'medium',
      emailType: 'regular',
      receivedAt: new Date(),
    };
  }

  async setTimelineFilter(filters: Record<string, unknown>): Promise<void> {
    this.activeFilters = { ...this.activeFilters, ...filters };
  }

  async getActiveFilters(): Promise<Record<string, unknown>> {
    return this.activeFilters;
  }

  async clearAllFilters(): Promise<void> {
    this.activeFilters = {};
  }

  async getAvailableTopicFilters(): Promise<string[]> {
    return Array.from(this.topics.keys());
  }

  async searchTimeline(query: string): Promise<{ updates: TimelineUpdate[] }> {
    return { updates: [] };
  }

  async seedTimelineWithTestData(): Promise<void> {
    for (let i = 0; i < 10; i++) {
      this.emails.set(`email-${i}`, {
        id: `email-${i}`,
        subject: `Test Email ${i}`,
        emailType: ['regular', 'updates', 'social', 'promotional'][i % 4],
        priority: ['high', 'medium', 'low'][i % 3],
        topic: ['Banking/Chase', 'Education/Udemy', 'Projects/Alpha'][i % 3],
        senderDomain: ['chase.com', 'udemy.com', 'company.com'][i % 3],
        receivedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      });
    }
  }

  async clearTimeline(): Promise<void> {
    this.emails.clear();
  }

  // ===== Deals =====

  async getDeals(options?: { sortBy?: string }): Promise<Deal[]> {
    let deals = Array.from(this.deals.values());

    if (options?.sortBy === 'expiryDate') {
      deals.sort((a, b) => {
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      });
    }

    return deals.map(d => ({
      ...d,
      copyCode: async () => {
        this.notifications.push({ type: 'success', message: 'Code copied to clipboard' });
      },
      markAsUsed: async () => {
        d.isUsed = true;
      },
      dismiss: async () => {
        d.isActive = false;
      },
      viewOriginalEmail: async () => {
        this.currentScreen = 'timeline';
        this.activeFilters = { emailId: d.emailId };
      },
    }));
  }

  async getDealForEmail(emailId: string): Promise<Deal | null> {
    const deal = this.deals.get(emailId);
    if (!deal) return null;

    return {
      ...deal,
      canCopyCode: !!deal.promoCode,
      copyCode: async () => {
        this.notifications.push({ type: 'success', message: 'Code copied to clipboard' });
      },
      markAsUsed: async () => {
        deal.isUsed = true;
      },
      dismiss: async () => {
        deal.isActive = false;
      },
      viewOriginalEmail: async () => {
        this.currentScreen = 'timeline';
        this.activeFilters = { emailId: deal.emailId };
      },
    };
  }

  async getActiveDeals(): Promise<Deal[]> {
    return Array.from(this.deals.values()).filter(d => d.isActive);
  }

  async getExpiredDeals(): Promise<Deal[]> {
    return Array.from(this.deals.values()).filter(d => !d.isActive);
  }

  async getFirstDeal(): Promise<Deal> {
    const deals = await this.getDeals();
    return deals[0] || {
      id: 'deal-1',
      emailId: 'email-1',
      title: 'Test Deal',
      brand: 'Test Brand',
      isActive: true,
    };
  }

  async setDealsFilter(filters: Record<string, unknown>): Promise<void> {
    // Apply deal filters
  }

  async seedDeals(options: { active?: number; expired?: number; brands?: string[]; categories?: string[] }): Promise<void> {
    const activeCount = options.active || 0;
    const expiredCount = options.expired || 0;

    for (let i = 0; i < activeCount; i++) {
      this.deals.set(`deal-active-${i}`, {
        id: `deal-active-${i}`,
        emailId: `email-${i}`,
        title: `Active Deal ${i}`,
        brand: options.brands?.[i % options.brands.length] || 'Brand',
        category: options.categories?.[i % options.categories.length] || 'General',
        isActive: true,
      });
    }

    for (let i = 0; i < expiredCount; i++) {
      this.deals.set(`deal-expired-${i}`, {
        id: `deal-expired-${i}`,
        emailId: `email-expired-${i}`,
        title: `Expired Deal ${i}`,
        brand: options.brands?.[i % (options.brands?.length || 1)] || 'Brand',
        category: options.categories?.[i % (options.categories?.length || 1)] || 'General',
        isActive: false,
      });
    }
  }

  async seedDealsWithExpiry(deals: { id: string; daysUntilExpiry: number }[]): Promise<void> {
    for (const deal of deals) {
      this.deals.set(deal.id, {
        id: deal.id,
        emailId: `email-${deal.id}`,
        title: `Deal ${deal.id}`,
        brand: 'Test Brand',
        expiryDate: new Date(Date.now() + deal.daysUntilExpiry * 24 * 60 * 60 * 1000),
        isActive: deal.daysUntilExpiry > 0,
        isExpiringSoon: deal.daysUntilExpiry <= 7 && deal.daysUntilExpiry > 0,
      });
    }
  }

  // ===== Topic Management =====

  async getAllTopics(): Promise<Topic[]> {
    return Array.from(this.topics.values());
  }

  async getEmailTopics(emailId: string): Promise<Topic[]> {
    const email = this.emails.get(emailId);
    if (!email || !email.topic) return [];

    const [parent, child] = email.topic.split('/');
    return [
      { parent, child, fullPath: email.topic },
    ];
  }

  async seedTopics(topics: { parent: string; child: string; emailCount: number }[]): Promise<void> {
    for (const t of topics) {
      const fullPath = `${t.parent}/${t.child}`;
      this.topics.set(fullPath, {
        id: fullPath,
        name: t.child,
        parent: t.parent,
        fullPath,
        emailCount: t.emailCount,
      });
    }
  }

  async getAvailableGmailLabels(): Promise<string[]> {
    return this.gmailLabels;
  }

  // ===== Topic Summaries =====

  async getTopicSummary(topic: string): Promise<TopicSummary> {
    return this.topicSummaries.get(topic) || {
      topic,
      content: `Summary for ${topic}`,
      paragraphs: ['Overview paragraph', 'Detail paragraph', 'Recent activity'],
      updateCount: 1,
      emailCount: 1,
      lastUpdatedAt: new Date(),
      lastEmailId: undefined,
      viewAllEmails: async () => {
        this.currentScreen = 'timeline';
        this.activeFilters = { topic };
      },
    };
  }

  async getAllTopicSummaries(options?: { sortBy?: string }): Promise<TopicSummary[]> {
    const summaries = Array.from(this.topicSummaries.values());

    if (options?.sortBy === 'recentActivity') {
      summaries.sort((a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime());
    }

    return summaries;
  }

  // ===== Sender Summaries =====

  async getSenderSummary(senderDomain: string): Promise<SenderSummary> {
    return this.senderSummaries.get(senderDomain) || {
      senderDomain,
      content: `Summary for ${senderDomain}`,
      paragraphs: ['Overview paragraph', 'Detail paragraph', 'Recent activity'],
      updateCount: 1,
      emailCount: 1,
      lastUpdatedAt: new Date(),
      lastEmailId: undefined,
      topics: [],
      viewAllEmails: async () => {
        this.currentScreen = 'timeline';
        this.activeFilters = { senderDomain };
      },
    };
  }

  async getAllSenderSummaries(options?: { sortBy?: string }): Promise<SenderSummary[]> {
    const summaries = Array.from(this.senderSummaries.values());

    if (options?.sortBy === 'recentActivity') {
      summaries.sort((a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime());
    }

    return summaries;
  }

  async processEmailsForSender(senderDomain: string, options: { count?: number; emails?: any[] }): Promise<void> {
    const count = options.count || (options.emails?.length || 0);
    for (let i = 0; i < count; i++) {
      await this.processEmail({
        id: `${senderDomain}-${i}-${Date.now()}`,
        senderDomain,
        ...options.emails?.[i],
      });
    }
  }

  // ===== Job Queue =====

  async getJobQueueStats(): Promise<JobStats> {
    return this.jobQueue.getStats();
  }

  async createJob(job: { type: string; payload: Record<string, unknown>; maxRetries?: number }): Promise<{ id: string }> {
    const created = await this.jobQueue.createJob(job);
    return { id: created.id };
  }

  async processJob(jobId: string): Promise<void> {
    await this.jobQueue.updateJobStatus(jobId, 'completed');
  }

  async seedJobs(options: { count: number; failCount?: number }): Promise<void> {
    for (let i = 0; i < options.count; i++) {
      await this.jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: `email-${i}` },
      });
    }
  }

  async processAllJobs(): Promise<void> {
    // Process all pending jobs
    const stats = await this.jobQueue.getStats();
    for (let i = 0; i < stats.pending; i++) {
      const job = await this.jobQueue.getNextJob();
      if (job) {
        await this.jobQueue.updateJobStatus(job.id, 'completed');
      }
    }
  }

  // ===== Navigation =====

  async navigateTo(page: string): Promise<void> {
    this.currentScreen = page;
  }

  async navigateToOnboardingStep(step: string): Promise<void> {
    this.currentScreen = `onboarding-${step}`;
  }

  async proceedToNextOnboardingStep(): Promise<void> {
    // Move to next onboarding step
  }

  // ===== Screen State =====

  async getCurrentScreen(): Promise<{ name: string; content?: string; buttons?: any[]; hasApiKeyInput?: boolean }> {
    return {
      name: this.currentScreen,
      content: '',
      buttons: [],
    };
  }

  async getScreenContent(): Promise<string> {
    return '';
  }

  async getScreenButtons(): Promise<any[]> {
    return [];
  }

  async getCurrentView(): Promise<{ page: string; filters?: Record<string, unknown>; emailId?: string }> {
    return { page: this.currentScreen, filters: this.activeFilters };
  }

  // ===== Onboarding =====

  async clickConnectGmail(): Promise<{ oauthUrl: string }> {
    return { oauthUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...' };
  }

  async completeOAuthFlow(credentials: GmailCredentials): Promise<void> {
    await this.connectGmail(credentials);
  }

  async simulateOAuthFailure(reason: string): Promise<void> {
    this.notifications.push({ type: 'error', message: `OAuth failed: ${reason}` });
  }

  async selectProvider(provider: string): Promise<void> {
    this.settings['llmProvider'] = provider;
  }

  async enterApiKey(key: string): Promise<void> {
    this.settings['llmApiKey'] = key;
  }

  async getMaskedApiKey(): Promise<string> {
    return 'sk-***...';
  }

  async validateApiKey(): Promise<{ isValid: boolean; error?: string }> {
    return { isValid: true };
  }

  async getAvailableProviders(): Promise<string[]> {
    return ['openai', 'anthropic', 'google'];
  }

  async getLookbackOptions(): Promise<{ value: number; label: string }[]> {
    return [
      { value: 7, label: '7 days' },
      { value: 14, label: '14 days' },
      { value: 30, label: '30 days' },
      { value: 60, label: '60 days' },
      { value: 90, label: '90 days' },
    ];
  }

  async getSyncIntervalOptions(): Promise<{ value: number; label: string }[]> {
    return [
      { value: 15, label: '15 minutes' },
      { value: 30, label: '30 minutes' },
      { value: 60, label: '1 hour' },
      { value: 120, label: '2 hours' },
      { value: 1440, label: 'Daily' },
    ];
  }

  async clickContinue(): Promise<void> {
    // Click continue button
  }

  async clickStartProcessing(): Promise<void> {
    // Start processing
  }

  async completeOnboarding(config: {
    gmail: GmailCredentials;
    preferences: { lookbackDays: number; syncInterval: number };
    llm: LLMConfig;
  }): Promise<void> {
    await this.connectGmail(config.gmail);
    await this.configureLookbackDays(config.preferences.lookbackDays);
    await this.configureSyncInterval(config.preferences.syncInterval);
    await this.configureLLM(config.llm);
  }

  // ===== Notifications =====

  async getNotifications(): Promise<Notification[]> {
    return this.notifications;
  }

  async getLastNotification(): Promise<Notification> {
    return this.notifications[this.notifications.length - 1];
  }

  // ===== Clipboard =====

  async getClipboard(): Promise<string> {
    return '';
  }

  // ===== Navigation State =====

  async getNavigation(): Promise<{ dealsCount: number }> {
    return { dealsCount: this.deals.size };
  }

  // ===== Processing Stats =====

  async getTotalProcessedCount(): Promise<number> {
    return this.syncState.processedCount;
  }

  async getEmailProcessingRecord(emailId: string): Promise<{ processedAt: Date; processCount: number }> {
    return {
      processedAt: new Date(),
      processCount: 1,
    };
  }

  async getOldestProcessedEmailDate(): Promise<Date> {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  // ===== Misc =====

  async launch(): Promise<void> {
    // Launch app
  }

  async getProcessingProgress(): Promise<SyncProgress> {
    return this.syncState;
  }

  async markEmailsAsProcessed(emailIds: string[]): Promise<void> {
    for (const id of emailIds) {
      this.syncState.processedCount++;
    }
  }

  async fetchNewEmailsSince(historyId: string): Promise<any[]> {
    return [];
  }

  async getEmailsSinceHistoryId(historyId: string): Promise<any[]> {
    return [];
  }

  async getLastHistoryId(): Promise<string> {
    return 'history-123';
  }

  async getLastSyncTime(): Promise<Date> {
    return new Date();
  }
}
