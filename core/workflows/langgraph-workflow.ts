import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { z } from 'zod';
import type { Email, EmailType } from '@core/types/email';
import type { LLMProvider } from '@core/llm/provider';
import {
  buildClassificationPrompt,
  buildUpdateExtractionPrompt,
  buildDealExtractionPrompt,
  buildSummaryPrompt,
  buildTopicLabelingPrompt,
  type TopicLabelingInput,
} from './prompts/classification';

/**
 * Timeline update extracted from an email.
 */
export interface TimelineUpdate {
  title: string;
  description?: string;
  summary?: string;
  priority?: 'high' | 'medium' | 'low';
  sentiment?: 'positive' | 'negative' | 'neutral';
  urgency?: boolean;
  actionItem?: boolean;
  actionItemTitle?: string;
  followUpDate?: string;
  financialImpact?: number;
  keyEntities?: {
    dates?: string[];
    amounts?: number[];
    names?: string[];
  };
}

/**
 * Deal extracted from a promotional email.
 */
export interface ExtractedDeal {
  dealTitle: string;
  dealDescription?: string;
  brandName?: string;
  dealValue?: string;
  dealCode?: string;
  dealExpiry?: string;
  dealLink?: string;
  minimumPurchase?: string;
  dealCategory?: string;
  isActive: boolean;
}

// ─── LLM Error Handling ──────────────────────────────────────────────────────────

/**
 * Check if an LLM error is retryable (429 rate limit, server errors, network issues).
 * Non-retryable errors (401, 403, content filter) should fail immediately.
 */
function isRetryableLLMError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const status = (error as any).status ?? (error as any).statusCode ?? (error as any).code;

  // Rate limit errors
  if (status === 429) return true;
  if (msg.includes('rate limit') || msg.includes('too many requests')) return true;

  // Server errors (5xx)
  if (typeof status === 'number' && status >= 500 && status < 600) return true;

  // Network/timeout errors
  if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('enotfound')) return true;
  if (msg.includes('network') || msg.includes('timeout')) return true;
  if (status === 'ECONNRESET' || status === 'ETIMEDOUT' || status === 'ENOTFOUND') return true;

  return false;
}

const LLM_MAX_RETRIES = 3;
const LLM_BASE_BACKOFF_MS = 1000;
const RETRY_BUFFER_MS = 500; // small buffer added to server-suggested retry delays

/**
 * Extract the retry delay (in ms) suggested by the server from a 429 error message.
 * Gemini format: "Please retry in 26.60836933s." or "Please retry in 30s."
 * Also handles "retryDelay" fields or generic "retry after Xs" patterns.
 * Returns null if no delay can be extracted.
 */
function extractRetryDelayMs(error: unknown): number | null {
  if (!(error instanceof Error)) return null;

  const msg = error.message;

  // Match "Please retry in Xs" or "retry in Xs" (with optional decimal)
  const retryInMatch = msg.match(/retry\s+(?:after|in)\s+([\d.]+)\s*s/i);
  if (retryInMatch) {
    const seconds = parseFloat(retryInMatch[1]);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000) + RETRY_BUFFER_MS;
    }
  }

  // Check for retryDelay property on the error object (some SDKs set this)
  const retryDelay = (error as any).retryDelay;
  if (typeof retryDelay === 'number' && retryDelay > 0) {
    return Math.ceil(retryDelay) + RETRY_BUFFER_MS;
  }

  return null;
}

/**
 * Retry wrapper for LLM calls with exponential backoff.
 * For 429 errors, uses the server-suggested retry delay when available.
 * Only retries on retryable errors (429, 5xx, network). Non-retryable errors throw immediately.
 */
async function withLLMRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = LLM_MAX_RETRIES,
  baseBackoffMs: number = LLM_BASE_BACKOFF_MS,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isRetryableLLMError(error) || attempt === maxRetries) {
        throw lastError;
      }

      // For 429 errors, prefer the server-suggested delay over fixed backoff
      const isRateLimit =
        (error as any).status === 429 ||
        (error as any).statusCode === 429 ||
        lastError.message.toLowerCase().includes('rate limit') ||
        lastError.message.toLowerCase().includes('too many requests');

      let delay: number;
      if (isRateLimit) {
        const serverDelay = extractRetryDelayMs(error);
        if (serverDelay !== null) {
          delay = serverDelay;
        } else {
          // Fallback to exponential backoff if server delay can't be extracted
          delay = baseBackoffMs * Math.pow(2, attempt);
        }
      } else {
        delay = baseBackoffMs * Math.pow(2, attempt);
      }

      console.warn(`LLM retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${lastError.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Age thresholds for decision making
const AGE_THRESHOLDS = {
  ONE_MONTH: 30,
  SIX_MONTHS: 180,
  TWO_YEARS: 730,
};

// Zod schemas for LLM structured output
const ClassificationSchema = z.object({
  type: z.enum(['regular', 'updates', 'social', 'promotional']),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});

const UpdateExtractionSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  summary: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
  urgency: z.boolean().optional(),
  actionItem: z.boolean().optional(),
  actionItemTitle: z.string().optional(),
  followUpDate: z.string().optional(),
  financialImpact: z.number().optional(),
  keyEntities: z.object({
    dates: z.array(z.string()).optional(),
    amounts: z.array(z.number()).optional(),
    names: z.array(z.string()).optional(),
  }).optional(),
});

const DealExtractionSchema = z.object({
  dealTitle: z.string(),
  dealDescription: z.string().optional(),
  brandName: z.string().optional(),
  dealValue: z.string().optional(),
  dealCode: z.string().optional(),
  dealExpiry: z.string().optional(),
  dealLink: z.string().optional(),
  minimumPurchase: z.string().optional(),
  dealCategory: z.string().optional(),
  isActive: z.boolean().default(true),
});

const TopicLabelingSchema = z.object({
  parent: z.string(),
  child: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * Define the state annotation for the email processing workflow.
 */
const EmailWorkflowAnnotation = Annotation.Root({
  // The email being processed - always required
  email: Annotation<Email>({
    reducer: (_, right) => right,
    default: () => null as unknown as Email,
  }),
  // Classification result from LLM
  classification: Annotation<{
    type: EmailType;
    confidence: number;
    reason?: string;
  } | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  // Decision about how to process the email
  decision: Annotation<{
    action: 'process' | 'archive' | 'delete' | 'extract_deals';
    reason: string;
    needsExtraction: boolean;
    needsTopicLabeling: boolean;
  } | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  // Extracted information (update or deal)
  extraction: Annotation<{
    type: 'update' | 'deal' | 'none';
    update?: TimelineUpdate;
    deal?: ExtractedDeal;
  } | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  // Topic label for the email
  topic: Annotation<{
    parent: string;
    child: string;
    confidence: number;
  } | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  // Gmail labels to apply
  labels: Annotation<string[]>({
    reducer: (left, right) => right ?? left ?? [],
    default: () => [],
  }),
  // Summary of the email
  summary: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  // Error message if any
  error: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  // Error step tracking
  errorStep: Annotation<string | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  // Whether the error is retryable (e.g., 429 rate limit) — triggers job-level retry
  isRetryableError: Annotation<boolean | null>({
    reducer: (_, right) => right,
    default: () => null,
  }),
  // Current step in the workflow
  currentStep: Annotation<string>({
    reducer: (_, right) => right,
    default: () => 'start',
  }),
  // Token usage tracking
  tokensUsed: Annotation<number>({
    reducer: (left, right) => (left ?? 0) + (right ?? 0),
    default: () => 0,
  }),
});

type EmailWorkflowState = typeof EmailWorkflowAnnotation.State;

/**
 * Function type for loading existing topics from the database.
 * Returns a list of parent topics, each with their child topic names.
 */
export type TopicLoader = () => Promise<Array<{ parent: string; children: string[] }>>;

/**
 * Create a LangGraph-based email processing workflow.
 * @param llmProvider - LLM provider for AI-powered nodes
 * @param topicLoader - Optional function to load existing topics from DB for labeling context
 */
export function createEmailProcessingWorkflow(llmProvider: LLMProvider, topicLoader?: TopicLoader) {
  // Node: Classify email type using LLM
  async function classifyNode(state: EmailWorkflowState): Promise<Partial<EmailWorkflowState>> {
    // Gmail-first short-circuit: skip LLM when gmailCategory is present
    if (state.email.gmailCategory) {
      const gmailMap: Record<string, { type: EmailType; confidence: number }> = {
        promotions: { type: 'promotional', confidence: 0.95 },
        social: { type: 'social', confidence: 0.95 },
        updates: { type: 'updates', confidence: 0.95 },
        forums: { type: 'updates', confidence: 0.85 },
        primary: { type: 'regular', confidence: 0.85 },
      };
      const mapped = gmailMap[state.email.gmailCategory];
      if (mapped) {
        return {
          classification: {
            type: mapped.type,
            confidence: mapped.confidence,
            reason: `Gmail ${state.email.gmailCategory} category`,
          },
          currentStep: 'classify',
        };
      }
    }

    // No gmailCategory or unrecognized category -- use LLM
    try {
      const prompt = buildClassificationPrompt({
        email: {
          subject: state.email.subject ?? undefined,
          snippet: (state.email.bodyPlain || state.email.snippet) ?? undefined,
          senderDomain: state.email.senderDomain,
          receivedAt: state.email.receivedAt,
          gmailCategory: state.email.gmailCategory ?? undefined,
        },
      });

      const result = await withLLMRetry(() => llmProvider.generateObject(prompt, ClassificationSchema));

      return {
        classification: {
          type: result.type,
          confidence: result.confidence,
          reason: result.reason,
        },
        currentStep: 'classify',
      };
    } catch (error) {
      const retryable = isRetryableLLMError(error);
      return {
        classification: {
          type: 'regular',
          confidence: 0.5,
          reason: 'Fallback classification (LLM error)',
        },
        currentStep: 'classify',
        error: error instanceof Error ? error.message : 'Classification error',
        errorStep: 'classify',
        isRetryableError: retryable ? true : null,
      };
    }
  }

  // Node: Decide processing action based on classification and age
  async function decideNode(state: EmailWorkflowState): Promise<Partial<EmailWorkflowState>> {
    const type = state.classification?.type ?? 'regular';
    const ageInDays = getEmailAgeInDays(state.email);

    let decision: EmailWorkflowState['decision'];

    switch (type) {
      case 'promotional':
        if (ageInDays <= AGE_THRESHOLDS.ONE_MONTH) {
          decision = {
            action: 'extract_deals',
            reason: 'Recent promotional email - extract deals',
            needsExtraction: true,
            needsTopicLabeling: false,
          };
        } else {
          decision = {
            action: 'delete',
            reason: `Promotional email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
            needsExtraction: false,
            needsTopicLabeling: false,
          };
        }
        break;

      case 'social':
        if (ageInDays >= AGE_THRESHOLDS.TWO_YEARS) {
          decision = {
            action: 'archive',
            reason: 'Social email older than 2 years',
            needsExtraction: false,
            needsTopicLabeling: false,
          };
        } else if (ageInDays < AGE_THRESHOLDS.ONE_MONTH) {
          decision = {
            action: 'process',
            reason: 'Recent social email',
            needsExtraction: true,
            needsTopicLabeling: true,
          };
        } else {
          decision = {
            action: 'delete',
            reason: `Social email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
            needsExtraction: false,
            needsTopicLabeling: false,
          };
        }
        break;

      case 'updates':
        if (ageInDays < AGE_THRESHOLDS.ONE_MONTH) {
          decision = {
            action: 'process',
            reason: 'Recent update email',
            needsExtraction: true,
            needsTopicLabeling: true,
          };
        } else {
          decision = {
            action: 'archive',
            reason: `Update email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
            needsExtraction: false,
            needsTopicLabeling: false,
          };
        }
        break;

      case 'regular':
      default:
        if (ageInDays < AGE_THRESHOLDS.SIX_MONTHS) {
          decision = {
            action: 'process',
            reason: 'Recent regular email',
            needsExtraction: true,
            needsTopicLabeling: true,
          };
        } else {
          decision = {
            action: 'archive',
            reason: `Regular email older than ${AGE_THRESHOLDS.SIX_MONTHS} days`,
            needsExtraction: false,
            needsTopicLabeling: false,
          };
        }
        break;
    }

    // Important emails are never deleted or archived — always process them
    if (state.email.isImportant && (decision!.action === 'delete' || decision!.action === 'archive')) {
      decision = {
        action: type === 'promotional' ? 'extract_deals' : 'process',
        reason: 'Gmail important flag — prioritized processing',
        needsExtraction: true,
        needsTopicLabeling: type !== 'promotional',
      };
    }

    return {
      decision,
      currentStep: 'decide',
    };
  }

  // Node: Extract information from email using LLM
  async function extractNode(state: EmailWorkflowState): Promise<Partial<EmailWorkflowState>> {
    const type = state.classification?.type;

    try {
      if (type === 'promotional') {
        // Extract deal information
        const prompt = buildDealExtractionPrompt({
          email: {
            subject: state.email.subject ?? undefined,
            snippet: (state.email.bodyPlain || state.email.snippet) ?? undefined,
            senderName: state.email.senderName ?? undefined,
            senderDomain: state.email.senderDomain,
            receivedAt: state.email.receivedAt,
          },
        });

        const result = await withLLMRetry(() => llmProvider.generateObject(prompt, DealExtractionSchema));

        return {
          extraction: {
            type: 'deal',
            deal: {
              dealTitle: result.dealTitle,
              dealDescription: result.dealDescription,
              brandName: result.brandName,
              dealValue: result.dealValue,
              dealCode: result.dealCode,
              dealExpiry: result.dealExpiry,
              dealLink: result.dealLink,
              minimumPurchase: result.minimumPurchase,
              dealCategory: result.dealCategory,
              isActive: result.isActive,
            },
          },
          currentStep: 'extract',
        };
      } else {
        // Extract update/timeline information
        const prompt = buildUpdateExtractionPrompt({
          email: {
            subject: state.email.subject ?? undefined,
            snippet: (state.email.bodyPlain || state.email.snippet) ?? undefined,
            senderName: state.email.senderName ?? undefined,
            senderDomain: state.email.senderDomain,
            receivedAt: state.email.receivedAt,
          },
        });

        const result = await withLLMRetry(() => llmProvider.generateObject(prompt, UpdateExtractionSchema));

        return {
          extraction: {
            type: 'update',
            update: {
              title: result.title,
              description: result.description,
              summary: result.summary,
              priority: result.priority,
              sentiment: result.sentiment,
              urgency: result.urgency,
              actionItem: result.actionItem,
              actionItemTitle: result.actionItemTitle,
              followUpDate: result.followUpDate,
              financialImpact: result.financialImpact,
              keyEntities: result.keyEntities,
            },
          },
          currentStep: 'extract',
        };
      }
    } catch (error) {
      const retryable = isRetryableLLMError(error);
      return {
        extraction: { type: 'none' },
        currentStep: 'extract',
        error: error instanceof Error ? error.message : 'Extraction error',
        errorStep: 'extract',
        isRetryableError: retryable ? true : null,
      };
    }
  }

  // Node: Label email with topic using LLM
  async function labelNode(state: EmailWorkflowState): Promise<Partial<EmailWorkflowState>> {
    // Load existing topics from DB if topicLoader is provided
    let existingTopics: TopicLabelingInput['existingTopics'] = [];
    if (topicLoader) {
      try {
        existingTopics = await topicLoader();
      } catch {
        // If topic loading fails, proceed without existing topic context
      }
    }

    try {
      const prompt = buildTopicLabelingPrompt({
        email: {
          subject: state.email.subject ?? undefined,
          snippet: (state.email.bodyPlain || state.email.snippet) ?? undefined,
          senderDomain: state.email.senderDomain,
        },
        existingTopics,
      });

      const result = await withLLMRetry(() => llmProvider.generateObject(prompt, TopicLabelingSchema));

      return {
        topic: {
          parent: result.parent,
          child: result.child,
          confidence: result.confidence,
        },
        labels: [
          `TB/${result.parent}`,
          `TB/${result.parent}/${result.child}`,
          'TB/Processed',
        ],
        currentStep: 'label',
      };
    } catch (error) {
      const retryable = isRetryableLLMError(error);
      return {
        topic: null,
        labels: ['TB/Processed'],
        currentStep: 'label',
        error: error instanceof Error ? error.message : 'Labeling error',
        errorStep: 'label',
        isRetryableError: retryable ? true : null,
      };
    }
  }

  // Node: Generate summary using LLM
  async function summarizeNode(state: EmailWorkflowState): Promise<Partial<EmailWorkflowState>> {
    try {
      const topic = state.topic ? `${state.topic.parent}/${state.topic.child}` : 'Unknown';
      const content = state.extraction?.type === 'update'
        ? `${state.extraction.update?.title ?? ''}\n${state.extraction.update?.description ?? ''}`
        : `${state.email.subject ?? ''}\n${(state.email.bodyPlain || state.email.snippet) ?? ''}`;

      const prompt = buildSummaryPrompt({
        topic,
        newContent: content,
        maxWords: 500,
      });

      const result = await withLLMRetry(() => llmProvider.generateText(prompt));

      return {
        summary: result.text,
        tokensUsed: state.tokensUsed + result.usage.totalTokens,
        currentStep: 'summarize',
      };
    } catch (error) {
      const retryable = isRetryableLLMError(error);
      return {
        summary: state.email.snippet ?? '',
        currentStep: 'summarize',
        error: error instanceof Error ? error.message : 'Summarization error',
        errorStep: 'summarize',
        isRetryableError: retryable ? true : null,
      };
    }
  }

  // Node: Archive email (no extraction needed)
  async function archiveNode(state: EmailWorkflowState): Promise<Partial<EmailWorkflowState>> {
    return {
      currentStep: 'archive',
      labels: ['TB/Archived'],
    };
  }

  // Node: Delete email (no extraction needed)
  async function deleteNode(state: EmailWorkflowState): Promise<Partial<EmailWorkflowState>> {
    return {
      currentStep: 'delete',
      labels: ['TB/Deleted'],
    };
  }

  // Routing functions
  function routeAfterDecide(state: EmailWorkflowState): string {
    const action = state.decision?.action;

    if (action === 'archive') return 'archive';
    if (action === 'delete') return 'delete';
    return 'extract';
  }

  function routeAfterExtract(state: EmailWorkflowState): string {
    if (state.decision?.needsTopicLabeling) {
      return 'label';
    }
    return 'summarize';
  }

  // Build the graph (method chaining required for proper type inference)
  const workflow = new StateGraph(EmailWorkflowAnnotation)
    .addNode('classify', classifyNode)
    .addNode('decide', decideNode)
    .addNode('extract', extractNode)
    .addNode('label', labelNode)
    .addNode('summarize', summarizeNode)
    .addNode('archive', archiveNode)
    .addNode('delete', deleteNode)
    .addEdge(START, 'classify')
    .addEdge('classify', 'decide')
    .addConditionalEdges('decide', routeAfterDecide, {
      extract: 'extract',
      archive: 'archive',
      delete: 'delete',
    })
    .addConditionalEdges('extract', routeAfterExtract, {
      label: 'label',
      summarize: 'summarize',
    })
    .addEdge('label', 'summarize')
    .addEdge('summarize', END)
    .addEdge('archive', END)
    .addEdge('delete', END);

  return workflow.compile();
}

/**
 * Execute the email processing workflow.
 */
export async function processEmailWithWorkflow(
  email: Email,
  llmProvider: LLMProvider,
  topicLoader?: TopicLoader
): Promise<EmailWorkflowState> {
  const workflow = createEmailProcessingWorkflow(llmProvider, topicLoader);

  const initialState: EmailWorkflowState = {
    email,
    classification: null,
    decision: null,
    extraction: null,
    topic: null,
    summary: null,
    error: null,
    errorStep: null,
    isRetryableError: null,
    currentStep: 'start',
    tokensUsed: 0,
    labels: [],
  };

  const result = await workflow.invoke(initialState);
  return result;
}

// Helper functions
function getEmailAgeInDays(email: Email): number {
  const now = new Date();
  const received = new Date(email.receivedAt);
  const diffMs = now.getTime() - received.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
