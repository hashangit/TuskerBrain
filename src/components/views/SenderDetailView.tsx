import type { ReactNode } from 'react';
import { Card, Button, Badge, StatusBadge, ActionItemsCard, EmailListCard, ThreadCard, type EmailListItem, type ThreadEmailItem } from '../ui';
import { formatRelativeTime } from '../../utils/date';

export type SenderEmail = EmailListItem;

type ThreadStatus = 'active' | 'waiting' | 'stale';

function computeThreadStatus(emails: SenderEmail[]): ThreadStatus | null {
  if (emails.length === 0) return null;

  // Sort by date descending to get latest
  const sorted = [...emails].sort((a, b) =>
    new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );
  const latest = sorted[0];
  const latestDate = new Date(latest.receivedAt);
  const now = new Date();
  const hoursSinceLatest = (now.getTime() - latestDate.getTime()) / (1000 * 60 * 60);

  // Check if latest email is from the user (has known user email patterns)
  // For sender view, since all emails are FROM the same domain, user replies
  // would have different sender domains. Since this is the sender view,
  // "waiting for reply" means the user hasn't replied yet - but we can't detect that
  // from the sender's emails alone. So use simpler heuristics:

  if (hoursSinceLatest < 48) return 'active';  // Active in last 48 hours
  if (hoursSinceLatest > 168) return 'stale';  // Stale after 7 days
  return null; // No badge needed for "normal" threads
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
 * Group emails by threadId
 */
function groupEmailsByThread(emails: SenderEmail[]): Map<string, SenderEmail[]> {
  const threadGroups = new Map<string, SenderEmail[]>();

  emails.forEach(email => {
    const threadId = email.threadId || email.id;
    if (!threadGroups.has(threadId)) {
      threadGroups.set(threadId, []);
    }
    threadGroups.get(threadId)!.push(email);
  });

  return threadGroups;
}

/**
 * Convert SenderEmail to ThreadEmailItem
 */
function toThreadEmailItem(email: SenderEmail): ThreadEmailItem {
  return {
    id: email.id,
    subject: email.subject,
    snippet: email.snippet,
    senderName: email.sender?.name || null,
    senderEmail: `${email.sender?.name || 'sender'}@${email.sender?.name ? 'example.com' : 'local'}`,
    receivedAt: email.receivedAt,
    isRead: email.isRead,
  };
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
  // Group emails by thread
  const threadGroups = groupEmailsByThread(data.recentEmails);

  // Sort threads by latest email date
  const sortedThreads = Array.from(threadGroups.entries()).sort(([, a], [, b]) => {
    const aLatest = new Date(a[a.length - 1].receivedAt).getTime();
    const bLatest = new Date(b[b.length - 1].receivedAt).getTime();
    return bLatest - aLatest;
  });

  // Separate into thread groups (3+ emails) and single/double emails
  const threadCards = sortedThreads.filter(([, emails]) => emails.length >= 3);
  const singleEmails = sortedThreads.filter(([, emails]) => emails.length < 3).flatMap(([, emails]) => emails);

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
              {data.emailCategories && data.emailCategories.length > 0 && (
                <div className="flex items-center gap-1">
                  {data.emailCategories.map((cat) => (
                    <button
                      key={cat}
                      className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-surface-muted text-text-secondary hover:bg-surface-hover transition-colors"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto space-y-3">
              {threadCards.length === 0 && singleEmails.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-6">No emails found</p>
              ) : (
                <>
                  {/* Thread groups (3+ emails) */}
                  {threadCards.map(([threadId, emails]) => {
                    const latestEmail = emails[emails.length - 1];
                    const earliestEmail = emails[0];
                    const status = computeThreadStatus(emails);
                    // Compute unique participants from thread emails
                    const participants = Array.from(
                      new Set(emails.map(e => e.sender?.name).filter(Boolean))
                    ) as string[];
                    return (
                      <ThreadCard
                        key={threadId}
                        subject={latestEmail.subject}
                        emailCount={emails.length}
                        latestSnippet={latestEmail.snippet}
                        latestSenderName={latestEmail.sender?.name || null}
                        dateRange={{
                          start: earliestEmail.receivedAt,
                          end: latestEmail.receivedAt,
                        }}
                        emails={emails.map(toThreadEmailItem)}
                        participants={participants}
                        onEmailClick={(email) => onEmailClick?.(data.recentEmails.find(e => e.id === email.id)!)}
                        headerExtras={
                          status ? (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              status === 'active' ? 'bg-green-50 text-green-700' :
                              status === 'stale' ? 'bg-gray-100 text-gray-500' :
                              ''
                            }`}>
                              {status === 'active' ? 'Active' : status === 'stale' ? 'Stale' : ''}
                            </span>
                          ) : undefined
                        }
                      />
                    );
                  })}

                  {/* Single/double emails */}
                  {singleEmails.map((email) => (
                    <div
                      key={email.id}
                      onClick={() => onEmailClick?.(email)}
                      className="relative p-4 bg-white rounded-lg border border-border hover:border-brand cursor-pointer transition-colors"
                    >
                      {/* Unread indicator */}
                      {!email.isRead && (
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-brand" />
                      )}

                      <div className={`flex items-start justify-between gap-3 mb-2 ${!email.isRead ? 'pl-4' : ''}`}>
                        <h4 className="text-sm font-semibold text-text-primary truncate flex-1">
                          {email.subject}
                        </h4>
                        <span className="text-[11px] text-text-muted flex-shrink-0">
                          {formatRelativeTime(email.receivedAt)}
                        </span>
                      </div>

                      <p className={`text-[12px] text-text-muted line-clamp-2 mb-2 ${!email.isRead ? 'pl-4' : ''}`}>
                        {email.snippet}
                      </p>

                      {email.tags && email.tags.length > 0 && (
                        <div className={`flex items-center gap-2 ${!email.isRead ? 'pl-4' : ''}`}>
                          {email.tags.map((tag, i) => (
                            <Badge key={i} color="orange">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Right Panel */}
        <div className="w-[340px] flex flex-col gap-4">
          {/* Action Items Card */}
          <ActionItemsCard
            items={data.actionItems}
            onToggleItem={onToggleAction}
            showProgress={true}
          />

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

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
