import type { JobQueue } from './jobs/queue';
import type { TuskerBrainDatabase } from '../database';
import type { GmailClient } from './gmail/client';
import type { LLMProvider } from './llm/provider';
import { ProcessingDecision, EmailProcessingWorkflow } from './workflows/email-processing';
import { EmailRepository, TimelineRepository, DealsRepository, TopicsRepository, SummariesRepository, LabelsRepository } from './repositories';
import type { Email } from './types/email';

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
 * Pipeline stages:
 * 1. Receive job from queue
 * 2. Classify email type
 * 3. Extract updates/deals (for appropriate types)
 * 4. Assign topics
 * 5. Apply Gmail labels
 * 6. Store to database
 * 7. Generate summaries
 * 8. Mark email as processed
 */
export class EmailProcessingOrchestrator {
  private db: TuskerBrainDatabase;
  private jobQueue: JobQueue;
  private gmailClient: GmailClient;
  private llmProvider: LLMProvider;
  private repos: OrchestratorOptions['repositories'];
  private workflow: EmailProcessingWorkflow;
  private isRunning: boolean = false;
  private processingCount: number = 0;

  constructor(options: OrchestratorOptions) {
    this.db = options.db;
    this.jobQueue = options.jobQueue;
    this.gmailClient = options.gmailClient;
    this.llmProvider = options.llmProvider;
    this.repos = options.repositories;
    this.workflow = new EmailProcessingWorkflow();
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
      const email = await this.repos.emails.findById(emailId);
      if (!email) {
        throw new Error(`Email not found: ${emailId}`);
      }

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
   * Process a single email through the full pipeline
   */
  async processEmail(email: Email): Promise<ProcessingResult> {
    // Step 1: Get processing decision (age-based rules)
    const decision = await ProcessingDecision.decide(email);

    // If decision is to archive or delete without AI processing
    if (decision.action === 'archive' || decision.action === 'delete') {
      await this.applyGmailAction(email.id, decision.action);
      await this.repos.emails.update(email.id, {
        isProcessed: true,
        isArchived: decision.action === 'archive',
        isDeleted: decision.action === 'delete',
      });

      return {
        emailId: email.id,
        classification: { type: 'regular', confidence: 1.0 },
        topics: [],
        gmailActions: {
          archived: decision.action === 'archive',
          deleted: decision.action === 'delete',
          labelsAdded: [],
        },
      };
    }

    // Step 2: Classify email type using LLM
    const classification = await this.classifyEmail(email);

    // Step 3: Extract content based on type
    let timelineUpdate;
    let deal;

    if (classification.type === 'updates') {
      timelineUpdate = await this.extractTimelineUpdate(email);
    } else if (classification.type === 'promotional') {
      deal = await this.extractDeal(email);
    }

    // Step 4: Assign topics
    const topics = await this.assignTopics(email);

    // Step 5: Apply Gmail labels
    const labelsAdded = await this.applyLabels(email, classification.type, topics);

    // Step 6: Store to database
    await this.storeResults(email, {
      classification,
      timelineUpdate,
      deal,
      topics,
    });

    // Step 7: Update summaries
    await this.updateSummaries(email, topics);

    // Step 8: Mark email as processed
    await this.repos.emails.markProcessed(email.id);

    // Apply Gmail actions (archive if not regular/important)
    const shouldArchive = classification.type !== 'regular' && !email.isImportant;
    if (shouldArchive) {
      await this.applyGmailAction(email.id, 'archive');
    }

    return {
      emailId: email.id,
      classification,
      timelineUpdate,
      deal,
      topics,
      gmailActions: {
        archived: shouldArchive,
        deleted: false,
        labelsAdded,
      },
    };
  }

  /**
   * Classify email type using LLM
   */
  private async classifyEmail(email: Email): Promise<{ type: 'regular' | 'updates' | 'social' | 'promotional'; confidence: number }> {
    // Use the workflow's classification
    const result = await this.workflow.classifyEmail(email);

    // Update email type in database
    await this.repos.emails.update(email.id, { emailType: result.type });

    return result;
  }

  /**
   * Extract timeline update from email
   */
  private async extractTimelineUpdate(email: Email): Promise<{ id: string; title: string; priority?: 'high' | 'medium' | 'low' } | undefined> {
    const extraction = await this.workflow.extractFromEmail(email, 'update');

    if (!extraction) {
      return undefined;
    }

    // Store timeline update
    const timelineRecord = await this.repos.timeline.create({
      id: `tu_${email.id}`,
      emailId: email.id,
      title: extraction.title,
      description: extraction.description,
      summary: extraction.summary,
      priority: extraction.priority,
      sentiment: extraction.sentiment,
      urgency: extraction.urgency,
      actionItem: extraction.actionItem,
      actionItemTitle: extraction.actionItemTitle,
      followUpDate: extraction.followUpDate,
      financialImpact: extraction.financialImpact,
      keyEntities: extraction.keyEntities,
    });

    return {
      id: timelineRecord.id,
      title: timelineRecord.title,
      priority: timelineRecord.priority || undefined,
    };
  }

  /**
   * Extract deal from promotional email
   */
  private async extractDeal(email: Email): Promise<{ id: string; dealTitle: string; brandName?: string } | undefined> {
    const extraction = await this.workflow.extractFromEmail(email, 'deal');

    if (!extraction) {
      return undefined;
    }

    // Store deal
    const dealRecord = await this.repos.deals.create({
      id: `deal_${email.id}`,
      emailId: email.id,
      dealTitle: extraction.dealTitle,
      dealDescription: extraction.dealDescription,
      brandName: extraction.brandName,
      dealValue: extraction.dealValue,
      dealCode: extraction.dealCode,
      dealExpiry: extraction.dealExpiry,
      dealLink: extraction.dealLink,
      minimumPurchase: extraction.minimumPurchase,
      dealCategory: extraction.dealCategory,
    });

    return {
      id: dealRecord.id,
      dealTitle: dealRecord.dealTitle,
      brandName: dealRecord.brandName || undefined,
    };
  }

  /**
   * Assign topics to email
   */
  private async assignTopics(email: Email): Promise<Array<{ id: string; name: string; confidence: number }>> {
    // Use workflow topic classification
    const topicAssignments = await this.workflow.assignTopics(email);

    const results = [];
    for (const assignment of topicAssignments) {
      // Find or create topic
      let topic = await this.repos.topics.findByFullPath(assignment.fullPath);

      if (!topic) {
        topic = await this.repos.topics.create({
          id: `topic_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: assignment.name,
          fullPath: assignment.fullPath,
        });
      }

      // Link email to topic
      await this.repos.topics.linkEmail(email.id, topic.id, assignment.confidence);

      // Increment topic email count
      await this.repos.topics.incrementEmailCount(topic.id);

      results.push({
        id: topic.id,
        name: topic.name,
        confidence: assignment.confidence,
      });
    }

    return results;
  }

  /**
   * Apply Gmail labels to email
   */
  private async applyLabels(
    email: Email,
    emailType: string,
    topics: Array<{ id: string; name: string }>
  ): Promise<string[]> {
    const labelsToAdd: string[] = [];

    // Add type-based label
    const typeLabel = this.getLabelForType(emailType);
    if (typeLabel) {
      labelsToAdd.push(typeLabel);
    }

    // Add topic-based labels
    for (const topic of topics.slice(0, 3)) { // Limit to top 3 topics
      const labelName = `TuskerBrain/${topic.name}`;
      labelsToAdd.push(labelName);
    }

    // Ensure labels exist and get their IDs
    const labelIds: string[] = [];
    for (const labelName of labelsToAdd) {
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

    // Link labels to email
    if (labelIds.length > 0) {
      await this.repos.labels.linkLabelsToEmail(email.id, labelIds);

      // Apply labels in Gmail
      try {
        await this.gmailClient.modifyMessage(email.id, {
          addLabelIds: labelIds,
        });
      } catch (error) {
        console.warn(`Failed to apply Gmail labels: ${error}`);
      }
    }

    return labelsToAdd;
  }

  /**
   * Get Gmail label name for email type
   */
  private getLabelForType(type: string): string | null {
    const typeLabels: Record<string, string> = {
      regular: 'TuskerBrain/Regular',
      updates: 'TuskerBrain/Updates',
      social: 'TuskerBrain/Social',
      promotional: 'TuskerBrain/Promotional',
    };
    return typeLabels[type] || null;
  }

  /**
   * Store processing results to database
   */
  private async storeResults(
    email: Email,
    results: {
      classification: { type: string; confidence: number };
      timelineUpdate?: { id: string; title: string };
      deal?: { id: string; dealTitle: string };
      topics: Array<{ id: string; name: string }>;
    }
  ): Promise<void> {
    // Update email with classification
    await this.repos.emails.update(email.id, {
      emailType: results.classification.type,
    });

    // Timeline and deal are already stored in their respective repositories
  }

  /**
   * Update summaries after processing
   */
  private async updateSummaries(
    email: Email,
    topics: Array<{ id: string; name: string }>
  ): Promise<void> {
    // Update topic summaries
    for (const topic of topics) {
      const existingSummary = await this.repos.topics.getSummary(topic.id);

      if (existingSummary) {
        // Generate rolling summary update
        const newContent = `New email from ${email.senderDomain}: ${email.subject}`;
        // For now, just increment the update count
        // In production, this would use LLM to generate a proper rolling summary
      }
    }

    // Update sender summary
    const existingSenderSummary = await this.repos.summaries.getSenderSummary(email.senderDomain);
    if (!existingSenderSummary) {
      await this.repos.summaries.upsertSenderSummary({
        senderDomain: email.senderDomain,
        summary: `Emails from ${email.senderDomain}`,
        lastEmailId: email.id,
      });
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
}

/**
 * Create an orchestrator with default configuration
 */
export function createOrchestrator(options: OrchestratorOptions): EmailProcessingOrchestrator {
  return new EmailProcessingOrchestrator(options);
}
