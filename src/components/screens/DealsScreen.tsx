import type { ReactNode, MouseEvent } from 'react';
import { useState, useMemo, useCallback } from 'react';
import { Card } from '../ui';
import {
  type DealData,
  type DealValueType,
  type DealsFilterOptions,
  filterDeals,
  sortDeals,
  extractCategories,
  extractBrands,
  groupDealsByStatus,
  isDealExpiringSoon,
  formatExpiryDate,
  formatDealValue,
} from '../../../database/deals';
import { useDeals } from '../../hooks/useDeals';

// Re-export DealData for external use
export type { DealData, DealValueType } from '../../../database/deals';

// ============================================================================
// Category Color Mapping
// ============================================================================

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Electronics: { bg: '#EEF5F6', text: '#0F848A' },
  Shopping: { bg: '#FFF4E5', text: '#7A4A00' },
  Travel: { bg: '#E3F2FD', text: '#1565C0' },
  Health: { bg: '#FFEBEE', text: '#C62828' },
  Social: { bg: '#F3E5F5', text: '#7B1FA2' },
  Education: { bg: '#E8F5E9', text: '#2E7D32' },
  Projects: { bg: '#EDE7F6', text: '#512DA8' },
  Technology: { bg: '#E0F7FA', text: '#00838F' },
  Entertainment: { bg: '#FCE4EC', text: '#C2185B' },
  Personal: { bg: '#FFFDE7', text: '#F9A825' },
  Food: { bg: '#FFF3E0', text: '#E65100' },
  General: { bg: '#F5F5F5', text: '#616161' },
};

function getCategoryColor(category: string | undefined): { bg: string; text: string } {
  if (!category) return CATEGORY_COLORS.General;
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.General;
}

// ============================================================================
// Toast Notification (Simple Implementation)
// ============================================================================

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

function useToast() {
  const [toast, setToast] = useState<ToastState>({
    message: '',
    type: 'info',
    visible: false,
  });

  const showToast = useCallback((message: string, type: ToastState['type'] = 'info') => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3000);
  }, []);

  return { toast, showToast };
}

// ============================================================================
// DealCard Component
// ============================================================================

export interface DealCardProps {
  data: DealData;
  onCopyCode?: (code: string) => void;
  onClick?: () => void;
  onMarkUsed?: (dealId: string) => void;
  onDismiss?: (dealId: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * DealCard component matching TuskerBrain design system.
 * Based on Component/DealCard (r11J1) in design-system.pen
 */
export function DealCard({
  data,
  onCopyCode,
  onClick,
  onMarkUsed,
  onDismiss,
  showToast,
}: DealCardProps): ReactNode {
  const isExpired = data.status === 'expired';
  const isUsed = data.status === 'used';
  const isDismissed = data.status === 'dismissed';
  const isExpiringSoon = isDealExpiringSoon(data.expiry);
  const categoryColor = getCategoryColor(data.category);

  const handleCopyCode = (e: MouseEvent) => {
    e.stopPropagation();
    if (data.code) {
      navigator.clipboard.writeText(data.code);
      onCopyCode?.(data.code);
      showToast?.(`Code "${data.code}" copied to clipboard`, 'success');
    }
  };

  const handleMarkUsed = (e: MouseEvent) => {
    e.stopPropagation();
    onMarkUsed?.(data.id);
    showToast?.('Deal marked as used', 'success');
  };

  const handleDismiss = (e: MouseEvent) => {
    e.stopPropagation();
    onDismiss?.(data.id);
    showToast?.('Deal dismissed', 'info');
  };

  const handleOpenLink = (e: MouseEvent) => {
    e.stopPropagation();
    if (data.link) {
      window.open(data.link, '_blank', 'noopener,noreferrer');
    }
  };

  // Don't render dismissed deals
  if (isDismissed) return null;

  return (
    <Card
      className={`cursor-pointer hover:shadow-lg transition-all duration-200 ${
        isExpired || isUsed ? 'opacity-50 grayscale-[0.5]' : ''
      }`}
      hover
      padding="lg"
      onClick={onClick}
      style={{
        borderRadius: '14px',
        padding: '18px',
        boxShadow: isExpired || isUsed ? undefined : '0 4px 12px rgba(3, 31, 32, 0.06)',
      }}
    >
      {/* Header - Deal Title and Brand Badge */}
      <div className="flex items-start justify-between mb-3">
        <h4
          className="font-display font-semibold text-[15px] text-text-primary leading-snug"
          style={{
            fontFamily: 'Manrope, sans-serif',
            fontWeight: 600,
            color: '#031f20',
            maxWidth: '160px',
          }}
        >
          {data.title}
        </h4>
        <div className="flex items-center gap-1.5">
          {isUsed && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#E8F5E9', color: '#2E7D32' }}
            >
              Used
            </span>
          )}
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
      </div>

      {/* Category Badge */}
      {data.category && (
        <div className="mb-2">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              backgroundColor: categoryColor.bg,
              color: categoryColor.text,
            }}
          >
            {data.category}
          </span>
        </div>
      )}

      {/* Deal Value (if present) */}
      {data.value && (
        <div className="mb-2">
          <span className="text-sm font-semibold" style={{ color: '#0f848a' }}>
            {formatDealValue(data.value, data.valueType)}
          </span>
        </div>
      )}

      {/* Promo Code Button or Auto-applied pill */}
      {data.code ? (
        <button
          onClick={handleCopyCode}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg mb-3 transition-colors"
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
      ) : (
        <div
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg mb-3"
          style={{ backgroundColor: '#F5F5F5' }}
        >
          <svg className="w-4 h-4" style={{ color: '#616161' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs font-medium" style={{ color: '#616161' }}>
            Auto-applied at checkout
          </span>
        </div>
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
        <div className="flex items-center gap-1.5 mb-3">
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

      {/* Action Buttons */}
      {!isUsed && !isExpired && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          {data.link && (
            <button
              onClick={handleOpenLink}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-gray-100"
              style={{ color: '#052C2E' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              Open
            </button>
          )}
          <button
            onClick={handleMarkUsed}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-green-50"
            style={{ color: '#2E7D32' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Used
          </button>
          <button
            onClick={handleDismiss}
            className="flex items-center justify-center p-1.5 rounded-md text-xs transition-colors hover:bg-gray-100"
            style={{ color: '#849B9F' }}
            title="Dismiss deal"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// Toast Component
// ============================================================================

function Toast({ toast }: { toast: ToastState }) {
  if (!toast.visible) return null;

  const bgColor =
    toast.type === 'success' ? '#E8F5E9' : toast.type === 'error' ? '#FFEBEE' : '#E3F2FD';
  const textColor =
    toast.type === 'success' ? '#2E7D32' : toast.type === 'error' ? '#C62828' : '#1565C0';

  return (
    <div
      className="fixed bottom-6 right-6 z-50 animate-slide-up"
      style={{
        backgroundColor: bgColor,
        color: textColor,
        padding: '12px 20px',
        borderRadius: '10px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        fontWeight: 500,
      }}
    >
      {toast.message}
    </div>
  );
}

// ============================================================================
// DealsScreen Component
// ============================================================================

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

type StatusFilter = 'all' | 'active' | 'expired' | 'used';

/**
 * DealsScreen displays a grid of deal cards with Active and Expired sections.
 * Matches the design specification from docs/design-system.pen (App Shell - Deals).
 */
export function DealsScreen({
  deals: externalDeals,
  onDealClick,
  onCopyCode,
  isLoading: externalLoading,
  useHook = true,
}: DealsScreenProps): ReactNode {
  const { toast, showToast } = useToast();

  // Use hook for internal data fetching, or external data if provided
  const dealsHook = useDeals({ autoFetch: useHook && !externalDeals });

  const deals = externalDeals ?? dealsHook.deals;
  const isLoading = externalLoading ?? dealsHook.isLoading;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');

  // Extract unique categories and brands for filter dropdowns
  const categories = useMemo(() => ['all', ...extractCategories(deals)], [deals]);
  const brands = useMemo(() => ['all', ...extractBrands(deals)], [deals]);

  // Filter and categorize deals using database utilities
  const { activeDeals, expiredDeals, usedDeals } = useMemo(() => {
    const filterOptions: DealsFilterOptions = {
      status: statusFilter === 'all' || statusFilter === 'used' ? 'all' : statusFilter,
      category: categoryFilter,
      excludeDismissed: true,
      excludeUsed: statusFilter !== 'used' && statusFilter !== 'all',
    };

    // Apply brand filter
    let filtered = filterDeals(deals, filterOptions);
    if (brandFilter !== 'all') {
      filtered = filtered.filter((d) => d.brand === brandFilter);
    }

    const sorted = sortDeals(filtered, 'expiry_asc');
    const grouped = groupDealsByStatus(sorted);

    return {
      activeDeals: grouped.active,
      expiredDeals: grouped.expired,
      usedDeals: grouped.used,
    };
  }, [deals, statusFilter, categoryFilter, brandFilter]);

  // Handle copy code
  const handleCopyCode = (code: string) => {
    if (onCopyCode) {
      onCopyCode(code);
    } else {
      dealsHook.copyCode(code);
    }
  };

  // Handle mark as used
  const handleMarkUsed = async (dealId: string) => {
    try {
      await dealsHook.markAsUsed(dealId);
    } catch (error) {
      showToast('Failed to mark deal as used', 'error');
    }
  };

  // Handle dismiss
  const handleDismiss = async (dealId: string) => {
    try {
      await dealsHook.dismiss(dealId);
    } catch (error) {
      showToast('Failed to dismiss deal', 'error');
    }
  };

  // Refresh deals
  const handleRefresh = () => {
    dealsHook.refresh();
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <Card key={i} className="animate-pulse" style={{ height: '220px', borderRadius: '14px' }}>
            <div className="h-5 bg-surface-muted rounded w-3/4 mb-4" />
            <div className="h-4 bg-surface-muted rounded w-1/2 mb-4" />
            <div className="h-12 bg-surface-muted rounded w-full mb-4" />
            <div className="h-4 bg-surface-muted rounded w-1/2" />
          </Card>
        ))}
      </div>
    );
  }

  const hasDeals = activeDeals.length > 0 || expiredDeals.length > 0 || usedDeals.length > 0;

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
          {brandFilter !== 'all'
            ? `No deals from "${brandFilter}".`
            : categoryFilter !== 'all'
            ? `No deals in "${categoryFilter}" category.`
            : statusFilter === 'expired'
            ? 'No expired deals.'
            : statusFilter === 'used'
            ? 'No used deals.'
            : 'Deals from promotional emails will appear here.'}
        </p>
      </div>
    );
  }

  const showActiveSection = statusFilter === 'all' || statusFilter === 'active';
  const showExpiredSection = statusFilter === 'all' || statusFilter === 'expired';
  const showUsedSection = statusFilter === 'all' || statusFilter === 'used';

  return (
    <>
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
                <option value="used">Used</option>
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

            {/* Brand Filter Dropdown */}
            <div className="relative">
              <select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="appearance-none flex items-center gap-2 px-2.5 py-2 pr-8 rounded-lg text-[13px] font-medium cursor-pointer transition-colors hover:bg-gray-50 min-w-[100px]"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 500,
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #D2E0E5',
                  color: '#052C2E',
                }}
              >
                <option value="all">All Brands</option>
                {brands.slice(1).map((brand) => (
                  <option key={brand} value={brand}>
                    {brand}
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

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg transition-colors hover:bg-gray-100"
              title="Refresh deals"
            >
              <svg
                className="w-5 h-5"
                style={{ color: '#849B9F' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
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
                  onMarkUsed={handleMarkUsed}
                  onDismiss={handleDismiss}
                  showToast={showToast}
                />
              ))}
            </div>
          </div>
        )}

        {/* Used Deals Section */}
        {showUsedSection && usedDeals.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2
              className="font-display text-lg font-bold"
              style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, color: '#031F20' }}
            >
              Used Deals
              <span className="ml-2 text-sm font-normal text-text-secondary">
                ({usedDeals.length})
              </span>
            </h2>
            <div className="grid grid-cols-5 gap-4">
              {usedDeals.map((deal) => (
                <DealCard
                  key={deal.id}
                  data={deal}
                  onClick={() => onDealClick?.(deal)}
                  onCopyCode={handleCopyCode}
                  showToast={showToast}
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
                  showToast={showToast}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      <Toast toast={toast} />
    </>
  );
}
