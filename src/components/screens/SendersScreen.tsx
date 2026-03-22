import type { ReactNode } from 'react';
import { useState, useMemo } from 'react';
import { Card, Badge } from '../ui';

export interface SenderData {
  id: string;
  domain: string;
  name: string;
  email: string;
  category: string;
  categoryColor?: 'orange' | 'purple' | 'teal' | 'default';
  emailCount: number;
  summary?: string;
  lastUpdated?: string;
}

export interface SenderItemProps {
  data: SenderData;
  onClick?: () => void;
}

/**
 * SenderItem component matching TuskerBrain design system.
 */
export function SenderItem({ data, onClick }: SenderItemProps): ReactNode {
  const categoryColors: Record<string, 'orange' | 'purple' | 'teal' | 'default'> = {
    Shopping: 'orange',
    Banking: 'teal',
    Social: 'purple',
    Education: 'teal',
    Technology: 'purple',
    default: 'default',
  };

  const color = data.categoryColor || categoryColors[data.category] || categoryColors.default;

  return (
    <Card
      className="cursor-pointer hover:border-border-muted"
      hover
      padding="lg"
      onClick={onClick}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-[10px] bg-brand-50 flex items-center justify-center border border-border">
            <span className="text-[13px] font-bold text-brand">
              {data.name.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* Name & Email */}
          <div className="flex flex-col min-w-0">
            <h4 className="font-bold text-[15px] text-text-primary truncate">
              {data.name}
            </h4>
            <p className="text-[12px] text-text-muted truncate">{data.email}</p>
          </div>
        </div>

        {/* Category Badge */}
        <Badge color={color}>{data.category}</Badge>
      </div>

      {/* Summary */}
      {data.summary && (
        <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-2 mb-4">
          {data.summary}
        </p>
      )}

      {/* Footer Stats */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-brand">
          {data.emailCount} Emails
        </span>
        {data.lastUpdated && (
          <span className="text-[11px] text-text-muted">
            {data.lastUpdated}
          </span>
        )}
      </div>
    </Card>
  );
}

export interface SendersScreenProps {
  senders: SenderData[];
  onSenderClick?: (sender: SenderData) => void;
  isLoading?: boolean;
}

/**
 * SendersScreen displays a grid of sender items.
 */
export function SendersScreen({
  senders,
  onSenderClick,
  isLoading,
}: SendersScreenProps): ReactNode {
  // Filter state
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'emails' | 'name'>('emails');

  // Extract unique categories from senders
  const categories = useMemo(() => {
    const uniqueCategories = [...new Set(senders.map(s => s.category).filter(Boolean))];
    return ['all', ...uniqueCategories.sort()];
  }, [senders]);

  // Apply filters and sorting
  const filteredSenders = useMemo(() => {
    let result = [...senders];

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(s => s.category === categoryFilter);
    }

    // Sorting
    if (sortBy === 'emails') {
      result.sort((a, b) => b.emailCount - a.emailCount);
    } else if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [senders, categoryFilter, sortBy]);

  const hasActiveFilters = categoryFilter !== 'all';

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="animate-pulse h-44">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-surface-muted rounded-[10px]" />
              <div className="flex-1">
                <div className="h-4 bg-surface-muted rounded w-1/2 mb-2" />
                <div className="h-3 bg-surface-muted rounded w-3/4" />
              </div>
            </div>
            <div className="h-3 bg-surface-muted rounded w-full mb-2" />
            <div className="h-3 bg-surface-muted rounded w-2/3" />
          </Card>
        ))}
      </div>
    );
  }

  if (senders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <svg className="w-16 h-16 mb-4 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-lg font-semibold text-text-primary mb-2">No senders yet</p>
        <p className="text-sm">Senders will appear as emails are processed.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Senders</h1>
          <p className="text-sm text-text-muted mt-1">
            {hasActiveFilters
              ? `${filteredSenders.length} of ${senders.length} senders`
              : `${senders.length} senders`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="appearance-none flex items-center gap-2 px-3 py-2 pr-8 rounded-lg text-[13px] font-medium cursor-pointer transition-colors hover:bg-gray-50 min-w-[120px] bg-white border border-border"
            style={{ fontFamily: 'Inter, sans-serif', color: '#374151' }}
          >
            <option value="all">All Categories</option>
            {categories.filter(c => c !== 'all').map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          {/* Sort Filter */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'emails' | 'name')}
            className="appearance-none flex items-center gap-2 px-3 py-2 pr-8 rounded-lg text-[13px] font-medium cursor-pointer transition-colors hover:bg-gray-50 min-w-[120px] bg-white border border-border"
            style={{ fontFamily: 'Inter, sans-serif', color: '#374151' }}
          >
            <option value="emails">Most Emails</option>
            <option value="name">By Name</option>
          </select>
        </div>
      </div>

      {/* Senders Grid */}
      {filteredSenders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted">
          <p className="text-lg font-semibold text-text-primary mb-2">No matching senders</p>
          <p className="text-sm">Try adjusting your filter selection.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {filteredSenders.map((sender) => (
            <SenderItem
              key={sender.id}
              data={sender}
              onClick={() => onSenderClick?.(sender)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
