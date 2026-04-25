import { app, ipcMain, shell, utilityProcess, type BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq, and, desc, sql } from 'drizzle-orm';
import { autoUpdaterInstance } from './auto-updater';
import { createMainWindow } from './window';
import { initializeRuntime } from './runtime';
import { forwardSyncProgress, startPeriodicSync } from './sync-events';
import { JobQueue } from '@core/jobs/queue';
import { TuskerBrainDatabase } from '@db/index';
import * as schema from '@db/schema';
import { registerIPCHandlers } from './ipc/handlers';
import { GmailSyncManager, GmailClient as SyncGmailClient, HISTORY_ID_EXPIRED } from '@core/gmail/sync';
import { GmailClient } from '@core/gmail/client';
import { RateLimitedGmailClient } from '@core/gmail/rate-limited-client';
import { SettingsManager } from '@core/settings/manager';
import { LLMProviderManager } from '@core/llm/provider-manager';
import { GmailOAuthService } from './oauth-service';
import { EmailRepository, TimelineRepository, DealsRepository, TopicsRepository, SummariesRepository } from '@core/repositories';
import type { ProviderName } from '@core/llm/provider';

// Use the sync.ts GmailClient interface for type compatibility
type GmailClientInterface = SyncGmailClient;

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let jobQueue: JobQueue | null = null;
let utilityChild: Electron.UtilityProcess | null = null;
let db: TuskerBrainDatabase | null = null;
let syncManager: GmailSyncManager | null = null;
let settingsManager: SettingsManager | null = null;
let llmProviderManager: LLMProviderManager | null = null;
let oauthService: GmailOAuthService | null = null;

// Repositories
let emailRepo: EmailRepository | null = null;
let timelineRepo: TimelineRepository | null = null;
let dealsRepo: DealsRepository | null = null;
let topicsRepo: TopicsRepository | null = null;
let summariesRepo: SummariesRepository | null = null;
let syncTimer: NodeJS.Timeout | null = null;

/**
 * Get the job queue instance (for testing)
 */
export function getJobQueue(): JobQueue | null {
  return jobQueue;
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
  mainWindow = createMainWindow(__dirname);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    const runtime = await initializeRuntime();
    const dbPath = runtime.dbPath;
    db = runtime.db;
    jobQueue = runtime.jobQueue;
    syncManager = runtime.syncManager;
    settingsManager = runtime.settingsManager;
    llmProviderManager = runtime.llmProviderManager;
    oauthService = runtime.oauthService;
    emailRepo = runtime.emailRepo;
    timelineRepo = runtime.timelineRepo;
    dealsRepo = runtime.dealsRepo;
    topicsRepo = runtime.topicsRepo;
    summariesRepo = runtime.summariesRepo;

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

          // After successful OAuth, create authenticated client and trigger initial sync
          if (result.success) {
            const authClient = await createAuthenticatedGmailClient();
            if (authClient && syncManager) {
              const rateLimitedClient = new RateLimitedGmailClient(authClient);
              syncManager.setClient(rateLimitedClient);
              console.log('Gmail client updated with authenticated credentials');

              // Trigger initial sync now that we have credentials
              runSyncCycle();
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
          // Forward to utility process so it can create the orchestrator
          if (utilityChild) {
            utilityChild.postMessage({ type: 'set-llm-provider', provider: providerId as ProviderName, apiKey });
          }
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
        startSync: async (_lookbackDays?: number, _incremental?: boolean) => {
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
          syncManager.setClient(rateLimitedClient);

          // Instead of startInitialSync, use fetchAndStoreToday for today
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const { emailIds, total } = await syncManager.fetchAndStoreToday(today, emailRepo!);

          // Emit sync progress and complete events
          mainWindow?.webContents.send('sync:progress', {
            processed: total,
            total,
            phase: 'sync',
          });

          mainWindow?.webContents.send('sync:complete', {
            total,
            emailCount: emailIds.length,
          });

          // Forward email IDs to utility process for AI processing
          if (utilityChild) {
            utilityChild.postMessage({
              type: 'process-emails',
              emailIds,
            });
          }

          // Emit processing started to renderer
          mainWindow?.webContents.send('processing:started', { total: emailIds.length });

          return {
            syncId: `sync-${Date.now()}`,
            estimatedEmails: total,
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

    // Start utility process for background job processing
    const utilityPath = path.join(__dirname, 'index.js');
    utilityChild = utilityProcess.fork(utilityPath, [], {
      stdio: 'pipe',
      serviceName: 'TuskerBrain Worker',
    });

    // Wait for utility process to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Utility process timeout')), 10000);
      utilityChild!.on('message', (msg: any) => {
        if (msg.type === 'ready') {
          clearTimeout(timeout);
          resolve();
        }
      });
    });

    // Initialize utility process with database path
    utilityChild.postMessage({ type: 'init', dbPath });

    // Wait for initialization to complete
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Utility process init timeout')), 10000);
      utilityChild!.on('message', (msg: any) => {
        if (msg.type === 'initialized' && msg.success) {
          clearTimeout(timeout);
          resolve();
        } else if (msg.type === 'initialized' && !msg.success) {
          clearTimeout(timeout);
          reject(new Error(`Utility process init failed: ${msg.error}`));
        }
      });
    });

    // Start job processing in utility process
    utilityChild.postMessage({ type: 'start' });

    // Restore LLM provider from persisted settings
    try {
      let activeProvider = await settingsManager?.getActiveProvider();

      // If no active provider set, check if any provider has an API key configured
      if (!activeProvider) {
        const configured = await settingsManager?.getConfiguredProviders();
        if (configured && configured.length > 0) {
          activeProvider = configured[0];
          await settingsManager?.setActiveProvider(activeProvider);
          console.log(`[main] Auto-selected LLM provider: ${activeProvider}`);
        }
      }

      if (activeProvider && utilityChild) {
        const apiKey = await settingsManager!.getApiKey(activeProvider);
        if (apiKey) {
          console.log(`[main] Restoring LLM provider: ${activeProvider}`);
          utilityChild.postMessage({
            type: 'set-llm-provider',
            provider: activeProvider,
            apiKey,
          });
        } else {
          console.log('[main] No API key found for provider, skipping restore');
        }
      } else {
        console.log('[main] No LLM provider configured');
      }
    } catch (error) {
      console.warn('[main] Failed to restore LLM provider:', error);
    }

    // Forward processing progress from utility process to renderer
    utilityChild.on('message', async (msg: any) => {
      if (msg.type === 'emailProcessed') {
        mainWindow?.webContents.send('processing:progress', {
          processed: msg.processed,
          failed: msg.failed ?? 0,
          total: msg.total,
        });
      }
      if (msg.type === 'emailFailed') {
        mainWindow?.webContents.send('processing:failed', {
          failed: msg.failed,
          total: msg.total,
        });
      }
      if (msg.type === 'processingComplete') {
        mainWindow?.webContents.send('processing:complete', {
          processed: msg.processed ?? 0,
          failed: msg.failed ?? 0,
          total: msg.total ?? 0,
        });
      }
      if (msg.type === 'processingError') {
        mainWindow?.webContents.send('processing:error', { error: msg.error });
      }
      if (msg.type === 'llm-provider-set') {
        if (msg.success) {
          console.log(`[main] Utility process LLM provider set: ${msg.provider}`);
        } else {
          console.error(`[main] Utility process failed to set LLM provider: ${msg.error}`);
        }
      }
      if (msg.type === 'error') {
        console.error(`[main] Utility process error: ${msg.error}`);
      }
      if (msg.type === 'gmail-request') {
        try {
          const client = await createAuthenticatedGmailClient();
          if (!client) throw new Error('No Gmail client available');

          const { method, args, requestId } = msg;
          const fn = (client as any)[method];
          if (typeof fn !== 'function') throw new Error(`Method ${method} not found`);

          const result = await fn.apply(client, args);
          utilityChild?.postMessage({
            type: 'gmail-response',
            requestId,
            result,
          });
        } catch (error) {
          utilityChild?.postMessage({
            type: 'gmail-response',
            requestId: msg.requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    // Recover unprocessed emails and forward to utility process
    try {
      const recoveredEmails = await db!.getDatabase()
        .select({ id: schema.emails.id })
        .from(schema.emails)
        .where(eq(schema.emails.isProcessed, false))
        .limit(100);

      if (recoveredEmails.length > 0 && utilityChild) {
        const emailIds = recoveredEmails.map(e => e.id);
        console.log(`[main] Recovering ${emailIds.length} unprocessed emails`);
        utilityChild.postMessage({
          type: 'process-emails',
          emailIds,
        });
        mainWindow?.webContents.send('processing:started', { total: emailIds.length });
      } else {
        console.log('[main] No unprocessed emails to recover');
      }
    } catch (error) {
      console.warn('[main] Failed to recover unprocessed emails:', error);
    }

    // Cleanup old completed jobs
    const cleanedCount = await jobQueue.cleanupOldJobs();
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old completed jobs`);
    }

    // Create window
    createWindow();

    if (syncManager) {
      forwardSyncProgress(syncManager, () => mainWindow);
    }

    // Auto-sync on startup (runs in background, safe if not authenticated yet)
    runSyncCycle();
    // Start periodic sync (every 30 minutes)
    syncTimer = startPeriodicSync(30, runSyncCycle, syncTimer);

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
      if (!timelineRepo || !emailRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      // 1. Fetch ALL synced emails (primary source)
      const allEmails = await emailRepo.findAll();

      // 2. Fetch enriched data for processed emails (overlay)
      const updates = await timelineRepo.findAll({
        priority: payload?.priority as 'high' | 'medium' | 'low' | undefined,
        limit: payload?.limit,
        offset: payload?.offset,
      });
      const enrichmentMap = new Map(updates.map(u => [u.emailId, u]));

      // 3. Build timeline entries: every email appears, enriched where available
      const allEntries = allEmails.map(email => {
        const enriched = enrichmentMap.get(email.id);
        if (enriched) {
          // Processed email with full AI data
          return {
            id: enriched.id,
            emailId: email.id,
            threadId: email.threadId,
            title: enriched.title,
            description: enriched.description,
            summary: enriched.summary,
            priority: enriched.priority,
            sentiment: enriched.sentiment,
            urgency: enriched.urgency,
            actionItem: enriched.actionItem,
            actionItemTitle: enriched.actionItemTitle,
            followUpDate: enriched.followUpDate,
            financialImpact: enriched.financialImpact,
            keyEntities: enriched.keyEntities,
            createdAt: new Date(enriched.createdAt).toISOString(),
            receivedAt: enriched.receivedAt ? new Date(enriched.receivedAt).toISOString() : new Date(enriched.createdAt).toISOString(),
            sender: {
              email: email.senderEmail,
              name: email.senderName,
              domain: email.senderDomain,
            },
            topic: enriched.topic,
            isProcessed: true,
          };
        }
        // Unprocessed or processed-but-not-enriched: show subject/snippet
        return {
          id: `email_${email.id}`,
          emailId: email.id,
          threadId: email.threadId,
          title: email.subject || '(No subject)',
          description: email.snippet || undefined,
          summary: email.snippet || undefined,
          priority: 'medium' as const,
          sentiment: undefined,
          urgency: undefined,
          actionItem: undefined,
          actionItemTitle: undefined,
          followUpDate: undefined,
          financialImpact: undefined,
          keyEntities: undefined,
          createdAt: email.receivedAt instanceof Date ? email.receivedAt.toISOString() : new Date(email.receivedAt).toISOString(),
          receivedAt: email.receivedAt instanceof Date ? email.receivedAt.toISOString() : new Date(email.receivedAt).toISOString(),
          sender: {
            email: email.senderEmail,
            name: email.senderName,
            domain: email.senderDomain,
          },
          topic: undefined,
          isProcessed: email.isProcessed,
        };
      }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return {
        success: true,
        data: {
          updates: allEntries,
          total: allEntries.length,
        },
      };
    } catch (error) {
      console.error('Failed to list timeline updates:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Timeline: Week Senders
  ipcMain.handle('timeline:week-senders', async (_event, payload?: { startDate?: string }) => {
    try {
      if (!timelineRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const startDate = payload?.startDate ? new Date(payload.startDate) : new Date();
      const senders = await timelineRepo.getWeekSenders(startDate);

      return {
        success: true,
        data: { senders },
      };
    } catch (error) {
      console.error('Failed to get week senders:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Timeline: Month Stats
  ipcMain.handle('timeline:month-stats', async (_event, payload?: { monthsBack?: number }) => {
    try {
      if (!timelineRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const monthsBack = payload?.monthsBack || 3;
      const stats = await timelineRepo.getMonthStats(monthsBack);

      return {
        success: true,
        data: { stats },
      };
    } catch (error) {
      console.error('Failed to get month stats:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Timeline: Year Stats
  ipcMain.handle('timeline:year-stats', async (_event, payload?: { yearsBack?: number }) => {
    try {
      if (!timelineRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const yearsBack = payload?.yearsBack || 3;
      const stats = await timelineRepo.getYearStats(yearsBack);

      return {
        success: true,
        data: { stats },
      };
    } catch (error) {
      console.error('Failed to get year stats:', error);
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

  // Topics: Get topic detail
  ipcMain.handle('topics:get-detail', async (_event, topicId: string) => {
    try {
      if (!topicsRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const detail = await topicsRepo.getTopicDetail(topicId);
      if (!detail) {
        return { success: false, error: 'Topic not found' };
      }

      // Generate topic summary if needed (with caching)
      let generatedTopicSummary: string | null = null;

      if (llmProviderManager && detail.emails.length > 0) {
        let needsGeneration = false;
        if (!detail.summary) {
          needsGeneration = true;
        } else {
          const lastSummaryTime = detail.summary.lastUpdated ? new Date(detail.summary.lastUpdated) : new Date(0);
          const hasNewEmails = detail.emails.some(e => new Date(e.receivedAt) > lastSummaryTime);
          if (hasNewEmails) {
            needsGeneration = true;
          }
        }

        if (needsGeneration) {
          try {
            const provider = await llmProviderManager.getActiveProvider();
            if (provider) {
              const emailExcerpts = detail.emails
                .slice(0, 8)
                .map(e => `Subject: ${e.subject || '(No subject)'}\nFrom: ${e.senderName || e.senderEmail}\nDate: ${e.receivedAt.toISOString()}\n${(e.snippet || '').slice(0, 300)}`)
                .join('\n\n---\n\n');

              if (emailExcerpts.length > 0) {
                const prompt = `Summarize the topic "${detail.topic.name}" based on these related emails. Write 2-3 paragraphs covering: what this topic is about, key themes and patterns, and any action items or financial impacts.

${emailExcerpts}

Write the summary as plain paragraphs, no bullet points.`;

                const result = await provider.generateText(
                  prompt,
                  'You are a topic analysis assistant. Write concise summaries about email topics.'
                );

                if (result.text && result.text.trim().length > 0) {
                  generatedTopicSummary = result.text.trim();

                  // Persist for future reuse
                  await topicsRepo.upsertSummary(
                    detail.topic.id,
                    generatedTopicSummary,
                    generatedTopicSummary.split(/\s+/).filter(w => w.length > 0).length,
                  );
                }
              }
            }
          } catch (error) {
            console.error('Error generating topic summary:', error);
          }
        }
      }

      return {
        success: true,
        data: {
          id: detail.topic.id,
          name: detail.topic.name,
          parentCategory: detail.parentTopic?.name || null,
          childTopics: detail.childTopics.map((c) => ({ id: c.id, name: c.name, emailCount: c.emailCount })),
          emailCount: detail.emails.length,
          senderCount: detail.senders.length,
          aiSummary: generatedTopicSummary || detail.summary?.summary || `No summary available for ${detail.topic.name}.`,
          highlights: [], // Could be derived from action items or financial impacts
          emails: detail.emails.map((e) => ({
            id: e.id,
            threadId: e.threadId,
            subject: e.subject || '(No subject)',
            snippet: e.snippet || '',
            sender: {
              name: e.senderName || e.senderEmail.split('@')[0],
              initial: e.senderInitial,
            },
            receivedAt: e.receivedAt.toISOString(),
            isRead: e.isRead,
            tags: [],
            topicName: e.topicName,
          })),
          senders: detail.senders,
          actionItems: detail.actionItems,
          totalSpend: detail.totalSpend ?? null,
          deals: detail.deals ?? [],
        },
      };
    } catch (error) {
      console.error('Failed to get topic detail:', error);
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

  // Action Items: Toggle completion
  ipcMain.handle('action-items:toggle', async (_event, id: string) => {
    try {
      if (!timelineRepo) {
        return { success: false, error: 'Database not initialized' };
      }

      const result = await timelineRepo.toggleActionItemCompleted(id);
      if (!result) {
        return { success: false, error: 'Action item not found' };
      }

      return {
        success: true,
        data: {
          id: result.id,
          completed: result.actionItemCompleted,
          completedAt: result.actionItemCompletedAt?.toISOString() ?? null,
        },
      };
    } catch (error) {
      console.error('Error toggling action item:', error);
      return { success: false, error: 'Failed to toggle action item' };
    }
  });

  // Senders: Get detail by domain
  ipcMain.handle('senders:get-detail', async (_event, domain: string) => {
    try {
      if (!emailRepo || !timelineRepo || !dealsRepo || !summariesRepo || !db) {
        return { success: false, error: 'Database not initialized' };
      }

      const database = db.getDatabase();

      // Step 1: Get sender summary
      const summaryResult = await database
        .select()
        .from(schema.senderSummaries)
        .where(eq(schema.senderSummaries.senderDomain, domain))
        .limit(1);

      const senderSummary = summaryResult[0];

      // Step 2: Get recent emails by domain
      const recentEmailsResult = await database
        .select()
        .from(schema.emails)
        .where(eq(schema.emails.senderDomain, domain))
        .orderBy(desc(schema.emails.receivedAt))
        .limit(10);

      // Step 3: Get action items from timeline_updates joined with emails
      const actionItemsResult = await database
        .select({
          id: schema.timelineUpdates.id,
          title: schema.timelineUpdates.actionItemTitle,
          urgency: schema.timelineUpdates.urgency,
          completed: schema.timelineUpdates.actionItemCompleted,
          completedAt: schema.timelineUpdates.actionItemCompletedAt,
          followUpDate: schema.timelineUpdates.followUpDate,
          emailId: schema.timelineUpdates.emailId,
        })
        .from(schema.timelineUpdates)
        .innerJoin(schema.emails, eq(schema.timelineUpdates.emailId, schema.emails.id))
        .where(and(
          eq(schema.emails.senderDomain, domain),
          eq(schema.timelineUpdates.actionItem, true)
        ));

      // Step 4: Get deals from deals joined with emails
      const dealsResult = await database
        .select({
          id: schema.deals.id,
          dealTitle: schema.deals.dealTitle,
          dealCode: schema.deals.dealCode,
          dealExpiry: schema.deals.dealExpiry,
          minimumPurchase: schema.deals.minimumPurchase,
          dealLink: schema.deals.dealLink,
        })
        .from(schema.deals)
        .innerJoin(schema.emails, eq(schema.deals.emailId, schema.emails.id))
        .where(and(
          eq(schema.emails.senderDomain, domain),
          eq(schema.deals.isActive, true)
        ));

      // Step 5: Get total email count
      const [countResult] = await database
        .select({ count: sql<number>`count(*)` })
        .from(schema.emails)
        .where(eq(schema.emails.senderDomain, domain));

      // Step 6: Compute stats
      const stats = {
        totalEmails: countResult?.count ?? 0,
        actionItems: actionItemsResult.length,
        activeDeals: dealsResult.filter(d => !d.dealExpiry || new Date(d.dealExpiry) > new Date()).length,
      };

      // Step 7: Build key insights
      const keyInsights: Array<{ icon: 'truck' | 'dollar' | 'tag' | 'alert'; text: string; color: 'amber' | 'red' | 'green' | 'blue' }> = [];

      const urgentItems = actionItemsResult.filter(ai => ai.urgency && !ai.completed);
      if (urgentItems.length > 0) {
        keyInsights.push({
          icon: 'alert',
          text: `${urgentItems.length} urgent action${urgentItems.length > 1 ? 's' : ''}`,
          color: 'red',
        });
      }

      const pendingItems = actionItemsResult.filter(ai => !ai.completed);
      if (pendingItems.length > 0) {
        keyInsights.push({
          icon: 'tag',
          text: `${pendingItems.length} pending action${pendingItems.length > 1 ? 's' : ''}`,
          color: 'amber',
        });
      }

      if (dealsResult.length > 0) {
        keyInsights.push({
          icon: 'dollar',
          text: `${dealsResult.length} active deal${dealsResult.length > 1 ? 's' : ''}`,
          color: 'green',
        });
      }

      // Step 8: Generate sender summary if needed (with caching)
      let generatedSenderSummary: string | null = null;

      if (summariesRepo && llmProviderManager) {
        let needsGeneration = false;
        if (!senderSummary) {
          needsGeneration = true;
        } else if (recentEmailsResult.length > 0) {
          const lastSummaryTime = senderSummary.lastUpdated ? new Date(senderSummary.lastUpdated) : new Date(0);
          const hasNewEmails = recentEmailsResult.some(e => new Date(e.receivedAt) > lastSummaryTime);
          if (hasNewEmails) {
            needsGeneration = true;
          }
        }

        if (needsGeneration) {
          try {
            const provider = await llmProviderManager.getActiveProvider();
            if (provider) {
              const emailExcerpts = recentEmailsResult
                .slice(0, 5)
                .map(e => `Subject: ${e.subject || '(No subject)'}\nFrom: ${e.senderName || e.senderEmail}\nDate: ${e.receivedAt.toISOString()}\n${(e.snippet || '').slice(0, 300)}`)
                .join('\n\n---\n\n');

              if (emailExcerpts.length > 0) {
                const prompt = `Summarize the relationship with the sender domain "${domain}" based on these recent emails. Write 2-3 paragraphs covering: what this sender is about, key patterns in their emails, and any action items or financial impacts.

${emailExcerpts}

Write the summary as plain paragraphs, no bullet points.`;

                const result = await provider.generateText(
                  prompt,
                  'You are a sender analysis assistant. Write concise summaries about email senders.'
                );

                if (result.text && result.text.trim().length > 0) {
                  generatedSenderSummary = result.text.trim();

                  // Persist for future reuse
                  await summariesRepo.upsertSummary({
                    senderDomain: domain,
                    summary: generatedSenderSummary,
                    wordCount: generatedSenderSummary.split(/\s+/).filter(w => w.length > 0).length,
                    lastEmailId: recentEmailsResult[0]?.id,
                  });
                }
              }
            }
          } catch (error) {
            console.error('Error generating sender summary:', error);
          }
        }
      }

      // Step 9: Build response
      return {
        success: true,
        data: {
          id: domain,
          domain,
          displayName: domain,
          category: recentEmailsResult[0]?.gmailCategory || 'General',
          isSubscribed: true, // Could be enhanced with subscription tracking
          stats,
          aiSummary: {
            text: generatedSenderSummary || senderSummary?.summary || `No summary available for ${domain}.`,
            updatedAt: senderSummary?.lastUpdated?.toISOString() || new Date().toISOString(),
          },
          keyInsights: keyInsights.length > 0 ? keyInsights : undefined,
          recentEmails: recentEmailsResult.map(e => ({
            id: e.id,
            threadId: e.threadId,
            subject: e.subject || '(No subject)',
            snippet: e.snippet || '',
            receivedAt: e.receivedAt.toISOString(),
            isRead: e.isRead ?? false,
            tags: [],
            category: e.gmailCategory || undefined,
          })),
          actionItems: actionItemsResult.map(ai => ({
            id: ai.id,
            title: ai.title || '',
            completed: ai.completed ?? false,
            completedAt: ai.completedAt?.toISOString(),
            dueDate: ai.followUpDate || undefined,
            urgent: ai.urgency ?? false,
          })),
          deals: dealsResult.map(d => ({
            id: d.id,
            title: d.dealTitle,
            code: d.dealCode || undefined,
            expiry: d.dealExpiry ? d.dealExpiry.toISOString() : undefined,
            minPurchase: d.minimumPurchase || undefined,
            autoApplied: false, // Could be enhanced
          })),
        },
      };
    } catch (error) {
      console.error('Failed to get sender detail:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

// Email list handler — returns paginated email records
ipcMain.handle('emails:list', async (_event, options?: { type?: string; processed?: boolean; limit?: number; offset?: number }) => {
  try {
    if (!emailRepo) {
      return { success: false, error: 'Email repository not initialized' };
    }

    const emails = await emailRepo.findAll(options);

    return {
      success: true,
      data: {
        emails: emails.map(e => ({
          id: e.id,
          threadId: e.threadId,
          senderEmail: e.senderEmail,
          senderName: e.senderName,
          senderDomain: e.senderDomain,
          subject: e.subject,
          snippet: e.snippet,
          receivedAt: e.receivedAt.toISOString(),
          emailType: e.emailType,
          gmailCategory: e.gmailCategory,
          isProcessed: e.isProcessed,
          isRead: e.isRead,
          isImportant: e.isImportant,
        })),
        total: emails.length,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Email detail handler — returns EmailDetailData matching the frontend interface
ipcMain.handle('emails:get-detail', async (_event, emailId: string) => {
  try {
    // Validate repositories are initialized
    if (!emailRepo || !timelineRepo || !topicsRepo || !dealsRepo) {
      return { success: false, error: 'Database not initialized' };
    }

    // Step 1: Fetch the base email
    const email = await emailRepo.findById(emailId);
    if (!email) {
      return { success: false, error: 'Email not found' };
    }

    // Step 2: Gather all related data in parallel
    const [timelineUpdates, emailTopics, threadEmails] = await Promise.all([
      timelineRepo.findByEmailId(emailId).catch(() => []),
      topicsRepo.findTopicsForEmail(emailId).catch(() => []),
      emailRepo.findByThreadId(email.threadId).catch(() => []),
    ]);

    const timelineUpdate = timelineUpdates.length > 0 ? timelineUpdates[0] : null;

    // Step 3: Caching logic — determine if we can reuse existing AI data
    let needsGeneration = false;

    if (!timelineUpdate) {
      // No existing timeline update — will need to generate
      needsGeneration = true;
    } else if (timelineUpdate.summary) {
      // Existing summary — check if new emails arrived since last processing
      const timelineCreatedAt = timelineUpdate.createdAt;
      const hasNewEmails = threadEmails.some(
        (threadEmail) => threadEmail.receivedAt > timelineCreatedAt
      );
      if (hasNewEmails) {
        needsGeneration = true;
      }
      // If no new emails, we reuse the existing data (no generation needed)
    } else {
      // Timeline update exists but has no summary
      needsGeneration = true;
    }

    // Step 4: Generate AI summary only if needed and LLM is available
    let aiSummaryBullets: string[] | undefined;

    if (needsGeneration && llmProviderManager) {
      try {
        const provider = await llmProviderManager.getActiveProvider();
        if (provider) {
          const body = email.bodyPlain || email.bodyHtml || email.snippet || '';
          if (body.length > 0) {
            const prompt = `Summarize this email in 3-5 concise bullet points. Each bullet should be a single sentence.

Subject: ${email.subject || '(No subject)'}
From: ${email.senderName || email.senderEmail}
Date: ${email.receivedAt.toISOString()}

${body.slice(0, 4000)}

Respond with ONLY a JSON array of strings, like: ["Point 1", "Point 2", "Point 3"]`;

            const result = await provider.generateText(
              prompt,
              'You are an email summarization assistant. Extract key points from emails as concise bullet points. Respond with ONLY a valid JSON array of strings, no other text.'
            );

            // Parse the bullets from the response
            try {
              const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
              const parsed = JSON.parse(cleaned);
              if (Array.isArray(parsed) && parsed.length > 0) {
                aiSummaryBullets = parsed.filter((item: unknown) => typeof item === 'string');
              }
            } catch {
              // If parsing fails, split by newlines and create bullets
              const lines = result.text
                .split('\n')
                .map((line: string) => line.replace(/^[-*•]\s*/, '').trim())
                .filter((line: string) => line.length > 0);
              if (lines.length > 0) {
                aiSummaryBullets = lines;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error generating AI summary for email detail:', error);
      }
    }

    // Persist generated summary to timeline_update for future reuse
    if (aiSummaryBullets && aiSummaryBullets.length > 0 && timelineUpdate) {
      try {
        await timelineRepo.update(timelineUpdate.id, {
          summary: aiSummaryBullets.join('\n'),
        });
      } catch (persistError) {
        console.error('Failed to persist email summary:', persistError);
      }
    }

    // Reuse existing summary from timeline update if we didn't generate a new one
    if (!aiSummaryBullets && timelineUpdate?.summary) {
      // Timeline summary is a text string — convert to bullets
      const summaryLines = timelineUpdate.summary
        .split('\n')
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter((line) => line.length > 0);
      aiSummaryBullets = summaryLines.length > 0 ? summaryLines : undefined;
    }

    // Step 5: Build the topic info
    let topic: { primary: string; count: number; all: string[] } | undefined;
    if (emailTopics.length > 0) {
      topic = {
        primary: emailTopics[0].fullPath,
        count: emailTopics.length,
        all: emailTopics.map((t) => t.fullPath),
      };
    }

    // Step 6: Build action items from ALL timeline updates
    const allActionItems = timelineUpdates
      .filter((tu: any) => tu.actionItem && tu.actionItemTitle)
      .map((tu: any) => ({
        id: tu.id,
        title: tu.actionItemTitle,
        completed: tu.actionItemCompleted ?? false,
        completedAt: tu.actionItemCompletedAt?.toISOString() ?? undefined,
        dueDate: tu.followUpDate ?? undefined,
        urgent: tu.urgency ?? false,
      }));

    let actionItems: Array<{ id: string; title: string; completed: boolean; completedAt?: string; dueDate?: string; urgent?: boolean }> | undefined;
    if (allActionItems.length > 0) {
      actionItems = allActionItems;
    }

    // Step 7: Build the thread URL
    let threadUrl: string | undefined;
    if (email.threadId) {
      // Gmail thread URL format — this links to the conversation view
      threadUrl = `https://mail.google.com/mail/u/0/#inbox/${email.threadId}`;
    }

    // Step 8: Build thread emails (other emails in the same thread, excluding the focused one)
    const otherThreadEmails = threadEmails
      .filter((te) => te.id !== email.id)
      .map((te) => ({
        id: te.id,
        subject: te.subject,
        snippet: te.snippet,
        senderName: te.senderName,
        senderEmail: te.senderEmail,
        receivedAt: te.receivedAt.toISOString(),
        isRead: te.isRead,
        bodyHtml: te.bodyHtml,
        bodyPlain: te.bodyPlain,
      }));

    // Step 9: Assemble the EmailDetailData response
    const emailDetailData: Record<string, unknown> = {
      id: email.id,
      subject: email.subject || '(No subject)',
      priority: timelineUpdate?.priority || 'medium',
      sender: {
        name: email.senderName || email.senderEmail.split('@')[0],
        email: email.senderEmail,
      },
      receivedAt: email.receivedAt,
      body: email.bodyHtml || email.bodyPlain || '',
      threadId: email.threadId,
    };

    // Add optional fields only if they have data
    if (topic) {
      emailDetailData.topic = topic;
    }

    if (aiSummaryBullets && aiSummaryBullets.length > 0) {
      emailDetailData.aiSummary = { bullets: aiSummaryBullets };
    }

    if (actionItems && actionItems.length > 0) {
      emailDetailData.actionItems = actionItems;
    }

    if (timelineUpdate?.financialImpact != null) {
      emailDetailData.financialImpact = timelineUpdate.financialImpact;
    }

    if (threadUrl) {
      emailDetailData.threadUrl = threadUrl;
    }

    if (otherThreadEmails.length > 0) {
      emailDetailData.threadEmails = otherThreadEmails;
    }

    return {
      success: true,
      data: emailDetailData,
    };
  } catch (error) {
    console.error('Error getting email detail:', error);
    return { success: false, error: 'Failed to get email detail' };
  }
});

// Email send-reply handler — sends a reply to an email with proper threading
ipcMain.handle('emails:send-reply', async (_event, payload: { emailId: string; body: string }) => {
  try {
    if (!emailRepo) {
      return { success: false, error: 'Database not initialized' };
    }

    // Fetch the original email to get threading information
    const email = await emailRepo.findById(payload.emailId);
    if (!email) {
      return { success: false, error: 'Email not found' };
    }

    // Create authenticated Gmail client
    const gmailClient = await createAuthenticatedGmailClient();
    if (!gmailClient) {
      return { success: false, error: 'Failed to create authenticated Gmail client. Please check your OAuth connection.' };
    }

    // Construct subject with Re: prefix if not already present
    const subject = email.subject?.startsWith('Re: ') ? email.subject : `Re: ${email.subject || ''}`;

    // Send reply with threading headers
    const result = await gmailClient.sendReply({
      to: email.senderEmail,
      subject,
      threadId: email.threadId,
      body: payload.body,
      inReplyTo: email.inReplyToHeader || email.messageIdHeader || undefined,
      references: email.referencesHeader || undefined,
    });

    return { success: true, data: { messageId: result.id } };
  } catch (error) {
    console.error('Failed to send reply:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Shell: Open external URL
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  try {
    // Security: Only allow Gmail URLs
    if (!url || !url.startsWith('https://mail.google.com')) {
      throw new Error('Invalid URL: Only Gmail URLs are allowed');
    }
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Failed to open external URL:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Run a single sync cycle using incremental history sync when possible.
 * Falls back to full sync if historyId is missing or expired.
 * Safe to call anytime — returns silently if not authenticated.
 */
async function runSyncCycle(): Promise<void> {
  if (!syncManager || !emailRepo || !utilityChild) {
    console.warn('[main] runSyncCycle skipped: dependencies not ready');
    return;
  }

  try {
    const authClient = await createAuthenticatedGmailClient();
    if (!authClient) {
      console.log('[main] runSyncCycle skipped: Gmail not authenticated');
      return;
    }

    const rateLimitedClient = new RateLimitedGmailClient(authClient);
    syncManager.setClient(rateLimitedClient);

    // Load persisted sync state (including historyId)
    await syncManager.initialize();

    console.log('[main] Starting sync cycle...');

    let emailIds: string[] = [];
    let total = 0;

    const currentHistoryId = syncManager.getHistoryId();

    if (currentHistoryId) {
      // Incremental sync using Gmail history API
      console.log(`[main] Performing incremental sync since historyId: ${currentHistoryId}`);
      try {
        const { added, deleted } = await syncManager.performIncrementalSync();

        // Download and store new emails
        if (added.length > 0) {
          console.log(`[main] Incremental sync found ${added.length} new emails`);

          mainWindow?.webContents.send('sync:progress', {
            processed: 0,
            total: added.length,
            phase: 'sync',
          });

          for (const messageId of added) {
            try {
              const email = await syncManager.processEmail(messageId);
              if (email) {
                await emailRepo.upsert(email);
                emailIds.push(messageId);
                total++;
              }
            } catch (error) {
              console.error(`[main] Failed to process email ${messageId}:`, error);
            }
          }
        }

        // Handle deletions
        if (deleted.length > 0) {
          console.log(`[main] ${deleted.length} emails deleted in Gmail since last sync`);
        }

        console.log(`[main] Incremental sync complete: ${emailIds.length} new emails`);
      } catch (error: any) {
        if (error?.message === HISTORY_ID_EXPIRED) {
          console.log('[main] historyId expired, falling back to full sync');
          const result = await performFullSync();
          emailIds = result.emailIds;
          total = result.total;
        } else {
          throw error;
        }
      }
    } else {
      // First run — no historyId stored yet
      console.log('[main] No historyId found, performing initial full sync');
      const result = await performFullSync();
      emailIds = result.emailIds;
      total = result.total;

      // Seed historyId from profile for future incremental syncs
      try {
        const profile = await rateLimitedClient.getProfile();
        if (profile?.historyId) {
          await syncManager.seedHistoryId(profile.historyId);
          console.log(`[main] Seeded historyId: ${profile.historyId}`);
        }
      } catch (error) {
        console.warn('[main] Failed to seed historyId:', error);
      }
    }

    // Forward to utility for AI processing
    if (emailIds.length > 0) {
      console.log(`[main] Sync found ${emailIds.length} new emails, forwarding to utility`);
      utilityChild.postMessage({
        type: 'process-emails',
        emailIds,
      });

      mainWindow?.webContents.send('processing:started', { total: emailIds.length });
    } else {
      console.log('[main] Sync cycle complete: no new emails');
      // Send processing events with 0 total so state machine completes its cycle
      mainWindow?.webContents.send('processing:started', { total: 0 });
      mainWindow?.webContents.send('processing:complete', { processed: 0, failed: 0, total: 0 });
    }

    mainWindow?.webContents.send('sync:complete', {
      total,
      emailCount: emailIds.length,
    });
  } catch (error) {
    console.error('[main] Sync cycle failed:', error);
  }
}

/**
 * Perform full sync (today's emails) as fallback for first run or expired historyId.
 */
async function performFullSync(): Promise<{ emailIds: string[]; total: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = await syncManager!.fetchAndStoreToday(today, emailRepo!);

  mainWindow?.webContents.send('sync:progress', {
    processed: result.total,
    total: result.total,
    phase: 'sync',
  });

  return result;
}

// Cleanup on app quit
app.on('before-quit', async () => {
  if (syncTimer) clearInterval(syncTimer);
  if (utilityChild) {
    utilityChild.postMessage({ type: 'stop' });
    utilityChild.kill();
  }
  if (db) {
    await db.close();
  }
});

/**
 * Schedule background backfill for remaining lookback days.
 * Called after initial sync+processing completes.
 */
async function scheduleBackfill(lookbackDays: number): Promise<void> {
  const remainingDays = lookbackDays - 1; // Today already done
  if (remainingDays <= 0) return;

  console.log(`[main] Scheduling backfill for ${remainingDays} remaining days`);

  for (let i = 1; i <= remainingDays; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    try {
      const authClient = await createAuthenticatedGmailClient();
      if (!authClient) break;

      const rateLimitedClient = new RateLimitedGmailClient(authClient);
      syncManager.setClient(rateLimitedClient);

      const { emailIds } = await syncManager!.fetchAndStoreToday(dayStart, emailRepo!);

      // Forward email IDs to utility process for AI processing
      if (emailIds.length > 0 && utilityChild) {
        utilityChild.postMessage({
          type: 'process-emails',
          emailIds,
        });
      }

      mainWindow?.webContents.send('backfill:progress', {
        day: i,
        totalDays: remainingDays,
        emailsProcessed: emailIds.length,
      });

      // 5-second spacing between days
      if (i < remainingDays) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`[main] Backfill failed for day ${i}:`, error);
    }
  }

  mainWindow?.webContents.send('backfill:complete');
}

// IPC handler for triggering backfill
ipcMain.handle('sync:start-backfill', async (_event, { lookbackDays }: { lookbackDays: number }) => {
  // Run backfill in background - don't await
  scheduleBackfill(lookbackDays).catch(err => {
    console.error('[main] Backfill error:', err);
  });
  return { started: true };
});

// Export for testing
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
