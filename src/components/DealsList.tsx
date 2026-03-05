import type { ReactNode, MouseEvent } from 'react';

export interface Deal {
  id: string;
  title: string;
  brand: string;
  code?: string | null;
  expiry?: Date;
  isActive: boolean;
}

export interface DealsListProps {
  deals: Deal[];
  showOnlyActive?: boolean;
  onCopyCode?: (code: string) => void;
}

/**
 * DealsList displays promotional deals with codes and expiry dates.
 */
export function DealsList({
  deals,
  showOnlyActive = false,
  onCopyCode,
}: DealsListProps): ReactNode {
  // Filter to active deals if specified
  const filteredDeals = showOnlyActive
    ? deals.filter((deal) => deal.isActive && !isExpired(deal.expiry))
    : deals;

  // Sort by expiry date (nearest first)
  const sortedDeals = [...filteredDeals].sort((a, b) => {
    if (!a.expiry) return 1;
    if (!b.expiry) return -1;
    return new Date(a.expiry).getTime() - new Date(b.expiry).getTime();
  });

  if (sortedDeals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>No deals available</p>
        <p className="text-sm mt-2">Deals from promotional emails will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {sortedDeals.map((deal) => (
        <DealCard
          key={deal.id}
          deal={deal}
          onCopyCode={onCopyCode}
        />
      ))}
    </div>
  );
}

interface DealCardProps {
  deal: Deal;
  onCopyCode?: (code: string) => void;
}

function DealCard({ deal, onCopyCode }: DealCardProps): ReactNode {
  const isDealExpired = isExpired(deal.expiry);

  const handleCopyCode = (e: MouseEvent) => {
    e.preventDefault();
    if (deal.code) {
      onCopyCode?.(deal.code);
    }
  };

  return (
    <div
      className={`flex flex-col gap-2 p-4 rounded-lg border ${
        isDealExpired ? 'opacity-50 bg-muted/50' : 'bg-card'
      }`}
      data-testid={`deal-${deal.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <span className="font-medium">{deal.title}</span>
          <span className="text-sm text-muted-foreground">{deal.brand}</span>
        </div>
        {isDealExpired && (
          <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
            Expired
          </span>
        )}
      </div>

      {deal.code && (
        <button
          className={`inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-md font-mono text-sm ${
            isDealExpired
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary/10 text-primary hover:bg-primary/20'
          }`}
          onClick={handleCopyCode}
        >
          {deal.code}
        </button>
      )}

      {deal.expiry && (
        <span className="text-xs text-muted-foreground">
          {isDealExpired ? 'Expired' : 'Expires'} {formatDate(deal.expiry)}
        </span>
      )}
    </div>
  );
}

function isExpired(expiry?: Date): boolean {
  if (!expiry) return false;
  return new Date(expiry) < new Date();
}

function formatDate(date: Date): string {
  const now = new Date();
  const expiry = new Date(date);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `${Math.abs(diffDays)} days ago`;
  }
  if (diffDays === 0) {
    return 'today';
  }
  if (diffDays === 1) {
    return 'tomorrow';
  }
  if (diffDays < 7) {
    return `in ${diffDays} days`;
  }

  return expiry.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
