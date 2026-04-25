// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DealData } from '../../src/hooks/dealData';
import { useDealMutations } from '../../src/hooks/useDealMutations';

function createDeal(overrides: Partial<DealData> = {}): DealData {
  return {
    id: 'deal-1',
    title: 'Test Deal',
    brand: 'Brand',
    isActive: true,
    status: 'active',
    createdAt: new Date('2026-04-20T00:00:00.000Z'),
    emailId: 'email-1',
    ...overrides,
  };
}

describe('useDealMutations', () => {
  it('optimistically marks a deal as used and persists through the API', async () => {
    let deals = [createDeal()];
    const setDeals = vi.fn((update: (current: DealData[]) => DealData[]) => {
      deals = update(deals);
    });
    const api = {
      markDealAsUsed: vi.fn().mockResolvedValue({ success: true }),
      undoMarkDealAsUsed: vi.fn(),
      dismissDeal: vi.fn(),
      undoDismissDeal: vi.fn(),
    };

    const { result } = renderHook(() =>
      useDealMutations({
        setDeals,
        api,
        now: () => new Date('2026-04-21T00:00:00.000Z'),
      })
    );

    await act(async () => {
      await result.current.handleMarkDealUsed('deal-1');
    });

    expect(api.markDealAsUsed).toHaveBeenCalledWith('deal-1');
    expect(deals[0]).toMatchObject({
      id: 'deal-1',
      status: 'used',
      usedAt: new Date('2026-04-21T00:00:00.000Z'),
    });
  });

  it('rolls back an optimistic dismiss when persistence fails', async () => {
    let deals = [createDeal()];
    const setDeals = vi.fn((update: (current: DealData[]) => DealData[]) => {
      deals = update(deals);
    });
    const api = {
      markDealAsUsed: vi.fn(),
      undoMarkDealAsUsed: vi.fn(),
      dismissDeal: vi.fn().mockRejectedValue(new Error('write failed')),
      undoDismissDeal: vi.fn(),
    };

    const { result } = renderHook(() =>
      useDealMutations({
        setDeals,
        api,
        logger: { error: vi.fn() },
        now: () => new Date('2026-04-21T00:00:00.000Z'),
      })
    );

    await expect(
      act(async () => {
        await result.current.handleDismissDeal('deal-1');
      })
    ).rejects.toThrow('write failed');

    expect(deals[0]).toMatchObject({
      id: 'deal-1',
      status: 'active',
      dismissedAt: undefined,
    });
  });
});
