import { describe, it, expect } from 'vitest';
import {
  buildSummaryPrompt,
  buildSenderSummaryPrompt,
  SummarySchema,
  SenderSummaryInputSchema,
} from '@domain/workflows/prompts/summarization';

describe('Summarization Prompts', () => {
  describe('buildSummaryPrompt', () => {
    it('should generate a prompt for topic summarization', () => {
      const prompt = buildSummaryPrompt({
        topic: 'Banking/Chase',
        newContent: 'Your statement is ready for review',
        maxWords: 500,
      });

      expect(prompt).toContain('Banking/Chase');
      expect(prompt).toContain('statement is ready');
      expect(prompt).toContain('500');
      expect(prompt).toContain('rolling summary');
    });

    it('should include current summary when provided', () => {
      const prompt = buildSummaryPrompt({
        topic: 'Work/Projects',
        currentSummary: 'Previous project updates here',
        newContent: 'New update available',
        maxWords: 300,
      });

      expect(prompt).toContain('Previous project updates here');
      expect(prompt).toContain('New update available');
    });

    it('should handle missing current summary', () => {
      const prompt = buildSummaryPrompt({
        topic: 'General',
        newContent: 'Some content',
        maxWords: 200,
      });

      expect(prompt).toContain('No previous summary exists');
    });

    it('should include guidelines in prompt', () => {
      const prompt = buildSummaryPrompt({
        topic: 'Test',
        newContent: 'Content',
        maxWords: 500,
      });

      expect(prompt).toContain('First paragraph');
      expect(prompt).toContain('3-4 paragraphs');
      expect(prompt).toContain('rolling summary');
    });
  });

  describe('buildSenderSummaryPrompt', () => {
    it('should generate a prompt for sender summarization', () => {
      const prompt = buildSenderSummaryPrompt({
        senderDomain: 'amazon.com',
        newContent: 'Your order has shipped',
        maxWords: 500,
      });

      expect(prompt).toContain('amazon.com');
      expect(prompt).toContain('order has shipped');
      expect(prompt).toContain('500');
    });

    it('should include current summary when provided', () => {
      const prompt = buildSenderSummaryPrompt({
        senderDomain: 'linkedin.com',
        currentSummary: 'Previous activity from LinkedIn',
        newContent: 'New connection request',
        maxWords: 300,
      });

      expect(prompt).toContain('Previous activity from LinkedIn');
      expect(prompt).toContain('New connection request');
    });

    it('should include sender-specific guidance', () => {
      const prompt = buildSenderSummaryPrompt({
        senderDomain: 'chase.com',
        newContent: 'Statement ready',
        maxWords: 400,
      });

      expect(prompt).toContain("sender's purpose");
      expect(prompt).toContain('recent email activity');
      expect(prompt).toContain('important actions');
    });
  });

  describe('SummarySchema', () => {
    it('should validate summary result', () => {
      const result = {
        summary: 'This is a summary of the topic.',
        wordCount: 7,
        paragraphCount: 1,
      };

      expect(() => SummarySchema.parse(result)).not.toThrow();
    });

    it('should reject missing required fields', () => {
      const result = {
        summary: 'Test summary',
      };

      expect(() => SummarySchema.parse(result)).toThrow();
    });
  });

  describe('SenderSummaryInputSchema', () => {
    it('should validate sender summary input', () => {
      const input = {
        senderDomain: 'amazon.com',
        currentSummary: 'Previous activity',
        newContent: 'New order shipped',
        maxWords: 500,
      };

      expect(() => SenderSummaryInputSchema.parse(input)).not.toThrow();
    });

    it('should apply default maxWords', () => {
      const input = {
        senderDomain: 'test.com',
        newContent: 'Content',
      };

      const parsed = SenderSummaryInputSchema.parse(input);
      expect(parsed.maxWords).toBe(500);
    });

    it('should allow optional currentSummary', () => {
      const input = {
        senderDomain: 'test.com',
        newContent: 'Content',
        maxWords: 300,
      };

      expect(() => SenderSummaryInputSchema.parse(input)).not.toThrow();
    });
  });
});
