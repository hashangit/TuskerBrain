import type { ReactNode } from 'react';
import { Card, Button, StatusBadge, Badge } from '../ui';

export interface EmailDetailData {
  id: string;
  subject: string;
  priority: 'high' | 'medium' | 'low';
  sender: {
    name: string;
    email: string;
    avatar?: string;
  };
  receivedAt: Date;
  topic?: {
    name: string;
    path: string;
  };
  body: string;
  aiSummary?: {
    bullets: string[];
  };
  actionItems?: Array<{
    id: string;
    title: string;
    completed?: boolean;
  }>;
  financialImpact?: number;
  threadUrl?: string;
}

export interface EmailDetailViewProps {
  data: EmailDetailData;
  onBack: () => void;
  onViewInGmail?: () => void;
  onViewSender?: () => void;
  onViewTopic?: () => void;
  onToggleActionItem?: (id: string) => void;
}

/**
 * EmailDetailView - Full screen view for a single email with AI insights.
 * Matches TuskerBrain Desktop Design System specification.
 */
export function EmailDetailView({
  data,
  onBack,
  onViewInGmail,
  onViewSender,
  onViewTopic,
  onToggleActionItem,
}: EmailDetailViewProps): ReactNode {
  const priorityConfig = {
    high: { variant: 'error' as const, icon: '⚠️' },
    medium: { variant: 'warning' as const, icon: '📋' },
    low: { variant: 'success' as const, icon: '📧' },
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Header */}
      <Card padding="lg">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-muted rounded-lg text-brand text-[13px] font-semibold hover:bg-brand-50 transition-colors mb-4"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Timeline
        </button>

        {/* Subject & Priority */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="font-display text-2xl font-bold text-text-primary flex-1">
            {data.subject}
          </h1>
          <StatusBadge variant={priorityConfig[data.priority].variant}>
            {priorityConfig[data.priority].icon} {data.priority.charAt(0).toUpperCase() + data.priority.slice(1)} Priority
          </StatusBadge>
        </div>

        {/* Sender Info */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-[10px] bg-brand flex items-center justify-center">
            <span className="text-white font-bold text-sm">
              {data.sender.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary">{data.sender.name}</span>
            <span className="text-sm text-text-muted">{data.sender.email}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border mb-4" />

        {/* Meta Row */}
        <div className="flex items-center gap-3">
          {/* Date */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-surface-muted rounded-lg border border-border">
            <svg className="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[11px] font-medium text-text-secondary">
              {formatDateTime(data.receivedAt)}
            </span>
          </div>

          {/* Topic */}
          {data.topic && (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-purple-50 rounded-lg">
              <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="text-[11px] font-semibold text-purple-700">{data.topic.name}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Main Content Row */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Email Content Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <Card padding="lg" className="flex-1 flex flex-col">
            {/* Email Body */}
            <div className="flex-1 overflow-auto">
              <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                {data.body}
              </p>
            </div>

            {/* Divider */}
            <div className="h-px bg-border my-6" />

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <Button onClick={onViewInGmail}>
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Reply
              </Button>
              <Button variant="ghost" onClick={onViewInGmail}>
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View in Gmail
              </Button>
            </div>
          </Card>
        </div>

        {/* AI Insights Column */}
        <div className="w-80 flex flex-col gap-4">
          {/* AI Summary Card */}
          {data.aiSummary && (
            <Card padding="md" className="bg-surface-muted border-brand-200">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                <span className="text-[13px] font-bold text-text-primary">AI Gist</span>
              </div>
              <div className="flex flex-col gap-2">
                {data.aiSummary.bullets.map((bullet, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <span className="text-brand mt-1">•</span>
                    <p className="text-[13px] text-text-secondary leading-relaxed">{bullet}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Action Items Card */}
          {data.actionItems && data.actionItems.length > 0 && (
            <Card padding="md">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <span className="text-[13px] font-bold text-text-primary">Extracted Actions</span>
              </div>
              <div className="flex flex-col gap-2">
                {data.actionItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2.5 bg-surface-muted rounded-lg border border-border"
                  >
                    <button
                      onClick={() => onToggleActionItem?.(item.id)}
                      className={`w-5 h-5 rounded flex items-center justify-center border ${
                        item.completed
                          ? 'bg-brand border-brand text-white'
                          : 'border-border hover:border-brand'
                      }`}
                    >
                      {item.completed && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <span className={`text-[13px] flex-1 ${item.completed ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                      {item.title}
                    </span>
                    <button className="p-1 text-text-muted hover:text-brand">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Financial Impact Card */}
          {data.financialImpact && (
            <Card padding="md">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                Financial Impact
              </span>
              <p className="text-2xl font-bold text-brand mt-1">
                ${data.financialImpact.toLocaleString()}
              </p>
              <p className="text-[11px] text-text-muted mt-1">
                Extracted from email content
              </p>
            </Card>
          )}

          {/* Contextual Links */}
          <div className="flex flex-col gap-2">
            {onViewSender && (
              <button
                onClick={onViewSender}
                className="flex items-center gap-2 px-3 py-2 bg-surface-muted rounded-lg border border-border hover:border-brand transition-colors"
              >
                <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-[13px] text-text-secondary">View Sender Data</span>
                <svg className="w-3.5 h-3.5 text-text-muted ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {onViewTopic && data.topic && (
              <button
                onClick={onViewTopic}
                className="flex items-center gap-2 px-3 py-2 bg-surface-muted rounded-lg border border-border hover:border-brand transition-colors"
              >
                <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-[13px] text-text-secondary">Open Topic</span>
                <svg className="w-3.5 h-3.5 text-text-muted ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
