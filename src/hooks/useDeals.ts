import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  type DealData,
  type DealsFilterOptions,
  type DealRecord,
  filterDeals,
  sortDeals,
  extractCategories,
  extractBrands,
  groupDealsByStatus,
  toDealDataList,
} from '../../database/deals';

/**
 * Hook state for deals data
 */
export interface UseDealsState {
  deals: DealData[];
  activeDeals: DealData[];
  expiredDeals: DealData[];
  categories: string[];
  brands: string[];
  isLoading: boolean;
  error: string | null;
  totalCount: number;
  activeCount: number;
  expiredCount: number;
}

/**
 * Hook actions for deals data
 */
export interface UseDealsActions {
  refresh: () => Promise<void>;
  markAsUsed: (dealId: string) => Promise<void>;
  dismiss: (dealId: string) => Promise<void>;
  copyCode: (code: string) => void;
}

/**
 * Hook options for deals fetching
 */
export interface UseDealsOptions {
  /** Auto-fetch on mount */
  autoFetch?: boolean;
  /** Initial filter options */
  initialFilters?: DealsFilterOptions;
  /** Sort option */
  sortBy?: 'expiry_asc' | 'expiry_desc' | 'created_asc' | 'created_desc';
}

/**
 * Hook return type
 */
export type UseDealsReturn = UseDealsState & UseDealsActions;

/**
 * Custom hook for fetching and managing deals data from the database.
 *
 * Features:
 * - Fetches deals from the database via IPC
 * - Provides filtered and sorted data
 * - Handles loading and error states
 * - Provides actions for marking deals as used/dismissed
 *
 * @param options - Hook configuration options
 * @returns Deals state and actions
 */
export function useDeals(options: UseDealsOptions = {}): UseDealsReturn {
  const { autoFetch = true, initialFilters, sortBy = 'expiry_asc' } = options;

  const [rawDeals, setRawDeals] = useState<DealData[]>([]);
  const [isLoading, setIsLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch deals from the database
   */
  const fetchDeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // In Electron, this would use IPC to communicate with the main process
      // For now, we'll check if window.electronAPI exists (Electron environment)
      // Otherwise, we'll use mock data for development

      if (typeof window !== 'undefined' && 'electronAPI' in window) {
        // Electron environment - use IPC
        const response = await (window as any).electronAPI.listDeals();
        if (response.success && response.data) {
          const deals = toDealDataList(response.data.deals as DealRecord[]);
          setRawDeals(deals);
        } else {
          throw new Error(response.error || 'Failed to fetch deals');
        }
      } else {
        // Development/preview environment - use mock data
        // This simulates a delay to show loading states
        await new Promise((resolve) => setTimeout(resolve, 300));

        const mockDeals: DealData[] = getMockDeals();
        setRawDeals(mockDeals);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deals');
      console.error('Failed to fetch deals:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Mark a deal as used
   */
  const markAsUsed = useCallback(async (dealId: string) => {
    // Optimistically update local state
    setRawDeals((prev) =>
      prev.map((deal) =>
        deal.id === dealId ? { ...deal, usedAt: new Date(), status: 'used' as const } : deal
      )
    );

    // TODO: Add IPC handler for marking deal as used
    // if (typeof window !== 'undefined' && 'electronAPI' in window) {
    //   await (window as any).electronAPI.markDealAsUsed(dealId);
    // }
  }, []);

  /**
   * Dismiss a deal
   */
  const dismiss = useCallback(async (dealId: string) => {
    // Optimistically update local state
    setRawDeals((prev) =>
      prev.map((deal) =>
        deal.id === dealId
          ? { ...deal, dismissedAt: new Date(), status: 'dismissed' as const }
          : deal
      )
    );

    // TODO: Add IPC handler for dismissing deals
    // if (typeof window !== 'undefined' && 'electronAPI' in window) {
    //   await (window as any).electronAPI.dismissDeal(dealId);
    // }
  }, []);

  /**
   * Copy promo code to clipboard
   */
  const copyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code);
  }, []);

  // Fetch on mount if autoFetch is enabled
  useEffect(() => {
    if (autoFetch) {
      fetchDeals();
    }
  }, [autoFetch, fetchDeals]);

  // Compute derived state
  const filteredDeals = useMemo(() => {
    let deals = rawDeals;

    if (initialFilters) {
      deals = filterDeals(deals, initialFilters);
    }

    return sortDeals(deals, sortBy);
  }, [rawDeals, initialFilters, sortBy]);

  const { active: activeDeals, expired: expiredDeals } = useMemo(
    () => groupDealsByStatus(filteredDeals),
    [filteredDeals]
  );

  const categories = useMemo(() => extractCategories(rawDeals), [rawDeals]);
  const brands = useMemo(() => extractBrands(rawDeals), [rawDeals]);

  return {
    // State
    deals: filteredDeals,
    activeDeals,
    expiredDeals,
    categories,
    brands,
    isLoading,
    error,
    totalCount: rawDeals.length,
    activeCount: activeDeals.length,
    expiredCount: expiredDeals.length,

    // Actions
    refresh: fetchDeals,
    markAsUsed,
    dismiss,
    copyCode,
  };
}

/**
 * Mock deals data for development/preview
 */
function getMockDeals(): DealData[] {
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return [
    {
      id: 'deal-1',
      title: '50% Off Electronics',
      brand: 'Amazon',
      description: 'Save big on electronics today only!',
      code: 'SAVE50',
      value: '50',
      valueType: 'percentage',
      expiry: in3Days,
      isActive: true,
      status: 'active',
      category: 'Electronics',
      minimumPurchase: '$100',
      createdAt: now,
      emailId: 'email-1',
    },
    {
      id: 'deal-2',
      title: 'Free Shipping on Orders $50+',
      brand: 'Target',
      code: 'FREESHIP',
      expiry: in14Days,
      isActive: true,
      status: 'active',
      category: 'General',
      minimumPurchase: '$50',
      createdAt: now,
      emailId: 'email-2',
    },
    {
      id: 'deal-3',
      title: '$20 Off Your Order',
      brand: 'Best Buy',
      code: 'SAVE20',
      value: '20',
      valueType: 'fixed_amount',
      expiry: in7Days,
      isActive: true,
      status: 'active',
      category: 'Electronics',
      minimumPurchase: '$100',
      createdAt: now,
      emailId: 'email-3',
    },
    {
      id: 'deal-4',
      title: '30% Off Fashion Items',
      brand: 'Nordstrom',
      code: 'FASHION30',
      value: '30',
      valueType: 'percentage',
      expiry: in30Days,
      isActive: true,
      status: 'active',
      category: 'Fashion',
      createdAt: now,
      emailId: 'email-4',
    },
    {
      id: 'deal-5',
      title: 'Free Month Apple Music',
      brand: 'Apple',
      code: 'APPLEMUSIC',
      expiry: in7Days,
      isActive: true,
      status: 'active',
      category: 'Entertainment',
      createdAt: now,
      emailId: 'email-5',
    },
    {
      id: 'deal-6',
      title: 'BOGO Pizza Special',
      brand: 'Dominos',
      code: 'BOGO2024',
      expiry: yesterday,
      isActive: false,
      status: 'expired',
      category: 'Food',
      createdAt: lastWeek,
      emailId: 'email-6',
    },
    {
      id: 'deal-7',
      title: 'Flash Sale - 40% Off',
      brand: 'Walmart',
      code: 'FLASH40',
      value: '40',
      valueType: 'percentage',
      expiry: lastWeek,
      isActive: false,
      status: 'expired',
      category: 'General',
      createdAt: lastWeek,
      emailId: 'email-7',
    },
    {
      id: 'deal-8',
      title: 'Member Exclusive: $50 Off',
      brand: 'Costco',
      code: 'MEMBER50',
      value: '50',
      valueType: 'fixed_amount',
      expiry: in30Days,
      isActive: true,
      status: 'active',
      category: 'General',
      minimumPurchase: '$200',
      createdAt: now,
      emailId: 'email-8',
    },
    {
      id: 'deal-9',
      title: 'New User: 25% Off First Order',
      brand: 'Uber Eats',
      code: 'NEWUSER25',
      value: '25',
      valueType: 'percentage',
      expiry: in14Days,
      isActive: true,
      status: 'active',
      category: 'Food',
      createdAt: now,
      emailId: 'email-9',
    },
    {
      id: 'deal-10',
      title: 'Travel Deal: $100 Off Flights',
      brand: 'Expedia',
      code: 'FLY100',
      value: '100',
      valueType: 'fixed_amount',
      expiry: in30Days,
      isActive: true,
      status: 'active',
      category: 'Travel',
      minimumPurchase: '$500',
      createdAt: now,
      emailId: 'email-10',
    },
  ];
}

export default useDeals;
