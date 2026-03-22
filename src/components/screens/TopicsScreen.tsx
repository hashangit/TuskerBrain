import type { ReactNode } from 'react';
import { useState, useMemo } from 'react';
import { Card, StatusBadge } from '../ui';

export interface TopicData {
  id: string;
  name: string;
  parentName?: string;
  emailCount: number;
  summary?: string;
  matchScore?: number;
  pendingActions?: number;
  senders?: Array<{ initial: string; color: string }>;
}

export interface TopicCardProps {
  data: TopicData;
  onClick?: () => void;
}

/**
 * TopicCard component matching TuskerBrain design system.
 */
export function TopicCard({ data, onClick }: TopicCardProps): ReactNode {
  return (
    <Card
      className="cursor-pointer hover:border-border-muted"
      hover
      padding="lg"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1">
          <svg className="w-3.5 h-3.5 text-brand flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <h4 className="font-semibold text-[13px] text-text-primary truncate">
            {data.name}
          </h4>
        </div>
        {data.matchScore && (
          <div className="px-1.5 py-0.5 bg-brand-50 rounded text-[10px] font-semibold text-brand">
            {data.matchScore}% Match
          </div>
        )}
      </div>

      {/* Email Count */}
      <p className="text-[11px] text-text-muted mb-3">
        {data.emailCount} emails{data.senders && data.senders.length > 0 && ` · ${data.senders.length} senders`}
      </p>

      {/* Summary */}
      {data.summary && (
        <p className="text-[12px] text-text-secondary leading-relaxed line-clamp-2 mb-3">
          {data.summary}
        </p>
      )}

      {/* Footer - Senders & Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        {/* Sender Avatars */}
        {data.senders && data.senders.length > 0 && (
          <div className="flex items-center">
            {data.senders.slice(0, 3).map((sender, index) => (
              <div
                key={index}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold border-2 border-white ${sender.color}`}
                style={{ marginLeft: index > 0 ? -6 : 0 }}
              >
                {sender.initial}
              </div>
            ))}
            {data.senders.length > 3 && (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold bg-surface-muted border-2 border-white"
                style={{ marginLeft: -6 }}
              >
                +{data.senders.length - 3}
              </div>
            )}
          </div>
        )}

        {/* Pending Actions Badge */}
        {data.pendingActions && data.pendingActions > 0 && (
          <StatusBadge variant="warning">
            {data.pendingActions} Pending
          </StatusBadge>
        )}
      </div>
    </Card>
  );
}

export interface TopicsScreenProps {
  topics: TopicData[];
  onTopicClick?: (topic: TopicData) => void;
  isLoading?: boolean;
}

/**
 * TopicsScreen displays a grid of topic cards.
 */
export function TopicsScreen({
  topics,
  onTopicClick,
  isLoading,
}: TopicsScreenProps): ReactNode {
  // Filter state
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'emails' | 'name' | 'pending'>('emails');

  // Apply filters and sorting
  const filteredTopics = useMemo(() => {
    let result = [...topics];

    // Filter: pending actions only
    if (showPendingOnly) {
      result = result.filter(t => (t.pendingActions ?? 0) > 0);
    }

    // Sorting
    if (sortBy === 'emails') {
      result.sort((a, b) => b.emailCount - a.emailCount);
    } else if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'pending') {
      result.sort((a, b) => (b.pendingActions ?? 0) - (a.pendingActions ?? 0));
    }

    return result;
  }, [topics, showPendingOnly, sortBy]);

  const hasActiveFilters = showPendingOnly;
  const pendingCount = topics.filter(t => (t.pendingActions ?? 0) > 0).length;

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="animate-pulse h-40">
            <div className="h-4 bg-surface-muted rounded w-1/2 mb-3" />
            <div className="h-3 bg-surface-muted rounded w-1/4 mb-3" />
            <div className="h-3 bg-surface-muted rounded w-full mb-2" />
            <div className="h-3 bg-surface-muted rounded w-3/4" />
          </Card>
        ))}
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-muted">
        <svg className="w-16 h-16 mb-4 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p className="text-lg font-semibold text-text-primary mb-2">No topics yet</p>
        <p className="text-sm">Topics will appear as emails are processed.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Topics</h1>
          <p className="text-sm text-text-muted mt-1">
            {hasActiveFilters
              ? `${filteredTopics.length} of ${topics.length} topics`
              : `${topics.length} topics`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Pending Filter Toggle */}
          {pendingCount > 0 && (
            <button
              onClick={() => setShowPendingOnly(!showPendingOnly)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium cursor-pointer transition-colors min-w-[120px] ${
                showPendingOnly
                  ? 'bg-brand text-white'
                  : 'bg-white border border-border hover:bg-gray-50'
              }`}
              style={{ fontFamily: 'Inter, sans-serif', color: showPendingOnly ? 'white' : '#374151' }}
            >
              {showPendingOnly ? `Pending (${pendingCount})` : `Has Pending (${pendingCount})`}
            </button>
          )}

          {/* Sort Filter */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'emails' | 'name' | 'pending')}
            className="appearance-none flex items-center gap-2 px-3 py-2 pr-8 rounded-lg text-[13px] font-medium cursor-pointer transition-colors hover:bg-gray-50 min-w-[120px] bg-white border border-border"
            style={{ fontFamily: 'Inter, sans-serif', color: '#374151' }}
          >
            <option value="emails">Most Emails</option>
            <option value="name">By Name</option>
            <option value="pending">Pending Actions</option>
          </select>
        </div>
      </div>

      {/* Topics Grid */}
      {filteredTopics.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-text-muted">
          <p className="text-lg font-semibold text-text-primary mb-2">
            {showPendingOnly ? 'No topics with pending actions' : 'No matching topics'}
          </p>
          <p className="text-sm">Try adjusting your filter selection.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filteredTopics.map((topic) => (
            <TopicCard
              key={topic.id}
              data={topic}
              onClick={() => onTopicClick?.(topic)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
