import { z } from 'zod';

/**
 * Email classification prompt template.
 * Used to classify emails into: regular', 'updates', 'social', 'promotional' } categories.
 */

const ClassificationPromptInput = z.object({
  email: z.object({
    subject: z.string().optional().describe('Email subject line'),
    snippet: z.string().optional().describe('Email snippet/preview text'),
    senderDomain: z.string().describe('Sender domain (e.g., amazon.com)'),
    receivedAt: z.coerce.date(),
    gmailCategory: z.string().optional().describe('Gmail category if provided'),
  }),
});

const ClassificationResultSchema = z.object({
  type: z.enum(['regular', 'updates', 'social', 'promotional']),
  confidence: z.number().min(0).max(1).describe('Classification confidence (0-1)'),
  reason: z.string().optional().describe('Classification reasoning'),
})

/**
 * Build the classification prompt for LLM.
 * @param input - Email data to classification prompt
 */
export function buildClassificationPrompt(input: ClassificationPromptInput): string {
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

Provide ONLY the JSON object with:
  type: "regular" | "updates" | "social" | "promotional",
  "confidence": confidence (0-1),
  "reason": "brief explanation"
`;
}

export const ClassificationPromptSchema = z.object({
  input: ClassificationPromptInput,
  output: ClassificationResultSchema,
});

// Zod schemas for update extraction
const UpdateExtractionInput = z.object({
  email: z.object({
    subject: z.string().optional(),
    snippet: z.string().optional(),
    senderName: z.string().optional(),
    senderDomain: z.string(),
    receivedAt: z.coerce.date(),
  })
})

const UpdateExtractionResult = z.object({
  title: z.string().describe('Short, descriptive title'),
  description: z.string().optional().describe('Detailed description'),
  summary: z.string().optional().describe('Brief summary'),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
  urgency: z.boolean().optional(),
  actionItem: z.boolean().optional(),
  actionItemTitle: z.string().optional(),
  followUpDate: z.coerce.date().optional(),
  financialImpact: z.number().optional(),
  keyEntities: z.object({
    dates: z.array(z.string()).optional(),
    amounts: z.array(z.number()).optional(),
    names: z.array(z.string()).optional(),
  }).optional(),
})

// Zod schemas for deal extraction
const DealExtractionInput = z.object({
  email: z.object({
    subject: z.string().optional(),
    snippet: z.string().optional(),
    senderName: z.string().optional(),
    senderDomain: z.string(),
    receivedAt: z.coerce.date(),
  })
})

const DealExtractionResult = z.object({
  dealTitle: z.string(),
  dealDescription: z.string().optional(),
  brandName: z.string().optional(),
  dealValue: z.string().optional(),
  dealCode: z.string().optional(),
  dealExpiry: z.coerce.date().optional(),
  dealLink: z.string().url().optional(),
  minimumPurchase: z.string().optional(),
  dealCategory: z.string().optional(),
  isActive: z.boolean().default(true),
})

/**
 * Build an update extraction prompt.
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

Provide ONLY the JSON object with:
  "title": string,
  "description": string,
  "summary": string,
  "priority": "high" | "medium" | "low",
  "sentiment": "positive" | "negative" | "neutral",
  "urgency": boolean,
  "actionItem": boolean,
  "actionItemTitle": string | null,
  "followUpDate": string | null,
  "financialImpact": number | null,
  "keyEntities": {
    "dates": string[],
    "amounts": number[],
    "names": string[]
  } | null
}
`;
}

/**
 * Build a deal extraction prompt.
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
8. Category: Product category

Provide the output as a JSON object with:
  "dealTitle": string,
  "dealDescription": string,
  "brandName": string,
  "dealValue": string,
  "dealCode": string,
  "dealExpiry": string,
  "dealLink": string,
  "dealCategory": string
}
`;
}

export const UpdateExtractionPromptSchema = z.object({
  input: UpdateExtractionInput,
  output: UpdateExtractionResult,
})

export const DealExtractionPromptSchema = z.object({
  input: DealExtractionInput,
  output: DealExtractionResult,
})

// Zod schemas for summarization
const SummaryInput = z.object({
  topic: z.string(),
  currentSummary: z.string().optional(),
  newContent: z.string(),
  maxWords: z.number().default(500),
})

const SummaryResult = z.object({
  summary: z.string(),
  wordCount: z.number(),
  paragraphCount: z.number(),
})

/**
 * Build a summary prompt for topic summaries.
 */
export function buildSummaryPrompt(input: SummaryInput): string {
  const { topic, currentSummary, newContent, maxWords } = input;

  return `Generate a rolling summary for the topic "${topic}" based on the new information and previous summary.

Guidelines:
- First paragraph: Always high-level overview
- Use 3-4 paragraphs
- Keep total under ${maxWords} words
- Gradually reduce focus on older information

Current Summary:
${currentSummary || 'No previous summary exists for this topic.'}

New Content:
${newContent}
`;
}

/**
 * Build a sender summary prompt.
 */
export function buildSenderSummaryPrompt(input: SenderSummaryInput): string {
  const { senderDomain, currentSummary, newContent, maxWords } = input;

  return `Summarize recent emails from "${senderDomain}"

Provide a rolling summary that includes:
- The domain's recent email activity
- Key topics discussed
- Recent updates or announcements
- Any important actions or deadlines

Guidelines:
- First paragraph: Overview of this sender's purpose
- Use 3-4 paragraphs
- Keep total under ${maxWords} words
- Gradually reduce focus on older emails

Sender Domain: ${senderDomain}
Current Summary:
${currentSummary || 'No previous summary exists for emails from ${senderDomain}.'}

New Content:
${newContent}
`;
}

export const SenderSummaryInput = z.object({
  senderDomain: z.string(),
  currentSummary: z.string().optional(),
  newContent: z.string(),
  maxWords: z.number().default(500),
})

export const SummaryPromptSchema = z.object({
  input: SummaryInput,
  output: SummaryResult,
})

export const SenderSummaryPromptSchema = z.object({
  input: SenderSummaryInput,
  output: SummaryResult,
})
