/**
 * Custom Test Assertions for TuskerBrain POV Tests
 *
 * This provides domain-specific assertion helpers for testing
 * email processing, topics, deals, and other TuskerBrain features.
 */

import { expect } from 'vitest';

// ===== Email Assertions =====

export interface EmailAssertionOptions {
  subject?: string | RegExp;
  sender?: string | RegExp;
  type?: 'regular' | 'updates' | 'social' | 'promotional';
  priority?: 'high' | 'medium' | 'low';
  aiProcessed?: boolean;
}

/**
 * Assert email has expected properties
 */
export function assertEmail(actual: any, expected: EmailAssertionOptions): void {
  if (expected.subject !== undefined) {
    if (expected.subject instanceof RegExp) {
      expect(actual.subject).toMatch(expected.subject);
    } else {
      expect(actual.subject).toContain(expected.subject);
    }
  }

  if (expected.sender !== undefined) {
    if (expected.sender instanceof RegExp) {
      expect(actual.sender || actual.senderDomain).toMatch(expected.sender);
    } else {
      expect(actual.sender || actual.senderDomain).toContain(expected.sender);
    }
  }

  if (expected.type !== undefined) {
    expect(actual.emailType || actual.type).toBe(expected.type);
  }

  if (expected.priority !== undefined) {
    expect(actual.priority).toBe(expected.priority);
  }

  if (expected.aiProcessed !== undefined) {
    expect(actual.aiProcessed).toBe(expected.aiProcessed);
  }
}

/**
 * Assert email is in timeline
 */
export function assertEmailInTimeline(timeline: any[], emailId: string): void {
  const found = timeline.some(e => e.emailId === emailId || e.id === emailId);
  expect(found, `Email ${emailId} should be in timeline`).toBe(true);
}

/**
 * Assert email is NOT in timeline
 */
export function assertEmailNotInTimeline(timeline: any[], emailId: string): void {
  const found = timeline.some(e => e.emailId === emailId || e.id === emailId);
  expect(found, `Email ${emailId} should NOT be in timeline`).toBe(false);
}

// ===== Topic Assertions =====

export interface TopicAssertionOptions {
  name?: string | RegExp;
  parent?: string;
  emailCount?: number;
  fullPath?: string;
}

/**
 * Assert topic has expected properties
 */
export function assertTopic(actual: any, expected: TopicAssertionOptions): void {
  if (expected.name !== undefined) {
    if (expected.name instanceof RegExp) {
      expect(actual.name).toMatch(expected.name);
    } else {
      expect(actual.name).toBe(expected.name);
    }
  }

  if (expected.parent !== undefined) {
    expect(actual.parent).toBe(expected.parent);
  }

  if (expected.emailCount !== undefined) {
    expect(actual.emailCount).toBe(expected.emailCount);
  }

  if (expected.fullPath !== undefined) {
    expect(actual.fullPath).toBe(expected.fullPath);
  }
}

/**
 * Assert topic exists in list
 */
export function assertTopicExists(topics: any[], topicName: string): void {
  const found = topics.some(t => t.name === topicName || t.fullPath === topicName);
  expect(found, `Topic "${topicName}" should exist`).toBe(true);
}

/**
 * Assert topic hierarchy is correct
 */
export function assertTopicHierarchy(topics: any[], parent: string, child: string): void {
  const childTopic = topics.find(t => t.name === child);
  expect(childTopic, `Child topic "${child}" should exist`).toBeDefined();
  expect(childTopic?.parent, `Child topic "${child}" should have parent "${parent}"`).toBe(parent);
}

// ===== Deal Assertions =====

export interface DealAssertionOptions {
  title?: string | RegExp;
  brand?: string;
  code?: string;
  value?: string;
  category?: string;
  isActive?: boolean;
  expiryDate?: string;
}

/**
 * Assert deal has expected properties
 */
export function assertDeal(actual: any, expected: DealAssertionOptions): void {
  if (expected.title !== undefined) {
    if (expected.title instanceof RegExp) {
      expect(actual.title).toMatch(expected.title);
    } else {
      expect(actual.title).toContain(expected.title);
    }
  }

  if (expected.brand !== undefined) {
    expect(actual.brand).toBe(expected.brand);
  }

  if (expected.code !== undefined) {
    expect(actual.promoCode || actual.code).toBe(expected.code);
  }

  if (expected.value !== undefined) {
    expect(actual.value).toBe(expected.value);
  }

  if (expected.category !== undefined) {
    expect(actual.category).toBe(expected.category);
  }

  if (expected.isActive !== undefined) {
    expect(actual.isActive).toBe(expected.isActive);
  }

  if (expected.expiryDate !== undefined) {
    expect(actual.expiryDate).toBe(expected.expiryDate);
  }
}

/**
 * Assert deal is active
 */
export function assertDealActive(deal: any): void {
  expect(deal.isActive, 'Deal should be active').toBe(true);
  if (deal.expiryDate) {
    const expiry = new Date(deal.expiryDate);
    expect(expiry > new Date(), 'Deal should not be expired').toBe(true);
  }
}

/**
 * Assert deal is expired
 */
export function assertDealExpired(deal: any): void {
  expect(deal.isActive, 'Deal should be inactive').toBe(false);
  if (deal.expiryDate) {
    const expiry = new Date(deal.expiryDate);
    expect(expiry <= new Date(), 'Deal should be expired').toBe(true);
  }
}

// ===== Summary Assertions =====

/**
 * Assert summary meets word count requirements
 */
export function assertSummaryWordCount(summary: string, maxWords: number = 500): void {
  const wordCount = summary.split(/\s+/).length;
  expect(wordCount, `Summary should have at most ${maxWords} words, got ${wordCount}`).toBeLessThanOrEqual(maxWords);
}

/**
 * Assert summary has high-level overview structure
 */
export function assertSummaryStructure(summary: string): void {
  const paragraphs = summary.split(/\n\n+/);
  expect(paragraphs.length, 'Summary should have at least one paragraph').toBeGreaterThanOrEqual(1);

  // First paragraph should be high-level (typically shorter and more general)
  const firstParagraph = paragraphs[0];
  expect(firstParagraph.length, 'First paragraph should be a high-level overview').toBeGreaterThan(10);
}

// ===== Job Assertions =====

export interface JobAssertionOptions {
  type?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'dead';
  retryCount?: number;
}

/**
 * Assert job has expected properties
 */
export function assertJob(actual: any, expected: JobAssertionOptions): void {
  if (expected.type !== undefined) {
    expect(actual.type).toBe(expected.type);
  }

  if (expected.status !== undefined) {
    expect(actual.status).toBe(expected.status);
  }

  if (expected.retryCount !== undefined) {
    expect(actual.retryCount || actual.retries).toBe(expected.retryCount);
  }
}

/**
 * Assert job queue stats
 */
export function assertJobStats(stats: any, expected: Partial<{
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
}>): void {
  for (const [key, value] of Object.entries(expected)) {
    expect(stats[key], `Job stats.${key} should be ${value}`).toBe(value);
  }
}

// ===== Sync Assertions =====

/**
 * Assert sync progress state
 */
export function assertSyncProgress(progress: any, expected: {
  status?: 'idle' | 'running' | 'paused' | 'synced' | 'error';
  currentDay?: number;
  totalDays?: number;
}): void {
  if (expected.status !== undefined) {
    expect(progress.status).toBe(expected.status);
  }

  if (expected.currentDay !== undefined) {
    expect(progress.currentDay).toBe(expected.currentDay);
  }

  if (expected.totalDays !== undefined) {
    expect(progress.totalDays).toBe(expected.totalDays);
  }
}

// ===== Collection Assertions =====

/**
 * Assert array has length
 */
export function assertLength(array: any[], expected: number): void {
  expect(array.length, `Array should have ${expected} items, got ${array.length}`).toBe(expected);
}

/**
 * Assert array has minimum length
 */
export function assertMinLength(array: any[], min: number): void {
  expect(array.length, `Array should have at least ${min} items, got ${array.length}`).toBeGreaterThanOrEqual(min);
}

/**
 * Assert array is empty
 */
export function assertEmpty(array: any[]): void {
  expect(array.length, 'Array should be empty').toBe(0);
}

/**
 * Assert array is not empty
 */
export function assertNotEmpty(array: any[]): void {
  expect(array.length, 'Array should not be empty').toBeGreaterThan(0);
}

// ===== Date/Time Assertions =====

/**
 * Assert date is recent (within specified milliseconds)
 */
export function assertDateRecent(date: Date | string, withinMs: number = 60000): void {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = Math.abs(now.getTime() - d.getTime());
  expect(diff, `Date should be within ${withinMs}ms of now`).toBeLessThanOrEqual(withinMs);
}

/**
 * Assert date is before another date
 */
export function assertDateBefore(date1: Date | string, date2: Date | string): void {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  expect(d1 < d2, `${d1} should be before ${d2}`).toBe(true);
}

/**
 * Assert date is after another date
 */
export function assertDateAfter(date1: Date | string, date2: Date | string): void {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  expect(d1 > d2, `${d1} should be after ${d2}`).toBe(true);
}
