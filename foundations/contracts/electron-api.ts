/**
 * Renderer <-> preload API contract.
 *
 * Lives in foundations/contracts so the UI layer (src/) and the Electron
 * preload can share the exact same type without importing the electron
 * package or any transport code. electron/preload.ts implements this shape
 * with contextBridge.
 */
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
} from './ipc';

export interface ElectronAPI {
  // Gmail OAuth
  startOAuth: (redirectPort: number) => Promise<GmailOAuthStartResponse>;
  handleOAuthCallback: (code: string, state: string) => Promise<GmailOAuthCallbackResponse>;
  refreshOAuthToken: () => Promise<GmailOAuthRefreshResponse>;
  revokeOAuthToken: () => Promise<GmailOAuthRevokeResponse>;
  getAuthStatus: () => Promise<GmailOAuthStatusResponse>;

  // LLM Provider
  listProviders: () => Promise<LLMProviderListResponse>;
  setProvider: (providerId: string, apiKey: string) => Promise<LLMProviderSetResponse>;
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
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
