import type { GmailClient } from '@core/gmail/client';
import type { Email } from '@core/types/email';

/**
 * Result of processing an email.
 */
export interface ProcessResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  email: Email;
}

/**
 * Email processor that handles marking emails as processed.
 */
export class EmailProcessor {
  private client: GmailClient;
  private processedLabelId: string | null = null;

  constructor(client: GmailClient) {
    this.client = client;
  }

  /**
   * Process an email.
   */
  async processEmail(email: Email): Promise<ProcessResult> {
    // Check if already processed
    if (email.isProcessed || (email.labels?.includes('TB/Processed'))) {
      return {
        success: false,
        skipped: true,
        reason: 'Email already processed',
        email,
      };
    }

    try {
      // Ensure processed label exists
      if (!this.processedLabelId) {
        await this.ensureProcessedLabel();
      }

      // Prepare modifications
      const modifications: { addLabelIds: string[]; removeLabelIds?: string[] } = {
        addLabelIds: [this.processedLabelId!],
      };

      // Mark as read if not already
      if (!email.isRead) {
        modifications.removeLabelIds = ['UNREAD'];
      }

      await this.client.modifyMessage(email.id, modifications);

      // Update email state
      const processedEmail: Email = {
        ...email,
        isProcessed: true,
        processedAt: new Date(),
        isRead: true,
      };

      return {
        success: true,
        skipped: false,
        email: processedEmail,
      };
    } catch (error) {
      return {
        success: false,
        skipped: false,
        error: error instanceof Error ? error.message : String(error),
        email,
      };
    }
  }

  /**
   * Ensure the processed label exists.
   */
  private async ensureProcessedLabel(): Promise<void> {
    if (this.processedLabelId) return;

    // Get existing labels
    const response = await this.client.listLabels();
    const labels = response.labels || [];

    const processedLabel = labels.find((l) => l.name === 'TB/Processed');

    if (processedLabel) {
      this.processedLabelId = processedLabel.id!;
      return;
    }

    // Create the label
    const newLabel = await this.client.createLabel('TB/Processed');
    this.processedLabelId = newLabel.id!;
  }
}
