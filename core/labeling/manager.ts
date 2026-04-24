import type { GmailClient } from '@core/gmail/client';

/**
 * Label cache entry.
 */
interface CachedLabel {
  id: string;
  name: string;
}

/**
 * Manages Gmail label hierarchy with TB/ prefix.
 */
export class GmailLabelManager {
  private client: GmailClient;
  private labelCache: Map<string, CachedLabel> = new Map();
  private cacheLoaded: boolean = false;

  constructor(client: GmailClient) {
    this.client = client;
  }

  /**
   * Load and cache all labels.
   */
  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;

    const response = await this.client.listLabels();
    if (response.labels) {
      for (const label of response.labels) {
        this.labelCache.set(label.name!, { id: label.id!, name: label.name! });
      }
    }
    this.cacheLoaded = true;
  }

  /**
   * Get label ID by name.
   */
  async getLabelId(name: string): Promise<string | undefined> {
    await this.loadCache();

    const cached = this.labelCache.get(name);
    if (cached) {
      return cached.id;
    }

    // Create the label
    const newLabel = await this.client.createLabel(name);
    const label: CachedLabel = { id: newLabel.id!, name: newLabel.name! };
    this.labelCache.set(name, label);
    return label.id;
  }

  /**
   * Normalize label name for Gmail compatibility.
   */
  private normalizeName(name: string): string {
    // Remove or replace unsupported characters, truncate to 100 chars max
    return name
      .replace(/[()\/&#!*?<>{}|\\^~`[\];:'"/]/g, '-') // Replace special chars with dash
      .replace(/-+/g, '-') // Collapse multiple dashes
      .replace(/^-|-$/g, '') // Remove leading/trailing dashes
      .substring(0, 100);
  }

  /**
   * Execute an operation with retry logic for rate limiting.
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if it's a rate limit error (429) or server error (500)
        const isRateLimitError =
          (error instanceof Error && error.message.toLowerCase().includes('rate limit')) ||
          (error instanceof Error && (error as any).code === 429);

        if (isRateLimitError && attempt < maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s, etc.
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else if (isRateLimitError) {
          // On the last attempt, re-throw the error
          throw lastError;
        } else {
          // For non-rate-limit errors, re-throw immediately
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Get or create a label with retry logic.
   */
  private async getOrCreateLabel(name: string): Promise<CachedLabel> {
    const cached = this.labelCache.get(name);
    if (cached) return cached;

    return this.withRetry(async () => {
      try {
        const newLabel = await this.client.createLabel(name);
        const label: CachedLabel = { id: newLabel.id!, name: newLabel.name! };
        this.labelCache.set(name, label);
        return label;
      } catch (error: any) {
        // Handle "already exists" error (409)
        if (error.message?.includes('already exists') || error.code === 409) {
          // Refresh cache and get the existing label
          this.cacheLoaded = false;
          await this.loadCache();
          const existing = this.labelCache.get(name);
          if (existing) return existing;
          throw new Error(`Label ${name} not found after conflict`);
        }
        throw error;
      }
    });
  }

  /**
   * Ensure topic labels exist (parent and child).
   * Returns Gmail label IDs for both parent and child.
   */
  async ensureTopicLabels(parent: string, child: string): Promise<{ parentId: string; childId: string; parentName: string; childName: string }> {
    await this.loadCache();

    const parentPath = `TB/${parent}`;
    const childPath = `TB/${parent}/${this.normalizeName(child)}`;

    const parentLabel = await this.getOrCreateLabel(parentPath);
    const parentId = parentLabel.id;

    const childLabel = await this.getOrCreateLabel(childPath);
    const childId = childLabel.id;

    return { parentId, childId, parentName: parentPath, childName: childPath };
  }

  /**
   * Apply topic labels to an email.
   */
  async applyTopicLabels(emailId: string, parent: string, child: string): Promise<string[]> {
    const { childId } = await this.ensureTopicLabels(parent, child);

    await this.client.modifyMessage(emailId, {
      addLabelIds: [childId],
    });

    return [childId];
  }

  /**
   * Apply sender label to an email.
   */
  async applySenderLabel(emailId: string, domain: string): Promise<string> {
    await this.loadCache();

    const normalizedDomain = domain.toLowerCase();
    const labelPath = `TB/Sender/${normalizedDomain}`;

    const label = await this.getOrCreateLabel(labelPath);

    await this.client.modifyMessage(emailId, {
      addLabelIds: [label.id],
    });

    return label.id;
  }

  /**
   * Apply Processed label to an email.
   */
  async applyProcessedLabel(emailId: string): Promise<string> {
    await this.loadCache();

    const labelPath = 'TB/Processed';

    const label = await this.getOrCreateLabel(labelPath);

    await this.client.modifyMessage(emailId, {
      addLabelIds: [label.id],
    });

    return label.id;
  }

  /**
   * Get sender label ID (without applying).
   */
  private async getSenderLabelId(domain: string): Promise<string> {
    const normalizedDomain = domain.toLowerCase();
    const labelPath = `TB/Sender/${normalizedDomain}`;
    const label = await this.getOrCreateLabel(labelPath);
    return label.id;
  }

  /**
   * Get Processed label ID (without applying).
   */
  private async getProcessedLabelId(): Promise<string> {
    const labelPath = 'TB/Processed';
    const label = await this.getOrCreateLabel(labelPath);
    return label.id;
  }

  /**
   * Apply all labels to an email in a single API call.
   */
  async applyAllLabels(
    emailId: string,
    options: {
      topic?: { parent: string; child: string };
      senderDomain?: string;
      processed?: boolean;
    }
  ): Promise<string[]> {
    const labelIds: string[] = [];

    if (options.topic) {
      const { childId } = await this.ensureTopicLabels(options.topic.parent, options.topic.child);
      labelIds.push(childId);
    }

    if (options.senderDomain) {
      const labelId = await this.getSenderLabelId(options.senderDomain);
      labelIds.push(labelId);
    }

    if (options.processed !== false) {
      const labelId = await this.getProcessedLabelId();
      labelIds.push(labelId);
    }

    // Make a single API call with all labels
    if (labelIds.length > 0) {
      await this.client.modifyMessage(emailId, {
        addLabelIds: labelIds,
      });
    }

    return labelIds;
  }
}
