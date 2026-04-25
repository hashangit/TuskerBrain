import type { ReactNode, MouseEvent } from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card } from '../ui';
import {
  type DealData,
  sortDeals,
  extractCategories,
  extractBrands,
  groupDealsByStatus,
  isDealExpiringSoon,
  formatExpiryDate,
  formatDealValue,
} from '../../hooks/dealData';
import { useDeals } from '../../hooks/useDeals';

// Re-export DealData for external use
export type { DealData, DealValueType } from '../../hooks/dealData';

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
  Banking: { bg: '#E8F5E9', text: '#1B5E20' },
};

function getCategoryColor(category: string | undefined): { bg: string; text: string } {
  if (!category) return CATEGORY_COLORS.General;
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.General;
}

// ============================================================================
// Toast Notification
// ============================================================================

interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
  undoAction?: () => void;
  undoLabel?: string;
}

function useToast() {
  const [toast, setToast] = useState<ToastState>({
    message: '',
    type: 'info',
    visible: false,
  });

  const showToast = useCallback((
    message: string,
    type: ToastState['type'] = 'info',
    undoAction?: () => void,
    undoLabel?: string
  ) => {
    setToast({ message, type, visible: true, undoAction, undoLabel });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false, undoAction: undefined }));
    }, 5000);
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
  onUnmarkUsed?: (dealId: string) => void;
  onDismiss?: (dealId: string) => void;
  onRestore?: (dealId: string) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  /** Show in dismissed mode (compact, with restore option) */
  dismissedMode?: boolean;
}

/**
 * DealCard component matching TuskerBrain design system.
 */
export function DealCard({
  data,
  onCopyCode,
  onClick,
  onMarkUsed,
  onUnmarkUsed,
  onDismiss,
  onRestore,
  showToast,
  dismissedMode = false,
}: DealCardProps): ReactNode {
  const isExpired = data.status === 'expired';
  const isUsed = data.status === 'used';
  const isDismissed = data.status === 'dismissed';
  const isExpiringSoon = isDealExpiringSoon(data.expiry);
  const categoryColor = getCategoryColor(data.category);

  // Check if deal can be restored (dismissed and not expired)
  const canRestore = isDismissed && !isExpired;

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
    console.log('[DealCard] handleMarkUsed called for deal:', data.id, data.title);
    console.log('[DealCard] onMarkUsed is:', onMarkUsed ? 'defined' : 'undefined');
    onMarkUsed?.(data.id);
  };

  const handleUnmarkUsed = (e: MouseEvent) => {
    e.stopPropagation();
    console.log('[DealCard] handleUnmarkUsed called for deal:', data.id, data.title);
    console.log('[DealCard] onUnmarkUsed is:', onUnmarkUsed ? 'defined' : 'undefined');
    onUnmarkUsed?.(data.id);
  };

  const handleDismiss = (e: MouseEvent) => {
    e.stopPropagation();
    console.log('[DealCard] handleDismiss called for deal:', data.id, data.title);
    console.log('[DealCard] onDismiss is:', onDismiss ? 'defined' : 'undefined');
    onDismiss?.(data.id);
  };

  const handleRestore = (e: MouseEvent) => {
    e.stopPropagation();
    console.log('[DealCard] handleRestore called for deal:', data.id, data.title);
    console.log('[DealCard] onRestore is:', onRestore ? 'defined' : 'undefined');
    onRestore?.(data.id);
  };

  const handleOpenLink = (e: MouseEvent) => {
    e.stopPropagation();
    if (data.link) {
      window.open(data.link, '_blank', 'noopener,noreferrer');
    }
  };

  // Dismissed mode - compact card with restore option
  if (dismissedMode) {
    return (
      <Card
        className="cursor-pointer hover:shadow-md transition-all duration-200"
        hover
        padding="sm"
        onClick={onClick}
        style={{
          borderRadius: '10px',
          padding: '12px',
          opacity: 0.7,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h4
              className="font-semibold text-[13px] truncate"
              style={{ fontFamily: 'Manrope, sans-serif', color: '#031f20' }}
            >
              {data.title}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: '#FFF4E5', color: '#7A4A00' }}
              >
                {data.brand}
              </span>
              {isExpired && (
                <span className="text-[10px] text-red-500">Expired</span>
              )}
            </div>
          </div>
          {canRestore && (
            <button
              onClick={handleRestore}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-green-50"
              style={{ color: '#2E7D32' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Restore
            </button>
          )}
        </div>
      </Card>
    );
  }

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
          {isExpired && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: '#FFEBEE', color: '#C62828' }}
            >
              Expired
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

      {/* Action Buttons - Different based on status */}
      {isUsed ? (
        /* Used Deal - Only show Unmark button */
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={handleUnmarkUsed}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-gray-100"
            style={{ color: '#052C2E' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
            Unmark Used
          </button>
        </div>
      ) : (
        /* Active or Expired Deal */
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
            Mark As Used
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

  const handleUndo = () => {
    toast.undoAction?.();
  };

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
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      {toast.message}
      {toast.undoAction && (
        <button
          onClick={handleUndo}
          style={{
            background: 'none',
            border: 'none',
            color: textColor,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
            padding: 0,
          }}
        >
          {toast.undoLabel || 'Undo'}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// CollapsibleSection Component
// ============================================================================

interface CollapsibleSectionProps {
  title: string;
  count: number;
  children: ReactNode;
  defaultCollapsed?: boolean;
  badgeColor?: string;
}

function CollapsibleSection({
  title,
  count,
  children,
  defaultCollapsed = false,
  badgeColor,
}: CollapsibleSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-2 text-left"
      >
        <svg
          className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
          style={{ color: '#849B9F' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <h2
          className="font-display text-lg font-bold"
          style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 700, color: '#031F20' }}
        >
          {title}
          <span
            className="ml-2 text-sm font-normal px-2 py-0.5 rounded"
            style={{
              backgroundColor: badgeColor || '#F5F5F5',
              color: badgeColor ? '#fff' : '#616161',
            }}
          >
            ({count})
          </span>
        </h2>
      </button>
      {!isCollapsed && children}
    </div>
  );
}

// ============================================================================
// DealsScreen Component
// ============================================================================

export interface DealsScreenProps {
  /** External deals data - makes this a controlled component */
  deals?: DealData[];
  /** Callback when a deal is clicked */
  onDealClick?: (deal: DealData) => void;
  /** Callback when a code is copied */
  onCopyCode?: (code: string) => void;
  /** Loading state override */
  isLoading?: boolean;
  /**
   * Mutation handlers - REQUIRED when `deals` prop is provided (controlled mode)
   * In controlled mode, the parent owns state and must handle these mutations
   */
  onMarkUsed?: (dealId: string) => Promise<void>;
  onUnmarkUsed?: (dealId: string) => Promise<void>;
  onDismiss?: (dealId: string) => Promise<void>;
  onRestore?: (dealId: string) => Promise<void>;
}

type StatusFilter = 'all' | 'active' | 'expired' | 'used' | 'dismissed';

/**
 * DealsScreen displays a grid of deal cards with Active, Used, Expired, and Dismissed sections.
 *
 * ARCHITECTURE: Controlled vs Uncontrolled Component Pattern
 *
 * - CONTROLLED MODE (externalDeals provided):
 *   Parent owns state, MUST provide mutation handlers (onMarkUsed, onDismiss, etc.)
 *   Component is purely presentational, calls parent handlers for mutations
 *
 * - UNCONTROLLED MODE (no externalDeals):
 *   Component uses internal useDeals hook for both data AND mutations
 *   Self-contained, manages its own state
 */
export function DealsScreen({
  deals: externalDeals,
  onDealClick,
  onCopyCode,
  isLoading: externalLoading,
  onMarkUsed,
  onUnmarkUsed,
  onDismiss,
  onRestore,
}: DealsScreenProps): ReactNode {
  const { toast, showToast } = useToast();

  // Determine component mode
  const isControlled = externalDeals !== undefined;

  // Only use hook in uncontrolled mode
  const dealsHook = useDeals({ autoFetch: !isControlled });

  // In controlled mode, use external deals; in uncontrolled mode, use hook's deals
  const deals = isControlled ? externalDeals : dealsHook.deals;
  const isLoading = externalLoading ?? dealsHook.isLoading;

  // Debug logging
  useEffect(() => {
    console.log('[DealsScreen] Mode:', isControlled ? 'CONTROLLED' : 'UNCONTROLLED');
    console.log('[DealsScreen] Deals count:', deals.length);
  }, [isControlled, deals.length]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');

  // Extract unique categories and brands for filter dropdowns
  const categories = useMemo(() => ['all', ...extractCategories(deals)], [deals]);
  const brands = useMemo(() => ['all', ...extractBrands(deals)], [deals]);

  // First, group ALL deals by status (without status filtering)
  // This ensures used/dismissed deals are always available in their respective groups
  const { activeDeals, expiredDeals, usedDeals, dismissedDeals } = useMemo(() => {
    console.log('[DealsScreen] Grouping deals, total deals:', deals.length);
    console.log('[DealsScreen] Deals input:', deals.map(d => ({
      id: d.id.slice(0,8),
      title: d.title.slice(0,20),
      status: d.status,
      usedAt: d.usedAt,
      dismissedAt: d.dismissedAt
    })));

    // Apply category and brand filters, but NOT status filter
    // We need all statuses to properly group them
    let filtered = [...deals];

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((d) => d.category === categoryFilter);
    }

    // Brand filter
    if (brandFilter !== 'all') {
      filtered = filtered.filter((d) => d.brand === brandFilter);
    }

    const sorted = sortDeals(filtered, 'expiry_asc');
    const grouped = groupDealsByStatus(sorted);

    console.log('[DealsScreen] Grouped results:', {
      active: grouped.active.length,
      expired: grouped.expired.length,
      used: grouped.used.length,
      dismissed: grouped.dismissed.length,
      usedDealIds: grouped.used.map(d => d.id.slice(0,8)),
      dismissedDealIds: grouped.dismissed.map(d => d.id.slice(0,8)),
    });

    return {
      activeDeals: grouped.active,
      expiredDeals: grouped.expired,
      usedDeals: grouped.used,
      dismissedDeals: grouped.dismissed,
    };
  }, [deals, categoryFilter, brandFilter]);

  // Debug: Track grouped deals changes
  useEffect(() => {
    console.log('[DealsScreen] Grouped deals updated:', {
      active: activeDeals.length,
      used: usedDeals.length,
      expired: expiredDeals.length,
      dismissed: dismissedDeals.length,
      usedDealIds: usedDeals.map(d => d.id.slice(0, 8)),
    });
  }, [activeDeals, usedDeals, expiredDeals, dismissedDeals]);

  // Determine which sections to show based on filter
  const showActiveSection = statusFilter === 'all' || statusFilter === 'active';
  const showUsedSection = statusFilter === 'all' || statusFilter === 'used';
  const showExpiredSection = statusFilter === 'all' || statusFilter === 'expired';
  const showDismissedSection = statusFilter === 'all' || statusFilter === 'dismissed';

  const hasDeals = activeDeals.length > 0 || expiredDeals.length > 0 || usedDeals.length > 0 || dismissedDeals.length > 0;
  const hasActiveFilters = categoryFilter !== 'all' || brandFilter !== 'all';

  const handleClearFilters = () => {
    setCategoryFilter('all');
    setBrandFilter('all');
  };

  // Handle copy code - uses parent handler or hook method
  const handleCopyCode = (code: string) => {
    if (onCopyCode) {
      onCopyCode(code);
    } else {
      dealsHook.copyCode(code);
    }
  };

  // Handle mark as used - routes to parent handler (controlled) or hook (uncontrolled)
  const handleMarkUsed = async (dealId: string) => {
    console.log('[DealsScreen] handleMarkUsed called, mode:', isControlled ? 'CONTROLLED' : 'UNCONTROLLED');

    if (isControlled) {
      // Controlled mode: parent handles the mutation
      if (!onMarkUsed) {
        console.error('[DealsScreen] onMarkUsed handler not provided in controlled mode!');
        showToast('Error: Handler not configured', 'error');
        return;
      }
      try {
        await onMarkUsed(dealId);
        showToast('Deal marked as used', 'success');
      } catch (error) {
        console.error('[DealsScreen] handleMarkUsed error:', error);
        showToast('Failed to mark deal as used', 'error');
      }
    } else {
      // Uncontrolled mode: hook handles the mutation
      try {
        await dealsHook.markAsUsed(dealId);
        showToast(
          'Deal marked as used',
          'success',
          async () => {
            await dealsHook.undoMarkUsed(dealId);
            showToast('Deal restored', 'info');
          },
          'Undo'
        );
      } catch (error) {
        console.error('[DealsScreen] handleMarkUsed error:', error);
        showToast('Failed to mark deal as used', 'error');
      }
    }
  };

  // Handle unmark as used - routes to parent handler (controlled) or hook (uncontrolled)
  const handleUnmarkUsed = async (dealId: string) => {
    console.log('[DealsScreen] handleUnmarkUsed called, mode:', isControlled ? 'CONTROLLED' : 'UNCONTROLLED');

    if (isControlled) {
      if (!onUnmarkUsed) {
        console.error('[DealsScreen] onUnmarkUsed handler not provided in controlled mode!');
        showToast('Error: Handler not configured', 'error');
        return;
      }
      try {
        await onUnmarkUsed(dealId);
        showToast('Deal unmarked', 'info');
      } catch (error) {
        console.error('[DealsScreen] handleUnmarkUsed error:', error);
        showToast('Failed to unmark deal', 'error');
      }
    } else {
      try {
        await dealsHook.undoMarkUsed(dealId);
        showToast(
          'Deal unmarked',
          'info',
          async () => {
            await dealsHook.markAsUsed(dealId);
            showToast('Deal marked as used', 'success');
          },
          'Undo'
        );
      } catch (error) {
        console.error('[DealsScreen] handleUnmarkUsed error:', error);
        showToast('Failed to unmark deal', 'error');
      }
    }
  };

  // Handle dismiss - routes to parent handler (controlled) or hook (uncontrolled)
  const handleDismiss = async (dealId: string) => {
    console.log('[DealsScreen] handleDismiss called, mode:', isControlled ? 'CONTROLLED' : 'UNCONTROLLED');

    if (isControlled) {
      if (!onDismiss) {
        console.error('[DealsScreen] onDismiss handler not provided in controlled mode!');
        showToast('Error: Handler not configured', 'error');
        return;
      }
      try {
        await onDismiss(dealId);
        showToast('Deal dismissed', 'info');
      } catch (error) {
        console.error('[DealsScreen] handleDismiss error:', error);
        showToast('Failed to dismiss deal', 'error');
      }
    } else {
      try {
        await dealsHook.dismiss(dealId);
        showToast(
          'Deal dismissed',
          'info',
          async () => {
            await dealsHook.undoDismiss(dealId);
            showToast('Deal restored', 'info');
          },
          'Undo'
        );
      } catch (error) {
        console.error('[DealsScreen] handleDismiss error:', error);
        showToast('Failed to dismiss deal', 'error');
      }
    }
  };

  // Handle restore - routes to parent handler (controlled) or hook (uncontrolled)
  const handleRestore = async (dealId: string) => {
    console.log('[DealsScreen] handleRestore called, mode:', isControlled ? 'CONTROLLED' : 'UNCONTROLLED');

    if (isControlled) {
      if (!onRestore) {
        console.error('[DealsScreen] onRestore handler not provided in controlled mode!');
        showToast('Error: Handler not configured', 'error');
        return;
      }
      try {
        await onRestore(dealId);
        showToast('Deal restored to active', 'success');
      } catch (error) {
        console.error('[DealsScreen] handleRestore error:', error);
        showToast('Failed to restore deal', 'error');
      }
    } else {
      try {
        await dealsHook.undoDismiss(dealId);
        showToast('Deal restored to active', 'success');
      } catch (error) {
        console.error('[DealsScreen] handleRestore error:', error);
        showToast('Failed to restore deal', 'error');
      }
    }
  };

  // Refresh deals - only available in uncontrolled mode
  const handleRefresh = () => {
    if (!isControlled) {
      dealsHook.refresh();
    }
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

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* Header - Always visible */}
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
                <option value="used">Used</option>
                <option value="expired">Expired</option>
                <option value="dismissed">Dismissed</option>
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

        {/* Empty State */}
        {!hasDeals && (
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
            <p className="text-sm text-text-secondary mb-4">
              {brandFilter !== 'all'
                ? `No deals from "${brandFilter}".`
                : categoryFilter !== 'all'
                ? `No deals in "${categoryFilter}" category.`
                : statusFilter === 'expired'
                ? 'No expired deals.'
                : statusFilter === 'used'
                ? 'No used deals yet. Mark deals as used to see them here.'
                : statusFilter === 'dismissed'
                ? 'No dismissed deals.'
                : 'Deals from promotional emails will appear here.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100"
                style={{
                  backgroundColor: '#F5F5F5',
                  color: '#052C2E',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

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
                  onUnmarkUsed={handleUnmarkUsed}
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
                  onMarkUsed={handleMarkUsed}
                  onDismiss={handleDismiss}
                  showToast={showToast}
                />
              ))}
            </div>
          </div>
        )}

        {/* Dismissed Deals Section - Collapsed by default */}
        {showDismissedSection && dismissedDeals.length > 0 && (
          <CollapsibleSection
            title="Dismissed Deals"
            count={dismissedDeals.length}
            defaultCollapsed={true}
            badgeColor="#849B9F"
          >
            <div className="grid grid-cols-5 gap-4">
              {dismissedDeals.map((deal) => (
                <DealCard
                  key={deal.id}
                  data={deal}
                  dismissedMode={true}
                  onClick={() => onDealClick?.(deal)}
                  onRestore={handleRestore}
                  showToast={showToast}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>

      {/* Toast Notification */}
      <Toast toast={toast} />
    </>
  );
}
