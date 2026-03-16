import { describe, it, expect } from 'vitest';
import {
  buildUpdateExtractionPrompt,
  buildDealExtractionPrompt,
  UpdateExtractionSchema,
  DealExtractionSchema,
} from '@core/workflows/prompts/extraction';

describe('Extraction Prompts', () => {
  describe('buildUpdateExtractionPrompt', () => {
    it('should generate a prompt with email details', () => {
      const prompt = buildUpdateExtractionPrompt({
        email: {
          subject: 'Project Update',
          snippet: 'Please review the attached document',
          senderName: 'John Doe',
          senderDomain: 'company.com',
          receivedAt: new Date('2024-01-15'),
        },
      });

      expect(prompt).toContain('Project Update');
      expect(prompt).toContain('company.com');
      expect(prompt).toContain('Please review');
      expect(prompt).toContain('Extract key information');
    });

    it('should handle missing optional fields', () => {
      const prompt = buildUpdateExtractionPrompt({
        email: {
          subject: undefined,
          snippet: undefined,
          senderName: undefined,
          senderDomain: 'notifications@example.com',
          receivedAt: new Date(),
        },
      });

      expect(prompt).toContain('notifications@example.com');
      expect(prompt).toContain('No subject');
      expect(prompt).toContain('No snippet');
    });

    it('should include extraction fields in prompt', () => {
      const prompt = buildUpdateExtractionPrompt({
        email: {
          senderDomain: 'test.com',
          receivedAt: new Date(),
        },
      });

      expect(prompt).toContain('title');
      expect(prompt).toContain('priority');
      expect(prompt).toContain('actionItem');
      expect(prompt).toContain('followUpDate');
    });
  });

  describe('buildDealExtractionPrompt', () => {
    it('should generate a prompt for promotional emails', () => {
      const prompt = buildDealExtractionPrompt({
        email: {
          subject: '50% Off Today!',
          snippet: 'Use code SAVE50 at checkout',
          senderName: 'Amazon Deals',
          senderDomain: 'amazon.com',
          receivedAt: new Date(),
        },
      });

      expect(prompt).toContain('50% Off Today!');
      expect(prompt).toContain('amazon.com');
      expect(prompt).toContain('SAVE50');
      expect(prompt).toContain('Extract deal information');
    });

    it('should include deal extraction fields', () => {
      const prompt = buildDealExtractionPrompt({
        email: {
          senderDomain: 'shop.com',
          receivedAt: new Date(),
        },
      });

      expect(prompt).toContain('dealTitle');
      expect(prompt).toContain('brandName');
      expect(prompt).toContain('dealCode');
      expect(prompt).toContain('dealExpiry');
    });
  });

  describe('UpdateExtractionSchema', () => {
    it('should validate complete update extraction result', () => {
      const result = {
        title: 'Project Update',
        description: 'Quarterly review',
        summary: 'Q4 results',
        priority: 'high',
        sentiment: 'positive',
        urgency: true,
        actionItem: true,
        actionItemTitle: 'Review document',
        followUpDate: '2024-02-01',
        financialImpact: 5000,
        keyEntities: {
          dates: ['2024-02-01'],
          amounts: [5000],
          names: ['Project Alpha'],
        },
      };

      expect(() => UpdateExtractionSchema.parse(result)).not.toThrow();
    });

    it('should validate minimal update extraction result', () => {
      const result = {
        title: 'Simple Update',
      };

      expect(() => UpdateExtractionSchema.parse(result)).not.toThrow();
    });

    it('should reject invalid priority', () => {
      const result = {
        title: 'Test',
        priority: 'invalid',
      };

      expect(() => UpdateExtractionSchema.parse(result)).toThrow();
    });
  });

  describe('DealExtractionSchema', () => {
    it('should validate complete deal extraction result', () => {
      const result = {
        dealTitle: '50% Off Electronics',
        dealDescription: 'Save on electronics',
        brandName: 'Amazon',
        dealValue: '50% off',
        dealCode: 'SAVE50',
        dealExpiry: '2024-12-31',
        dealLink: 'https://amazon.com/deals',
        minimumPurchase: '$50',
        dealCategory: 'Electronics',
        isActive: true,
      };

      expect(() => DealExtractionSchema.parse(result)).not.toThrow();
    });

    it('should validate minimal deal extraction result', () => {
      const result = {
        dealTitle: 'Sale',
      };

      expect(() => DealExtractionSchema.parse(result)).not.toThrow();
    });

    it('should default isActive to true', () => {
      const result = {
        dealTitle: 'Sale',
      };

      const parsed = DealExtractionSchema.parse(result);
      expect(parsed.isActive).toBe(true);
    });

    it('should reject invalid URL for dealLink', () => {
      const result = {
        dealTitle: 'Sale',
        dealLink: 'not-a-url',
      };

      expect(() => DealExtractionSchema.parse(result)).toThrow();
    });
  });
});
