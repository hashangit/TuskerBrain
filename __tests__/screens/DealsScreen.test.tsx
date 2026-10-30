/**
 * Feature-Perspective Tests for Deals Used/Dismiss Functionality
 *
 * These tests verify the expected user behaviors using the CONTROLLED COMPONENT pattern:
 * - Parent provides deals and mutation handlers
 * - Component calls handlers, parent updates state
 * - State flows down as props
 *
 * This matches how App.tsx uses DealsScreen in production.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { DealsScreen, DealCard } from '../../src/components/screens/DealsScreen';
import type { DealData } from '@foundations/database/deals';

// Mock deal data
const mockActiveDeal: DealData = {
  id: 'test-deal-1',
  title: 'Test Deal',
  brand: 'Test Brand',
  code: 'TESTCODE',
  value: '20',
  valueType: 'percentage',
  expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  isActive: true,
  status: 'active',
  category: 'Electronics',
  createdAt: new Date(),
  emailId: 'email-1',
};

const mockUsedDeal: DealData = {
  ...mockActiveDeal,
  id: 'test-deal-2',
  title: 'Used Deal',
  status: 'used',
  usedAt: new Date(),
};

const mockDismissedDeal: DealData = {
  ...mockActiveDeal,
  id: 'test-deal-3',
  title: 'Dismissed Deal',
  status: 'dismissed',
  dismissedAt: new Date(),
};

// Mock electronAPI for tests
const mockElectronAPI = {
  listDeals: vi.fn().mockResolvedValue({ success: true, data: { deals: [] } }),
  markDealAsUsed: vi.fn().mockResolvedValue({ success: true }),
  dismissDeal: vi.fn().mockResolvedValue({ success: true }),
  undoMarkDealAsUsed: vi.fn().mockResolvedValue({ success: true }),
  undoDismissDeal: vi.fn().mockResolvedValue({ success: true }),
};

beforeEach(() => {
  vi.clearAllMocks();
  // @ts-expect-error - Mocking window.electronAPI
  window.electronAPI = mockElectronAPI;
});

// ============================================================================
// Test Wrapper - Simulates how App.tsx uses DealsScreen
// ============================================================================

/**
 * TestWrapper simulates the parent component (App.tsx) that:
 * 1. Owns the deals state
 * 2. Provides mutation handlers that update the state
 * 3. Passes updated deals back to DealsScreen
 */
function TestWrapper({ initialDeals }: { initialDeals: DealData[] }) {
  const [deals, setDeals] = useState<DealData[]>(initialDeals);

  // Mutation handlers - update local state (simulating App.tsx behavior)
  const handleMarkUsed = vi.fn(async (dealId: string) => {
    setDeals(prev => prev.map(deal =>
      deal.id === dealId
        ? { ...deal, usedAt: new Date(), status: 'used' as const }
        : deal
    ));
  });

  const handleUnmarkUsed = vi.fn(async (dealId: string) => {
    setDeals(prev => prev.map(deal =>
      deal.id === dealId
        ? { ...deal, usedAt: undefined, status: 'active' as const }
        : deal
    ));
  });

  const handleDismiss = vi.fn(async (dealId: string) => {
    setDeals(prev => prev.map(deal =>
      deal.id === dealId
        ? { ...deal, dismissedAt: new Date(), status: 'dismissed' as const }
        : deal
    ));
  });

  const handleRestore = vi.fn(async (dealId: string) => {
    setDeals(prev => prev.map(deal =>
      deal.id === dealId
        ? { ...deal, dismissedAt: undefined, status: 'active' as const }
        : deal
    ));
  });

  return (
    <DealsScreen
      deals={deals}
      onMarkUsed={handleMarkUsed}
      onUnmarkUsed={handleUnmarkUsed}
      onDismiss={handleDismiss}
      onRestore={handleRestore}
    />
  );
}

// ============================================================================
// DealCard Tests
// ============================================================================

describe('DealCard Used/Unused Toggle', () => {
  it('should show "Used" button for active deal', () => {
    const onMarkUsed = vi.fn();
    render(
      <DealCard
        data={mockActiveDeal}
        onMarkUsed={onMarkUsed}
      />
    );

    const usedButton = screen.getByRole('button', { name: /used/i });
    expect(usedButton).toBeDefined();
  });

  it('should show "Unmark Used" button for used deal', () => {
    const onUnmarkUsed = vi.fn();
    render(
      <DealCard
        data={mockUsedDeal}
        onUnmarkUsed={onUnmarkUsed}
      />
    );

    const unmarkButton = screen.getByRole('button', { name: /unmark/i });
    expect(unmarkButton).toBeDefined();
  });

  it('should call onMarkUsed when clicking "Mark As Used" button', async () => {
    const onMarkUsed = vi.fn();
    render(
      <DealCard
        data={mockActiveDeal}
        onMarkUsed={onMarkUsed}
      />
    );

    const usedButton = screen.getByRole('button', { name: /Mark As Used/i });
    await fireEvent.click(usedButton);

    expect(onMarkUsed).toHaveBeenCalledWith('test-deal-1');
  });
});

// ============================================================================
// DealsScreen Section Grouping (Static Tests)
// ============================================================================

describe('DealsScreen Section Grouping', () => {
  it('should show deal in Active section when status is active', () => {
    render(<TestWrapper initialDeals={[mockActiveDeal]} />);

    expect(screen.getByText(/Active Deals/i)).toBeDefined();
    expect(screen.getByText('Test Deal')).toBeDefined();
  });

  it('should show deal in Used section when status is used', () => {
    render(<TestWrapper initialDeals={[mockUsedDeal]} />);

    expect(screen.getByText(/Used Deals/i)).toBeDefined();
    expect(screen.getByText('Used Deal')).toBeDefined();
  });

  it('should show deal in Dismissed section when status is dismissed', () => {
    render(<TestWrapper initialDeals={[mockDismissedDeal]} />);

    expect(screen.getByText(/Dismissed Deals/i)).toBeDefined();
  });
});

// ============================================================================
// Used/Unused Toggle Feature (Integration Tests)
// ============================================================================

describe('Used/Unused Toggle Feature', () => {
  it('should move deal from Active to Used section when clicking "Used" button', async () => {
    render(<TestWrapper initialDeals={[{ ...mockActiveDeal }]} />);

    // Verify deal is in Active section initially
    expect(screen.getByText('Test Deal')).toBeDefined();
    expect(screen.getByText(/Active Deals/i)).toBeDefined();

    // Initially, there should be NO Used section
    expect(screen.queryByText(/Used Deals/i)).toBeNull();

    // Find and click the "Used" button
    const usedButton = screen.getByRole('button', { name: /Mark As Used/i });
    await fireEvent.click(usedButton);

    // After clicking, deal should move to Used section
    await waitFor(() => {
      const usedSection = screen.queryByText(/Used Deals/i);
      expect(usedSection).not.toBeNull();
    }, { timeout: 3000 });
  });

  it('should show "Unmark Used" button after marking deal as used', async () => {
    render(<TestWrapper initialDeals={[{ ...mockActiveDeal }]} />);

    // Click "Used" button
    const usedButton = screen.getByRole('button', { name: /Mark As Used/i });
    await fireEvent.click(usedButton);

    // The deal should now show "Unmark Used" button
    await waitFor(() => {
      const unmarkButton = screen.queryByRole('button', { name: /unmark/i });
      expect(unmarkButton).not.toBeNull();
    }, { timeout: 3000 });
  });
});

// ============================================================================
// Dismiss Feature (Integration Tests)
// ============================================================================

describe('Dismiss Feature', () => {
  it('should move deal from Active to Dismissed section when dismissed', async () => {
    render(<TestWrapper initialDeals={[{ ...mockActiveDeal }]} />);

    // Verify deal is in Active section initially
    expect(screen.getByText('Test Deal')).toBeDefined();

    // Initially, there should be NO Dismissed section
    expect(screen.queryByText(/Dismissed Deals/i)).toBeNull();

    // Find the dismiss button by title attribute
    const buttons = screen.getAllByRole('button');
    const dismissBtn = buttons.find(btn => btn.getAttribute('title') === 'Dismiss deal');
    expect(dismissBtn).toBeDefined();

    await fireEvent.click(dismissBtn!);

    // After dismissing, a Dismissed section should appear
    await waitFor(() => {
      const dismissedSection = screen.queryByText(/Dismissed Deals/i);
      expect(dismissedSection).not.toBeNull();
    }, { timeout: 3000 });
  });
});

// ============================================================================
// State Management Integration
// ============================================================================

describe('State Management Integration', () => {
  it('should update UI when deal status changes via controlled handlers', async () => {
    render(<TestWrapper initialDeals={[{ ...mockActiveDeal }]} />);

    // Initial state: deal is active
    expect(screen.getByText(/Active Deals/i)).toBeDefined();

    // Click "Used" button
    const usedButton = screen.getByRole('button', { name: /Mark As Used/i });
    await fireEvent.click(usedButton);

    // UI should reflect the change - Used section should appear
    await waitFor(() => {
      const usedSection = screen.queryByText(/Used Deals/i);
      expect(usedSection).not.toBeNull();
    }, { timeout: 3000 });
  });
});
