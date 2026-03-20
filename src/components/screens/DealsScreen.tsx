import type { ReactNode, MouseEvent } from 'react';
import { useState, useMemo } from 'react';
import { Card } from '../ui';
import {
  type DealData,
  type DealValueType,
  type DealsFilterOptions,
  filterDeals,
  sortDeals,
  extractCategories,
  groupDealsByStatus,
  isDealExpiringSoon,
  formatExpiryDate,
  formatDealValue,
} from '../../../database/deals';
import { useDeals } from '../../hooks/useDeals';

// Re-export DealData for external use
export type { DealData, DealValueType } from '../../../database/deals';

export interface DealCardProps {
  data: DealData;
  onCopyCode?: (code: string) => void;
  onClick?: () => void;
}

/**
 * DealCard component matching TuskerBrain design system.
 * Based on Component/DealCard (r11J1) in design-system.pen
 */
export function DealCard({ data, onCopyCode, onClick }: DealCardProps): ReactNode {
  const isExpired = data.status === 'expired';
  const isExpiringSoon = isDealExpiringSoon(data.expiry);

  const handleCopyCode = (e: MouseEvent) => {
    e.stopPropagation();
    if (data.code) {
      navigator.clipboard.writeText(data.code);
      onCopyCode?.(data.code);
    }
  };

  return (
    <Card
      className={`cursor-pointer hover:shadow-lg transition-all duration-200 ${
        isExpired ? 'opacity-50 grayscale-[0.5]' : ''
      }`}
      hover
      padding="lg"
      onClick={onClick}
      style={{
        borderRadius: '14px',
        padding: '18px',
        boxShadow: isExpired ? undefined : '0 4px 12px rgba(3, 31, 32, 0.06)',
      }}
    >
      {/* Header - Deal Title and Brand Badge */}
      <div className="flex items-start justify-between mb-3.5">
        <h4
          className="font-display font-semibold text-[15px] text-text-primary leading-snug"
          style={{
            fontFamily: 'Manrope, sans-serif',
            fontWeight: 600,
            color: '#031f20',
            maxWidth: '180px',
          }}
        >
          {data.title}
        </h4>
        <span
          className="text-[10px] font-semibold px-2 py-1 rounded-md"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            backgroundColor: '#FFF4E5',
            color: '#7A4A00',
          }}
        >
          {data.brand}
        </span>
      </div>

      {/* Deal Value (if present) */}
      {data.value && (
        <div className="mb-3">
          <span className="text-sm font-semibold" style={{ color: '#0f848a' }}>
            {formatDealValue(data.value, data.valueType)}
          </span>
        </div>
      )}

      {/* Promo Code Button */}
      {data.code && (
        <button
          onClick={handleCopyCode}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg mb-3.5 transition-colors"
          style={{
            backgroundColor: '#e8fcfd',
            border: '1px solid #a3f1f5',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#d0f8f9';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#e8fcfd';
          }}
        >
          <span
            className="font-mono font-semibold text-[14px]"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 600,
              color: '#0a585c',
            }}
          >
            {data.code}
          </span>
          <svg
            className="w-[14px] h-[14px]"
            style={{ color: '#0f848a' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </button>
      )}

      {/* Minimum Purchase (if present) */}
      {data.minimumPurchase && (
        <div className="mb-2">
          <span className="text-xs" style={{ color: '#849B9F' }}>
            Min. purchase: {data.minimumPurchase}
          </span>
        </div>
      )}

      {/* Expiry Info */}
      {data.expiry && (
        <div className="flex items-center gap-1.5">
          <svg
            className={`w-[14px] h-[14px] ${isExpiringSoon ? 'text-red-500' : 'text-text-muted'}`}
            style={{ color: isExpiringSoon ? '#ef4444' : '#7c748b' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span
            className="text-[12px]"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: isExpiringSoon ? 500 : 400,
              color: isExpiringSoon ? '#ef4444' : '#4a4653',
            }}
          >
            {isExpired ? 'Expired' : formatExpiryDate(data.expiry)}
          </span>
        </div>
      )}
    </Card>
  );
}

export interface DealsScreenProps {
  /** External deals data (if provided, hook is not used) */
  deals?: DealData[];
  /** Callback when a deal is clicked */
  onDealClick?: (deal: DealData) => void;
  /** Callback when a code is copied */
  onCopyCode?: (code: string) => void;
  /** Loading state override */
  isLoading?: boolean;
  /** Use the useDeals hook internally (default: true) */
  useHook?: boolean;
}

type StatusFilter = 'all' | 'active' | 'expired';

/**
 * DealsScreen displays a grid of deal cards with Active and Expired sections.
 * Matches the design specification from docs/design-system.pen (App Shell - Deals).
 *
 * Can operate in two modes:
 * 1. With useHook=true (default): Fetches data internally using useDeals hook
 * 2. With deals prop: Uses externally provided data (for testing/controlled usage)
 */
export function DealsScreen({
  deals: externalDeals,
  onDealClick,
  onCopyCode,
  isLoading: externalLoading,
  useHook = true,
}: DealsScreenProps): ReactNode {
  // Use hook for internal data fetching, or external data if provided
  const dealsHook = useDeals({ autoFetch: useHook && !externalDeals });

  const deals = externalDeals ?? dealsHook.deals;
  const isLoading = externalLoading ?? dealsHook.isLoading;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Extract unique categories for filter dropdown
  const categories = useMemo(() => {
    return ['all', ...extractCategories(deals)];
  }, [deals]);

  // Filter and categorize deals using database utilities
  const { activeDeals, expiredDeals } = useMemo(() => {
    const filterOptions: DealsFilterOptions = {
      status: statusFilter === 'all' ? 'all' : statusFilter,
      category: categoryFilter,
      excludeDismissed: true,
      excludeUsed: true,
    };

    const filtered = filterDeals(deals, filterOptions);
    const sorted = sortDeals(filtered, 'expiry_asc');
    const grouped = groupDealsByStatus(sorted);

    return {
      activeDeals: grouped.active,
      expiredDeals: grouped.expired,
    };
  }, [deals, statusFilter, categoryFilter]);

  // Handle copy code with optional callback
  const handleCopyCode = (code: string) => {
    if (onCopyCode) {
      onCopyCode(code);
    } else {
      dealsHook.copyCode(code);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <Card key={i} className="animate-pulse" style={{ height: '180px', borderRadius: '14px' }}>
            <div className="h-5 bg-surface-muted rounded w-3/4 mb-4" />
            <div className="h-12 bg-surface-muted rounded w-full mb-4" />
            <div className="h-4 bg-surface-muted rounded w-1/2" />
          </Card>
        ))}
      </div>
    );
  }

  const hasDeals = activeDeals.length > 0 || expiredDeals.length > 0;

  if (!hasDeals) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <svg
          className="w-16 h-16 mb-4"
          style={{ color: '#D2E0E5' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
        <p
          className="text-lg font-semibold mb-2"
          style={{ fontFamily: 'Manrope, sans-serif', color: '#031f20' }}
        >
          No deals found
        </p>
        <p className="text-sm text-text-secondary">
          {categoryFilter !== 'all'
            ? `No deals in "${categoryFilter}" category.`
            : statusFilter === 'expired'
            ? 'No expired deals yet.'
            : 'Deals from promotional emails will appear here.'}
        </p>
      </div>
    );
  }

  const showActiveSection = statusFilter === 'all' || statusFilter === 'active';
  const showExpiredSection = statusFilter === 'all' || statusFilter === 'expired';

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1
          className="font-display text-2xl font-bold"
          style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, color: '#031f20' }}
        >
          Deals
        </h1>
        <div className="flex items-center gap-3">
          {/* Status Filter Dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="appearance-none flex items-center gap-2 px-2.5 py-2 pr-8 rounded-lg text-[13px] font-medium cursor-pointer transition-colors hover:bg-gray-50"
              style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                backgroundColor: '#FFFFFF',
                border: '1px solid #D2E0E5',
                color: '#052C2E',
              }}
            >
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="all">All Deals</option>
            </select>
            <svg
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: '#849B9F' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Category Filter Dropdown */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="appearance-none flex items-center gap-2 px-2.5 py-2 pr-8 rounded-lg text-[13px] font-medium cursor-pointer transition-colors hover:bg-gray-50 min-w-[120px]"
              style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
                backgroundColor: '#FFFFFF',
                border: '1px solid #D2E0E5',
                color: '#052C2E',
              }}
            >
              <option value="all">All Categories</option>
              {categories.slice(1).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <svg
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: '#849B9F' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Active Deals Section */}
      {showActiveSection && activeDeals.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2
            className="font-display text-lg font-bold"
            style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, color: '#031F20' }}
          >
            Active Deals
            <span className="ml-2 text-sm font-normal text-text-secondary">
              ({activeDeals.length})
            </span>
          </h2>
          <div className="grid grid-cols-5 gap-4">
            {activeDeals.map((deal) => (
              <DealCard
                key={deal.id}
                data={deal}
                onClick={() => onDealClick?.(deal)}
                onCopyCode={handleCopyCode}
              />
            ))}
          </div>
        </div>
      )}

      {/* Expired Deals Section */}
      {showExpiredSection && expiredDeals.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2
            className="font-display text-lg font-bold"
            style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, color: '#031F20' }}
          >
            Expired Deals
            <span className="ml-2 text-sm font-normal text-text-secondary">
              ({expiredDeals.length})
            </span>
          </h2>
          <div className="grid grid-cols-5 gap-4">
            {expiredDeals.map((deal) => (
              <DealCard
                key={deal.id}
                data={deal}
                onClick={() => onDealClick?.(deal)}
                onCopyCode={handleCopyCode}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
