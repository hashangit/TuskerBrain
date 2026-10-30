import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitedGmailClient } from '@capabilities/gmail/rate-limited-client';
import { MockGmailClient } from '../mocks/gmail-client';

describe('RateLimitedGmailClient', () => {
  let mockClient: MockGmailClient;
  let rateLimitedClient: RateLimitedGmailClient;

  beforeEach(() => {
    mockClient = new MockGmailClient();
    // Use a very low rate for testing (5 requests per 100ms)
    rateLimitedClient = new RateLimitedGmailClient(mockClient as any, {
      rate: 5,
      interval: 100,
    });
  });

  it('should allow requests within rate limit', async () => {
    mockClient.seedEmails([{ id: 'email-1' }]);

    const start = Date.now();

    // Make 5 requests (within limit)
    await Promise.all([
      rateLimitedClient.listMessages(),
      rateLimitedClient.getMessage('email-1'),
      rateLimitedClient.listLabels(),
      rateLimitedClient.getProfile(),
      rateLimitedClient.createLabel('test'),
    ]);

    const elapsed = Date.now() - start;

    // All 5 requests should complete quickly (within rate limit)
    expect(elapsed).toBeLessThan(50);
  });

  it('should throttle requests exceeding rate limit', async () => {
    mockClient.seedEmails([{ id: 'email-1' }]);

    const start = Date.now();

    // Make 10 requests (exceeds limit of 5 per 100ms)
    await Promise.all([
      rateLimitedClient.listMessages(),
      rateLimitedClient.listMessages(),
      rateLimitedClient.listMessages(),
      rateLimitedClient.listMessages(),
      rateLimitedClient.listMessages(),
      rateLimitedClient.listMessages(),
      rateLimitedClient.listMessages(),
      rateLimitedClient.listMessages(),
      rateLimitedClient.listMessages(),
      rateLimitedClient.listMessages(),
    ]);

    const elapsed = Date.now() - start;

    // Should take at least 100ms because we need to wait for token refill
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it('should pass through method calls to wrapped client', async () => {
    mockClient.seedEmails([{ id: 'email-1', subject: 'Test' }]);

    const profile = await rateLimitedClient.getProfile();
    expect(profile.emailAddress).toBe('test@example.com');

    const labels = await rateLimitedClient.listLabels();
    expect(labels.labels).toEqual([]);

    const message = await rateLimitedClient.getMessage('email-1');
    expect(message.id).toBe('email-1');
  });

  it('should create label through wrapped client', async () => {
    const label = await rateLimitedClient.createLabel('Important');
    expect(label.name).toBe('Important');
    expect(label.id).toBe('label-Important');
  });

  it('should modify message through wrapped client', async () => {
    mockClient.seedEmails([{ id: 'email-1' }]);

    const result = await rateLimitedClient.modifyMessage('email-1', {
      addLabelIds: ['label-1'],
      removeLabelIds: ['label-2'],
    });

    expect(result).toEqual({});
  });
});
