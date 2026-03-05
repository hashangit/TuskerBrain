/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DealsList } from '@/components/DealsList';

describe('DealsList Component', () => {
  // Create dates relative to current date
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30); // 30 days in future

  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 10); // 10 days ago

  const mockDeals = [
    {
      id: 'deal-1',
      title: '50% Off Electronics',
      brand: 'Amazon',
      code: 'SAVE50',
      expiry: futureDate,
      isActive: true,
    },
    {
      id: 'deal-2',
      title: 'Free Shipping on Orders $50+',
      brand: 'Best Buy',
      code: null,
      expiry: futureDate,
      isActive: true,
    },
    {
      id: 'deal-3',
      title: '20% Off All TVs',
      brand: 'Walmart',
      code: 'TV20',
      expiry: expiredDate, // Expired
      isActive: false,
    },
  ];

  describe('Rendering', () => {
    it('should render deals with titles and brands', () => {
      render(<DealsList deals={mockDeals} />);

      expect(screen.getByText('50% Off Electronics')).toBeInTheDocument();
      expect(screen.getByText('Amazon')).toBeInTheDocument();
      expect(screen.getByText('Free Shipping on Orders $50+')).toBeInTheDocument();
      expect(screen.getByText('Best Buy')).toBeInTheDocument();
    });

    it('should show promo codes when available', () => {
      render(<DealsList deals={mockDeals} />);

      expect(screen.getByText('SAVE50')).toBeInTheDocument();
      expect(screen.getByText('TV20')).toBeInTheDocument();
    });

    it('should show empty state when no deals', () => {
      render(<DealsList deals={[]} />);

      expect(screen.getByText(/no deals/i)).toBeInTheDocument();
    });

    it('should show expiry date', () => {
      render(<DealsList deals={mockDeals} />);

      // Look for expiry text - either "Expires" or "in X days"
      const expiryTexts = screen.getAllByText(/expires|in \d+ days/i);
      expect(expiryTexts.length).toBeGreaterThan(0);
    });
  });

  describe('Filtering', () => {
    it('should filter to show only active deals', () => {
      render(<DealsList deals={mockDeals} showOnlyActive />);

      expect(screen.getByText('50% Off Electronics')).toBeInTheDocument();
      expect(screen.queryByText('20% Off All TVs')).not.toBeInTheDocument();
    });

    it('should show all deals including expired', () => {
      render(<DealsList deals={mockDeals} showOnlyActive={false} />);

      expect(screen.getByText('50% Off Electronics')).toBeInTheDocument();
      expect(screen.getByText('20% Off All TVs')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('should call onCopyCode when code is clicked', async () => {
      const onCopyCode = vi.fn();
      render(<DealsList deals={mockDeals} onCopyCode={onCopyCode} />);

      // Click the copy button for SAVE50
      screen.getByText('SAVE50').click();

      expect(onCopyCode).toHaveBeenCalledWith('SAVE50');
    });
  });
});
