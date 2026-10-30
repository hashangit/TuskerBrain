import type { JobQueue } from '@domain/jobs/queue';
import type { Job } from '@foundations/types/jobs';
import type { TuskerBrainDatabase } from '@foundations/database';
import type { GmailClient } from '@capabilities/gmail/types';
import type { LLMProvider } from '@capabilities/llm/provider';
import { processEmailWithWorkflow } from '@domain/workflows/langgraph-workflow';
import { EmailRepository, TimelineRepository, DealsRepository, TopicsRepository, SummariesRepository, LabelsRepository } from '@foundations/persistence';
import type { Email, EmailType } from '@foundations/types/email';

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

/**
 * Options for the orchestrator
 */
export interface OrchestratorOptions {
  db: TuskerBrainDatabase;
  jobQueue: JobQueue;
  gmailClient: GmailClient;
  llmProvider: LLMProvider;
  repositories: {
    emails: EmailRepository;
    timeline: TimelineRepository;
    deals: DealsRepository;
    topics: TopicsRepository;
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
  private jobQueue: JobQueue;
  private gmailClient: GmailClient;
  private llmProvider: LLMProvider;
  private repos: OrchestratorOptions['repositories'];
  private isRunning: boolean = false;
  private processingCount: number = 0;

  constructor(options: OrchestratorOptions) {
    this.db = options.db;
    this.jobQueue = options.jobQueue;
    this.gmailClient = options.gmailClient;
    this.llmProvider = options.llmProvider;
    this.repos = options.repositories;
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
    this.jobQueue.startProcessing(async (job: Job) => {
      try {
        await this.processJob(job);
      } catch (error) {
        console.error(`Error processing job ${job.id}:`, error);
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
      const record = await this.repos.emails.findById(emailId);
      if (!record) {
        throw new Error(`Email not found: ${emailId}`);
      }

      // Map the persistence record to the domain Email shape
      const email: Email = {
        ...record,
        emailType: (record.emailType as EmailType | null) ?? null,
      };

      // Run the full processing pipeline
      const result = await this.processEmail(email);

      // Update processing stats
      this.processingCount++;

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
    const workflowResult = await processEmailWithWorkflow(email, this.llmProvider);

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

    // Handle workflow errors
    if (workflowResult.error) {
      console.warn(`Workflow error for ${email.id}: ${workflowResult.error}`);
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
      const dealRecord = await this.repos.deals.create({
        id: `deal_${email.id}`,
        emailId: email.id,
        dealTitle: deal.dealTitle,
        dealDescription: deal.dealDescription,
        brandName: deal.brandName ?? '',
        dealValue: deal.dealValue,
        dealCode: deal.dealCode,
        dealExpiry: deal.dealExpiry ? new Date(deal.dealExpiry) : undefined,
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

    // Persist topic
    if (workflowResult.topic) {
      const topic = workflowResult.topic;

      // Find or create topic
      let topicRecord = await this.repos.topics.findByFullPath(topic.fullPath);

      if (!topicRecord) {
        topicRecord = await this.repos.topics.create({
          id: `topic_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: topic.child,
          fullPath: topic.fullPath,
        });
      }

      // Link email to topic
      await this.repos.topics.linkEmail(email.id, topicRecord.id, topic.confidence);
      await this.repos.topics.incrementEmailCount(topicRecord.id);

      result.topics.push({
        id: topicRecord.id,
        name: topicRecord.name,
        confidence: topic.confidence,
      });
    }

    // Apply Gmail labels
    const labelsToAdd = workflowResult.labels ?? [];
    if (labelsToAdd.length > 0) {
      await this.applyGmailLabels(email.id, labelsToAdd);
      result.gmailActions.labelsAdded = labelsToAdd;
    }

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
      await this.updateTopicSummary(result.topics[0].id, workflowResult.summary);
    }

    // Update sender summary
    await this.updateSenderSummary(email, workflowResult.summary);

    this.processingCount++;
    return result;
  }

  /**
   * Apply Gmail labels to an email
   */
  private async applyGmailLabels(emailId: string, labelNames: string[]): Promise<void> {
    const labelIds: string[] = [];

    for (const labelName of labelNames) {
      let label = await this.repos.labels.findByName(labelName);

      if (!label) {
        label = await this.repos.labels.create({
          id: `label_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: labelName,
          type: 'user',
        });
      }

      labelIds.push(label.id);
    }

    if (labelIds.length > 0) {
      await this.repos.labels.linkLabelsToEmail(emailId, labelIds);

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
   * Update topic summary
   */
  private async updateTopicSummary(topicId: string, summary: string): Promise<void> {
    // In production, this would merge with existing summary using LLM
    // For now, just store the summary
    await this.repos.topics.updateSummary(topicId, summary);
  }

  /**
   * Update sender summary
   */
  private async updateSenderSummary(email: Email, summary?: string | null): Promise<void> {
    const existingSummary = await this.repos.summaries.getSenderSummary(email.senderDomain);

    if (!existingSummary) {
      await this.repos.summaries.upsertSenderSummary({
        senderDomain: email.senderDomain,
        summary: summary ?? `Emails from ${email.senderDomain}`,
        lastEmailId: email.id,
      });
    } else {
      await this.repos.summaries.upsertSenderSummary({
        senderDomain: email.senderDomain,
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
