import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { autoUpdaterInstance } from './auto-updater';
import { JobQueue } from '@core/jobs/queue';
import { JobRunner } from '@core/jobs/runner';
import { TuskerBrainDatabase, recoverUnprocessedJobs } from '@db/index';
import { registerIPCHandlers } from './ipc/handlers';
import { GmailSyncManager, GmailClient as SyncGmailClient } from '@core/gmail/sync';
import { GmailClient } from '@core/gmail/client';
import { RateLimitedGmailClient } from '@core/gmail/rate-limited-client';
import { SettingsManager } from '@core/settings/manager';
import { LLMProviderManager } from '@core/llm/provider-manager';
import type { ProviderName } from '@core/llm/provider';

// Re-export for type usage
type ProviderNameAlias = ProviderName;

// Use the sync.ts GmailClient interface for type compatibility
type GmailClientInterface = SyncGmailClient;

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let jobQueue: JobQueue | null = null;
let jobRunner: JobRunner | null = null;
let db: TuskerBrainDatabase | null = null;
let syncManager: GmailSyncManager | null = null;
let settingsManager: SettingsManager | null = null;
let llmProviderManager: LLMProviderManager | null = null;

/**
 * Get the job queue instance (for testing)
 */
export function getJobQueue(): JobQueue | null {
  return jobQueue;
}

/**
 * Get the job runner instance (for testing)
 */
export function getJobRunner(): JobRunner | null {
  return jobRunner;
}

/**
 * Get the database instance (for testing)
 */
export function getDatabase(): TuskerBrainDatabase | null {
  return db;
}

/**
 * Get the sync manager instance (for testing)
 */
export function getSyncManager(): GmailSyncManager | null {
  return syncManager;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'TuskerBrain',
    show: false,
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    // Initialize database
    db = new TuskerBrainDatabase();
    await db.initialize();

    // Create and wire job system
    jobQueue = new JobQueue();
    jobRunner = new JobRunner(jobQueue);

    // Create Gmail client with rate limiting
    // Note: In production, we would get the access token from OAuth
    // For now, we create a placeholder client that will be replaced when OAuth is implemented
    const placeholderClient: GmailClientInterface = {
      listMessages: async () => ({ messages: [], nextPageToken: undefined }),
      getMessage: async () => null,
      getProfile: async () => ({ emailAddress: 'placeholder@example.com', historyId: undefined, messagesTotal: 0 }),
      modifyMessage: async () => ({}),
    };

    // Wrap with rate limiter
    const gmailClient = new RateLimitedGmailClient(placeholderClient);

    // Create sync manager with Gmail client and job queue
    syncManager = new GmailSyncManager(gmailClient, jobQueue);

    // Create settings manager and LLM provider manager
    settingsManager = new SettingsManager();
    llmProviderManager = new LLMProviderManager(settingsManager);

    // Register IPC handlers with job queue and database
    registerIPCHandlers({
      jobQueue: {
        listJobs: async (status?: string, limit?: number) => {
          const jobs = status
            ? await jobQueue!.getJobsByStatus(status as any)
            : Array.from((jobQueue as any).jobs.values());
          const limited = limit ? jobs.slice(0, limit) : jobs;
          return {
            jobs: limited.map(j => ({
              id: j.id,
              type: j.type,
              status: j.status,
              createdAt: j.createdAt.toISOString(),
              startedAt: j.startedAt?.toISOString(),
              completedAt: j.completedAt?.toISOString(),
            })),
            total: limited.length,
          };
        },
        createJob: async (type: string, payload: Record<string, unknown>, emailId?: string, scheduledAt?: string) => {
          const job = await jobQueue!.createJob({
            type: type as any,
            payload,
            emailId,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          });
          return job.id;
        },
        cancelJob: async (jobId: string) => {
          // Mark job as dead to cancel it
          await jobQueue!.updateJobStatus(jobId, 'dead');
        },
        getJobStatus: async (jobId: string) => {
          const job = await jobQueue!.getJob(jobId);
          if (!job) throw new Error(`Job ${jobId} not found`);
          return {
            id: job.id,
            type: job.type,
            status: job.status,
            payload: job.payload,
            result: job.result,
            error: job.error,
            retryCount: job.retryCount,
            createdAt: job.createdAt.toISOString(),
            startedAt: job.startedAt?.toISOString(),
            completedAt: job.completedAt?.toISOString(),
          };
        },
        pause: () => jobQueue!.pauseProcessing(),
        resume: () => jobQueue!.resumeProcessing(),
      },
      gmailOAuth: {
        startAuthFlow: async () => ({ authUrl: '' }),
        handleCallback: async () => {},
        refreshToken: async () => {},
        revokeToken: async () => {},
        getStatus: async () => ({ isAuthenticated: false }),
      },
      llmProvider: {
        listProviders: async () => {
          if (!llmProviderManager) return [];
          return llmProviderManager.listProviders();
        },
        setProvider: async (providerId: string, apiKey: string) => {
          if (!llmProviderManager) return;
          await llmProviderManager.setProvider(providerId as ProviderName, apiKey);
        },
        validateProvider: async (providerId: string) => {
          if (!llmProviderManager) return { isValid: false, models: [] };
          return llmProviderManager.validateProvider(providerId as ProviderName);
        },
        testProvider: async (providerId: string, prompt?: string) => {
          if (!llmProviderManager) return { response: '', tokensUsed: 0 };
          return llmProviderManager.testProvider(providerId as ProviderName, prompt);
        },
      },
      settings: {
        get: async () => null,
        set: async () => {},
        reset: async () => {},
      },
      syncManager: {
        startSync: async (lookbackDays?: number, incremental?: boolean) => {
          if (!syncManager) {
            throw new Error('Sync manager not initialized');
          }
          await syncManager.startInitialSync(lookbackDays ?? 30);
          const progress = syncManager.getProgress();
          return {
            syncId: `sync-${Date.now()}`,
            estimatedEmails: progress.total,
          };
        },
        getStatus: async () => {
          if (!syncManager) {
            return { isRunning: false };
          }
          const progress = syncManager.getProgress();
          const state = await syncManager.getSyncState();
          return {
            isRunning: progress.isRunning,
            progress: progress.isRunning ? {
              total: progress.total,
              processed: progress.processed,
              failed: progress.failed,
              currentBatch: progress.currentBatch,
            } : undefined,
            lastSync: state.lastFullSync?.toISOString(),
          };
        },
        cancel: async () => {
          if (syncManager) {
            syncManager.stop();
          }
        },
      },
    });

    // Start job processing
    await jobRunner.start();

    // Recover unprocessed jobs from source data
    const recoveredCount = await recoverUnprocessedJobs(db, jobQueue);
    if (recoveredCount > 0) {
      console.log(`Recovered ${recoveredCount} unprocessed jobs on startup`);
    }

    // Cleanup old completed jobs
    const cleanedCount = await jobQueue.cleanupOldJobs();
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old completed jobs`);
    }

    // Create window
    createWindow();

    // Initialize auto-updater (in production)
    if (!process.env.VITE_DEV_SERVER_URL) {
      await autoUpdaterInstance.initialize();
    }
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on app quit
app.on('before-quit', async () => {
  if (jobRunner) {
    await jobRunner.stop();
  }
  if (db) {
    await db.close();
  }
});

// Export for testing
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
