import type { ReactNode } from 'react';
import { Card } from './Card';

export interface ActionItem {
  id: string;
  title: string;
  completed?: boolean;
  dueDate?: string;
  urgent?: boolean;
}

export interface ActionItemsCardProps {
  /** Title shown in the card header */
  title?: string;
  /** Action items to display */
  items: ActionItem[];
  /** Callback when an item is toggled */
  onToggleItem?: (id: string) => void;
  /** Show progress bar and completion stats */
  showProgress?: boolean;
  /** Maximum number of items to display (undefined = show all) */
  maxItems?: number;
  /** Optional content to render after the items list */
  footer?: ReactNode;
}

/**
 * ActionItemsCard - Unified action items component.
 * Matches SenderDetailView's canonical design with optional features.
 */
export function ActionItemsCard({
  title = 'Action Items',
  items,
  onToggleItem,
  showProgress = true,
  maxItems,
  footer,
}: ActionItemsCardProps): ReactNode {
  const safeItems = items ?? [];
  if (safeItems.length === 0) return null;

  const completedActions = safeItems.filter(item => item.completed).length;
  const totalActions = safeItems.length;
  const pendingActions = totalActions - completedActions;
  const displayItems = maxItems ? safeItems.slice(0, maxItems) : safeItems;

  return (
    <Card padding="md">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-[13px] font-bold text-text-primary">{title}</span>
        </div>
        {showProgress && totalActions > 0 && pendingActions > 0 && (
          <div className="px-2 py-0.5 bg-red-50 rounded text-[10px] font-semibold text-red-600">
            {pendingActions} pending
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {showProgress && totalActions > 0 && (
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
      )}

      {/* Action Items List */}
      <div className="space-y-2">
        {displayItems.map((item) => (
          <div
            key={item.id}
            onClick={() => onToggleItem?.(item.id)}
            className={`flex items-center gap-3 p-2.5 bg-surface-muted rounded-lg transition-colors ${onToggleItem ? 'cursor-pointer hover:bg-brand-50' : ''}`}
          >
            {/* Checkbox */}
            <div className={`w-5 h-5 rounded flex items-center justify-center border ${
              item.completed ? 'bg-brand border-brand' : 'border-border'
            }`}>
              {item.completed && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>

            {/* Content */}
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

      {/* Footer */}
      {footer && (
        <div className="mt-3">
          {footer}
        </div>
      )}
    </Card>
  );
}
