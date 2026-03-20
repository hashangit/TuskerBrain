import type { ReactNode } from 'react';
import { Card, Button, Badge, StatusBadge } from '../ui';

export interface TopicEmail {
  id: string;
  subject: string;
  snippet: string;
  sender: {
    name: string;
    initial: string;
  };
  receivedAt: Date;
  isRead?: boolean;
  tags?: string[];
}

export interface TopicSender {
  name: string;
  emailCount: number;
}

export interface TopicActionItem {
  id: string;
  title: string;
  completed?: boolean;
}

export interface TopicDetailData {
  id: string;
  name: string;
  parentCategory?: string;
  emailCount: number;
  senderCount: number;
  aiSummary: string;
  highlights?: string[];
  emails: TopicEmail[];
  senders: TopicSender[];
  actionItems: TopicActionItem[];
  totalSpend?: number;
}

export interface TopicDetailViewProps {
  data: TopicDetailData;
  onBack: () => void;
  onEmailClick?: (email: TopicEmail) => void;
  onToggleAction?: (id: string) => void;
}

/**
 * TopicDetailView - Full screen view for a topic with AI summary and activity.
 * Matches TuskerBrain Desktop Design System specification (Screen 2b).
 */
export function TopicDetailView({
  data,
  onBack,
  onEmailClick,
  onToggleAction,
}: TopicDetailViewProps): ReactNode {
  return (
    <div className="flex flex-col gap-6 h-full bg-surface-muted p-6 rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-border text-brand text-[13px] font-semibold hover:bg-surface-hover transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All Topics
          </button>
        </div>
      </div>

      {/* Title Row */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">{data.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            {data.parentCategory && (
              <Badge color="purple">{data.parentCategory}</Badge>
            )}
            <span className="text-sm text-text-muted">
              {data.emailCount} emails from {data.senderCount} senders
            </span>
          </div>
        </div>
        <Button variant="ghost">
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Recategorize
        </Button>
      </div>

      {/* AI Summary Card */}
      <Card padding="lg" className="bg-gradient-to-br from-brand-50 to-teal-50 border-brand-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <span className="text-[13px] font-bold text-text-primary">AI Topic Summary</span>
          </div>
        </div>
        <p className="text-[13px] text-text-secondary leading-relaxed mb-4">
          {data.aiSummary}
        </p>
        {data.highlights && data.highlights.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {data.highlights.map((highlight, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-lg border border-border"
              >
                <span className="text-[11px] font-semibold text-text-secondary">{highlight}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Main Content Row */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* Recent Activity Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <Card padding="lg" className="flex-1 flex flex-col overflow-hidden">
            <h3 className="font-semibold text-text-primary mb-4">Recent Activity</h3>
            <div className="flex-1 overflow-auto space-y-3">
              {data.emails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => onEmailClick?.(email)}
                  className="p-3 bg-surface-muted rounded-lg border border-border hover:border-brand cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-brand-50 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-brand">{email.sender.initial}</span>
                      </div>
                      <span className="text-sm font-medium text-text-primary truncate">
                        {email.subject}
                      </span>
                    </div>
                    <span className="text-[11px] text-text-muted flex-shrink-0">
                      {formatRelativeTime(email.receivedAt)}
                    </span>
                  </div>
                  <p className="text-[12px] text-text-muted line-clamp-1 ml-8">
                    {email.snippet}
                  </p>
                  {email.tags && email.tags.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 ml-8">
                      {email.tags.map((tag, i) => (
                        <Badge key={i} color="orange">{tag}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Insights Panel */}
        <div className="w-72 flex flex-col gap-4">
          {/* Involved Senders */}
          <Card padding="md">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="text-[13px] font-bold text-text-primary">Involved Senders</span>
            </div>
            <div className="space-y-2">
              {data.senders.slice(0, 5).map((sender, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-[13px] text-text-secondary">{sender.name}</span>
                  <span className="text-[11px] text-text-muted">{sender.emailCount} emails</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Topic To-dos */}
          {data.actionItems.length > 0 && (
            <Card padding="md">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-[13px] font-bold text-text-primary">Topic To-dos</span>
              </div>
              <div className="space-y-2">
                {data.actionItems.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onToggleAction?.(item.id)}
                    className="flex items-center gap-2 p-2 bg-surface-muted rounded-lg cursor-pointer hover:bg-brand-50 transition-colors"
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center border ${
                      item.completed ? 'bg-brand border-brand' : 'border-border'
                    }`}>
                      {item.completed && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={`text-[12px] ${item.completed ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Topic Spend */}
          {data.totalSpend && (
            <Card padding="md">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                Topic Spend (This Month)
              </span>
              <p className="text-2xl font-bold text-text-primary mt-2">
                ${data.totalSpend.toLocaleString()}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
