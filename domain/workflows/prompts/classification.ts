import { z } from 'zod';

/**
 * Email classification prompt template.
 * Used to classify emails into: regular, updates, social, promotional categories.
 */

// Re-export from submodules for convenience
export {
  buildUpdateExtractionPrompt,
  buildDealExtractionPrompt,
  UpdateExtractionSchema,
  DealExtractionSchema,
  UpdateExtractionInputSchema,
  DealExtractionInputSchema,
  type UpdateExtractionInput,
  type DealExtractionInput,
} from './extraction';

export {
  buildSummaryPrompt,
  buildSenderSummaryPrompt,
  SummarySchema,
  SummaryInputSchema,
  SenderSummaryInputSchema,
  type SummaryInput,
  type SenderSummaryInput,
  type SummaryResult,
} from './summarization';

// Classification-specific schemas
const ClassificationPromptInput = z.object({
  email: z.object({
    subject: z.string().optional().describe('Email subject line'),
    snippet: z.string().optional().describe('Email snippet/preview text'),
    senderDomain: z.string().describe('Sender domain (e.g., amazon.com)'),
    receivedAt: z.coerce.date(),
    gmailCategory: z.string().optional().describe('Gmail category if provided'),
  }),
});

export const ClassificationResultSchema = z.object({
  type: z.enum(['regular', 'updates', 'social', 'promotional']),
  confidence: z.number().min(0).max(1).describe('Classification confidence (0-1)'),
  reason: z.string().optional().describe('Classification reasoning'),
});

export const ClassificationPromptSchema = z.object({
  input: ClassificationPromptInput,
  output: ClassificationResultSchema,
});

export type ClassificationInput = z.infer<typeof ClassificationPromptInput>;

/**
 * Build the classification prompt for LLM.
 * @param input - Email data to classification prompt
 */
export function buildClassificationPrompt(input: ClassificationInput): string {
  const { email } = input;

  return `Classify this email based on its sender domain, subject line, snippet, and Gmail category.

Consider:
1. Is it from a known sender (like amazon.com, chase.com)?
2. Is it about a recent transaction?
3. Is it promotional content?
4. Is it social media related?
5. Is it a notification/update?

Sender Domain: ${email.senderDomain}
Subject: ${email.subject || 'No subject'}
Snippet: ${email.snippet || 'No snippet'}
Gmail Category: ${email.gmailCategory || 'Not provided'}

Provide ONLY a JSON object with:
{
  "type": "regular" | "updates" | "social" | "promotional",
  "confidence": number (0-1),
  "reason": "brief explanation"
}`;
}
