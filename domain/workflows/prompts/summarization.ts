import { z } from 'zod';

/**
 * Summarization prompts for topic and sender summaries.
 * Used with LangGraph workflow nodes for generating rolling summaries.
 */

// Input schema for topic summarization
export const SummaryInputSchema = z.object({
  topic: z.string().describe('Topic path (e.g., Banking/Chase)'),
  currentSummary: z.string().optional().describe('Existing summary to update'),
  newContent: z.string().describe('New content to incorporate'),
  maxWords: z.number().default(500).describe('Maximum words in summary'),
});

// Output schema for summarization
export const SummarySchema = z.object({
  summary: z.string().describe('Generated summary text'),
  wordCount: z.number().describe('Number of words in summary'),
  paragraphCount: z.number().describe('Number of paragraphs'),
});

// Input schema for sender summarization
export const SenderSummaryInputSchema = z.object({
  senderDomain: z.string().describe('Sender domain (e.g., amazon.com)'),
  currentSummary: z.string().optional().describe('Existing sender summary'),
  newContent: z.string().describe('New content to incorporate'),
  maxWords: z.number().default(500).describe('Maximum words in summary'),
});

// Type exports
export type SummaryInput = z.infer<typeof SummaryInputSchema>;
export type SenderSummaryInput = z.infer<typeof SenderSummaryInputSchema>;
export type SummaryResult = z.infer<typeof SummarySchema>;

/**
 * Build a topic summary prompt for LLM.
 * Used to generate rolling summaries that incorporate new information.
 */
export function buildSummaryPrompt(input: SummaryInput): string {
  const { topic, currentSummary, newContent, maxWords } = input;

  return `Generate a rolling summary for the topic "${topic}" based on the new information and previous summary.

Guidelines:
- First paragraph: Always high-level overview
- Use 3-4 paragraphs
- Keep total under ${maxWords} words
- Gradually reduce focus on older information
- Highlight key changes and updates
- Preserve important dates, amounts, and action items

Current Summary:
${currentSummary || 'No previous summary exists for this topic.'}

New Content:
${newContent}

Provide the summary as plain text. Focus on synthesizing information rather than listing it.`;
}

/**
 * Build a sender summary prompt for LLM.
 * Used to generate rolling summaries for a specific email sender.
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
- Highlight patterns in communication

Sender Domain: ${senderDomain}

Current Summary:
${currentSummary || `No previous summary exists for emails from ${senderDomain}.`}

New Content:
${newContent}

Provide the summary as plain text. Focus on synthesizing information rather than listing it.`;
}
