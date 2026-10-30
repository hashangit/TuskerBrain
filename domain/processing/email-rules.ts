import type { Email, EmailType } from '@foundations/types/email';
import { classifyEmailType } from '@domain/workflows/nodes/classify';

/**
 * Single source of truth for the email type x age -> action decision table.
 *
 * | Email Type  | < 1 month                | 1 - 6 months | > 6 months | > 2 years |
 * |-------------|--------------------------|--------------|------------|-----------|
 * | regular     | process                  | process      | archive    | archive   |
 * | updates     | process                  | archive      | archive    | archive   |
 * | social      | process                  | delete       | delete     | archive   |
 * | promotional | extract_deals (<= 30d)   | delete       | delete     | delete    |
 *
 * Consumers:
 * - domain/workflows/langgraph-workflow.ts (decideNode)
 * - domain/sync/sync.ts (clean-first cleanup phase)
 */

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
 * Age thresholds (in days) for email handling decisions.
 */
export const AGE_THRESHOLDS = {
  ONE_MONTH: 30,
  SIX_MONTHS: 180,
  TWO_YEARS: 730,
} as const;

/**
 * Pure decision function: given a classified email type and the email's age
 * in days, decide the processing action.
 */
export function decideEmailAction(type: EmailType, ageInDays: number): ProcessingDecisionResult {
  switch (type) {
    case 'promotional':
      // Recent promotional (<= 30 days): extract deals
      if (ageInDays <= AGE_THRESHOLDS.ONE_MONTH) {
        return {
          action: 'extract_deals',
          reason: 'Recent promotional email - extract deals',
          needsExtraction: true,
          needsTopicLabeling: false,
        };
      }
      // Old promotional (> 30 days): delete
      return {
        action: 'delete',
        reason: `Promotional email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
        needsExtraction: false,
        needsTopicLabeling: false,
      };

    case 'social':
      // Very old social (2+ years): archive
      if (ageInDays >= AGE_THRESHOLDS.TWO_YEARS) {
        return {
          action: 'archive',
          reason: 'Social email older than 2 years',
          needsExtraction: false,
          needsTopicLabeling: false,
        };
      }
      // Recent social (< 1 month): process
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

    case 'updates':
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

    case 'regular':
    default:
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
 * Get the age of an email in whole days.
 */
export function getEmailAgeInDays(email: { receivedAt: Date }): number {
  const now = new Date();
  const received = new Date(email.receivedAt);
  const diffMs = now.getTime() - received.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Composed decision: classifies the email (rule-based) and applies the
 * decision table. Equivalent to the former ProcessingDecision.decide().
 */
export async function decideEmail(email: Email): Promise<ProcessingDecisionResult> {
  const classification = await classifyEmailType(email);
  return decideEmailAction(classification.type, getEmailAgeInDays(email));
}
