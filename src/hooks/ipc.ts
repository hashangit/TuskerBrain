import { useState, useCallback, useEffect } from 'react';
import type {
  GmailOAuthStatusResponse,
  LLMProviderListResponse,
  LLMProviderSetResponse,
  LLMProviderValidateResponse,
  JobListResponse,
  SyncStatusResponse,
} from '../../electron/ipc/channels';

/**
 * React hooks for IPC communication with Electron main process.
 * These hooks wrap the electronAPI exposed via preload.ts
 */

type WrappedIpcResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

type MaybeWrapped<T> = T | WrappedIpcResponse<T>;

function unwrapIpcData<T>(response: MaybeWrapped<T>): T | undefined {
  if (
    response &&
    typeof response === 'object' &&
    'success' in response &&
    'data' in response
  ) {
    return (response as WrappedIpcResponse<T>).data;
  }
  return response as T;
}

// ============================================================================
// Gmail OAuth Hooks
// ============================================================================

/**
 * Hook for Gmail OAuth operations
 */
export function useGmailOAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [email, setEmail] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.getAuthStatus();
      console.log('[Frontend] checkStatus response:', response);
      const data = unwrapIpcData(response as MaybeWrapped<GmailOAuthStatusResponse>);
      if (!data) return null;
      setIsAuthenticated(data.isAuthenticated);
      setNeedsReauth(data.needsReauth ?? false);
      setEmail(data.email);
      return data;
    } catch (err) {
      console.error('[Frontend] checkStatus error:', err);
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startOAuth = useCallback(async (redirectPort: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.startOAuth(redirectPort);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCallback = useCallback(async (code: string, state: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.handleOAuthCallback(code, state);
      if (response.success) {
        await checkStatus();
      }
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [checkStatus]);

  const refreshToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.refreshOAuthToken();
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const revokeToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.revokeOAuthToken();
      if (response.success) {
        setIsAuthenticated(false);
        setEmail(undefined);
      }
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isAuthenticated,
    needsReauth,
    email,
    isLoading,
    error,
    checkStatus,
    startOAuth,
    handleCallback,
    refreshToken,
    revokeToken,
  };
}

// ============================================================================
// LLM Provider Hooks
// ============================================================================

/**
 * Hook for LLM provider operations
 */
export function useLLMProvider() {
  const [providers, setProviders] = useState<LLMProviderListResponse['providers']>([]);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.listProviders();
      const data = unwrapIpcData(response as MaybeWrapped<LLMProviderListResponse>);
      const providers = data?.providers ?? [];
      setProviders(providers);
      setActiveProvider(data?.activeProvider ?? null);
      return providers;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setProvider = useCallback(async (providerId: string, apiKey: string, model?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.setProvider(providerId, apiKey, model);
      return unwrapIpcData(response as MaybeWrapped<LLMProviderSetResponse>) ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const validateProvider = useCallback(async (providerId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.validateProvider(providerId);
      return unwrapIpcData(response as MaybeWrapped<LLMProviderValidateResponse>) ?? null;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const testProvider = useCallback(async (providerId: string, prompt?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.testProvider(providerId, prompt);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    providers,
    activeProvider,
    isLoading,
    error,
    listProviders,
    setProvider,
    validateProvider,
    testProvider,
  };
}

// ============================================================================
// Job Queue Hooks
// ============================================================================

/**
 * Hook for job queue operations
 */
export function useJobQueue() {
  const [jobs, setJobs] = useState<JobListResponse['jobs']>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listJobs = useCallback(async (status?: string, limit?: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.listJobs(status, limit);
      const data = unwrapIpcData(response as MaybeWrapped<JobListResponse>);
      if (!data) return null;
      setJobs(data.jobs);
      setTotal(data.total);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createJob = useCallback(async (
    type: string,
    payload: Record<string, unknown>,
    emailId?: string,
    scheduledAt?: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.createJob(type, payload, emailId, scheduledAt);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cancelJob = useCallback(async (jobId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.cancelJob(jobId);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getJobStatus = useCallback(async (jobId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.getJobStatus(jobId);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const pauseJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.pauseJobs();
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resumeJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.resumeJobs();
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    jobs,
    total,
    isLoading,
    error,
    listJobs,
    createJob,
    cancelJob,
    getJobStatus,
    pauseJobs,
    resumeJobs,
  };
}

// ============================================================================
// Settings Hooks
// ============================================================================

/**
 * Hook for settings operations
 */
export function useSettings() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSetting = useCallback(async <T = unknown>(key: string): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.getSetting(key);
      return response as T;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSetting = useCallback(async (key: string, value: unknown) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.setSetting(key, value);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetSetting = useCallback(async (key: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.resetSetting(key);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    getSetting,
    setSetting,
    resetSetting,
  };
}

// ============================================================================
// Sync Hooks
// ============================================================================

/**
 * Hook for sync operations
 */
export function useSync() {
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSync = useCallback(async (lookbackDays?: number, incremental?: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.startSync(lookbackDays, incremental);
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSyncStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.getSyncStatus();
      const data = unwrapIpcData(response as MaybeWrapped<SyncStatusResponse>);
      if (!data) return null;
      setStatus(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cancelSync = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.cancelSync();
      return response;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    status,
    isLoading,
    error,
    startSync,
    getSyncStatus,
    cancelSync,
  };
}

/**
 * Hook that polls sync status at an interval
 */
export function useSyncStatusPolling(intervalMs: number = 5000) {
  const { status, isLoading, error, getSyncStatus } = useSync();

  useEffect(() => {
    // Initial fetch
    getSyncStatus();

    // Set up polling
    const interval = setInterval(() => {
      getSyncStatus();
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs, getSyncStatus]);

  return { status, isLoading, error, refresh: getSyncStatus };
}

/**
 * Hook for real-time sync and processing progress via IPC events.
 * Subscribes to sync:progress, sync:complete, processing:progress, processing:complete events.
 */
export function useSyncProgress() {
  const [state, setState] = useState<{
    syncPhase: 'idle' | 'syncing' | 'complete' | 'error';
    syncProgress: { processed: number; total: number };
    processingPhase: 'idle' | 'waiting' | 'processing' | 'complete' | 'error';
    processingProgress: { processed: number; total: number };
    processingFailed: number;
    processingError: string | null;
    backfillDay?: number;
    backfillTotal?: number;
  }>({
    syncPhase: 'idle',
    syncProgress: { processed: 0, total: 0 },
    processingPhase: 'idle',
    processingProgress: { processed: 0, total: 0 },
    processingFailed: 0,
    processingError: null,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;

    const unsubs: (() => void)[] = [];

    // Subscribe to sync progress events
    if (window.electronAPI.onSyncProgress) {
      unsubs.push(window.electronAPI.onSyncProgress((data) => {
        setState(prev => ({
          ...prev,
          syncPhase: 'syncing',
          syncProgress: { processed: data.processed, total: data.total },
          // AI processing is waiting while sync is running
          processingPhase: prev.processingPhase === 'idle' ? 'waiting' : prev.processingPhase,
        }));
      }));
    }
    if (window.electronAPI.onSyncComplete) {
      unsubs.push(window.electronAPI.onSyncComplete((data) => {
        setState(prev => ({
          ...prev,
          syncPhase: 'complete',
          syncProgress: { processed: data.total, total: data.total },
        }));
      }));
    }
    if (window.electronAPI.onSyncError) {
      unsubs.push(window.electronAPI.onSyncError(() => {
        setState(prev => ({ ...prev, syncPhase: 'error' }));
      }));
    }

    // Subscribe to processing progress events
    if (window.electronAPI.onProcessingStarted) {
      unsubs.push(window.electronAPI.onProcessingStarted((data) => {
        setState(prev => ({
          ...prev,
          processingPhase: 'processing',
          processingProgress: { processed: 0, total: data.total },
          processingFailed: 0,
          processingError: null,
        }));
      }));
    }
    if (window.electronAPI.onProcessingProgress) {
      unsubs.push(window.electronAPI.onProcessingProgress((data) => {
        setState(prev => ({
          ...prev,
          processingPhase: 'processing',
          processingProgress: { processed: data.processed, total: data.total },
          processingFailed: data.failed ?? prev.processingFailed,
        }));
      }));
    }
    if (window.electronAPI.onProcessingComplete) {
      unsubs.push(window.electronAPI.onProcessingComplete((data) => {
        setState(prev => ({
          ...prev,
          processingPhase: 'complete',
          processingFailed: data?.failed ?? prev.processingFailed,
        }));
      }));
    }
    if (window.electronAPI.onProcessingFailed) {
      unsubs.push(window.electronAPI.onProcessingFailed((data) => {
        setState(prev => ({
          ...prev,
          processingFailed: data.failed,
        }));
      }));
    }
    if (window.electronAPI.onProcessingError) {
      unsubs.push(window.electronAPI.onProcessingError((data) => {
        setState(prev => ({
          ...prev,
          processingPhase: 'error',
          processingError: data.error,
        }));
      }));
    }

    // Backfill events
    if (window.electronAPI.onBackfillProgress) {
      unsubs.push(window.electronAPI.onBackfillProgress((data) => {
        setState(prev => ({
          ...prev,
          backfillDay: data.day,
          backfillTotal: data.totalDays,
        }));
      }));
    }
    if (window.electronAPI.onBackfillComplete) {
      unsubs.push(window.electronAPI.onBackfillComplete(() => {
        setState(prev => ({ ...prev, backfillDay: undefined, backfillTotal: undefined }));
      }));
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  return state;
}
