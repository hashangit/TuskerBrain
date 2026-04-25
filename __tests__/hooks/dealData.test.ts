import { describe, expect, it } from 'vitest';
import {
  formatDealValue,
  formatExpiryDate,
  toDealData,
  toDealDataList,
  updateDealById,
  type DealData,
  type DealRecord,
} from '../../src/hooks/dealData';

describe('renderer deal data utilities', () => {
  it('converts IPC deal records to UI deal data', () => {
    const record: DealRecord = {
      id: 'deal-1',
      emailId: 'email-1',
      dealTitle: '20% Off Headphones',
      brandName: null,
      dealDescription: 'Limited-time discount',
      dealCode: 'LISTEN20',
      dealValue: '20',
      dealValueType: 'percentage',
      dealExpiry: '2099-05-01T00:00:00.000Z',
      dealCategory: 'Electronics',
      dealLink: 'https://example.com/deal',
      minimumPurchase: '$50',
      isActive: true,
      usedAt: null,
      dismissedAt: null,
      createdAt: '2026-04-20T12:00:00.000Z',
    };

    expect(toDealData(record)).toEqual({
      id: 'deal-1',
      title: '20% Off Headphones',
      brand: '',
      description: 'Limited-time discount',
      code: 'LISTEN20',
      value: '20',
      valueType: 'percentage',
      expiry: new Date('2099-05-01T00:00:00.000Z'),
      isActive: true,
      status: 'active',
      category: 'Electronics',
      link: 'https://example.com/deal',
      minimumPurchase: '$50',
      usedAt: undefined,
      dismissedAt: undefined,
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
      emailId: 'email-1',
    });
  });

  it('derives dismissed status before used or expired status', () => {
    const records: DealRecord[] = [
      {
        id: 'deal-used',
        emailId: 'email-1',
        dealTitle: 'Used Deal',
        brandName: 'Brand',
        dealExpiry: '2099-05-01T00:00:00.000Z',
        isActive: true,
        usedAt: '2026-04-21T00:00:00.000Z',
        dismissedAt: null,
        createdAt: '2026-04-20T00:00:00.000Z',
      },
      {
        id: 'deal-dismissed',
        emailId: 'email-2',
        dealTitle: 'Dismissed Deal',
        brandName: 'Brand',
        dealExpiry: '2020-01-01T00:00:00.000Z',
        isActive: false,
        usedAt: '2026-04-21T00:00:00.000Z',
        dismissedAt: '2026-04-22T00:00:00.000Z',
        createdAt: '2026-04-20T00:00:00.000Z',
      },
    ];

    expect(toDealDataList(records).map((deal) => deal.status)).toEqual(['used', 'dismissed']);
  });

  it('updates one deal without mutating the original list', () => {
    const originalDeal: DealData = {
      id: 'deal-1',
      title: 'Original Deal',
      brand: 'Brand',
      isActive: true,
      status: 'active',
      createdAt: new Date('2026-04-20T00:00:00.000Z'),
      emailId: 'email-1',
    };
    const untouchedDeal: DealData = {
      ...originalDeal,
      id: 'deal-2',
      title: 'Untouched Deal',
    };

    const updated = updateDealById([originalDeal, untouchedDeal], 'deal-1', (deal) => ({
      ...deal,
      status: 'used',
      usedAt: new Date('2026-04-21T00:00:00.000Z'),
    }));

    expect(updated[0]).toMatchObject({ id: 'deal-1', status: 'used' });
    expect(updated[1]).toBe(untouchedDeal);
    expect(originalDeal.status).toBe('active');
  });

  it('formats deal display values without relying on database modules', () => {
    expect(formatDealValue('20', 'percentage')).toBe('20% off');
    expect(formatDealValue('15', 'fixed_amount')).toBe('$15 off');
    expect(formatDealValue('Free shipping', 'other')).toBe('Free shipping');
  });

  it('formats expiry dates for renderer display', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

    expect(formatExpiryDate(tomorrow)).toBe('Expires tomorrow');
    expect(formatExpiryDate(undefined)).toBe('');
  });
});
