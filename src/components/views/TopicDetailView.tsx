import type { ReactNode } from 'react';
import { Card, Button, Badge, StatusBadge, ActionItemsCard, ThreadCard, type EmailListItem, type ThreadEmailItem } from '../ui';
import { formatRelativeTime } from '../../utils/date';

export type TopicEmail = EmailListItem & {
  sender: {
    name: string;
    initial: string;
  };
  threadId?: string;
};

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
  deals?: Array<{
    id: string;
    title: string;
    code?: string;
    expiry?: Date;
    minPurchase?: string;
    autoApplied?: boolean;
  }>;
}

export interface TopicDetailViewProps {
  data: TopicDetailData;
  onBack: () => void;
  onEmailClick?: (email: EmailListItem) => void;
  onToggleAction?: (id: string) => void;
  onCopyDealCode?: (code: string) => void;
}

/** Group emails by threadId */
interface ThreadGroup {
  threadId: string | null;
  emails: TopicEmail[];
  latestEmail: TopicEmail;
  earliestDate: Date;
  latestDate: Date;
}

function groupEmailsByThread(emails: TopicEmail[]): (ThreadGroup | TopicEmail)[] {
  const threadMap = new Map<string | null, TopicEmail[]>();
  const singleEmails: TopicEmail[] = [];

  // Group emails by threadId
  for (const email of emails) {
    const threadId = email.threadId ?? null;
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, []);
    }
    threadMap.get(threadId)!.push(email);
  }

  const result: (ThreadGroup | TopicEmail)[] = [];

  // Process each thread group
  for (const [threadId, threadEmails] of threadMap) {
    if (threadEmails.length === 1 && !threadId) {
      // Single email with no thread ID
      result.push(threadEmails[0]);
    } else if (threadEmails.length === 1 && threadId) {
      // Single email with a thread ID - could be the start of a thread
      // For now, treat as single email
      result.push(threadEmails[0]);
    } else {
      // Multi-email thread
      const sortedEmails = threadEmails.sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
      const latestEmail = sortedEmails[0];
      const earliestDate = sortedEmails.reduce(
        (min, e) => (new Date(e.receivedAt) < new Date(min) ? e.receivedAt : min),
        sortedEmails[0].receivedAt
      );
      const latestDate = latestEmail.receivedAt;

      result.push({
        threadId,
        emails: sortedEmails,
        latestEmail,
        earliestDate,
        latestDate,
      });
    }
  }

  // Sort all groups by latest email date
  return result.sort((a, b) => {
    const aDate = 'latestEmail' in a ? new Date(a.latestDate) : new Date(a.receivedAt);
    const bDate = 'latestEmail' in b ? new Date(b.latestDate) : new Date(b.receivedAt);
    return bDate.getTime() - aDate.getTime();
  });
}

/** Convert TopicEmail to ThreadEmailItem for ThreadCard */
function toThreadEmailItem(email: TopicEmail): ThreadEmailItem {
  return {
    id: email.id,
    subject: email.subject,
    snippet: email.snippet,
    senderName: email.sender?.name ?? null,
    senderEmail: email.sender?.name ?? 'unknown@example.com',
    receivedAt: email.receivedAt,
    isRead: email.isRead,
    topicName: email.topicName,
  };
}

/** Convert TopicEmail to EmailListItem for onEmailClick */
function toEmailListItem(email: TopicEmail): EmailListItem {
  return {
    id: email.id,
    subject: email.subject,
    snippet: email.snippet,
    receivedAt: email.receivedAt,
    isRead: email.isRead,
    tags: email.tags,
    sender: email.sender,
    category: email.category,
    topicName: email.topicName,
  };
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
  onCopyDealCode,
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
          <Card padding="md" className="flex-1 flex flex-col overflow-hidden">
            <h3 className="font-semibold text-text-primary mb-4">Recent Activity</h3>
            <div className="flex-1 overflow-auto space-y-3">
              {data.emails.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-6">No emails in this topic</p>
              ) : (
                groupEmailsByThread(data.emails).map((item, index) => {
                  // Render thread card for multi-email threads
                  if ('latestEmail' in item) {
                    const threadEmails = item.emails.map(toThreadEmailItem);
                    // Compute unique participants from thread emails
                    const participants = Array.from(
                      new Set(item.emails.map(e => e.sender?.name).filter(Boolean))
                    ) as string[];
                    return (
                      <ThreadCard
                        key={item.threadId ?? `thread-${index}`}
                        subject={item.latestEmail.subject}
                        emailCount={item.emails.length}
                        latestSnippet={item.latestEmail.snippet}
                        latestSenderName={item.latestEmail.sender?.name ?? null}
                        dateRange={{ start: item.earliestDate, end: item.latestDate }}
                        emails={threadEmails}
                        participants={participants}
                        currentTopicName={data.name}
                        onEmailClick={(email) => {
                          // Find the original email and convert to EmailListItem
                          const originalEmail = item.emails.find(e => e.id === email.id);
                          if (originalEmail && onEmailClick) {
                            onEmailClick(toEmailListItem(originalEmail));
                          }
                        }}
                      />
                    );
                  }

                  // Render individual email card for single emails
                  const email = item;
                  return (
                    <div
                      key={email.id}
                      onClick={() => onEmailClick?.(toEmailListItem(email))}
                      className="relative p-4 bg-white rounded-lg border border-border hover:border-brand cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        {/* Sender avatar */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
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

                      <p className="text-[12px] text-text-muted line-clamp-2 ml-8">
                        {email.snippet}
                      </p>

                      {email.tags && email.tags.length > 0 && (
                        <div className="flex items-center gap-2 ml-8 mt-2">
                          {email.tags.map((tag, i) => (
                            <Badge key={i} color="orange">{tag}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Insights Panel */}
        <div className="w-72 flex flex-col gap-4">
          {/* Involved Senders */}
          <Card padding="md" className="max-h-[300px] flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="text-[13px] font-bold text-text-primary">Involved Senders</span>
            </div>
            <div className="space-y-2 overflow-auto flex-1">
              {data.senders.map((sender, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-[13px] text-text-secondary">{sender.name}</span>
                  <span className="text-[11px] text-text-muted">{sender.emailCount} emails</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Action Items Card */}
          {data.actionItems.length > 0 && (
            <ActionItemsCard
              items={data.actionItems}
              onToggleItem={onToggleAction}
            />
          )}

          {/* Topic Spend */}
          {data.totalSpend && (
            <Card padding="md">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                Financial Impact
              </span>
              <p className="text-2xl font-bold text-brand mt-1">
                ${data.totalSpend.toLocaleString()}
              </p>
            </Card>
          )}

          {/* Active Deals */}
          {data.deals && data.deals.length > 0 && (
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
                        Expires {new Date(deal.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
