import type { ReactNode } from 'react';
import { Card, Button, Badge, StatusBadge } from '../ui';

export interface SenderEmail {
  id: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  isRead?: boolean;
  tags?: string[];
  category?: string;
}

export interface SenderActionItem {
  id: string;
  title: string;
  dueDate?: string;
  category?: string;
  completed?: boolean;
  urgent?: boolean;
}

export interface SenderDeal {
  id: string;
  title: string;
  code?: string;
  expiry?: Date;
  minPurchase?: string;
  autoApplied?: boolean;
}

export interface SenderDetailData {
  id: string;
  domain: string;
  displayName: string;
  category: string;
  isSubscribed: boolean;
  stats: {
    totalEmails: number;
    actionItems: number;
    activeDeals: number;
  };
  aiSummary: {
    text: string;
    updatedAt: string;
  };
  keyInsights?: Array<{
    icon: 'truck' | 'dollar' | 'tag' | 'alert';
    text: string;
    color: 'amber' | 'red' | 'green' | 'blue';
  }>;
  recentEmails: SenderEmail[];
  emailCategories?: string[];
  actionItems: SenderActionItem[];
  deals: SenderDeal[];
}

export interface SenderDetailViewProps {
  data: SenderDetailData;
  onBack: () => void;
  onViewInGmail?: () => void;
  onEmailClick?: (email: SenderEmail) => void;
  onToggleAction?: (id: string) => void;
  onCopyDealCode?: (code: string) => void;
}

/**
 * SenderDetailView - Full screen view for a sender with AI summary and activity.
 * Matches TuskerBrain Desktop Design System specification (Screen 3b).
 */
export function SenderDetailView({
  data,
  onBack,
  onViewInGmail,
  onEmailClick,
  onToggleAction,
  onCopyDealCode,
}: SenderDetailViewProps): ReactNode {
  const completedActions = data.actionItems.filter(a => a.completed).length;
  const totalActions = data.actionItems.length;

  return (
    <div className="flex flex-col gap-4 h-full overflow-auto">
      {/* Header Card */}
      <Card padding="lg">
        <div className="flex items-start justify-between">
          {/* Left: Avatar + Meta */}
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-[14px] bg-brand-50 flex items-center justify-center border border-border">
              <span className="text-xl font-bold text-brand">
                {data.domain.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Meta */}
            <div>
              <h1 className="font-display text-xl font-bold text-text-primary">{data.domain}</h1>
              <p className="text-[13px] text-text-muted">{data.displayName}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge color="orange">{data.category}</Badge>
                {data.isSubscribed && (
                  <span className="flex items-center gap-1 text-[11px] text-text-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand" />
                    Subscribed
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Stats + Actions */}
          <div className="flex items-center gap-4">
            {/* Stat Cards */}
            <div className="flex items-center gap-3">
              <div className="px-4 py-3 bg-surface-muted rounded-xl border border-border text-center">
                <p className="text-2xl font-bold text-text-primary">{data.stats.totalEmails}</p>
                <p className="text-[11px] text-text-muted">Total Emails</p>
              </div>
              <div className="px-4 py-3 bg-surface-muted rounded-xl border border-border text-center">
                <p className="text-2xl font-bold text-text-primary">{data.stats.actionItems}</p>
                <p className="text-[11px] text-text-muted">Actions</p>
              </div>
              <div className="px-4 py-3 bg-surface-muted rounded-xl border border-border text-center">
                <p className="text-2xl font-bold text-purple-600">{data.stats.activeDeals}</p>
                <p className="text-[11px] text-text-muted">Deals</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onViewInGmail}>
                View in Gmail
              </Button>
              <Button onClick={onBack}>
                ← Back to Senders
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* AI Summary Card */}
      <Card padding="lg" className="bg-gradient-to-br from-brand-50 to-teal-50 border-brand-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <span className="text-[13px] font-bold text-text-primary">AI Summary</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-white rounded-md border border-brand-200">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            <span className="text-[10px] text-brand-700">{data.aiSummary.updatedAt}</span>
          </div>
        </div>
        <p className="text-[13px] text-text-secondary leading-relaxed mb-4">
          {data.aiSummary.text}
        </p>
        {data.keyInsights && data.keyInsights.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {data.keyInsights.map((insight, index) => {
              const colorClasses = {
                amber: 'bg-amber-50 border-amber-200 text-amber-700',
                red: 'bg-red-50 border-red-200 text-red-700',
                green: 'bg-green-50 border-green-200 text-green-700',
                blue: 'bg-blue-50 border-blue-200 text-blue-700',
              };
              const icons = {
                truck: '🚚',
                dollar: '💵',
                tag: '🏷️',
                alert: '⚠️',
              };
              return (
                <div
                  key={index}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${colorClasses[insight.color]}`}
                >
                  <span>{icons[insight.icon]}</span>
                  <span className="text-[11px] font-semibold">{insight.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Main Content Row */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Recent Emails Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <Card padding="md" className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-primary">Recent Emails</h3>
              {/* Category Filters */}
              <div className="flex items-center gap-1">
                {data.emailCategories?.map((cat, i) => (
                  <button
                    key={i}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
                      i === 0 ? 'bg-brand text-white' : 'bg-surface-muted text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Email List */}
            <div className="flex-1 overflow-auto space-y-3">
              {data.recentEmails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => onEmailClick?.(email)}
                  className="relative p-4 bg-white rounded-lg border border-border hover:border-brand cursor-pointer transition-colors"
                >
                  {/* Unread Indicator */}
                  {!email.isRead && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-brand" />
                  )}

                  <div className="flex items-start justify-between gap-3 mb-2 pl-4">
                    <h4 className="text-sm font-semibold text-text-primary truncate flex-1">
                      {email.subject}
                    </h4>
                    <span className="text-[11px] text-text-muted flex-shrink-0">
                      {formatRelativeTime(email.receivedAt)}
                    </span>
                  </div>
                  <p className="text-[12px] text-text-muted line-clamp-2 mb-2 pl-4">
                    {email.snippet}
                  </p>
                  {email.tags && email.tags.length > 0 && (
                    <div className="flex items-center gap-2 pl-4">
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

        {/* Right Panel */}
        <div className="w-[340px] flex flex-col gap-4">
          {/* Action Items Card */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-[13px] font-bold text-text-primary">Action Items</span>
              </div>
              {totalActions > 0 && (
                <div className="px-2 py-0.5 bg-red-50 rounded text-[10px] font-semibold text-red-600">
                  {totalActions - completedActions} pending
                </div>
              )}
            </div>

            {/* Progress */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-text-muted">
                {completedActions} of {totalActions} completed
              </span>
              <div className="w-24 h-1.5 bg-surface-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all"
                  style={{ width: `${(completedActions / totalActions) * 100}%` }}
                />
              </div>
            </div>

            {/* Action Items List */}
            <div className="space-y-2">
              {data.actionItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onToggleAction?.(item.id)}
                  className="flex items-center gap-3 p-2.5 bg-surface-muted rounded-lg cursor-pointer hover:bg-brand-50 transition-colors"
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                    item.completed ? 'bg-brand border-brand' : 'border-border'
                  }`}>
                    {item.completed && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] ${item.completed ? 'text-text-muted line-through' : 'text-text-secondary'}`}>
                      {item.title}
                    </p>
                    {item.dueDate && (
                      <p className={`text-[10px] ${item.urgent ? 'text-red-600' : 'text-text-muted'}`}>
                        {item.dueDate}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Active Deals Card */}
          {data.deals.length > 0 && (
            <Card padding="md">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span className="text-[13px] font-bold text-text-primary">Active Deals</span>
              </div>

              <div className="space-y-2">
                {data.deals.map((deal) => (
                  <div key={deal.id} className="p-3 bg-surface-muted rounded-lg">
                    <p className="text-[13px] font-semibold text-text-primary mb-2">{deal.title}</p>
                    {deal.code && (
                      <button
                        onClick={() => onCopyDealCode?.(deal.code!)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white rounded border border-border hover:border-brand transition-colors"
                      >
                        <span className="font-mono text-[12px] text-brand-700">{deal.code}</span>
                        <svg className="w-3 h-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}
                    {deal.autoApplied && (
                      <p className="text-[10px] text-green-600 mt-1">Auto-applied at checkout</p>
                    )}
                    {deal.expiry && (
                      <p className="text-[10px] text-text-muted mt-1">
                        Expires {formatDate(deal.expiry)}
                      </p>
                    )}
                    {deal.minPurchase && (
                      <p className="text-[10px] text-text-muted">Min. purchase: {deal.minPurchase}</p>
                    )}
                  </div>
                ))}
              </div>
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
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
