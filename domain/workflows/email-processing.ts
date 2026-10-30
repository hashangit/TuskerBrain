import type { Email, EmailType } from '@foundations/types/email';
import { classifyEmailType } from './nodes/classify';
import { extractFromEmail } from './nodes/extract';
import { decideEmail, type ProcessingDecisionResult } from '@domain/processing/email-rules';

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

    // Step 2: Decide (shared decision table: domain/processing/email-rules.ts)
    state.currentStep = 'decide';
    const decision = await decideEmail(email);
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
