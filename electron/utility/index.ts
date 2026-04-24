/**
 * Utility Process Entry Point
 *
 * Runs in a separate process to handle background tasks without blocking the UI.
 * Handles: job processing, email AI processing, sync management
 */

import { TuskerBrainDatabase } from '@db/index';
import { JobQueue } from '@core/jobs/queue';
import { JobRunner } from '@core/jobs/runner';
import type { Job } from '@core/jobs/types';
import { EmailRepository, TimelineRepository, DealsRepository, TopicsRepository, SummariesRepository, LabelsRepository } from '@core/repositories';
import { EmailProcessingOrchestrator } from '@core/orchestrator';
import { createLLMProvider, type ProviderName } from '@core/llm/provider';
import { createProxiedGmailClient } from '../ipc/gmail-proxy';

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

// Pending emails that arrived before orchestrator was ready
let pendingEmailIds: string[] = [];

// Message types
type MessageType =
  | { type: 'init'; dbPath: string }
  | { type: 'set-llm-provider'; provider: ProviderName; apiKey: string; model?: string }
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'get-status' }
  | { type: 'process-job'; job: Job }
  | { type: 'process-emails'; emailIds: string[] };

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

    // Process the email through the orchestrator
    const result = await orchestrator.processEmail(email);

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
    const emails = await emailRepo!.findByTopic(topicId);
    // Summary generation would happen here via LLM

    return { topicId, emailCount: emails.length };
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
async function setLLMProvider(provider: ProviderName, key: string, model?: string): Promise<void> {
  activeProvider = provider;
  apiKey = key;

  // Create LLM provider factory
  if (provider && key) {
    try {
      const llmProvider = createLLMProvider({ provider, apiKey: key, model });

      // Create orchestrator with LLM provider
      if (emailRepo && timelineRepo && dealsRepo && topicsRepo && summariesRepo && labelsRepo && db) {
        orchestrator = new EmailProcessingOrchestrator({
          db,
          jobQueue: jobQueue! as any,
          gmailClient: createProxiedGmailClient(),
          llmProvider,
          repositories: {
            emails: emailRepo,
            timeline: timelineRepo,
            deals: dealsRepo,
            topics: topicsRepo as any,
            summaries: summariesRepo,
            labels: labelsRepo,
          },
        });
      }

      sendMessage({ type: 'llm-provider-set', success: true, provider });

      // Drain any emails that arrived before the orchestrator was ready
      if (pendingEmailIds.length > 0) {
        const pending = [...pendingEmailIds];
        pendingEmailIds = [];
        console.log(`[utility] Draining ${pending.length} pending emails`);
        processEmails(pending).catch(err => {
          console.error('[utility] Failed to process pending emails:', err);
        });
      }
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
 * Process a batch of emails by creating jobs in the utility process's job queue.
 * The JobRunner picks them up through the registered 'email_process' handler.
 */
async function processEmails(emailIds: string[]): Promise<void> {
  if (!jobQueue || !jobRunner) {
    sendMessage({ type: 'error', error: 'Job queue or runner not initialized' });
    return;
  }

  if (!orchestrator) {
    // Stash for later — will be drained once LLM provider is set
    pendingEmailIds.push(...emailIds);
    console.log(`[utility] Stashing ${emailIds.length} emails (orchestrator not ready), total pending: ${pendingEmailIds.length}`);
    return;
  }

  // Create jobs in the utility process's own job queue
  for (const emailId of emailIds) {
    await jobQueue.createJob({
      type: 'email_process',
      payload: { emailId },
      emailId,
    });
  }

  // Ensure runner is started
  if (!jobRunner.isRunning()) {
    await jobRunner.start();
  }

  // Poll until all jobs reach a terminal state
  const total = emailIds.length;
  let lastReported = 0;

  await new Promise<void>((resolve) => {
    const interval = setInterval(async () => {
      const completed = await jobQueue!.getJobsByStatus('completed');
      const failed = await jobQueue!.getJobsByStatus('failed');
      const dead = await jobQueue!.getJobsByStatus('dead');
      const done = completed.length + failed.length + dead.length;
      const failedCount = failed.length + dead.length;

      if (done > lastReported) {
        lastReported = done;
        sendMessage({ type: 'emailProcessed', processed: completed.length, failed: failedCount, total });

        if (failedCount > 0) {
          sendMessage({ type: 'emailFailed', failed: failedCount, total });
        }
      }

      if (done >= total) {
        clearInterval(interval);
        sendMessage({ type: 'processingComplete', processed: completed.length, failed: failedCount, total });
        resolve();
      }
    }, 200);
  });
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
  if (process.parentPort) {
    process.parentPort.postMessage(message);
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
      await setLLMProvider(message.provider, message.apiKey, message.model);
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
    case 'process-emails':
      await processEmails(message.emailIds);
      break;
    default:
      sendMessage({ type: 'error', error: `Unknown message type: ${(message as any).type}` });
  }
}

// Listen for messages from parent process
if (process.parentPort) {
  process.parentPort.on('message', (e: { data: MessageType }) => {
    // Skip gmail-response messages — handled internally by Gmail proxy system
    if ((e.data as any).type === 'gmail-response') return;

    handleMessage(e.data).catch((error) => {
      sendMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });
}

// Signal that utility process is ready
sendMessage({ type: 'ready' });

// Export for testability
export type { MessageType };
export { handleMessage };
