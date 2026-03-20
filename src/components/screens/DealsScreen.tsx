import type { ReactNode } from 'react';
import { Card, Badge } from '../ui';

export interface DealData {
  id: string;
  title: string;
  brand: string;
  code?: string;
  expiry?: Date;
  isActive: boolean;
  category?: string;
}

export interface DealCardProps {
  data: DealData;
  onCopyCode?: (code: string) => void;
  onClick?: () => void;
}

/**
 * DealCard component matching TuskerBrain design system.
 */
export function DealCard({ data, onCopyCode, onClick }: DealCardProps): ReactNode {
  const isExpired = data.expiry && new Date(data.expiry) < new Date();
  const isExpiringSoon = data.expiry && !isExpired &&
    (new Date(data.expiry).getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000;

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.code) {
      navigator.clipboard.writeText(data.code);
      onCopyCode?.(data.code);
    }
  };

  return (
    <Card
      className={`cursor-pointer hover:border-border-muted ${isExpired ? 'opacity-50' : ''}`}
      hover
      padding="lg"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <h4 className="font-display font-semibold text-[15px] text-text-primary line-clamp-2 flex-1 pr-3">
          {data.title}
        </h4>
        <Badge color="orange">{data.brand}</Badge>
      </div>

      {/* Promo Code */}
      {data.code && (
        <button
          onClick={handleCopyCode}
          className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-brand-50 rounded-lg border border-brand-200 mb-4 hover:bg-brand-100 transition-colors"
        >
          <span className="font-mono font-semibold text-[14px] text-brand-700">
            {data.code}
          </span>
          <svg className="w-3.5 h-3.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      )}

      {/* Expiry */}
      {data.expiry && (
        <div className="flex items-center gap-1.5">
          <svg className={`w-3.5 h-3.5 ${isExpiringSoon ? 'text-red-500' : 'text-text-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className={`text-[12px] ${isExpiringSoon ? 'text-red-600 font-medium' : 'text-text-secondary'}`}>
            {isExpired
              ? 'Expired'
              : `Expires ${formatExpiry(data.expiry)}`
            }
          </span>
        </div>
      )}
    </Card>
  );
}

function formatExpiry(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export interface DealsScreenProps {
  deals: DealData[];
  onDealClick?: (deal: DealData) => void;
  onCopyCode?: (code: string) => void;
  isLoading?: boolean;
  showExpired?: boolean;
}

/**
 * DealsScreen displays a grid of deal cards.
 */
export function DealsScreen({
  deals,
  onDealClick,
  onCopyCode,
  isLoading,
  showExpired = false,
}: DealsScreenProps): ReactNode {
  const activeDeals = deals.filter(d => d.isActive);
  const expiredDeals = deals.filter(d => !d.isActive);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="animate-pulse h-40">
            <div className="h-5 bg-surface-muted rounded w-3/4 mb-3" />
            <div className="h-10 bg-surface-muted rounded w-full mb-3" />
            <div className="h-4 bg-surface-muted rounded w-1/2" />
          </Card>
        ))}
      </div>
    );
  }

  const displayDeals = showExpired ? expiredDeals : activeDeals;

  if (displayDeals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <svg className="w-16 h-16 mb-4 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <p className="text-lg font-semibold text-text-primary mb-2">
          {showExpired ? 'No expired deals' : 'No active deals'}
        </p>
        <p className="text-sm">
          {showExpired
            ? 'Expired deals will appear here.'
            : 'Deals from promotional emails will appear here.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Deals</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-border">
            <span className="text-[13px] text-text-secondary">Active</span>
            <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-border">
            <span className="text-[13px] text-text-secondary">All Categories</span>
            <svg className="w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Section Title */}
      <h2 className="font-display text-lg font-bold text-text-primary">
        {showExpired ? 'Expired Deals' : 'Active Deals'}
      </h2>

      {/* Deals Grid */}
      <div className="grid grid-cols-3 gap-4">
        {displayDeals.map((deal) => (
          <DealCard
            key={deal.id}
            data={deal}
            onClick={() => onDealClick?.(deal)}
            onCopyCode={onCopyCode}
          />
        ))}
      </div>
    </div>
  );
}
