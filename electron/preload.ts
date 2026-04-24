import { contextBridge, ipcRenderer } from 'electron';
import type {
  GmailOAuthStartResponse,
  GmailOAuthCallbackResponse,
  GmailOAuthRefreshResponse,
  GmailOAuthRevokeResponse,
  GmailOAuthStatusResponse,
  LLMProviderListResponse,
  LLMProviderSetResponse,
  LLMProviderValidateResponse,
  LLMProviderTestResponse,
  JobListResponse,
  JobCreateResponse,
  JobCancelResponse,
  JobStatusResponse,
  JobPauseResponse,
  JobResumeResponse,
  SettingsGetResponse,
  SettingsSetResponse,
  SettingsResetResponse,
  SyncStartResponse,
  SyncStatusResponse,
  SyncCancelResponse,
} from './ipc/channels';
import type { EmailDetailData } from '../src/components/views/EmailDetailView';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Gmail OAuth
  startOAuth: (redirectPort: number) =>
    ipcRenderer.invoke('gmail:oauth:start', { redirectPort }) as Promise<GmailOAuthStartResponse>,
  handleOAuthCallback: (code: string, state: string) =>
    ipcRenderer.invoke('gmail:oauth:callback', { code, state }) as Promise<GmailOAuthCallbackResponse>,
  refreshOAuthToken: () =>
    ipcRenderer.invoke('gmail:oauth:refresh') as Promise<GmailOAuthRefreshResponse>,
  revokeOAuthToken: () =>
    ipcRenderer.invoke('gmail:oauth:revoke') as Promise<GmailOAuthRevokeResponse>,
  getAuthStatus: () =>
    ipcRenderer.invoke('gmail:oauth:status') as Promise<GmailOAuthStatusResponse>,

  // LLM Provider
  listProviders: () =>
    ipcRenderer.invoke('llm:provider:list') as Promise<LLMProviderListResponse>,
  setProvider: (providerId: string, apiKey: string, model?: string) =>
    ipcRenderer.invoke('llm:provider:set', { providerId, apiKey, model }) as Promise<LLMProviderSetResponse>,
  validateProvider: (providerId: string) =>
    ipcRenderer.invoke('llm:provider:validate', { providerId }) as Promise<LLMProviderValidateResponse>,
  testProvider: (providerId: string, prompt?: string) =>
    ipcRenderer.invoke('llm:provider:test', { providerId, prompt }) as Promise<LLMProviderTestResponse>,

  // Jobs
  listJobs: (status?: string, limit?: number) =>
    ipcRenderer.invoke('jobs:list', { status, limit }) as Promise<JobListResponse>,
  createJob: (type: string, payload: Record<string, unknown>, emailId?: string, scheduledAt?: string) =>
    ipcRenderer.invoke('jobs:create', { type, payload, emailId, scheduledAt }) as Promise<JobCreateResponse>,
  cancelJob: (jobId: string) =>
    ipcRenderer.invoke('jobs:cancel', { jobId }) as Promise<JobCancelResponse>,
  getJobStatus: (jobId: string) =>
    ipcRenderer.invoke('jobs:status', { jobId }) as Promise<JobStatusResponse>,
  pauseJobs: () =>
    ipcRenderer.invoke('jobs:pause') as Promise<JobPauseResponse>,
  resumeJobs: () =>
    ipcRenderer.invoke('jobs:resume') as Promise<JobResumeResponse>,

  // Settings
  getSetting: (key: string) =>
    ipcRenderer.invoke('settings:get', { key }) as Promise<SettingsGetResponse>,
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke('settings:set', { key, value }) as Promise<SettingsSetResponse>,
  resetSetting: (key: string) =>
    ipcRenderer.invoke('settings:reset', { key }) as Promise<SettingsResetResponse>,

  // Sync
  startSync: (lookbackDays?: number, incremental?: boolean) =>
    ipcRenderer.invoke('sync:start', { lookbackDays, incremental }) as Promise<SyncStartResponse>,
  getSyncStatus: () =>
    ipcRenderer.invoke('sync:status') as Promise<SyncStatusResponse>,
  cancelSync: () =>
    ipcRenderer.invoke('sync:cancel') as Promise<SyncCancelResponse>,

  // Timeline
  listTimelineUpdates: (options?: { priority?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('timeline:list', options) as Promise<{ success: boolean; data?: { updates: any[]; total: number }; error?: string }>,
  getTimelineWeekSenders: (options?: { startDate?: string }) =>
    ipcRenderer.invoke('timeline:week-senders', options) as Promise<{ success: boolean; data?: { senders: Array<{ domain: string; category: string; count: number; summary: string }> }; error?: string }>,
  getTimelineMonthStats: (options?: { monthsBack?: number }) =>
    ipcRenderer.invoke('timeline:month-stats', options) as Promise<{ success: boolean; data?: { stats: Array<{ month: string; weeks: number; emails: number; actionItems: number }> }; error?: string }>,
  getTimelineYearStats: (options?: { yearsBack?: number }) =>
    ipcRenderer.invoke('timeline:year-stats', options) as Promise<{ success: boolean; data?: { stats: Array<{ year: string; emails: number; actionItems: number; deals: number }> }; error?: string }>,

  // Topics
  listTopics: () =>
    ipcRenderer.invoke('topics:list') as Promise<{ success: boolean; data?: { topics: any[] }; error?: string }>,
  getTopicDetail: (topicId: string) =>
    ipcRenderer.invoke('topics:get-detail', topicId) as Promise<{ success: boolean; data?: any; error?: string }>,

  // Deals
  listDeals: (options?: { activeOnly?: boolean; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('deals:list', options) as Promise<{ success: boolean; data?: { deals: any[]; total: number }; error?: string }>,
  markDealAsUsed: (dealId: string) =>
    ipcRenderer.invoke('deals:mark-used', dealId) as Promise<{ success: boolean; data?: { id: string; usedAt: string }; error?: string }>,
  undoMarkDealAsUsed: (dealId: string) =>
    ipcRenderer.invoke('deals:undo-mark-used', dealId) as Promise<{ success: boolean; data?: { id: string }; error?: string }>,
  dismissDeal: (dealId: string) =>
    ipcRenderer.invoke('deals:dismiss', dealId) as Promise<{ success: boolean; data?: { id: string; dismissedAt: string }; error?: string }>,
  undoDismissDeal: (dealId: string) =>
    ipcRenderer.invoke('deals:undo-dismiss', dealId) as Promise<{ success: boolean; data?: { id: string }; error?: string }>,

  // Senders
  listSenders: () =>
    ipcRenderer.invoke('senders:list') as Promise<{ success: boolean; data?: { senders: any[] }; error?: string }>,
  getSenderDetail: (domain: string) =>
    ipcRenderer.invoke('senders:get-detail', domain) as Promise<{ success: boolean; data?: any; error?: string }>,

  // Action Items
  toggleActionItem: (actionItemId: string) =>
    ipcRenderer.invoke('action-items:toggle', actionItemId) as Promise<{ success: boolean; data?: any; error?: string }>,

  // Email List
  listEmails: (options?: { type?: string; processed?: boolean; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('emails:list', options) as Promise<{ success: boolean; data?: { emails: Array<{ id: string; threadId: string; senderEmail: string; senderName: string | null; senderDomain: string; subject: string | null; snippet: string | null; receivedAt: string; emailType: string | null; gmailCategory: string | null; isProcessed: boolean; isRead: boolean; isImportant: boolean }>; total: number }; error?: string }>,

  // Email Detail
  getEmailDetail: (emailId: string) =>
    ipcRenderer.invoke('emails:get-detail', emailId) as Promise<{ success: boolean; data?: EmailDetailData; error?: string }>,

  // Email Reply
  sendReply: (emailId: string, body: string) =>
    ipcRenderer.invoke('emails:send-reply', { emailId, body }) as Promise<{ success: boolean; data?: { messageId: string }; error?: string }>,

  // Shell
  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:openExternal', url) as Promise<{ success: boolean; error?: string }>,

  // Backfill
  startBackfill: (lookbackDays: number) =>
    ipcRenderer.invoke('sync:start-backfill', { lookbackDays }) as Promise<{ started: boolean }>,

  // Sync Progress Events
  onSyncProgress: (callback: (data: { processed: number; total: number; phase: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('sync:progress', listener);
    return () => ipcRenderer.removeListener('sync:progress', listener);
  },
  onSyncComplete: (callback: (data: { total: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('sync:complete', listener);
    return () => ipcRenderer.removeListener('sync:complete', listener);
  },
  onSyncError: (callback: (data: { error: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('sync:error', listener);
    return () => ipcRenderer.removeListener('sync:error', listener);
  },

  // Processing Progress Events
  onProcessingStarted: (callback: (data: { total: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('processing:started', listener);
    return () => ipcRenderer.removeListener('processing:started', listener);
  },
  onProcessingProgress: (callback: (data: { processed: number; failed: number; total: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('processing:progress', listener);
    return () => ipcRenderer.removeListener('processing:progress', listener);
  },
  onProcessingComplete: (callback: (data: { processed: number; failed: number; total: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('processing:complete', listener);
    return () => ipcRenderer.removeListener('processing:complete', listener);
  },
  onProcessingFailed: (callback: (data: { failed: number; total: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('processing:failed', listener);
    return () => ipcRenderer.removeListener('processing:failed', listener);
  },
  onProcessingError: (callback: (data: { error: string }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('processing:error', listener);
    return () => ipcRenderer.removeListener('processing:error', listener);
  },

  // Backfill Events
  onBackfillProgress: (callback: (data: { day: number; totalDays: number; emailsProcessed: number }) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('backfill:progress', listener);
    return () => ipcRenderer.removeListener('backfill:progress', listener);
  },
  onBackfillComplete: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('backfill:complete', listener);
    return () => ipcRenderer.removeListener('backfill:complete', listener);
  },
});

// Type definition for the exposed API
export interface ElectronAPI {
  // Gmail OAuth
  startOAuth: (redirectPort: number) => Promise<GmailOAuthStartResponse>;
  handleOAuthCallback: (code: string, state: string) => Promise<GmailOAuthCallbackResponse>;
  refreshOAuthToken: () => Promise<GmailOAuthRefreshResponse>;
  revokeOAuthToken: () => Promise<GmailOAuthRevokeResponse>;
  getAuthStatus: () => Promise<GmailOAuthStatusResponse>;

  // LLM Provider
  listProviders: () => Promise<LLMProviderListResponse>;
  setProvider: (providerId: string, apiKey: string, model?: string) => Promise<LLMProviderSetResponse>;
  validateProvider: (providerId: string) => Promise<LLMProviderValidateResponse>;
  testProvider: (providerId: string, prompt?: string) => Promise<LLMProviderTestResponse>;

  // Jobs
  listJobs: (status?: string, limit?: number) => Promise<JobListResponse>;
  createJob: (type: string, payload: Record<string, unknown>, emailId?: string, scheduledAt?: string) => Promise<JobCreateResponse>;
  cancelJob: (jobId: string) => Promise<JobCancelResponse>;
  getJobStatus: (jobId: string) => Promise<JobStatusResponse>;
  pauseJobs: () => Promise<JobPauseResponse>;
  resumeJobs: () => Promise<JobResumeResponse>;

  // Settings
  getSetting: (key: string) => Promise<SettingsGetResponse>;
  setSetting: (key: string, value: unknown) => Promise<SettingsSetResponse>;
  resetSetting: (key: string) => Promise<SettingsResetResponse>;

  // Sync
  startSync: (lookbackDays?: number, incremental?: boolean) => Promise<SyncStartResponse>;
  getSyncStatus: () => Promise<SyncStatusResponse>;
  cancelSync: () => Promise<SyncCancelResponse>;

  // Timeline
  listTimelineUpdates: (options?: { priority?: string; limit?: number; offset?: number }) => Promise<{ success: boolean; data?: { updates: any[]; total: number }; error?: string }>;
  getTimelineWeekSenders: (options?: { startDate?: string }) => Promise<{ success: boolean; data?: { senders: Array<{ domain: string; category: string; count: number; summary: string }> }; error?: string }>;
  getTimelineMonthStats: (options?: { monthsBack?: number }) => Promise<{ success: boolean; data?: { stats: Array<{ month: string; weeks: number; emails: number; actionItems: number }> }; error?: string }>;
  getTimelineYearStats: (options?: { yearsBack?: number }) => Promise<{ success: boolean; data?: { stats: Array<{ year: string; emails: number; actionItems: number; deals: number }> }; error?: string }>;

  // Topics
  listTopics: () => Promise<{ success: boolean; data?: { topics: any[] }; error?: string }>;
  getTopicDetail: (topicId: string) => Promise<{ success: boolean; data?: any; error?: string }>;

  // Deals
  listDeals: (options?: { activeOnly?: boolean; limit?: number; offset?: number }) => Promise<{ success: boolean; data?: { deals: any[]; total: number }; error?: string }>;
  markDealAsUsed: (dealId: string) => Promise<{ success: boolean; data?: { id: string; usedAt: string }; error?: string }>;
  undoMarkDealAsUsed: (dealId: string) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  dismissDeal: (dealId: string) => Promise<{ success: boolean; data?: { id: string; dismissedAt: string }; error?: string }>;
  undoDismissDeal: (dealId: string) => Promise<{ success: boolean; data?: { id: string }; error?: string }>;

  // Senders
  listSenders: () => Promise<{ success: boolean; data?: { senders: any[] }; error?: string }>;
  getSenderDetail: (domain: string) => Promise<{ success: boolean; data?: any; error?: string }>;

  // Action Items
  toggleActionItem: (actionItemId: string) => Promise<{ success: boolean; data?: any; error?: string }>;

  // Email List
  listEmails: (options?: { type?: string; processed?: boolean; limit?: number; offset?: number }) => Promise<{ success: boolean; data?: { emails: Array<{ id: string; threadId: string; senderEmail: string; senderName: string | null; senderDomain: string; subject: string | null; snippet: string | null; receivedAt: string; emailType: string | null; gmailCategory: string | null; isProcessed: boolean; isRead: boolean; isImportant: boolean }>; total: number }; error?: string }>;

  // Email Detail
  getEmailDetail: (emailId: string) => Promise<{ success: boolean; data?: EmailDetailData; error?: string }>;

  // Email Reply
  sendReply: (emailId: string, body: string) => Promise<{ success: boolean; data?: { messageId: string }; error?: string }>;

  // Shell
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;

  // Backfill
  startBackfill: (lookbackDays: number) => Promise<{ started: boolean }>;

  // Sync Progress Events
  onSyncProgress: (callback: (data: { processed: number; total: number; phase: string }) => void) => () => void;
  onSyncComplete: (callback: (data: { total: number }) => void) => () => void;
  onSyncError: (callback: (data: { error: string }) => void) => () => void;
  onProcessingStarted: (callback: (data: { total: number }) => void) => () => void;
  onProcessingProgress: (callback: (data: { processed: number; failed: number; total: number }) => void) => () => void;
  onProcessingComplete: (callback: (data: { processed: number; failed: number; total: number }) => void) => () => void;
  onProcessingFailed: (callback: (data: { failed: number; total: number }) => void) => () => void;
  onProcessingError: (callback: (data: { error: string }) => void) => () => void;
  onBackfillProgress: (callback: (data: { day: number; totalDays: number; emailsProcessed: number }) => void) => () => void;
  onBackfillComplete: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
