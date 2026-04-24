import { useState, type ReactNode } from 'react';
import { Card, Badge } from './index';
import { formatRelativeTime } from '../../utils/date';

export interface EmailListItem {
  id: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  isRead?: boolean;
  tags?: string[];
  threadId?: string;
  sender?: {
    name: string;
    initial: string;
  };
  category?: string;
  topicName?: string;
}

export interface EmailListCardProps {
  emails: EmailListItem[];
  onEmailClick?: (email: EmailListItem) => void;
  /** Show sender avatar (for topic view where emails come from multiple senders) */
  showSender?: boolean;
  /** Show unread indicator dot (for sender view) */
  showUnreadIndicator?: boolean;
  /** Category filter buttons (for sender view) */
  categories?: string[];
  /** Section title (default: "Recent Emails") */
  title?: string;
  /** Empty state message */
  emptyMessage?: string;
}

/**
 * Shared email list component used by TopicDetailView and SenderDetailView.
 * Configurable display options for context-specific rendering.
 */
export function EmailListCard({
  emails,
  onEmailClick,
  showSender = false,
  showUnreadIndicator = false,
  categories,
  title = 'Recent Emails',
  emptyMessage = 'No emails found',
}: EmailListCardProps): ReactNode {
  const [activeCategory, setActiveCategory] = useState<string>(categories?.[0] ?? 'All');

  // Filter emails by active category
  const filteredEmails = categories && activeCategory !== 'All'
    ? emails.filter(e => e.category === activeCategory || e.tags?.some(t => t.includes(activeCategory)))
    : emails;

  return (
    <Card padding="md" className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text-primary">{title}</h3>
        {categories && categories.length > 0 && (
          <div className="flex items-center gap-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
                  activeCategory === cat
                    ? 'bg-brand text-white'
                    : 'bg-surface-muted text-text-secondary hover:bg-surface-hover'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto space-y-3">
        {filteredEmails.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">{emptyMessage}</p>
        ) : (
          filteredEmails.map((email) => (
            <div
              key={email.id}
              onClick={() => onEmailClick?.(email)}
              className="relative p-4 bg-white rounded-lg border border-border hover:border-brand cursor-pointer transition-colors"
            >
              {/* Unread indicator */}
              {showUnreadIndicator && !email.isRead && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-brand" />
              )}

              <div className={`flex items-start justify-between gap-3 mb-2 ${showUnreadIndicator && !email.isRead ? 'pl-4' : showSender ? '' : ''}`}>
                {/* Sender avatar (topic view) */}
                {showSender && email.sender && (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-brand">{email.sender.initial}</span>
                    </div>
                    <span className="text-sm font-medium text-text-primary truncate">
                      {email.subject}
                    </span>
                  </div>
                )}
                {!showSender && (
                  <h4 className="text-sm font-semibold text-text-primary truncate flex-1">
                    {email.subject}
                  </h4>
                )}
                <span className="text-[11px] text-text-muted flex-shrink-0">
                  {formatRelativeTime(email.receivedAt)}
                </span>
              </div>

              <p className={`text-[12px] text-text-muted line-clamp-2 mb-2 ${showUnreadIndicator && !email.isRead ? 'pl-4' : showSender && email.sender ? 'ml-8' : ''}`}>
                {email.snippet}
              </p>

              {email.tags && email.tags.length > 0 && (
                <div className={`flex items-center gap-2 ${showUnreadIndicator && !email.isRead ? 'pl-4' : showSender && email.sender ? 'ml-8' : ''}`}>
                  {email.tags.map((tag, i) => (
                    <Badge key={i} color="orange">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
