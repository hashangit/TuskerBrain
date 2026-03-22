import type { ReactNode } from 'react';
import { Card } from './ui';

export interface RichTimelineCardData {
  id: string;
  emailId: string;
  title: string;
  summary?: string;
  priority?: 'high' | 'medium' | 'low';
  sentiment?: 'positive' | 'negative' | 'neutral';
  followUpDate?: string;
  financialImpact?: number;
  hasActionItem?: boolean;
  actionItemCount?: number;
  createdAt: Date;
  time?: string;
  sender?: {
    name: string;
    email: string;
  };
  topic?: string;
}

export interface RichTimelineCardProps {
  data: RichTimelineCardData;
  onClick?: () => void;
}

// Sentiment icons
const SentimentIcons = {
  positive: () => (
    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  negative: () => (
    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  neutral: () => (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// Calendar icon for follow-up
const CalendarIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

// Dollar icon for financial impact
const DollarIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// Check circle icon for action items
const CheckCircleIcon = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

/**
 * Rich timeline card matching TuskerBrain design system.
 * Includes sentiment icon, title, summary, and action tags.
 */
export function RichTimelineCard({ data, onClick }: RichTimelineCardProps): ReactNode {
  const priorityVariant = {
    high: 'error' as const,
    medium: 'warning' as const,
    low: 'success' as const,
  };

  const priorityColors = {
    high: { bg: 'bg-red-50', text: 'text-red-600', badge: 'text-red-600' },
    medium: { bg: 'bg-amber-50', text: 'text-amber-600', badge: 'text-amber-600' },
    low: { bg: 'bg-green-50', text: 'text-green-600', badge: 'text-green-600' },
  };

  const financialColors = {
    bg: 'bg-teal-50',
    text: 'text-teal-700',
  };

  const actionColors = {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
  };

  return (
    <Card
      className="cursor-pointer hover:border-border-muted w-full max-w-[400px]"
      hover
      onClick={onClick}
      padding="md"
    >
      {/* Header: Sentiment Icon + Title + Time */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {data.sentiment && SentimentIcons[data.sentiment]()}
          <h4 className="font-semibold text-text-primary text-[15px] truncate">
            {data.title}
          </h4>
        </div>
        {data.time && (
          <span className="text-xs text-text-muted ml-2 shrink-0">
            {data.time}
          </span>
        )}
      </div>

      {/* Summary */}
      {data.summary && (
        <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-2 mb-2">
          {data.summary}
        </p>
      )}

      {/* Footer: Priority Badge + Action Tags */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Priority Badge */}
        {data.priority && (
          <span
            className={`
              inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold
              ${priorityColors[data.priority].bg} ${priorityColors[data.priority].badge}
            `}
          >
            {data.priority === 'high' ? 'High Priority' : data.priority.charAt(0).toUpperCase() + data.priority.slice(1)}
          </span>
        )}

        {/* Follow-up Date Tag */}
        {data.followUpDate && (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-brand-50 rounded-md text-[11px] font-medium text-brand-700">
            <CalendarIcon />
            Follow up {data.followUpDate}
          </span>
        )}

        {/* Financial Impact Tag */}
        {data.financialImpact && (
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${financialColors.bg} ${financialColors.text}`}>
            <DollarIcon />
            ${data.financialImpact.toLocaleString()} payment due
          </span>
        )}

        {/* Action Items Tag */}
        {data.hasActionItem && data.actionItemCount && (
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium ${actionColors.bg} ${actionColors.text}`}>
            <CheckCircleIcon />
            {data.actionItemCount} Action Item{data.actionItemCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </Card>
  );
}
