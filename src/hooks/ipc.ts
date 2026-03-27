// @ts-nocheck
import { useState, useCallback, useEffect } from 'react';
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
} from '../../electron/ipc/channels';

/**
 * React hooks for IPC communication with Electron main process.
 * These hooks wrap the electronAPI exposed via preload.ts
 */

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
      // Unwrap the IPC response
      const data = response.success ? response.data : response;
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listProviders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.listProviders();
      // Unwrap the IPC response - handler wraps in { success, data }
      const data = response && typeof response === 'object' && 'success' in response && 'data' in response
        ? response.data
        : response;
      const providers = data?.providers ?? [];
      setProviders(providers);
      return providers;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setProvider = useCallback(async (providerId: string, apiKey: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await window.electronAPI.setProvider(providerId, apiKey);
      // Unwrap the IPC response
      if (response && typeof response === 'object' && 'success' in response && 'data' in response) {
        return response.data;
      }
      return response;
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
      // Unwrap the IPC response
      if (response && typeof response === 'object' && 'success' in response && 'data' in response) {
        return response.data;
      }
      return response;
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
      setJobs(response.jobs);
      setTotal(response.total);
      return response;
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
      setStatus(response);
      return response;
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
