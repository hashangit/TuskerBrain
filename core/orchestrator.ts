import type { JobQueue } from './jobs/queue';
import type { TuskerBrainDatabase } from '../database';
import type { GmailClient } from './gmail/client';
import type { LLMProvider } from './llm/provider';
import { processEmailWithWorkflow, type TopicLoader } from './workflows/langgraph-workflow';
import { EmailRepository, TimelineRepository, DealsRepository, TopicsRepository, SummariesRepository, LabelsRepository } from './repositories';
import type { Email } from './types/email';
import { buildSummaryPrompt, buildSenderSummaryPrompt, SummarySchema } from './workflows/prompts/summarization';
import { GmailLabelManager } from './labeling/manager';

/**
 * Processing result for a single email
 */
export interface ProcessingResult {
  emailId: string;
  classification: {
    type: 'regular' | 'updates' | 'social' | 'promotional';
    confidence: number;
  };
  timelineUpdate?: {
    id: string;
    title: string;
    priority?: 'high' | 'medium' | 'low';
  };
  deal?: {
    id: string;
    dealTitle: string;
    brandName?: string;
  };
  topics: Array<{
    id: string;
    name: string;
    confidence: number;
  }>;
  gmailActions: {
    archived: boolean;
    deleted: boolean;
    labelsAdded: string[];
  };
}

export class WorkflowProcessingError extends Error {
  readonly retryable: boolean;
  readonly step: string;
  readonly workflowError: string;

  constructor(retryable: boolean, step: string, workflowError: string) {
    const prefix = retryable ? 'Retryable' : 'Non-retryable';
    super(`${prefix} LLM error at step ${step}: ${workflowError}`);
    this.name = new.target.name;
    this.retryable = retryable;
    this.step = step;
    this.workflowError = workflowError;
  }
}

export class RetryableWorkflowError extends WorkflowProcessingError {
  constructor(step: string, workflowError: string) {
    super(true, step, workflowError);
  }
}

export class NonRetryableWorkflowError extends WorkflowProcessingError {
  constructor(step: string, workflowError: string) {
    super(false, step, workflowError);
  }
}

/**
 * Extended JobQueue interface including the callback-based processing methods
 * used by the orchestrator. These may be provided by mock implementations
 * or a future production queue adapter.
 */
interface OrchestratorJobQueue extends JobQueue {
  startProcessing(handler: (job: { id: string; type: string; payload: Record<string, unknown> }) => Promise<void>): void;
  stopProcessing(): void;
}

/**
 * Extended TopicsRepository interface including the updateSummary stub.
 * This method is a stub pending future LLM-based summary merging.
 */
interface OrchestratorTopicsRepository extends TopicsRepository {
  updateSummary(topicId: string, summary: string, wordCount?: number): Promise<void>;
}

/**
 * Options for the orchestrator
 */
export interface OrchestratorOptions {
  db: TuskerBrainDatabase;
  jobQueue: OrchestratorJobQueue;
  gmailClient: GmailClient;
  llmProvider: LLMProvider;
  repositories: {
    emails: EmailRepository;
    timeline: TimelineRepository;
    deals: DealsRepository;
    topics: OrchestratorTopicsRepository;
    summaries: SummariesRepository;
    labels: LabelsRepository;
  };
}

/**
 * EmailProcessingOrchestrator coordinates the full email processing pipeline.
 *
 * Uses LangGraph workflow for LLM-powered processing:
 * 1. Receive job from queue
 * 2. Run LangGraph workflow (classify → decide → extract → label → summarize)
 * 3. Persist results to database
 * 4. Apply Gmail actions (archive/delete/labels)
 */
export class EmailProcessingOrchestrator {
  private db: TuskerBrainDatabase;
  private jobQueue: OrchestratorJobQueue;
  private gmailClient: GmailClient;
  private llmProvider: LLMProvider;
  private repos: OrchestratorOptions['repositories'];
  private topicLoader: TopicLoader;
  private isRunning: boolean = false;
  private processingCount: number = 0;

  constructor(options: OrchestratorOptions) {
    this.db = options.db;
    this.jobQueue = options.jobQueue;
    this.gmailClient = options.gmailClient;
    this.llmProvider = options.llmProvider;
    this.repos = options.repositories;
    this.topicLoader = async () => {
      const allTopics = await this.repos.topics.findAll();
      const parents = allTopics.filter(t => t.parentId === null);
      return parents.map(parent => ({
        parent: parent.name,
        children: allTopics
          .filter(t => t.parentId === parent.id)
          .map(t => t.name),
      }));
    };
  }

  /**
   * Start processing jobs from the queue
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('Orchestrator is already running');
      return;
    }

    this.isRunning = true;
    console.log('EmailProcessingOrchestrator started');

    // Start job queue processing
    this.jobQueue.startProcessing(async (job) => {
      try {
        await this.processJob(job);
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
        throw error; // Re-throw so the job queue can mark the job as failed
      }
    });
  }

  /**
   * Stop processing jobs
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.jobQueue.stopProcessing();
    console.log('EmailProcessingOrchestrator stopped');
  }

  /**
   * Get current processing status
   */
  getStatus(): { isRunning: boolean; processed: number } {
    return {
      isRunning: this.isRunning,
      processed: this.processingCount,
    };
  }

  /**
   * Process a single job
   */
  private async processJob(job: { id: string; type: string; payload: Record<string, unknown> }): Promise<void> {
    if (job.type !== 'email_process') {
      console.warn(`Unknown job type: ${job.type}`);
      return;
    }

    const emailId = job.payload.emailId as string;
    if (!emailId) {
      throw new Error('Job payload missing emailId');
    }

    console.log(`Processing email: ${emailId}`);
    const startTime = Date.now();

    try {
      // Get email from database
      const emailRecord = await this.repos.emails.findById(emailId);
      if (!emailRecord) {
        throw new Error(`Email not found: ${emailId}`);
      }

      // Convert EmailRecord to Email for workflow compatibility
      const email: Email = {
        id: emailRecord.id,
        threadId: emailRecord.threadId,
        senderEmail: emailRecord.senderEmail,
        senderName: emailRecord.senderName,
        senderDomain: emailRecord.senderDomain,
        subject: emailRecord.subject,
        snippet: emailRecord.snippet,
        bodyPlain: emailRecord.bodyPlain,
        bodyHtml: emailRecord.bodyHtml,
        receivedAt: emailRecord.receivedAt,
        emailType: (emailRecord.emailType as Email['emailType']) ?? undefined,
        gmailCategory: (emailRecord.gmailCategory as Email['gmailCategory']) ?? undefined,
        isImportant: emailRecord.isImportant,
        isRead: emailRecord.isRead,
        isArchived: emailRecord.isArchived,
        isDeleted: emailRecord.isDeleted,
        isProcessed: emailRecord.isProcessed,
        processedAt: emailRecord.processedAt,
        createdAt: emailRecord.createdAt,
      };

      // Run the full processing pipeline
      const result = await this.processEmail(email);

      // Validate that processing produced meaningful results
      const hasTopics = result.topics.length > 0;
      const hasTimeline = result.timelineUpdate != null;
      const hasDeal = result.deal != null;
      const wasHandled = result.gmailActions.archived || result.gmailActions.deleted;
      if (!hasTopics && !hasTimeline && !hasDeal && !wasHandled) {
        console.warn(`Email ${emailId} processed but produced no results (no topics, timeline, deal, or archive/delete action)`);
      }

      const duration = Date.now() - startTime;
      console.log(`Processed email ${emailId} in ${duration}ms`);

    } catch (error) {
      console.error(`Failed to process email ${emailId}:`, error);
      throw error;
    }
  }

  /**
   * Process a single email through the LangGraph workflow
   */
  async processEmail(email: Email): Promise<ProcessingResult> {
    // Run the LangGraph workflow
    const workflowResult = await processEmailWithWorkflow(email, this.llmProvider, this.topicLoader);

    // Extract classification
    const classification = workflowResult.classification ?? {
      type: 'regular' as const,
      confidence: 0.5,
    };

    // Initialize result
    const result: ProcessingResult = {
      emailId: email.id,
      classification: {
        type: classification.type,
        confidence: classification.confidence,
      },
      topics: [],
      gmailActions: {
        archived: false,
        deleted: false,
        labelsAdded: [],
      },
    };

    // Handle workflow errors — any error means the email was NOT processed
    if (workflowResult.error) {
      console.warn(`Workflow error for ${email.id}: ${workflowResult.error} at step ${workflowResult.errorStep ?? 'unknown'}`);

      const errorStep = workflowResult.errorStep ?? 'unknown';
      if (workflowResult.isRetryableError) {
        // Retryable (429, 5xx, network): throw to fail the job, queue will retry later
        throw new RetryableWorkflowError(errorStep, workflowResult.error);
      }

      // Non-retryable error (401, 403, content filter, etc.): throw so the job is marked as failed
      // instead of silently returning an empty result that looks like success
      throw new NonRetryableWorkflowError(errorStep, workflowResult.error);
    }

    // Handle archive/delete decisions
    if (workflowResult.currentStep === 'archive') {
      await this.applyGmailAction(email.id, 'archive');
      await this.repos.emails.update(email.id, {
        isProcessed: true,
        isArchived: true,
        emailType: classification.type,
      });

      result.gmailActions.archived = true;
      this.processingCount++;
      return result;
    }

    if (workflowResult.currentStep === 'delete') {
      await this.applyGmailAction(email.id, 'delete');
      await this.repos.emails.update(email.id, {
        isProcessed: true,
        isDeleted: true,
        emailType: classification.type,
      });

      result.gmailActions.deleted = true;
      this.processingCount++;
      return result;
    }

    // Persist extraction results
    if (workflowResult.extraction?.type === 'deal' && workflowResult.extraction.deal) {
      const deal = workflowResult.extraction.deal;
      const dealExpiry = deal.dealExpiry ? new Date(deal.dealExpiry) : undefined;
      const dealRecord = await this.repos.deals.create({
        id: `deal_${email.id}`,
        emailId: email.id,
        dealTitle: deal.dealTitle,
        dealDescription: deal.dealDescription,
        brandName: deal.brandName ?? email.senderDomain,
        dealValue: deal.dealValue,
        dealCode: deal.dealCode,
        dealExpiry: isNaN(dealExpiry?.getTime() ?? NaN) ? undefined : dealExpiry,
        dealLink: deal.dealLink,
        minimumPurchase: deal.minimumPurchase,
        dealCategory: deal.dealCategory,
      });

      result.deal = {
        id: dealRecord.id,
        dealTitle: dealRecord.dealTitle,
        brandName: dealRecord.brandName ?? undefined,
      };
    }

    if (workflowResult.extraction?.type === 'update' && workflowResult.extraction.update) {
      const update = workflowResult.extraction.update;
      const timelineRecord = await this.repos.timeline.create({
        id: `tu_${email.id}`,
        emailId: email.id,
        title: update.title,
        description: update.description,
        summary: update.summary,
        priority: update.priority,
        sentiment: update.sentiment,
        urgency: update.urgency,
        actionItem: update.actionItem,
        actionItemTitle: update.actionItemTitle,
        followUpDate: update.followUpDate,
        financialImpact: update.financialImpact,
        keyEntities: update.keyEntities
          ? {
              dates: update.keyEntities.dates ?? [],
              amounts: update.keyEntities.amounts ?? [],
              names: update.keyEntities.names ?? [],
            }
          : undefined,
      });

      result.timelineUpdate = {
        id: timelineRecord.id,
        title: timelineRecord.title,
        priority: timelineRecord.priority ?? undefined,
      };
    }

    // Persist topic hierarchy (parent + child)
    if (workflowResult.topic) {
      const topic = workflowResult.topic;
      const parentName = topic.parent;
      const childName = topic.child;
      const parentPath = parentName;
      const childPath = `${parentName}/${childName}`;

      // Step 1: Find or create parent topic
      let parentRecord = await this.repos.topics.findByFullPath(parentPath);
      if (!parentRecord) {
        parentRecord = await this.repos.topics.create({
          id: `topic_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: parentName,
          fullPath: parentPath,
        });
      }

      // Step 2: Find or create child topic with parentId linked to parent
      let childRecord = await this.repos.topics.findByFullPath(childPath);
      if (!childRecord) {
        childRecord = await this.repos.topics.create({
          id: `topic_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          parentId: parentRecord.id,
          name: childName,
          fullPath: childPath,
        });
      }

      // Step 3: Link email to child topic with confidence score
      await this.repos.topics.linkEmail(email.id, childRecord.id, topic.confidence);

      // Step 4: Increment email count on both parent and child
      await this.repos.topics.incrementEmailCount(parentRecord.id);
      await this.repos.topics.incrementEmailCount(childRecord.id);

      result.topics.push({
        id: childRecord.id,
        name: childRecord.name,
        confidence: topic.confidence,
      });

      // Step 5: Create Gmail labels via API and record in DB
      const parentLabelName = `TB/${parentName}`;
      const childLabelName = `TB/${parentName}/${childName}`;

      try {
        const labelManager = new GmailLabelManager(this.gmailClient);
        const { parentId: gmailParentId, childId: gmailChildId } = await labelManager.ensureTopicLabels(parentName, childName);

        // Insert gmailLabels rows for parent and child
        let parentDbLabel = await this.repos.labels.findById(gmailParentId);
        if (!parentDbLabel) {
          parentDbLabel = await this.repos.labels.create({
            id: gmailParentId,
            name: parentLabelName,
            labelSource: 'tb',
            labelType: 'topic',
          });
        }

        let childDbLabel = await this.repos.labels.findById(gmailChildId);
        if (!childDbLabel) {
          childDbLabel = await this.repos.labels.create({
            id: gmailChildId,
            name: childLabelName,
            labelSource: 'tb',
            labelType: 'topic',
          });
        }

        // Set gmailLabelId on topic records
        if (!parentRecord.gmailLabelId) {
          await this.repos.topics.updateGmailLabelId(parentRecord.id, gmailParentId);
        }
        if (!childRecord.gmailLabelId) {
          await this.repos.topics.updateGmailLabelId(childRecord.id, gmailChildId);
        }

        // Link email to both labels in emailLabels
        await this.repos.labels.linkLabelsToEmail(email.id, [gmailParentId, gmailChildId]);

        // Apply labels to the Gmail message
        await this.gmailClient.modifyMessage(email.id, {
          addLabelIds: [gmailParentId, gmailChildId],
        });
      } catch (error) {
        console.warn(`Failed to create/apply topic Gmail labels for ${email.id}: ${error}`);
      }
    }

    // Apply non-topic Gmail labels (Processed, Sender, etc.)
    // Filter out topic labels which are handled in Step 5 above
    const topicLabelPrefixes = workflowResult.topic
      ? [`TB/${workflowResult.topic.parent}`, `TB/${workflowResult.topic.parent}/`]
      : [];
    const workflowLabels = (workflowResult.labels ?? [])
      .filter(label => !label.startsWith('TuskerBrain/') && !topicLabelPrefixes.some(prefix => label.startsWith(prefix)));
    if (workflowLabels.length > 0) {
      await this.applyGmailLabels(email.id, workflowLabels);
    }

    // Collect all applied labels in result
    const tbLabels = workflowResult.topic
      ? [`TB/${workflowResult.topic.parent}`, `TB/${workflowResult.topic.parent}/${workflowResult.topic.child}`]
      : [];
    result.gmailActions.labelsAdded = [...tbLabels, ...workflowLabels];

    // Archive non-regular emails
    const shouldArchive = classification.type !== 'regular' && !email.isImportant;
    if (shouldArchive) {
      await this.applyGmailAction(email.id, 'archive');
      result.gmailActions.archived = true;
    }

    // Mark email as processed
    await this.repos.emails.markProcessed(email.id);
    await this.repos.emails.update(email.id, {
      emailType: classification.type,
    });

    // Update summaries
    if (workflowResult.summary && result.topics.length > 0) {
      try {
        await this.updateTopicSummary(result.topics[0].id, workflowResult.summary);
      } catch (error) {
        console.warn(`Failed to update topic summary for ${email.id}: ${error}`);
      }
    }

    // Update sender summary
    try {
      await this.updateSenderSummary(email, workflowResult.summary);
    } catch (error) {
      console.warn(`Failed to update sender summary for ${email.id}: ${error}`);
    }

    this.processingCount++;
    return result;
  }

  /**
   * Determine labelType from a label name.
   */
  private inferLabelType(name: string): string {
    if (name.startsWith('TB/Sender/')) return 'sender';
    if (name === 'TB/Processed') return 'processed';
    if (name.startsWith('TB/')) return 'topic';
    return 'unknown';
  }

  /**
   * Apply Gmail labels to an email.
   * Creates gmailLabels rows with labelSource='tb' and appropriate labelType.
   */
  private async applyGmailLabels(emailId: string, labelNames: string[]): Promise<void> {
    const labelIds: string[] = [];

    for (const labelName of labelNames) {
      let label = await this.repos.labels.findByName(labelName);

      if (!label) {
        label = await this.repos.labels.create({
          id: `label_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: labelName,
          labelSource: 'tb',
          labelType: this.inferLabelType(labelName),
        });
      }

      labelIds.push(label.id);
    }

    if (labelIds.length > 0) {
      await this.repos.labels.addLabelsToEmail(emailId, labelIds);

      try {
        await this.gmailClient.modifyMessage(emailId, {
          addLabelIds: labelIds,
        });
      } catch (error) {
        console.warn(`Failed to apply Gmail labels: ${error}`);
      }
    }
  }

  /**
   * Apply Gmail action (archive or delete)
   */
  private async applyGmailAction(emailId: string, action: 'archive' | 'delete'): Promise<void> {
    try {
      if (action === 'archive') {
        await this.gmailClient.modifyMessage(emailId, {
          removeLabelIds: ['INBOX'],
        });
      } else if (action === 'delete') {
        await this.gmailClient.modifyMessage(emailId, {
          addLabelIds: ['TRASH'],
        });
      }
    } catch (error) {
      console.warn(`Failed to apply Gmail action ${action}: ${error}`);
    }
  }

  /**
   * Update topic summary by merging new content with existing summary using LLM.
   * If no existing summary exists, the new summary is stored as-is.
   */
  private async updateTopicSummary(topicId: string, summary: string): Promise<void> {
    const existing = await this.repos.topics.getSummary(topicId);

    if (!existing) {
      // No existing summary — store the new summary directly
      const wordCount = summary.split(/\s+/).filter(w => w.length > 0).length;
      await this.repos.topics.upsertSummary(topicId, summary, wordCount);
      return;
    }

    // Merge new content into existing summary using LLM
    const topic = await this.repos.topics.findById(topicId);
    const topicName = topic?.fullPath ?? 'Unknown Topic';

    const prompt = buildSummaryPrompt({
      topic: topicName,
      currentSummary: existing.summary,
      newContent: summary,
      maxWords: 500,
    });

    const result = await this.llmProvider.generateObject(
      prompt,
      SummarySchema,
      'You are a summary assistant. Your job is to merge new information into an existing summary, producing a concise 3-4 paragraph summary under 500 words. Preserve key facts, dates, amounts, and action items. Gradually reduce focus on older information.'
    );

    await this.repos.topics.upsertSummary(topicId, result.summary, result.wordCount);
  }

  /**
   * Update sender summary by generating or merging using LLM.
   * For new senders without a summary: generates a proper summary from the email content.
   * For existing senders: merges new email information into the existing summary.
   */
  private async updateSenderSummary(email: Email, summary?: string | null): Promise<void> {
    const existingSummary = await this.repos.summaries.getSenderSummary(email.senderDomain);
    const newContent = summary ?? `Subject: ${email.subject ?? 'No subject'}\nFrom: ${email.senderName ?? email.senderEmail}\n${email.snippet ?? ''}`;

    if (!existingSummary) {
      // New sender — generate an initial summary from the email content
      const prompt = buildSenderSummaryPrompt({
        senderDomain: email.senderDomain,
        currentSummary: undefined,
        newContent,
        maxWords: 500,
      });

      const result = await this.llmProvider.generateObject(
        prompt,
        SummarySchema,
        'You are a summary assistant. Your job is to generate a concise 3-4 paragraph summary of emails from a sender, under 500 words. Focus on the purpose of the sender and the key information in their emails.'
      );

      await this.repos.summaries.upsertSummary({
        senderDomain: email.senderDomain,
        summary: result.summary,
        wordCount: result.wordCount,
        lastEmailId: email.id,
      });
    } else {
      // Existing sender — merge new content into the existing summary
      const prompt = buildSenderSummaryPrompt({
        senderDomain: email.senderDomain,
        currentSummary: existingSummary.summary,
        newContent,
        maxWords: 500,
      });

      const result = await this.llmProvider.generateObject(
        prompt,
        SummarySchema,
        'You are a summary assistant. Your job is to merge new email information into an existing sender summary, producing a concise 3-4 paragraph summary under 500 words. Gradually reduce focus on older emails while preserving key patterns and important facts.'
      );

      await this.repos.summaries.upsertSummary({
        senderDomain: email.senderDomain,
        summary: result.summary,
        wordCount: result.wordCount,
        lastEmailId: email.id,
      });
    }
  }
}

/**
 * Create an orchestrator with default configuration
 */
export function createOrchestrator(options: OrchestratorOptions): EmailProcessingOrchestrator {
  return new EmailProcessingOrchestrator(options);
}
