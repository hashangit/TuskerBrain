/**
 * @module processing-decision
 *
 * Shared utility that applies age/type-based rules to decide how to handle
 * an email (process, archive, delete, extract_deals).
 *
 * Used by both the LangGraph workflow (via duplicated logic in its `decideNode`)
 * and by `GmailSyncManager.applyCleanupRules()` in `core/gmail/sync.ts`.
 *
 * This is production code and IS canonical.
 */

import type { Email, EmailType } from '@core/types/email';
import { classifyEmailType } from './nodes/classify';

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
 *
 * This is a shared utility used in production by:
 * - `core/gmail/sync.ts` -- GmailSyncManager.applyCleanupRules() for batch cleanup
 * - `EmailProcessingWorkflow` -- the simple non-LLM workflow (test-only)
 *
 * Note: The LangGraph workflow (`core/workflows/langgraph-workflow.ts`) has its own
 * inline `decideNode` that duplicates this logic rather than importing this class.
 * Both implementations use the same age thresholds and decision rules.
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
    _email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    // Recent promotional (≤30 days): extract deals
    if (ageInDays <= AGE_THRESHOLDS.ONE_MONTH) {
      return {
        action: 'extract_deals',
        reason: 'Recent promotional email - extract deals',
        needsExtraction: true,
        needsTopicLabeling: false,
      };
    }

    // Old promotional (>30 days): delete (regardless of age)
    return {
      action: 'delete',
      reason: `Promotional email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }

  private static decideForSocial(
    _email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    // Very old social (2+ years): archive
    if (ageInDays >= AGE_THRESHOLDS.TWO_YEARS) {
      return {
        action: 'archive',
        reason: 'Social email older than 2 years',
        needsExtraction: false,
        needsTopicLabeling: false,
      };
    }

    // Recent social (<1 month): process
    if (ageInDays < AGE_THRESHOLDS.ONE_MONTH) {
      return {
        action: 'process',
        reason: 'Recent social email',
        needsExtraction: true,
        needsTopicLabeling: true,
      };
    }

    // Old social (1 month - 2 years): delete
    return {
      action: 'delete',
      reason: `Social email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }

  private static decideForUpdates(
    _email: Email,
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
    _email: Email,
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
