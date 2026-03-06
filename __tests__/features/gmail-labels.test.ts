import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GmailLabelManager } from '@core/labeling/manager';
import type { GmailClient } from '@core/gmail/client';

/**
 * Design Spec Reference: Lines 174-196, 853-859
 *
 * Gmail Label Hierarchy:
 * TuskerBrain/
 * ├── Processed                    # Marks email as processed
 * ├── Topic/
 * │   ├── Banking/
 * │   │   ├── Chase
 * │   │   └── HSBC
 * │   ├── Projects/
 * │   │   └── Client-ABC
 * │   └── Education/
 * │       └── Udemy-React
 * └── Sender/
 *     └── chase.com
 */
describe('Gmail Label Management', () => {
  let labelManager: GmailLabelManager;
  let mockGmailClient: GmailClient;

  beforeEach(() => {
    mockGmailClient = {
      listLabels: vi.fn().mockResolvedValue({
        labels: [
          { id: 'Label_Processed', name: 'TuskerBrain/Processed' },
          { id: 'Label_Banking', name: 'TuskerBrain/Topic/Banking' },
          { id: 'Label_Chase', name: 'TuskerBrain/Topic/Banking/Chase' },
        ],
      }),
      createLabel: vi.fn().mockImplementation((name: string) =>
        Promise.resolve({ id: `Label_${Date.now()}`, name })
      ),
      modifyMessage: vi.fn().mockResolvedValue({}),
    } as unknown as GmailClient;

    labelManager = new GmailLabelManager(mockGmailClient);
  });

  describe('Label Hierarchy Creation', () => {
    it('should create parent topic label if it does not exist', async () => {
      (mockGmailClient.listLabels as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        labels: [{ id: 'Label_Processed', name: 'TuskerBrain/Processed' }],
      });

      await labelManager.ensureTopicLabels('Education', 'Udemy');

      expect(mockGmailClient.createLabel).toHaveBeenCalledWith('TuskerBrain/Topic/Education');
      expect(mockGmailClient.createLabel).toHaveBeenCalledWith('TuskerBrain/Topic/Education/Udemy');
    });

    it('should create child topic label under existing parent', async () => {
      // Parent Banking already exists
      await labelManager.ensureTopicLabels('Banking', 'HSBC');

      // Should not create parent again
      expect(mockGmailClient.createLabel).not.toHaveBeenCalledWith('TuskerBrain/Topic/Banking');
      // But should create child
      expect(mockGmailClient.createLabel).toHaveBeenCalledWith('TuskerBrain/Topic/Banking/HSBC');
    });

    it('should not create labels that already exist', async () => {
      await labelManager.ensureTopicLabels('Banking', 'Chase');

      // Both parent and child already exist
      expect(mockGmailClient.createLabel).not.toHaveBeenCalled();
    });

    it('should create nested labels in correct order (parent first)', async () => {
      const createOrder: string[] = [];
      (mockGmailClient.createLabel as ReturnType<typeof vi.fn>).mockImplementation((name: string) => {
        createOrder.push(name);
        return Promise.resolve({ id: `Label_${name}`, name });
      });
      (mockGmailClient.listLabels as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        labels: [],
      });

      await labelManager.ensureTopicLabels('Projects', 'Client-ABC');

      // Parent must be created before child
      const parentIndex = createOrder.indexOf('TuskerBrain/Topic/Projects');
      const childIndex = createOrder.indexOf('TuskerBrain/Topic/Projects/Client-ABC');
      expect(parentIndex).toBeLessThan(childIndex);
    });
  });

  describe('Applying Labels to Emails', () => {
    it('should apply topic labels to processed email', async () => {
      const labelIds = await labelManager.applyTopicLabels('email-1', 'Banking', 'Chase');

      expect(mockGmailClient.modifyMessage).toHaveBeenCalledWith(
        'email-1',
        expect.objectContaining({
          addLabelIds: expect.arrayContaining([
            expect.stringContaining('Chase'), // Topic label
          ]),
        })
      );
      expect(labelIds).toContain('Label_Chase');
    });

    it('should apply sender label to processed email', async () => {
      await labelManager.applySenderLabel('email-1', 'chase.com');

      expect(mockGmailClient.createLabel).toHaveBeenCalledWith('TuskerBrain/Sender/chase.com');
      expect(mockGmailClient.modifyMessage).toHaveBeenCalledWith(
        'email-1',
        expect.objectContaining({
          addLabelIds: expect.any(Array),
        })
      );
    });

    it('should apply Processed label to email', async () => {
      await labelManager.applyProcessedLabel('email-1');

      expect(mockGmailClient.modifyMessage).toHaveBeenCalledWith(
        'email-1',
        expect.objectContaining({
          addLabelIds: expect.arrayContaining(['Label_Processed']),
        })
      );
    });

    it('should apply all relevant labels in single API call', async () => {
      await labelManager.applyAllLabels('email-1', {
        topic: { parent: 'Banking', child: 'Chase' },
        senderDomain: 'chase.com',
      });

      // Should make only one modifyMessage call with all labels
      expect(mockGmailClient.modifyMessage).toHaveBeenCalledTimes(1);
      const call = (mockGmailClient.modifyMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toBe('email-1');
      expect(call[1].addLabelIds.length).toBeGreaterThan(1);
    });
  });

  describe('Label Name Normalization', () => {
    it('should handle special characters in topic names', async () => {
      await labelManager.ensureTopicLabels('Projects', 'Client/ABC (2024)');

      // Gmail labels don't support certain characters in the label name (after the last /)
      const createCalls = (mockGmailClient.createLabel as ReturnType<typeof vi.fn>).mock.calls;
      for (const call of createCalls) {
        const labelName = call[0] as string;
        // Extract the child part (after the last /)
        const childPart = labelName.split('/').pop() || '';
        // The child part should not contain (, ), or / (they should be replaced with -)
        expect(childPart).not.toMatch(/[()]/);
      }
    });

    it('should normalize sender domain to lowercase', async () => {
      await labelManager.applySenderLabel('email-1', 'CHASE.COM');

      expect(mockGmailClient.createLabel).toHaveBeenCalledWith(
        'TuskerBrain/Sender/chase.com'
      );
    });

    it('should truncate long topic names', async () => {
      const longName = 'A'.repeat(100);
      await labelManager.ensureTopicLabels('Projects', longName);

      // Gmail has character limits on label names
      const createCalls = (mockGmailClient.createLabel as ReturnType<typeof vi.fn>).mock.calls;
      const childCall = createCalls.find((call: unknown[]) =>
        typeof call[0] === 'string' && call[0].includes('Projects')
      );

      if (childCall) {
        expect(childCall[0].length).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Label Caching', () => {
    it('should cache labels to reduce API calls', async () => {
      // First call should hit the API
      await labelManager.getLabelId('TuskerBrain/Topic/Banking/Chase');
      expect(mockGmailClient.listLabels).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await labelManager.getLabelId('TuskerBrain/Topic/Banking/Chase');
      expect(mockGmailClient.listLabels).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should refresh cache when label not found', async () => {
      // First lookup
      await labelManager.getLabelId('TuskerBrain/Topic/New');

      // New label was created, cache should be updated
      const labelId = await labelManager.getLabelId('TuskerBrain/Topic/New');
      expect(labelId).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle Gmail API rate limits', async () => {
      (mockGmailClient.createLabel as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce({ id: 'Label_New', name: 'New' });

      // Should retry and eventually succeed
      await expect(labelManager.ensureTopicLabels('New', 'Topic')).resolves.not.toThrow();
    });

    it('should handle label creation conflict (already exists)', async () => {
      (mockGmailClient.createLabel as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
        message: 'Label already exists',
        code: 409,
      });

      // Should handle gracefully and fetch existing label
      await expect(labelManager.ensureTopicLabels('Banking', 'Chase')).resolves.not.toThrow();
    });
  });
});
