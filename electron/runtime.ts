import { app } from 'electron';
import path from 'path';
import { seed } from '@db/seed';
import * as schema from '@db/schema';
import { TuskerBrainDatabase } from '@db/index';
import { JobQueue } from '@core/jobs/queue';
import { GmailSyncManager, GmailClient as SyncGmailClient } from '@core/gmail/sync';
import { RateLimitedGmailClient } from '@core/gmail/rate-limited-client';
import { SettingsManager } from '@core/settings/manager';
import { LLMProviderManager } from '@core/llm/provider-manager';
import { GmailOAuthService } from './oauth-service';
import {
  EmailRepository,
  TimelineRepository,
  DealsRepository,
  TopicsRepository,
  SummariesRepository,
  LabelsRepository,
  SyncStateRepository,
} from '@core/repositories';

type GmailClientInterface = SyncGmailClient;

export interface MainRuntime {
  dbPath: string;
  db: TuskerBrainDatabase;
  jobQueue: JobQueue;
  syncManager: GmailSyncManager;
  settingsManager: SettingsManager;
  llmProviderManager: LLMProviderManager;
  oauthService: GmailOAuthService;
  emailRepo: EmailRepository;
  timelineRepo: TimelineRepository;
  dealsRepo: DealsRepository;
  topicsRepo: TopicsRepository;
  summariesRepo: SummariesRepository;
  labelsRepo: LabelsRepository;
}

export async function initializeRuntime(): Promise<MainRuntime> {
  const dbPath = path.join(app.getPath('userData'), 'tuskerbrain.db');
  const db = new TuskerBrainDatabase(dbPath);
  await db.initialize();

  const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
  if (isDev) {
    const existingEmails = await db.getDatabase()
      .select({ id: schema.emails.id })
      .from(schema.emails)
      .limit(1);

    if (existingEmails.length === 0) {
      console.log('[main] Database is empty (dev mode), running seed...');
      await seed(db.getDatabase());
    }
  }

  const emailRepo = new EmailRepository(db);
  const timelineRepo = new TimelineRepository(db);
  const dealsRepo = new DealsRepository(db);
  const topicsRepo = new TopicsRepository(db);
  const summariesRepo = new SummariesRepository(db);
  const labelsRepo = new LabelsRepository(db);
  const syncStateRepo = new SyncStateRepository(db);

  const jobQueue = new JobQueue();

  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  SettingsManager.initializeWithFilePath(settingsPath);
  const settingsManager = new SettingsManager();
  const llmProviderManager = new LLMProviderManager(settingsManager);
  const oauthService = new GmailOAuthService();

  const placeholderClient: GmailClientInterface = {
    listMessages: async () => ({ messages: [], nextPageToken: undefined }),
    getMessage: async () => null,
    getProfile: async () => ({ emailAddress: 'placeholder@example.com', historyId: undefined, messagesTotal: 0 }),
    modifyMessage: async () => ({}),
  };

  const gmailClient = new RateLimitedGmailClient(placeholderClient);
  const syncManager = new GmailSyncManager(gmailClient, jobQueue, syncStateRepo, emailRepo);

  return {
    dbPath,
    db,
    jobQueue,
    syncManager,
    settingsManager,
    llmProviderManager,
    oauthService,
    emailRepo,
    timelineRepo,
    dealsRepo,
    topicsRepo,
    summariesRepo,
    labelsRepo,
  };
}
