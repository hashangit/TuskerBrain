import { app, BrowserWindow, ipcMain } from 'electron';
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
import { GmailOAuthService } from './oauth-service';
import { EmailRepository, TimelineRepository, DealsRepository, TopicsRepository, SummariesRepository, LabelsRepository } from '@core/repositories';
import { EmailProcessingOrchestrator } from '@core/orchestrator';
import { LLMProviderFactory } from '@core/llm/provider';
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
let oauthService: GmailOAuthService | null = null;
let orchestrator: EmailProcessingOrchestrator | null = null;

// Repositories
let emailRepo: EmailRepository | null = null;
let timelineRepo: TimelineRepository | null = null;
let dealsRepo: DealsRepository | null = null;
let topicsRepo: TopicsRepository | null = null;
let summariesRepo: SummariesRepository | null = null;
let labelsRepo: LabelsRepository | null = null;

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

/**
 * Create an authenticated Gmail client using OAuth tokens
 */
async function createAuthenticatedGmailClient(): Promise<GmailClientInterface | null> {
  if (!oauthService) {
    console.warn('OAuth service not initialized');
    return null;
  }

  try {
    const status = await oauthService.getStatus();
    if (!status.isAuthenticated) {
      console.warn('User not authenticated with Gmail');
      return null;
    }

    const accessToken = await oauthService.getValidAccessToken();
    // Create Gmail client with access token
    const gmailClient = new GmailClient(accessToken);
    return gmailClient as unknown as GmailClientInterface;
  } catch (error) {
    console.error('Failed to create authenticated Gmail client:', error);
    return null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    icon: path.join(__dirname, '../public/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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
    // Initialize database with persistent storage
    const dbPath = path.join(app.getPath('userData'), 'tuskerbrain.db');
    db = new TuskerBrainDatabase(dbPath);
    await db.initialize();

    // Initialize repositories
    emailRepo = new EmailRepository(db);
    timelineRepo = new TimelineRepository(db);
    dealsRepo = new DealsRepository(db);
    topicsRepo = new TopicsRepository(db);
    summariesRepo = new SummariesRepository(db);
    labelsRepo = new LabelsRepository(db);

    // Create and wire job system
    jobQueue = new JobQueue();
    jobRunner = new JobRunner(jobQueue);

    // Create settings manager with persistent storage
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    SettingsManager.initializeWithFilePath(settingsPath);
    settingsManager = new SettingsManager();
    llmProviderManager = new LLMProviderManager(settingsManager);

    // Create OAuth service
    oauthService = new GmailOAuthService();

    // Create placeholder client initially - will be replaced when OAuth completes
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
        startAuthFlow: async (redirectPort: number) => {
          return oauthService!.startAuthFlow(redirectPort);
        },
        handleCallback: async (code: string, state: string) => {
          const result = await oauthService!.handleCallback(code, state);

          // After successful OAuth, create authenticated client and update sync manager
          if (result.success) {
            const authClient = await createAuthenticatedGmailClient();
            if (authClient && syncManager) {
              const rateLimitedClient = new RateLimitedGmailClient(authClient);
              (syncManager as any).client = rateLimitedClient;
              console.log('Gmail client updated with authenticated credentials');
            }
          }

          return result;
        },
        refreshToken: async () => {
          return oauthService!.refreshToken();
        },
        revokeToken: async () => {
          return oauthService!.revokeToken();
        },
        getStatus: async () => {
          return oauthService!.getStatus();
        },
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
        get: async (key: string) => {
          if (!settingsManager) return null;
          return settingsManager.get(key);
        },
        set: async (key: string, value: unknown) => {
          if (!settingsManager) return;
          await settingsManager.set(key, value);
        },
        reset: async (key: string) => {
          if (!settingsManager) return;
          await settingsManager.reset(key);
        },
      },
      syncManager: {
        startSync: async (lookbackDays?: number, incremental?: boolean) => {
          if (!syncManager) {
            throw new Error('Sync manager not initialized');
          }

          // Ensure we have an authenticated client
          const authClient = await createAuthenticatedGmailClient();
          if (!authClient) {
            throw new Error('Gmail not authenticated. Please connect your Gmail account first.');
          }

          // Update sync manager with authenticated client
          const rateLimitedClient = new RateLimitedGmailClient(authClient);
          (syncManager as any).client = rateLimitedClient;

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

    // Register additional IPC handlers for data retrieval
    registerDataHandlers();

    // Start job processing in main process for now
    // TODO: Move to utility process once ES module issues are resolved
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

/**
 * Register IPC handlers for data retrieval (Timeline, Topics, Deals)
 */
function registerDataHandlers() {
  // Timeline: List updates
  ipcMain.handle('timeline:list', async (_event, payload?: { priority?: string; limit?: number; offset?: number }) => {
    try {
      if (!timelineRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const updates = await timelineRepo.findAll({
        priority: payload?.priority as 'high' | 'medium' | 'low' | undefined,
        limit: payload?.limit,
        offset: payload?.offset,
      });

      return {
        success: true,
        data: {
          updates: updates.map(u => ({
            id: u.id,
            emailId: u.emailId,
            title: u.title,
            description: u.description,
            summary: u.summary,
            priority: u.priority,
            sentiment: u.sentiment,
            urgency: u.urgency,
            actionItem: u.actionItem,
            actionItemTitle: u.actionItemTitle,
            followUpDate: u.followUpDate,
            financialImpact: u.financialImpact,
            keyEntities: u.keyEntities,
            createdAt: u.createdAt.toISOString(),
          })),
          total: updates.length,
        },
      };
    } catch (error) {
      console.error('Failed to list timeline updates:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Topics: List all topics
  ipcMain.handle('topics:list', async () => {
    try {
      if (!topicsRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const topics = await topicsRepo.findAll();

      // Get summaries for each topic
      const topicsWithSummaries = await Promise.all(
        topics.map(async (topic) => {
          const summary = await topicsRepo!.getSummary(topic.id);
          return {
            id: topic.id,
            parentId: topic.parentId,
            name: topic.name,
            fullPath: topic.fullPath,
            emailCount: topic.emailCount,
            summary: summary?.summary || null,
            createdAt: topic.createdAt.toISOString(),
          };
        })
      );

      return {
        success: true,
        data: { topics: topicsWithSummaries },
      };
    } catch (error) {
      console.error('Failed to list topics:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Deals: List deals
  ipcMain.handle('deals:list', async (_event, payload?: { activeOnly?: boolean; limit?: number; offset?: number }) => {
    try {
      if (!dealsRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      let deals: any[];
      let total: number;

      if (payload?.limit !== undefined || payload?.offset !== undefined) {
        // Use paginated query
        const result = await dealsRepo.findAllPaginated({
          limit: payload?.limit,
          offset: payload?.offset,
        });
        deals = result.deals;
        total = result.total;
      } else if (payload?.activeOnly) {
        deals = await dealsRepo.findActive(payload.limit);
        total = deals.length;
      } else {
        deals = await dealsRepo.findAll();
        total = deals.length;
      }

      return {
        success: true,
        data: {
          deals: deals.map(d => ({
            id: d.id,
            emailId: d.emailId,
            dealTitle: d.dealTitle,
            dealDescription: d.dealDescription,
            brandName: d.brandName,
            dealCategory: d.dealCategory,
            dealValue: d.dealValue,
            dealValueType: d.dealValueType,
            dealCode: d.dealCode,
            minimumPurchase: d.minimumPurchase,
            dealExpiry: d.dealExpiry ? d.dealExpiry.toISOString() : null,
            dealLink: d.dealLink,
            isActive: d.isActive,
            usedAt: d.usedAt ? d.usedAt.toISOString() : null,
            dismissedAt: d.dismissedAt ? d.dismissedAt.toISOString() : null,
            createdAt: d.createdAt.toISOString(),
          })),
          total,
        },
      };
    } catch (error) {
      console.error('Failed to list deals:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Deals: Mark as Used
  ipcMain.handle('deals:mark-used', async (_event, dealId: string) => {
    try {
      if (!dealsRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const deal = await dealsRepo.markAsUsed(dealId);
      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }

      return {
        success: true,
        data: {
          id: deal.id,
          usedAt: deal.usedAt?.toISOString(),
        },
      };
    } catch (error) {
      console.error('Failed to mark deal as used:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Deals: Dismiss
  ipcMain.handle('deals:dismiss', async (_event, dealId: string) => {
    try {
      if (!dealsRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const deal = await dealsRepo.dismiss(dealId);
      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }

      return {
        success: true,
        data: {
          id: deal.id,
          dismissedAt: deal.dismissedAt?.toISOString(),
        },
      };
    } catch (error) {
      console.error('Failed to dismiss deal:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Deals: Undo Mark as Used
  ipcMain.handle('deals:undo-mark-used', async (_event, dealId: string) => {
    try {
      if (!dealsRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const deal = await dealsRepo.undoMarkAsUsed(dealId);
      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }

      return {
        success: true,
        data: {
          id: deal.id,
          usedAt: null,
        },
      };
    } catch (error) {
      console.error('Failed to undo mark deal as used:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Deals: Undo Dismiss
  ipcMain.handle('deals:undo-dismiss', async (_event, dealId: string) => {
    try {
      if (!dealsRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const deal = await dealsRepo.undoDismiss(dealId);
      if (!deal) {
        return { success: false, error: 'Deal not found' };
      }

      return {
        success: true,
        data: {
          id: deal.id,
          dismissedAt: null,
        },
      };
    } catch (error) {
      console.error('Failed to undo dismiss deal:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Sender Summaries: List
  ipcMain.handle('senders:list', async () => {
    try {
      if (!summariesRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const summaries = await summariesRepo.getAllSenderSummaries();

      return {
        success: true,
        data: {
          senders: summaries.map(s => ({
            id: s.id,
            senderDomain: s.senderDomain,
            summary: s.summary,
            wordCount: s.wordCount,
            lastUpdated: s.lastUpdated.toISOString(),
            updateCount: s.updateCount,
          })),
        },
      };
    } catch (error) {
      console.error('Failed to list sender summaries:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

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
