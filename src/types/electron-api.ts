import type {
  GmailOAuthCallbackResponse,
  GmailOAuthRefreshResponse,
  GmailOAuthRevokeResponse,
  GmailOAuthStartResponse,
  GmailOAuthStatusResponse,
  JobCancelResponse,
  JobCreateResponse,
  JobListResponse,
  JobPauseResponse,
  JobResumeResponse,
  JobStatusResponse,
  LLMProviderListResponse,
  LLMProviderSetResponse,
  LLMProviderTestResponse,
  LLMProviderValidateResponse,
  SettingsGetResponse,
  SettingsResetResponse,
  SettingsSetResponse,
  SyncCancelResponse,
  SyncStartResponse,
  SyncStatusResponse,
} from '../../electron/ipc/channels';
import type { TimelineCardData, TopicData } from '../components/screens';
import type { EmailDetailData } from '../components/views/EmailDetailView';
import type { SenderDetailData, TopicDetailData } from '../components/views';
import type { DealRecord } from '../hooks/dealData';
import type { Topic as TimelineTopic } from '../hooks/useTimeline';
import type { TopicInfo } from '../stores/timeline';

type Unsubscribe = () => void;

export interface TimelineUpdateIpcRecord {
  id: string;
  emailId: string;
  threadId: string;
  title: string;
  description: string | null;
  summary: string | null;
  priority: TimelineCardData['priority'] | null;
  sentiment?: string | null;
  urgency?: boolean | null;
  actionItem?: boolean | null;
  actionItemTitle?: string | null;
  followUpDate?: string | null;
  financialImpact?: number | null;
  keyEntities?: unknown;
  createdAt: string;
  receivedAt?: string;
  sender: TimelineCardData['sender'];
  topic?: TopicInfo | null;
  isProcessed: boolean;
}

export interface SenderSummaryIpcRecord {
  id: string;
  senderDomain: string;
  summary: string;
  wordCount: number | null;
  lastUpdated: string;
  updateCount: number;
}

type TopicListIpcRecord = TopicData & TimelineTopic;

interface TopicDetailIpcEmail {
  id: string;
  subject: string;
  snippet: string;
  sender: {
    name: string;
    initial: string;
  };
  receivedAt: string;
  isRead: boolean;
  tags: string[];
}

interface TopicDetailIpcDeal {
  id: string;
  title: string;
  code?: string;
  expiry?: string;
  minPurchase?: string;
  autoApplied: boolean;
}

type TopicDetailIpcData = Omit<TopicDetailData, 'emails' | 'deals'> & {
  emails: TopicDetailIpcEmail[];
  deals?: TopicDetailIpcDeal[];
};

export interface ElectronAPI {
  startOAuth: (redirectPort: number) => Promise<GmailOAuthStartResponse>;
  handleOAuthCallback: (code: string, state: string) => Promise<GmailOAuthCallbackResponse>;
  refreshOAuthToken: () => Promise<GmailOAuthRefreshResponse>;
  revokeOAuthToken: () => Promise<GmailOAuthRevokeResponse>;
  getAuthStatus: () => Promise<GmailOAuthStatusResponse>;

  listProviders: () => Promise<LLMProviderListResponse>;
  setProvider: (providerId: string, apiKey: string, model?: string) => Promise<LLMProviderSetResponse>;
  validateProvider: (providerId: string) => Promise<LLMProviderValidateResponse>;
  testProvider: (providerId: string, prompt?: string) => Promise<LLMProviderTestResponse>;

  listJobs: (status?: string, limit?: number) => Promise<JobListResponse>;
  createJob: (
    type: string,
    payload: Record<string, unknown>,
    emailId?: string,
    scheduledAt?: string
  ) => Promise<JobCreateResponse>;
  cancelJob: (jobId: string) => Promise<JobCancelResponse>;
  getJobStatus: (jobId: string) => Promise<JobStatusResponse>;
  pauseJobs: () => Promise<JobPauseResponse>;
  resumeJobs: () => Promise<JobResumeResponse>;

  getSetting: (key: string) => Promise<SettingsGetResponse>;
  setSetting: (key: string, value: unknown) => Promise<SettingsSetResponse>;
  resetSetting: (key: string) => Promise<SettingsResetResponse>;

  startSync: (lookbackDays?: number, incremental?: boolean) => Promise<SyncStartResponse>;
  getSyncStatus: () => Promise<SyncStatusResponse>;
  cancelSync: () => Promise<SyncCancelResponse>;

  listTimelineUpdates: (options?: { priority?: string; limit?: number; offset?: number }) => Promise<{ success: boolean; data?: { updates: TimelineUpdateIpcRecord[]; total: number }; error?: string }>;
  getTimelineWeekSenders: (options?: { startDate?: string }) => Promise<{ success: boolean; data?: { senders: Array<{ domain: string; category: string; count: number; summary: string }> }; error?: string }>;
  getTimelineMonthStats: (options?: { monthsBack?: number }) => Promise<{ success: boolean; data?: { stats: Array<{ month: string; weeks: number; emails: number; actionItems: number }> }; error?: string }>;
  getTimelineYearStats: (options?: { yearsBack?: number }) => Promise<{ success: boolean; data?: { stats: Array<{ year: string; emails: number; actionItems: number; deals: number }> }; error?: string }>;

  listTopics: () => Promise<{ success: boolean; data?: { topics: TopicListIpcRecord[] }; error?: string }>;
  getTopicDetail: (topicId: string) => Promise<{ success: boolean; data?: TopicDetailIpcData; error?: string }>;

  listDeals: (options?: { activeOnly?: boolean; limit?: number; offset?: number }) => Promise<{ success: boolean; data?: { deals: DealRecord[]; total: number }; error?: string }>;
  markDealAsUsed: (dealId: string) => Promise<{ success: boolean; data?: { id: string; usedAt: string }; error?: string }>;
  undoMarkDealAsUsed: (dealId: string) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  dismissDeal: (dealId: string) => Promise<{ success: boolean; data?: { id: string; dismissedAt: string }; error?: string }>;
  undoDismissDeal: (dealId: string) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;

  listSenders: () => Promise<{ success: boolean; data?: { senders: SenderSummaryIpcRecord[] }; error?: string }>;
  getSenderDetail: (domain: string) => Promise<{ success: boolean; data?: SenderDetailData; error?: string }>;

  toggleActionItem: (actionItemId: string) => Promise<{ success: boolean; data?: { id: string; completed: boolean; completedAt?: string | null }; error?: string }>;
  listEmails: (options?: { type?: string; processed?: boolean; limit?: number; offset?: number }) => Promise<{ success: boolean; data?: { emails: Array<{ id: string; threadId: string; senderEmail: string; senderName: string | null; senderDomain: string; subject: string | null; snippet: string | null; receivedAt: string; emailType: string | null; gmailCategory: string | null; isProcessed: boolean; isRead: boolean; isImportant: boolean }>; total: number }; error?: string }>;
  getEmailDetail: (emailId: string) => Promise<{ success: boolean; data?: EmailDetailData; error?: string }>;
  sendReply: (emailId: string, body: string) => Promise<{ success: boolean; data?: { messageId: string }; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  startBackfill: (lookbackDays: number) => Promise<{ started: boolean }>;

  onSyncProgress: (callback: (data: { processed: number; total: number; phase: string }) => void) => Unsubscribe;
  onSyncComplete: (callback: (data: { total: number }) => void) => Unsubscribe;
  onSyncError: (callback: (data: { error: string }) => void) => Unsubscribe;
  onProcessingStarted: (callback: (data: { total: number }) => void) => Unsubscribe;
  onProcessingProgress: (
    callback: (data: { processed: number; failed: number; total: number }) => void
  ) => Unsubscribe;
  onProcessingComplete: (
    callback: (data: { processed: number; failed: number; total: number }) => void
  ) => Unsubscribe;
  onProcessingFailed: (callback: (data: { failed: number; total: number }) => void) => Unsubscribe;
  onProcessingError: (callback: (data: { error: string }) => void) => Unsubscribe;
  onBackfillProgress: (
    callback: (data: { day: number; totalDays: number; emailsProcessed: number }) => void
  ) => Unsubscribe;
  onBackfillComplete: (callback: () => void) => Unsubscribe;
}
