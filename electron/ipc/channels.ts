/**
 * Type definitions for IPC communication between Electron main and renderer processes.
 */

// Channel name constants (runtime values)
export const CHANNEL = {
  // Gmail OAuth
  GMAIL_OAUTH_START: 'gmail:oauth:start',
  GMAIL_OAUTH_CALLBACK: 'gmail:oauth:callback',
  GMAIL_OAUTH_REFRESH: 'gmail:oauth:refresh',
  GMAIL_OAUTH_REVOKE: 'gmail:oauth:revoke',
  GMAIL_OAUTH_STATUS: 'gmail:oauth:status',

  // LLM Provider
  LLM_PROVIDER_LIST: 'llm:provider:list',
  LLM_PROVIDER_SET: 'llm:provider:set',
  LLM_PROVIDER_VALIDATE: 'llm:provider:validate',
  LLM_PROVIDER_TEST: 'llm:provider:test',

  // Job Queue
  JOB_LIST: 'jobs:list',
  JOB_CREATE: 'jobs:create',
  JOB_CANCEL: 'jobs:cancel',
  JOB_STATUS: 'jobs:status',
  JOB_PAUSE: 'jobs:pause',
  JOB_RESUME: 'jobs:resume',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',

  // Sync
  SYNC_START: 'sync:start',
  SYNC_STATUS: 'sync:status',
  SYNC_CANCEL: 'sync:cancel',

  // Database
  DB_SEED: 'db:seed',
  DB_GET_TIMELINE: 'db:getTimeline',
  DB_GET_TOPICS: 'db:getTopics',
  DB_GET_SENDERS: 'db:getSenders',
  DB_GET_TOPIC_SUMMARY: 'db:getTopicSummary',
  DB_GET_SENDER_SUMMARY: 'db:getSenderSummary',
} as const;

// Gmail OAuth channels
export type GmailOAuthStartChannel = 'gmail:oauth:start' | 'gmail:oauth:callback' | 'gmail:oauth:refresh' | 'gmail:oauth:revoke';
export type GmailOAuthStatusChannel = 'gmail:oauth:status';

export interface GmailOAuthStartRequest {
  channel: 'gmail:oauth:start';
  payload: {
    redirectPort: number;
  };
}

export interface GmailOAuthStartResponse {
  authUrl: string;
}

export interface GmailOAuthCallbackRequest {
  channel: 'gmail:oauth:callback';
  payload: {
    code: string;
    state: string;
  };
}

export interface GmailOAuthCallbackResponse {
  success: boolean;
  email?: string;
}

export interface GmailOAuthRefreshRequest {
  channel: 'gmail:oauth:refresh';
  payload: {};
}

export interface GmailOAuthRefreshResponse {
  success: boolean;
}

export interface GmailOAuthRevokeRequest {
  channel: 'gmail:oauth:revoke';
  payload: {};
}

export interface GmailOAuthRevokeResponse {
  success: boolean;
}

export interface GmailOAuthStatusRequest {
  channel: 'gmail:oauth:status';
  payload: {};
}

export interface GmailOAuthStatusResponse {
  isAuthenticated: boolean;
  email?: string;
  expiresAt?: string;
}

// LLM Provider channels
export type LLMProviderChannel = 'llm:provider:list' | 'llm:provider:set' | 'llm:provider:validate' | 'llm:provider:test';

export interface LLMProviderListRequest {
  channel: 'llm:provider:list';
  payload: {};
}

export interface LLMProviderListResponse {
  providers: Array<{
    id: string;
    name: string;
    isConfigured: boolean;
    isValid: boolean;
  }>;
}

export interface LLMProviderSetRequest {
  channel: 'llm:provider:set';
  payload: {
    providerId: string;
    apiKey: string;
  };
}

export interface LLMProviderSetResponse {
  success: boolean;
}

export interface LLMProviderValidateRequest {
  channel: 'llm:provider:validate';
  payload: {
    providerId: string;
  };
}

export interface LLMProviderValidateResponse {
  isValid: boolean;
  models: string[];
}

export interface LLMProviderTestRequest {
  channel: 'llm:provider:test';
  payload: {
    providerId: string;
    prompt?: string;
  };
}

export interface LLMProviderTestResponse {
  response: string;
  tokensUsed: number;
}

// Job Queue channels
export type JobQueueChannel = 'jobs:list' | 'jobs:create' | 'jobs:cancel' | 'jobs:status' | 'jobs:pause' | 'jobs:resume';

export interface JobListRequest {
  channel: 'jobs:list';
  payload: {
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'dead';
    limit?: number;
  };
}

export interface JobListResponse {
  jobs: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  }>;
  total: number;
}

export interface JobCreateRequest {
  channel: 'jobs:create';
  payload: {
    type: string;
    payload: Record<string, unknown>;
    emailId?: string;
    scheduledAt?: string;
  };
}

export interface JobCreateResponse {
  jobId: string;
}

export interface JobCancelRequest {
  channel: 'jobs:cancel';
  payload: {
    jobId: string;
  };
}

export interface JobCancelResponse {
  success: boolean;
}

export interface JobStatusRequest {
  channel: 'jobs:status';
  payload: {
    jobId: string;
  };
}

export interface JobStatusResponse {
  job: {
    id: string;
    type: string;
    status: string;
    payload: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: string;
    retryCount: number;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  };
}

export interface JobPauseRequest {
  channel: 'jobs:pause';
  payload: {};
}

export interface JobPauseResponse {
  success: boolean;
}

export interface JobResumeRequest {
  channel: 'jobs:resume';
  payload: {};
}

export interface JobResumeResponse {
  success: boolean;
}

// Settings channels
export type SettingsChannel = 'settings:get' | 'settings:set' | 'settings:reset';

export interface SettingsGetRequest {
  channel: 'settings:get';
  payload: {
    key: string;
  };
}

export interface SettingsGetResponse {
  value: unknown;
}

export interface SettingsSetRequest {
  channel: 'settings:set';
  payload: {
    key: string;
    value: unknown;
  };
}

export interface SettingsSetResponse {
  success: boolean;
}

export interface SettingsResetRequest {
  channel: 'settings:reset';
  payload: {
    key: string;
  };
}

export interface SettingsResetResponse {
  success: boolean;
}

// Sync channels
export type SyncChannel = 'sync:start' | 'sync:status' | 'sync:cancel';

export interface SyncStartRequest {
  channel: 'sync:start';
  payload: {
    lookbackDays?: number;
    incremental?: boolean;
  };
}

export interface SyncStartResponse {
  syncId: string;
  estimatedEmails: number;
}

export interface SyncStatusRequest {
  channel: 'sync:status';
  payload: {};
}

export interface SyncStatusResponse {
  isRunning: boolean;
  progress?: {
    total: number;
    processed: number;
    failed: number;
    currentBatch: string;
  };
  lastSync?: string;
  nextSync?: string;
}

export interface SyncCancelRequest {
  channel: 'sync:cancel';
  payload: {};
}

export interface SyncCancelResponse {
  success: boolean;
}

// Generic IPC types
export type IPCChannel = 
  | GmailOAuthStartChannel
  | GmailOAuthStatusChannel
  | LLMProviderChannel
  | JobQueueChannel
  | SettingsChannel
  | SyncChannel;

export interface IPCRequest<T = IPCChannel> {
  channel: T;
  payload?: unknown;
}

export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
