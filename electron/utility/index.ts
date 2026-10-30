/**
 * Utility Process Entry Point
 *
 * Runs in a separate process to handle background tasks without blocking the UI.
 * Handles: job processing, email AI processing, sync management
 */

import { parentPort } from 'node:worker_threads';
import { TuskerBrainDatabase } from '@foundations/database';
import { JobQueue } from '@domain/jobs/queue';
import { JobRunner } from '@domain/jobs/runner';
import type { Job } from '@foundations/types/jobs';
import { EmailRepository, TimelineRepository, DealsRepository, TopicsRepository, SummariesRepository, LabelsRepository } from '@foundations/persistence';
import { EmailProcessingOrchestrator } from '@domain/processing/orchestrator';
import { createLLMProvider, type ProviderName } from '@capabilities/llm/provider';
import type { GmailClient } from '@capabilities/gmail/types';
import type { Email, EmailType } from '@foundations/types/email';

// State
let db: TuskerBrainDatabase | null = null;
let jobQueue: JobQueue | null = null;
let jobRunner: JobRunner | null = null;
let orchestrator: EmailProcessingOrchestrator | null = null;

// Repositories
let emailRepo: EmailRepository | null = null;
let timelineRepo: TimelineRepository | null = null;
let dealsRepo: DealsRepository | null = null;
let topicsRepo: TopicsRepository | null = null;
let summariesRepo: SummariesRepository | null = null;
let labelsRepo: LabelsRepository | null = null;

// LLM Provider
let activeProvider: ProviderName | null = null;
let apiKey: string | null = null;

// Message types
type MessageType =
  | { type: 'init'; dbPath: string }
  | { type: 'set-llm-provider'; provider: ProviderName; apiKey: string }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'get-status' }
  | { type: 'process-job'; job: Job };

/**
 * Initialize the utility process
 */
async function initialize(dbPath: string): Promise<void> {
  try {
    // Initialize database
    db = new TuskerBrainDatabase(dbPath);
    await db.initialize();

    // Initialize repositories
    emailRepo = new EmailRepository(db);
    timelineRepo = new TimelineRepository(db);
    dealsRepo = new DealsRepository(db);
    topicsRepo = new TopicsRepository(db);
    summariesRepo = new SummariesRepository(db);
    labelsRepo = new LabelsRepository(db);

    // Create job queue and runner
    jobQueue = new JobQueue();
    jobRunner = new JobRunner(jobQueue);

    // Register job handlers
    registerJobHandlers();

    sendMessage({ type: 'initialized', success: true });
  } catch (error) {
    sendMessage({
      type: 'initialized',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Register handlers for different job types
 */
function registerJobHandlers(): void {
  if (!jobRunner) return;

  // Email processing handler
  jobRunner.registerHandler('email_process', async (job: Job) => {
    if (!orchestrator || !emailRepo) {
      throw new Error('Orchestrator or email repository not initialized');
    }

    const { emailId } = job.payload as { emailId: string };
    const email = await emailRepo.findById(emailId);

    if (!email) {
      throw new Error(`Email not found: ${emailId}`);
    }

    // Map the persistence record to the domain Email shape
    const domainEmail: Email = {
      ...email,
      emailType: (email.emailType as EmailType | null) ?? null,
    };

    // Process the email through the orchestrator
    const result = await orchestrator.processEmail(domainEmail);

    return { emailId, result };
  });

  // Topic summary handler
  jobRunner.registerHandler('topic_summary', async (job: Job) => {
    if (!topicsRepo || !summariesRepo) {
      throw new Error('Repositories not initialized');
    }

    const { topicId } = job.payload as { topicId: string };
    const topic = await topicsRepo.findById(topicId);

    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    // Get emails for this topic and generate summary
    const emailIds = await topicsRepo!.findEmailsForTopic(topicId);
    // Summary generation would happen here via LLM

    return { topicId, emailCount: emailIds.length };
  });

  // Sender summary handler
  jobRunner.registerHandler('sender_summary', async (job: Job) => {
    if (!summariesRepo) {
      throw new Error('Summaries repository not initialized');
    }

    const { senderDomain } = job.payload as { senderDomain: string };
    // Sender summary generation would happen here via LLM

    return { senderDomain };
  });

  // Deal extraction handler
  jobRunner.registerHandler('deal_extraction', async (job: Job) => {
    if (!dealsRepo || !emailRepo) {
      throw new Error('Repositories not initialized');
    }

    const { emailId } = job.payload as { emailId: string };
    const email = await emailRepo.findById(emailId);

    if (!email) {
      throw new Error(`Email not found: ${emailId}`);
    }

    // Deal extraction would happen here via LLM

    return { emailId };
  });
}

/**
 * Set LLM provider configuration
 */
async function setLLMProvider(provider: ProviderName, key: string): Promise<void> {
  activeProvider = provider;
  apiKey = key;

  // Create LLM provider factory
  if (provider && key) {
    try {
      const llmProvider = createLLMProvider({ provider, apiKey: key });

      // Create orchestrator with LLM provider
      if (emailRepo && timelineRepo && dealsRepo && topicsRepo && summariesRepo && labelsRepo) {
        // Placeholder Gmail client (matching main.ts) — Gmail actions are a
        // no-op in the utility process for now.
        const placeholderClient: GmailClient = {
          listMessages: async () => ({ messages: [], nextPageToken: undefined }),
          getMessage: async () => null,
          getProfile: async () => ({ emailAddress: 'placeholder@example.com', historyId: undefined, messagesTotal: 0 }),
          modifyMessage: async () => ({}),
        };

        orchestrator = new EmailProcessingOrchestrator({
          db: db!,
          jobQueue: jobQueue!,
          gmailClient: placeholderClient,
          llmProvider,
          repositories: {
            emails: emailRepo,
            timeline: timelineRepo,
            deals: dealsRepo,
            topics: topicsRepo,
            summaries: summariesRepo,
            labels: labelsRepo,
          },
        });
      }

      sendMessage({ type: 'llm-provider-set', success: true, provider });
    } catch (error) {
      sendMessage({
        type: 'llm-provider-set',
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Start job processing
 */
async function startProcessing(): Promise<void> {
  if (!jobRunner) {
    sendMessage({ type: 'started', success: false, error: 'Job runner not initialized' });
    return;
  }

  await jobRunner.start();
  sendMessage({ type: 'started', success: true });
}

/**
 * Stop job processing
 */
async function stopProcessing(): Promise<void> {
  if (jobRunner) {
    await jobRunner.stop();
  }
  sendMessage({ type: 'stopped', success: true });
}

/**
 * Pause job processing
 */
function pauseProcessing(): void {
  if (jobRunner) {
    jobRunner.pause();
  }
  sendMessage({ type: 'paused', success: true });
}

/**
 * Resume job processing
 */
function resumeProcessing(): void {
  if (jobRunner) {
    jobRunner.resume();
  }
  sendMessage({ type: 'resumed', success: true });
}

/**
 * Get current status
 */
function getStatus(): void {
  const status = {
    isRunning: jobRunner?.isRunning() ?? false,
    hasLLMProvider: activeProvider !== null && apiKey !== null,
    provider: activeProvider,
  };
  sendMessage({ type: 'status', status });
}

/**
 * Send message to parent process
 */
function sendMessage(message: Record<string, unknown>): void {
  if (parentPort) {
    parentPort.postMessage(message);
  }
}

/**
 * Handle incoming messages from main process
 */
async function handleMessage(message: MessageType): Promise<void> {
  switch (message.type) {
    case 'init':
      await initialize(message.dbPath);
      break;
    case 'set-llm-provider':
      await setLLMProvider(message.provider, message.apiKey);
      break;
    case 'start':
      await startProcessing();
      break;
    case 'stop':
      await stopProcessing();
      break;
    case 'pause':
      pauseProcessing();
      break;
    case 'resume':
      resumeProcessing();
      break;
    case 'get-status':
      getStatus();
      break;
    default:
      sendMessage({ type: 'error', error: `Unknown message type: ${(message as any).type}` });
  }
}

// Listen for messages from parent process
if (parentPort) {
  parentPort.on('message', (message: MessageType) => {
    handleMessage(message).catch((error) => {
      sendMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });
}

// Signal that utility process is ready
sendMessage({ type: 'ready' });
