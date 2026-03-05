import type { Email, EmailType } from '@core/types/email';
import { classifyEmailType } from './nodes/classify';
import { extractFromEmail } from './nodes/extract';

/**
 * Decision about how to handle an email based on type and age.
 */
export interface ProcessingDecisionResult {
  action: 'process' | 'archive' | 'delete' | 'extract_deals';
  reason: string;
  needsExtraction: boolean;
  needsTopicLabeling: boolean;
}

/**
 * Age-based rules for email handling.
 */
const AGE_THRESHOLDS = {
  ONE_MONTH: 30, // days
  SIX_MONTHS: 180,
  TWO_YEARS: 730,
};

/**
 * Determines the processing action based on email type and age.
 */
export class ProcessingDecision {
  /**
   * Decides how to handle an email based on its type and age.
   */
  static async decide(email: Email): Promise<ProcessingDecisionResult> {
    const classification = await classifyEmailType(email);
    const ageInDays = this.getEmailAgeInDays(email);

    switch (classification.type) {
      case 'promotional':
        return this.decideForPromotional(email, ageInDays);

      case 'social':
        return this.decideForSocial(email, ageInDays);

      case 'updates':
        return this.decideForUpdates(email, ageInDays);

      case 'regular':
      default:
        return this.decideForRegular(email, ageInDays);
    }
  }

  private static getEmailAgeInDays(email: Email): number {
    const now = new Date();
    const received = new Date(email.receivedAt);
    const diffMs = now.getTime() - received.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private static decideForPromotional(
    email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    // Recent promotional: extract deals
    if (ageInDays < AGE_THRESHOLDS.ONE_MONTH) {
      return {
        action: 'extract_deals',
        reason: 'Recent promotional email - extract deals',
        needsExtraction: true,
        needsTopicLabeling: false,
      };
    }

    // Old promotional: delete
    return {
      action: 'delete',
      reason: `Promotional email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }

  private static decideForSocial(
    email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    // Recent social: process
    if (ageInDays < AGE_THRESHOLDS.ONE_MONTH) {
      return {
        action: 'process',
        reason: 'Recent social email',
        needsExtraction: true,
        needsTopicLabeling: true,
      };
    }

    // Old social: delete
    if (ageInDays < AGE_THRESHOLDS.SIX_MONTHS) {
      return {
        action: 'delete',
        reason: `Social email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
        needsExtraction: false,
        needsTopicLabeling: false,
      };
    }

    // Very old social: archive
    return {
      action: 'archive',
      reason: `Social email older than ${AGE_THRESHOLDS.SIX_MONTHS} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }

  private static decideForUpdates(
    email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    // Recent updates: process
    if (ageInDays < AGE_THRESHOLDS.ONE_MONTH) {
      return {
        action: 'process',
        reason: 'Recent update email',
        needsExtraction: true,
        needsTopicLabeling: true,
      };
    }

    // Old updates: archive
    return {
      action: 'archive',
      reason: `Update email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }

  private static decideForRegular(
    email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    // Recent regular: process
    if (ageInDays < AGE_THRESHOLDS.SIX_MONTHS) {
      return {
        action: 'process',
        reason: 'Recent regular email',
        needsExtraction: true,
        needsTopicLabeling: true,
      };
    }

    // Old regular: archive
    return {
      action: 'archive',
      reason: `Regular email older than ${AGE_THRESHOLDS.SIX_MONTHS} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }
}

/**
 * Workflow state passed between nodes.
 */
export interface WorkflowState {
  email: Email;
  classification?: {
    type: EmailType;
    confidence: number;
    reason?: string;
  };
  decision?: ProcessingDecisionResult;
  extraction?: {
    type: 'update' | 'deal' | 'none';
    update?: unknown;
    deal?: unknown;
  };
  topic?: {
    parent: string;
    child: string;
    fullPath: string;
    confidence: number;
  };
  labels?: string[];
  error?: string;
  currentStep: string;
}

/**
 * Simple workflow definition for email processing.
 * This provides a graph-like structure without requiring LangGraph dependency.
 */
export class EmailProcessingWorkflow {
  private nodes: Set<string> = new Set();
  private edges: Map<string, string[]> = new Map();

  constructor() {
    // Define workflow nodes
    this.addNode('start');
    this.addNode('classify');
    this.addNode('decide');
    this.addNode('extract');
    this.addNode('label');
    this.addNode('archive');
    this.addNode('delete');
    this.addNode('end');

    // Define workflow edges
    this.addEdge('start', 'classify');
    this.addEdge('classify', 'decide');
    this.addEdge('decide', 'archive');
    this.addEdge('decide', 'delete');
    this.addEdge('decide', 'extract');
    this.addEdge('decide', 'label');
    this.addEdge('extract', 'label');
    this.addEdge('label', 'end');
    this.addEdge('archive', 'end');
    this.addEdge('delete', 'end');
  }

  private addNode(name: string): void {
    this.nodes.add(name);
  }

  private addEdge(from: string, to: string): void {
    if (!this.edges.has(from)) {
      this.edges.set(from, []);
    }
    this.edges.get(from)!.push(to);
  }

  hasNode(name: string): boolean {
    return this.nodes.has(name);
  }

  getEdges(from: string): string[] {
    return this.edges.get(from) || [];
  }

  /**
   * Executes the workflow for a given email.
   */
  async execute(email: Email): Promise<WorkflowState> {
    let state: WorkflowState = {
      email,
      currentStep: 'start',
    };

    // Step 1: Classify
    state.currentStep = 'classify';
    const classification = await classifyEmailType(email);
    state.classification = classification;

    // Step 2: Decide
    state.currentStep = 'decide';
    const decision = await ProcessingDecision.decide(email);
    state.decision = decision;

    // Step 3: Execute based on decision
    switch (decision.action) {
      case 'process':
      case 'extract_deals':
        state.currentStep = 'extract';
        state.extraction = await extractFromEmail(
          email,
          classification.type === 'promotional' ? 'promotional' : 'updates'
        );

        state.currentStep = 'label';
        // Topic labeling would happen here
        state.labels = [];
        break;

      case 'archive':
        state.currentStep = 'archive';
        break;

      case 'delete':
        state.currentStep = 'delete';
        break;
    }

    state.currentStep = 'end';
    return state;
  }
}
