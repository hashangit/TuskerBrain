import type { GmailClient, ListMessagesOptions, ListMessagesResponse } from './sync';

/**
 * Simple token bucket rate limiter for API calls.
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private config: { rate: number; interval: number }) {
    this.tokens = config.rate;
    this.lastRefill = Date.now();
  }

  async throttle(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitTime = this.config.interval - (Date.now() - this.lastRefill);
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
      this.refill();
    }
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.config.interval) {
      this.tokens = this.config.rate;
      this.lastRefill = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Rate-limited wrapper around GmailClient.
 * Enforces Gmail API quota limits (250 quota units/second by default).
 */
export class RateLimitedGmailClient implements GmailClient {
  private rateLimiter: TokenBucket;
  private wrappedClient: GmailClient;

  constructor(client: GmailClient, options?: { rate?: number; interval?: number }) {
    this.wrappedClient = client;
    this.rateLimiter = new TokenBucket({
      rate: options?.rate ?? 250,
      interval: options?.interval ?? 1000,
    });
  }

  async listMessages(options?: ListMessagesOptions): Promise<ListMessagesResponse> {
    await this.rateLimiter.throttle();
    return this.wrappedClient.listMessages(options);
  }

  async getMessage(id: string): Promise<any> {
    await this.rateLimiter.throttle();
    return this.wrappedClient.getMessage(id);
  }

  async modifyMessage(messageId: string, modifications: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<any> {
    await this.rateLimiter.throttle();
    return this.wrappedClient.modifyMessage(messageId, modifications);
  }

  async listLabels(): Promise<any> {
    await this.rateLimiter.throttle();
    return this.wrappedClient.listLabels();
  }

  async createLabel(name: string): Promise<any> {
    await this.rateLimiter.throttle();
    return this.wrappedClient.createLabel(name);
  }

  async getProfile(): Promise<any> {
    await this.rateLimiter.throttle();
    return this.wrappedClient.getProfile();
  }
}
