import type { ReactNode } from 'react';
import { useState } from 'react';
import DOMPurify from 'dompurify';
import { Card, Button, StatusBadge, Badge, ActionItemsCard, ThreadEmailCard } from '../ui';
import { formatDateTime, formatRelativeTime } from '../../utils/date';

// Check if running in Electron
const isElectron = typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';

/**
 * Format time gap between two emails for display as a gap indicator
 * Returns null if the gap is too small (< 4 hours) to show
 */
function formatTimeGap(earlier: string | Date, later: string | Date): string | null {
  const diffMs = new Date(later).getTime() - new Date(earlier).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 4) return null; // Too small to show

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 0) return `${Math.round(diffHours)}h later`;
  if (diffDays === 1) return '1 day later';
  if (diffDays < 7) return `${diffDays} days later`;
  if (diffDays < 14) return '1 week later';
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks} weeks later`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month later';
  return `${diffMonths} months later`;
}

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
    primary: string;
    count: number;
    all: string[];
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
  threadId?: string;
  threadEmails?: Array<{
    id: string;
    subject: string | null;
    snippet: string | null;
    senderName: string | null;
    senderEmail: string;
    receivedAt: Date;
    isRead?: boolean;
    bodyHtml?: string | null;
    bodyPlain?: string | null;
  }>;
}

export interface EmailDetailViewProps {
  data: EmailDetailData;
  onBack: () => void;
  onViewInGmail?: () => void;
  onReply?: () => void;
  onViewSender?: () => void;
  onViewTopic?: () => void;
  onToggleActionItem?: (id: string) => void;
  onRefocusEmail?: (emailId: string) => void;
}

/**
 * EmailDetailView - Full screen view for a single email with AI insights.
 * Matches TuskerBrain Desktop Design System specification.
 */
export function EmailDetailView({
  data,
  onBack,
  onViewInGmail,
  onReply,
  onViewSender,
  onViewTopic,
  onToggleActionItem,
  onRefocusEmail,
}: EmailDetailViewProps): ReactNode {
  // Compose UI state
  const [showCompose, setShowCompose] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{success: boolean; message: string} | null>(null);

  const priorityConfig = {
    high: { variant: 'error' as const, icon: '⚠️' },
    medium: { variant: 'warning' as const, icon: '📋' },
    low: { variant: 'success' as const, icon: '📧' },
  };

  // Split thread emails into earlier and later relative to focused email
  const earlierEmails: typeof data.threadEmails = [];
  const laterEmails: typeof data.threadEmails = [];

  if (data.threadEmails && data.threadEmails.length > 0) {
    const focusedDate = new Date(data.receivedAt).getTime();

    for (const email of data.threadEmails) {
      if (email.id === data.id) continue; // Skip the focused email

      const emailDate = new Date(email.receivedAt).getTime();
      if (emailDate < focusedDate) {
        earlierEmails.push(email);
      } else {
        laterEmails.push(email);
      }
    }

    // Sort chronologically
    earlierEmails.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
    laterEmails.sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  }

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
              <span className="text-[11px] font-semibold text-purple-700">{data.topic.primary}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Thread Context */}
      {data.threadEmails && data.threadEmails.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Thread Summary */}
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-muted rounded-lg border border-border">
            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
            <span className="text-[13px] font-semibold text-text-primary">
              Thread: {data.subject}
            </span>
            <span className="text-[11px] text-text-muted">
              — {data.threadEmails.length} email{data.threadEmails.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Earlier Messages */}
          {earlierEmails.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                {earlierEmails.length} earlier message{earlierEmails.length !== 1 ? 's' : ''} in thread
              </span>
              <div className="flex flex-col space-y-1.5">
                {earlierEmails.map((email, index) => {
                  const prevEmail = index > 0 ? earlierEmails[index - 1] : null;
                  const gapText = prevEmail ? formatTimeGap(prevEmail.receivedAt, email.receivedAt) : null;

                  return (
                    <div key={email.id}>
                      {gapText && (
                        <div className="text-center py-1">
                          <span className="text-[10px] text-text-muted bg-surface-muted px-2 py-0.5 rounded-full">
                            {gapText}
                          </span>
                        </div>
                      )}
                      <ThreadEmailCard
                        email={{
                          id: email.id,
                          subject: email.subject,
                          snippet: email.snippet,
                          senderName: email.senderName,
                          senderEmail: email.senderEmail,
                          receivedAt: email.receivedAt,
                          isRead: email.isRead,
                        }}
                        onClick={onRefocusEmail ? () => onRefocusEmail(email.id) : undefined}
                        isFocused={false}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content Row */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Email Content Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <Card padding="lg" className="flex-1 flex flex-col">
            {/* Email Body — sanitized via DOMPurify to prevent XSS */}
            <div
              className="flex-1 overflow-auto email-body text-sm text-text-secondary leading-relaxed"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.body) }}
            />

            {/* Divider */}
            <div className="h-px bg-border my-6" />

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  if (isElectron) {
                    setShowCompose(true);
                  } else if (onReply) {
                    onReply();
                  }
                }}
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
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

            {/* Inline Compose Area */}
            {showCompose && (
              <div className="mt-6 border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-text-primary">
                    Reply to {data.sender?.name || data.sender?.email}
                  </h3>
                  <button
                    onClick={() => {
                      setShowCompose(false);
                      setReplyBody('');
                      setSendResult(null);
                    }}
                    className="text-xs text-text-muted hover:text-text-primary"
                  >
                    Cancel
                  </button>
                </div>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write your reply..."
                  className="w-full h-32 p-3 bg-surface-muted border border-border rounded-lg text-sm text-text-primary placeholder:text-text-subtle resize-y focus:outline-none focus:ring-1 focus:ring-brand"
                  disabled={sending}
                />
                {sendResult && (
                  <p className={`text-xs mt-2 ${sendResult.success ? 'text-green-600' : 'text-red-600'}`}>
                    {sendResult.message}
                  </p>
                )}
                <div className="flex justify-end mt-3">
                  <Button
                    onClick={async () => {
                      if (!replyBody.trim()) return;
                      setSending(true);
                      setSendResult(null);
                      try {
                        const result = await window.electronAPI.sendReply(data.id, replyBody.trim());
                        if (result.success) {
                          setSendResult({ success: true, message: 'Reply sent!' });
                          setTimeout(() => {
                            setShowCompose(false);
                            setReplyBody('');
                            setSendResult(null);
                          }, 2000);
                        } else {
                          setSendResult({ success: false, message: result.error || 'Failed to send reply' });
                        }
                      } catch (err) {
                        setSendResult({ success: false, message: 'Failed to send reply' });
                      } finally {
                        setSending(false);
                      }
                    }}
                    disabled={!replyBody.trim() || sending}
                  >
                    {sending ? 'Sending...' : 'Send Reply'}
                  </Button>
                </div>
              </div>
            )}
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
            <ActionItemsCard
              items={data.actionItems}
              onToggleItem={onToggleActionItem}
            />
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

      {/* Later Messages in Thread */}
      {data.threadEmails && data.threadEmails.length > 0 && laterEmails.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
            {laterEmails.length} later message{laterEmails.length !== 1 ? 's' : ''} in thread
          </span>
          <div className="flex flex-col space-y-1.5">
            {laterEmails.map((email, index) => {
              const prevEmail = index > 0 ? laterEmails[index - 1] : null;
              const gapText = prevEmail ? formatTimeGap(prevEmail.receivedAt, email.receivedAt) : null;

              return (
                <div key={email.id}>
                  {gapText && (
                    <div className="text-center py-1">
                      <span className="text-[10px] text-text-muted bg-surface-muted px-2 py-0.5 rounded-full">
                        {gapText}
                      </span>
                    </div>
                  )}
                  <ThreadEmailCard
                    email={{
                      id: email.id,
                      subject: email.subject,
                      snippet: email.snippet,
                      senderName: email.senderName,
                      senderEmail: email.senderEmail,
                      receivedAt: email.receivedAt,
                      isRead: email.isRead,
                    }}
                    onClick={onRefocusEmail ? () => onRefocusEmail(email.id) : undefined}
                    isFocused={false}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}