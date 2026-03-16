import { z } from 'zod';

/**
 * Extraction prompts for updates and deals from emails.
 * Used with LangGraph workflow nodes for structured LLM output.
 */

// Input schema for update extraction
export const UpdateExtractionInputSchema = z.object({
  email: z.object({
    subject: z.string().optional(),
    snippet: z.string().optional(),
    senderName: z.string().optional(),
    senderDomain: z.string(),
    receivedAt: z.coerce.date(),
  }),
});

// Output schema for update extraction - used by LLM generateObject
export const UpdateExtractionSchema = z.object({
  title: z.string().describe('Short, descriptive title'),
  description: z.string().optional().describe('Detailed description'),
  summary: z.string().optional().describe('Brief summary'),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
  urgency: z.boolean().optional(),
  actionItem: z.boolean().optional(),
  actionItemTitle: z.string().optional(),
  followUpDate: z.string().optional(),
  financialImpact: z.number().optional(),
  keyEntities: z
    .object({
      dates: z.array(z.string()).optional(),
      amounts: z.array(z.number()).optional(),
      names: z.array(z.string()).optional(),
    })
    .optional(),
});

// Input schema for deal extraction
export const DealExtractionInputSchema = z.object({
  email: z.object({
    subject: z.string().optional(),
    snippet: z.string().optional(),
    senderName: z.string().optional(),
    senderDomain: z.string(),
    receivedAt: z.coerce.date(),
  }),
});

// Output schema for deal extraction - used by LLM generateObject
export const DealExtractionSchema = z.object({
  dealTitle: z.string(),
  dealDescription: z.string().optional(),
  brandName: z.string().optional(),
  dealValue: z.string().optional(),
  dealCode: z.string().optional(),
  dealExpiry: z.string().optional(),
  dealLink: z.string().url().optional(),
  minimumPurchase: z.string().optional(),
  dealCategory: z.string().optional(),
  isActive: z.boolean().default(true),
});

// Type exports
export type UpdateExtractionInput = z.infer<typeof UpdateExtractionInputSchema>;
export type DealExtractionInput = z.infer<typeof DealExtractionInputSchema>;

/**
 * Build an update extraction prompt for LLM.
 * Used to extract structured information from regular/update emails.
 */
export function buildUpdateExtractionPrompt(input: UpdateExtractionInput): string {
  const { email } = input;

  return `Extract key information from this email update.

Sender: ${email.senderDomain}
Subject: ${email.subject || 'No subject'}
Snippet: ${email.snippet || 'No snippet'}

Extract:
1. Title: A short, descriptive title
2. Description: A detailed description
3. Summary: A brief summary (1 sentence)
4. Priority: high/medium/low
5. Sentiment: positive/negative/neutral
6. Urgency: Is this urgent?
7. Action item: Does this require action?
8. Action title: If action required, what?
9. Follow-up date: Any deadline?
10. Financial impact: Any monetary amount mentioned?
11. Key entities: dates, amounts, names mentioned

Provide ONLY a JSON object with:
{
  "title": string,
  "description": string | null,
  "summary": string | null,
  "priority": "high" | "medium" | "low" | null,
  "sentiment": "positive" | "negative" | "neutral" | null,
  "urgency": boolean | null,
  "actionItem": boolean | null,
  "actionItemTitle": string | null,
  "followUpDate": string | null,
  "financialImpact": number | null,
  "keyEntities": {
    "dates": string[],
    "amounts": number[],
    "names": string[]
  } | null
}`;
}

/**
 * Build a deal extraction prompt for LLM.
 * Used to extract promotional deal information from emails.
 */
export function buildDealExtractionPrompt(input: DealExtractionInput): string {
  const { email } = input;

  return `Extract deal information from this promotional email.

Sender: ${email.senderDomain}
Subject: ${email.subject || 'No subject'}
Snippet: ${email.snippet || 'No snippet'}

Extract:
1. Title: A short, descriptive title
2. Description: A brief description of the deal
3. Brand: The brand name
4. Deal value: The discount percentage or amount
5. Promo code: The promotional code
6. Expiry: The deal expiration date
7. Link: URL to deal page
8. Minimum purchase: Any minimum purchase requirement
9. Category: Product category
10. Is active: Is this deal currently active?

Provide ONLY a JSON object with:
{
  "dealTitle": string,
  "dealDescription": string | null,
  "brandName": string | null,
  "dealValue": string | null,
  "dealCode": string | null,
  "dealExpiry": string | null,
  "dealLink": string (URL) | null,
  "minimumPurchase": string | null,
  "dealCategory": string | null,
  "isActive": boolean
}`;
}
