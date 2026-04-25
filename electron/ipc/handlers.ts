import { ipcMain } from 'electron';
import type {
  GmailOAuthStartRequest,
  GmailOAuthStartResponse,
  GmailOAuthCallbackRequest,
  GmailOAuthCallbackResponse,
  GmailOAuthRefreshRequest,
  GmailOAuthRefreshResponse,
  GmailOAuthRevokeRequest,
  GmailOAuthRevokeResponse,
  GmailOAuthStatusResponse,
  LLMProviderListRequest,
  LLMProviderListResponse,
  LLMProviderSetRequest,
  LLMProviderSetResponse,
  LLMProviderValidateRequest,
  LLMProviderValidateResponse,
  LLMProviderTestRequest,
  LLMProviderTestResponse,
  JobListRequest,
  JobListResponse,
  JobCreateRequest,
  JobCreateResponse,
  JobCancelRequest,
  JobCancelResponse,
  JobStatusRequest,
  JobStatusResponse,
  SettingsGetRequest,
  SettingsGetResponse,
  SettingsSetRequest,
  SettingsSetResponse,
  SettingsResetRequest,
  SettingsResetResponse,
  SyncStartRequest,
  SyncStartResponse,
  SyncStatusResponse,
} from './channels';

/**
 * Type-safe IPC handler wrapper.
 * Provides consistent error handling and response formatting.
 */
export function createIPCHandler<TRequest, TResponse>(
  channel: string,
  handler: (payload: TRequest['payload']) => Promise<TResponse>
): void {
  ipcMain.handle(channel, async (_event, payload: TRequest['payload']) => {
    try {
      const data = await handler(payload);
      return { success: true, data } as TResponse;
    } catch (error) {
      console.error(`IPC error [${channel}]:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } as TResponse;
    }
  });
}

/**
 * Registers all IPC handlers for the application.
 */
export function registerIPCHandlers(dependencies: {
  gmailOAuth: {
    startAuthFlow: (redirectPort: number) => Promise<{ authUrl: string }>;
    handleCallback: (code: string, state: string) => Promise<{ success: boolean; email?: string }>;
    refreshToken: () => Promise<{ success: boolean }>;
    revokeToken: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<{
      isAuthenticated: boolean;
      needsReauth?: boolean;
      email?: string;
      expiresAt?: string;
    }>;
  };
  llmProvider: {
    listProviders: () => Promise<Array<{
      id: string;
      name: string;
      isValid: boolean;
    }>>;
    setProvider: (providerId: string, apiKey: string, model?: string) => Promise<{ success: boolean }>;
    validateProvider: (providerId: string) => Promise<{
      isValid: boolean;
      models: string[];
    }>;
    testProvider: (providerId: string, prompt?: string) => Promise<{
      response: string;
      tokensUsed: number;
    }>;
  };
  jobQueue: {
    listJobs: (status?: string, limit?: number) => Promise<{
      jobs: Array<{
        id: string;
        type: string;
        status: string;
        createdAt: string;
        startedAt?: string;
        completedAt?: string;
      }>;
      total: number;
    }>;
    createJob: (type: string, payload: Record<string, unknown>, emailId?: string, scheduledAt?: string) => Promise<string>;
    cancelJob: (jobId: string) => Promise<void>;
    getJobStatus: (jobId: string) => Promise<{
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
    }>;
    pause: () => void;
    resume: () => void;
  };
  settings: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
    reset: (key: string) => Promise<void>;
  };
  syncManager: {
    startSync: (lookbackDays?: number, incremental?: boolean) => Promise<{
      syncId: string;
      estimatedEmails: number;
    }>;
    getStatus: () => Promise<{
      isRunning: boolean;
      progress?: {
        total: number;
        processed: number;
        failed: number;
        currentBatch: string;
      };
      lastSync?: string;
      nextSync?: string;
    }>;
    cancel: () => Promise<void>;
  };
}): void {
  // Gmail OAuth handlers
  registerOAuthHandlers(dependencies);

  // LLM Provider handlers
  registerLLMHandlers(dependencies);

  // Job Queue handlers
  registerJobHandlers(dependencies);

  // Settings handlers
  registerSettingsHandlers(dependencies);

  // Sync handlers
  registerSyncHandlers(dependencies);
}

function registerOAuthHandlers(dependencies: Parameters<typeof registerIPCHandlers>[0]): void {
  // Gmail OAuth: Start
  createIPCHandler<GmailOAuthStartRequest, GmailOAuthStartResponse>(
    'gmail:oauth:start',
    async (payload) => {
      const result = await dependencies.gmailOAuth.startAuthFlow(payload.redirectPort);
      return result;
    }
  );

  // Gmail OAuth: Callback
  createIPCHandler<GmailOAuthCallbackRequest, GmailOAuthCallbackResponse>(
    'gmail:oauth:callback',
    async (payload) => {
      const result = await dependencies.gmailOAuth.handleCallback(payload.code, payload.state);
      return result;
    }
  );

  // Gmail OAuth: Refresh
  createIPCHandler<GmailOAuthRefreshRequest, GmailOAuthRefreshResponse>(
    'gmail:oauth:refresh',
    async () => {
      const result = await dependencies.gmailOAuth.refreshToken();
      return result;
    }
  );

  // Gmail OAuth: Revoke
  createIPCHandler<GmailOAuthRevokeRequest, GmailOAuthRevokeResponse>(
    'gmail:oauth:revoke',
    async () => {
      const result = await dependencies.gmailOAuth.revokeToken();
      return result;
    }
  );

  // Gmail OAuth: Status
  createIPCHandler<{ channel: 'gmail:oauth:status' }, GmailOAuthStatusResponse>(
    'gmail:oauth:status',
    async () => {
      const status = await dependencies.gmailOAuth.getStatus();
      return status;
    }
  );
}

function registerLLMHandlers(dependencies: Parameters<typeof registerOAuthHandlers>[0]): void {
  // LLM Provider: List
  createIPCHandler<LLMProviderListRequest, LLMProviderListResponse>(
    'llm:provider:list',
    async () => {
      const providers = await dependencies.llmProvider.listProviders();
      const activeProvider = await dependencies.settings.get('activeProvider') as string | null;
      return { providers, activeProvider: activeProvider ?? null };
    }
  );

  // LLM Provider: Set
  createIPCHandler<LLMProviderSetRequest, LLMProviderSetResponse>(
    'llm:provider:set',
    async (payload) => {
      const result = await dependencies.llmProvider.setProvider(payload.providerId, payload.apiKey, payload.model);
      return result;
    }
  );

  // LLM Provider: Validate
  createIPCHandler<LLMProviderValidateRequest, LLMProviderValidateResponse>(
    'llm:provider:validate',
    async (payload) => {
      console.log('[IPC] LLM validate provider:', payload.providerId);
      const result = await dependencies.llmProvider.validateProvider(payload.providerId);
      console.log('[IPC] LLM validate result:', result);
      return result;
    }
  );

  // LLM Provider: Test
  createIPCHandler<LLMProviderTestRequest, LLMProviderTestResponse>(
    'llm:provider:test',
    async (payload) => {
      const result = await dependencies.llmProvider.testProvider(payload.providerId, payload.prompt);
      return result;
    }
  );
}

function registerJobHandlers(dependencies: Parameters<typeof registerOAuthHandlers>[0]): void {
  // Jobs: List
  createIPCHandler<JobListRequest, JobListResponse>(
    'jobs:list',
    async (payload) => {
      const result = await dependencies.jobQueue.listJobs(
        payload?.status,
        payload?.limit
      );
      return result;
    }
  );

  // Jobs: Create
  createIPCHandler<JobCreateRequest, JobCreateResponse>(
    'jobs:create',
    async (payload) => {
      const jobId = await dependencies.jobQueue.createJob(
        payload.type,
        payload.payload,
        payload.emailId,
        payload.scheduledAt
      );
      return { jobId };
    }
  );

  // Jobs: Cancel
  createIPCHandler<JobCancelRequest, JobCancelResponse>(
    'jobs:cancel',
    async (payload) => {
      await dependencies.jobQueue.cancelJob(payload.jobId);
      return { success: true };
    }
  );

  // Jobs: Status
  createIPCHandler<JobStatusRequest, JobStatusResponse>(
    'jobs:status',
    async (payload) => {
      const job = await dependencies.jobQueue.getJobStatus(payload.jobId);
      return { job };
    }
  );

  // Jobs: Pause
  ipcMain.handle('jobs:pause', () => {
    dependencies.jobQueue.pause();
    return { success: true };
  });

  // Jobs: Resume
  ipcMain.handle('jobs:resume', () => {
    dependencies.jobQueue.resume();
    return { success: true };
  });
}

function registerSettingsHandlers(dependencies: Parameters<typeof registerOAuthHandlers>[0]): void {
  // Settings: Get
  createIPCHandler<SettingsGetRequest, SettingsGetResponse>(
    'settings:get',
    async (payload) => {
      const value = await dependencies.settings.get(payload.key);
      return { value };
    }
  );

  // Settings: Set
  createIPCHandler<SettingsSetRequest, SettingsSetResponse>(
    'settings:set',
    async (payload) => {
      await dependencies.settings.set(payload.key, payload.value);
      return { success: true };
    }
  );

  // Settings: Reset
  createIPCHandler<SettingsResetRequest, SettingsResetResponse>(
    'settings:reset',
    async (payload) => {
      await dependencies.settings.reset(payload.key);
      return { success: true };
    }
  );
}

function registerSyncHandlers(dependencies: Parameters<typeof registerOAuthHandlers>[0]): void {
  // Sync: Start
  createIPCHandler<SyncStartRequest, SyncStartResponse>(
    'sync:start',
    async (payload) => {
      const result = await dependencies.syncManager.startSync(
        payload?.lookbackDays,
        payload?.incremental
      );
      return result;
    }
  );

  // Sync: Status
  createIPCHandler<{ channel: 'sync:status' }, SyncStatusResponse>(
    'sync:status',
    async () => {
      const status = await dependencies.syncManager.getStatus();
      return status;
    }
  );

  // Sync: Cancel
  ipcMain.handle('sync:cancel', async () => {
    await dependencies.syncManager.cancel();
    return { success: true };
  });
}

/**
 * Removes all IPC handlers (for cleanup/testing).
 */
export function removeAllIPCHandlers(): void {
  const channels = [
    'gmail:oauth:start',
    'gmail:oauth:callback',
    'gmail:oauth:refresh',
    'gmail:oauth:revoke',
    'gmail:oauth:status',
    'llm:provider:list',
    'llm:provider:set',
    'llm:provider:validate',
    'llm:provider:test',
    'jobs:list',
    'jobs:create',
    'jobs:cancel',
    'jobs:status',
    'jobs:pause',
    'jobs:resume',
    'settings:get',
    'settings:set',
    'settings:reset',
    'sync:start',
    'sync:status',
    'sync:cancel',
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }
}
