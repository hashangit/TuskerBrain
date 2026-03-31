import { z } from 'zod';

/**
 * Topic labeling prompt template.
 * Used to assign parent and child topic labels to emails based on content
 * and existing topic hierarchy.
 */

// Input schema for topic labeling
const TopicLabelingInputSchema = z.object({
  email: z.object({
    subject: z.string().optional().describe('Email subject line'),
    snippet: z.string().optional().describe('Email snippet/preview text'),
    senderDomain: z.string().describe('Sender domain (e.g., amazon.com)'),
  }),
  existingTopics: z.array(
    z.object({
      parent: z.string().describe('Parent topic name'),
      children: z.array(z.string()).describe('Child topic names under this parent'),
    })
  ).describe('All existing parent/child topic pairs from the database'),
});

// Output schema for topic labeling - used by LLM generateObject
export const TopicLabelingResultSchema = z.object({
  parent: z.string().describe('Parent topic name (e.g., "Banking", "Shopping")'),
  child: z.string().describe('Child topic name (e.g., "Chase", "Amazon")'),
  confidence: z.number().min(0).max(1).describe('Labeling confidence (0-1)'),
});

export type TopicLabelingInput = z.infer<typeof TopicLabelingInputSchema>;
export type TopicLabelingResult = z.infer<typeof TopicLabelingResultSchema>;

/**
 * Build the topic labeling prompt for LLM.
 * Instructs the LLM to choose or create a parent and child topic for the email,
 * preferring to match existing topics when appropriate.
 */
export function buildTopicLabelingPrompt(input: TopicLabelingInput): string {
  const { email, existingTopics } = input;

  const topicList =
    existingTopics.length > 0
      ? existingTopics
          .map((t) => {
            const children = t.children.length > 0 ? ` (${t.children.join(', ')})` : '';
            return `- ${t.parent}${children}`;
          })
          .join('\n')
      : '(No existing topics yet)';

  return `Assign a topic label to this email.

Sender Domain: ${email.senderDomain}
Subject: ${email.subject || 'No subject'}
Snippet: ${email.snippet || 'No snippet'}

Existing topics in the database:
${topicList}

Instructions:
1. Choose a parent topic and a child topic that best describe this email.
2. Prefer matching an existing parent and child if the email clearly fits.
3. If the email fits an existing parent but no existing child, reuse the parent and create a new child.
4. If no existing parent is a good fit, create both a new parent and a new child.
5. Parent topics should be broad categories (e.g., "Banking", "Shopping", "Travel", "Work", "Health").
6. Child topics should be specific (e.g., "Chase", "Amazon", "United Airlines").
7. Keep names concise and consistent with existing naming style.

Provide ONLY a JSON object with:
{
  "parent": string,
  "child": string,
  "confidence": number (0-1)
}`;
}
