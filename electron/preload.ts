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
  setProvider: (providerId: string, apiKey: string) =>
    ipcRenderer.invoke('llm:provider:set', { providerId, apiKey }) as Promise<LLMProviderSetResponse>,
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

  // Topics
  listTopics: () =>
    ipcRenderer.invoke('topics:list') as Promise<{ success: boolean; data?: { topics: any[] }; error?: string }>,

  // Deals
  listDeals: (options?: { activeOnly?: boolean; limit?: number }) =>
    ipcRenderer.invoke('deals:list', options) as Promise<{ success: boolean; data?: { deals: any[]; total: number }; error?: string }>,
  markDealAsUsed: (dealId: string) =>
    ipcRenderer.invoke('deals:mark-used', dealId) as Promise<{ success: boolean; data?: { id: string; usedAt: string }; error?: string }>,
  dismissDeal: (dealId: string) =>
    ipcRenderer.invoke('deals:dismiss', dealId) as Promise<{ success: boolean; data?: { id: string; dismissedAt: string }; error?: string }>,

  // Senders
  listSenders: () =>
    ipcRenderer.invoke('senders:list') as Promise<{ success: boolean; data?: { senders: any[] }; error?: string }>,
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

  // Topics
  listTopics: () => Promise<{ success: boolean; data?: { topics: any[] }; error?: string }>;

  // Deals
  listDeals: (options?: { activeOnly?: boolean; limit?: number }) => Promise<{ success: boolean; data?: { deals: any[]; total: number }; error?: string }>;
  markDealAsUsed: (dealId: string) => Promise<{ success: boolean; data?: { id: string; usedAt: string }; error?: string }>;
  dismissDeal: (dealId: string) => Promise<{ success: boolean; data?: { id: string; dismissedAt: string }; error?: string }>;

  // Senders
  listSenders: () => Promise<{ success: boolean; data?: { senders: any[] }; error?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
