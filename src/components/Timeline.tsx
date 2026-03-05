import type { ReactNode } from 'react';

export interface TimelineUpdate {
  id: string;
  title: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  emailId: string;
}

export interface TimelineProps {
  updates: TimelineUpdate[];
  priorityFilter?: 'high' | 'medium' | 'low';
  dateGrouping?: boolean;
  emptyMessage?: string;
}

/**
 * Timeline component displays a chronological feed of email updates.
 */
export function Timeline({
  updates,
  priorityFilter,
  dateGrouping = true,
  emptyMessage = 'No updates to display',
}: TimelineProps): ReactNode {
  // Filter by priority if specified
  const filteredUpdates = priorityFilter
    ? updates.filter((update) => update.priority === priorityFilter)
    : updates;

  // Sort by date (newest first)
  const sortedUpdates = [...filteredUpdates].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Group by date if enabled
  const groupedUpdates = dateGrouping
    ? groupByDate(sortedUpdates)
    : { 'All Updates': sortedUpdates };

  if (sortedUpdates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {Object.entries(groupedUpdates).map(([date, dateUpdates]) => (
        <div key={date} className="flex flex-col gap-3">
          {dateGrouping && (
            <h3 className="text-sm font-medium text-muted-foreground">{date}</h3>
          )}
          {dateUpdates.map((update) => (
            <TimelineItem key={update.id} update={update} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface TimelineItemProps {
  update: TimelineUpdate;
}

function TimelineItem({ update }: TimelineItemProps): ReactNode {
  const priorityColors = {
    high: 'border-l-red-500',
    medium: 'border-l-yellow-500',
    low: 'border-l-green-500',
  };

  return (
    <div
      className={`border-l-4 pl-4 py-2 ${priorityColors[update.priority]}`}
      data-testid="timeline-item"
    >
      <h4 className="font-medium">{update.title}</h4>
      {update.description && (
        <p className="text-sm text-muted-foreground mt-1">{update.description}</p>
      )}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-muted-foreground">
          {formatDate(update.createdAt)}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
          {update.priority}
        </span>
      </div>
    </div>
  );
}

function groupByDate(
  updates: TimelineUpdate[]
): Record<string, TimelineUpdate[]> {
  const groups: Record<string, TimelineUpdate[]> = {};

  for (const update of updates) {
    const dateKey = formatDateGroup(update.createdAt);
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(update);
  }

  return groups;
}

function formatDateGroup(date: Date): string {
  const now = new Date();
  const updateDate = new Date(date);
  const diffMs = now.getTime() - updateDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return updateDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}
