import { useState, useMemo, type ReactNode } from 'react';
import { TimelineZoomControl, type ZoomLevel } from '../TimelineZoomControl';
import { TimelineDayHeader } from '../TimelineDayHeader';
import { RichTimelineCard, type RichTimelineCardData } from '../RichTimelineCard';
import {
  TimelineFilterBox,
  type TimelineFilterState,
} from '../TimelineFilterBox';
import type { TopicInfo } from '../../stores/timeline';

export interface TimelineCardData extends Omit<RichTimelineCardData, 'time' | 'actionItemCount'> {
  actionItemCount?: number;
  emailType?: string;
  topic?: TopicInfo;
  sender?: {
    email: string;
    name?: string | null;
    domain: string;
  };
}

export interface TimelineCardProps {
  data: TimelineCardData;
  onClick?: () => void;
}

/** Stub export retained for backwards-compat — actual rendering uses RichTimelineCard via the vertical timeline layout. */
export function TimelineCard({ data, onClick }: TimelineCardProps): ReactNode {
  return (
    <div
      className="bg-white rounded-xl border border-[#D2E0E5] p-4 cursor-pointer hover:border-[#0F848A] transition-colors"
      onClick={onClick}
    >
      <h4 className="text-[15px] font-semibold text-[#031f20]">{data.title}</h4>
      {data.summary && (
        <p className="text-[13px] text-[#4a4653] leading-relaxed mt-1">{data.summary}</p>
      )}
    </div>
  );
}

export interface TimelineScreenProps {
  updates: TimelineCardData[];
  weekSenders?: Array<{ id: string; domain: string; category: string; count: number; summary: string; badgeBg: string; badgeText: string }>;
  monthStats?: Array<{ id: string; month: string; weeks: number; emails: number; actionItems: number }>;
  yearStats?: Array<{ id: string; year: string; emails: number; actionItems: number; deals: number }>;
  onCardClick?: (update: TimelineCardData) => void;
  /** Called when a sender card in the Week view is clicked. Receives the sender's domain name. */
  onWeekSenderClick?: (domain: string) => void;
  onFilterChange?: (filter: TimelineFilterState) => void;
  isLoading?: boolean;
}

// Types for aggregated data
export interface WeekSenderItem {
  id: string;
  domain: string;
  category: string;
  count: number;
  summary: string;
  badgeBg: string;
  badgeText: string;
}

export interface MonthStatsItem {
  id: string;
  month: string;
  weeks: number;
  emails: number;
  actionItems: number;
}

export interface YearStatsItem {
  id: string;
  year: string;
  emails: number;
  actionItems: number;
  deals: number;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const ChevronLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const FilterIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const CalendarSmIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

// ─── Shared Vertical Timeline Rail Layout ─────────────────────────────────────
// The rail sits at ~55% from the left. Left cards alternate with right cards.
// Left cards: right-aligned, connector goes from card right edge to dot on its left
// Right cards: left-aligned, connector goes from dot to card left edge

interface VerticalTimelineProps<T> {
  items: T[];
  renderCard: (item: T) => ReactNode;
  getKey: (item: T) => string;
}

function VerticalTimeline<T>({ items, renderCard, getKey }: VerticalTimelineProps<T>): ReactNode {
  // Rail position: 530px from left in a ~1060px content area ≈ 50% but slightly left of center
  // We use a fixed pixel approach matching the design: 530px from left in viewport
  // Using CSS: rail at left: 530px (absolute), cards at left start: 132px, cards on right: left: 552px
  // Max card width: 380px in design. We'll use proportional layout.

  return (
    <div className="relative w-full overflow-hidden" style={{ minHeight: '600px' }}>
      {/* Vertical Rail */}
      <div
        className="absolute top-0 bottom-0 rounded-full bg-[#D2E0E5]"
        style={{ left: '50%', width: '4px', transform: 'translateX(-50%)' }}
      />

      {/* Items */}
      <div className="relative flex flex-col pt-4 pb-12">
        {items.map((item, index) => {
          const isLeft = index % 2 === 0;
          return (
            <div
              key={getKey(item)}
              className="relative flex items-start mb-2"
              style={{ minHeight: '38px' }}
            >
              {/* Left slot */}
              <div
                className="flex justify-end pr-4"
                style={{ width: '50%' }}
              >
                {isLeft && (
                  <div style={{ width: '380px', maxWidth: '380px' }}>
                    {renderCard(item)}
                  </div>
                )}
              </div>

              {/* Rail dot + connector */}
              <div className="relative flex-shrink-0" style={{ width: '0px' }}>
                {/* Dot */}
                <div
                  className="absolute rounded-full bg-[#0F848A] z-10"
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '3px solid #CFF7F9',
                    left: '-8px',
                    top: '12px',
                  }}
                />
                {/* Connector to left card */}
                {isLeft && (
                  <div
                    className="absolute bg-[#D2E0E5]"
                    style={{ height: '2px', width: '5px', right: '8px', top: '19px' }}
                  />
                )}
                {/* Connector to right card */}
                {!isLeft && (
                  <div
                    className="absolute bg-[#D2E0E5]"
                    style={{ height: '2px', width: '5px', left: '8px', top: '19px' }}
                  />
                )}
              </div>

              {/* Right slot */}
              <div
                className="flex justify-start pl-4"
                style={{ width: '50%' }}
              >
                {!isLeft && (
                  <div style={{ width: '380px', maxWidth: '380px' }}>
                    {renderCard(item)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week Sender Card ─────────────────────────────────────────────────────────

function WeekSenderCard({ item, onClick }: { item: WeekSenderItem; onClick?: () => void }): ReactNode {
  return (
    <div
      className="bg-white rounded-xl border border-[#D2E0E5] p-4 flex flex-col gap-2 cursor-pointer hover:border-[#0F848A] hover:shadow-md transition-all duration-150"
      style={{ boxShadow: '0 2px 8px rgba(3,31,32,0.06)' }}
      onClick={onClick}
    >
      {/* Header: domain + badge */}
      <div className="flex items-center justify-between">
        <span className="text-[16px] font-bold text-[#031f20]">{item.domain}</span>
        <span
          className="text-[11px] font-semibold rounded-full px-2.5 py-0.5"
          style={{ backgroundColor: item.badgeBg, color: item.badgeText }}
        >
          {item.category}
        </span>
      </div>
      {/* Meta */}
      <span className="text-[13px] font-medium text-[#4a4653]">
        {item.count} email{item.count !== 1 ? 's' : ''} this week
      </span>
      {/* Summary */}
      <p className="text-[13px] text-[#4a4653] leading-[1.4] line-clamp-2">
        {item.summary}
      </p>
    </div>
  );
}

// ─── Month Stats Card ─────────────────────────────────────────────────────────

function MonthStatsCard({ item }: { item: MonthStatsItem }): ReactNode {
  return (
    <div
      className="bg-white rounded-xl border border-[#D2E0E5] p-5 flex flex-col gap-4"
      style={{ boxShadow: '0 4px 12px rgba(3,31,32,0.06)' }}
    >
      {/* Header: Month name + badge */}
      <div className="flex items-center justify-between">
        <span className="text-[24px] font-bold text-[#031f20]">{item.month}</span>
        <span className="text-[11px] font-semibold text-[#052c2e] bg-[#EEF5F6] rounded-xl px-2 py-1">
          {item.weeks} Weeks
        </span>
      </div>
      {/* Stats */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-[13px] text-[#4a4653]">Emails</span>
          <span className="text-[13px] font-semibold text-[#031f20]">{item.emails.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[13px] text-[#4a4653]">Action Items</span>
          <span className="text-[13px] font-semibold text-[#031f20]">{item.actionItems.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Year Stats Card ──────────────────────────────────────────────────────────

function YearStatsCard({ item }: { item: YearStatsItem }): ReactNode {
  return (
    <div
      className="bg-white rounded-2xl border border-[#D2E0E5] p-6 flex flex-col gap-4"
      style={{ boxShadow: '0 4px 12px rgba(3,31,32,0.06)' }}
    >
      {/* Header: Year + badge */}
      <div className="flex items-center justify-between">
        <span className="text-[40px] font-bold text-[#031f20] leading-none">{item.year}</span>
        <span className="text-[12px] font-semibold text-[#052c2e] bg-[#EEF5F6] rounded-xl px-2.5 py-1">
          12 Months
        </span>
      </div>
      {/* Stats */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-[13px] text-[#4a4653]">Emails Processed</span>
          <span className="text-[14px] font-semibold text-[#031f20]">{item.emails.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[13px] text-[#4a4653]">Action Items</span>
          <span className="text-[14px] font-semibold text-[#031f20]">{item.actionItems.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[13px] text-[#4a4653]">Deals Found</span>
          <span className="text-[14px] font-semibold text-[#031f20]">{item.deals.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Badge Helpers ──────────────────────────────────────────────────────────

function getCategoryBadgeBg(category: string): string {
  const colors: Record<string, string> = {
    'Shopping': '#FFF3E0',
    'Banking': '#EEF5F6',
    'Social': '#EDECF9',
    'Travel': '#E1F0FF',
    'Entertainment': '#FCE4E4',
    'Developer': '#E8F5E9',
    'Technology': '#E8F5E9',
    'Education': '#FFF8E1',
    'Health': '#E0F2F1',
    'General': '#F5F5F5',
  };
  return colors[category] || '#F5F5F5';
}

function getCategoryBadgeText(category: string): string {
  const colors: Record<string, string> = {
    'Shopping': '#E65100',
    'Banking': '#4a4653',
    'Social': '#4a4653',
    'Travel': '#4a4653',
    'Entertainment': '#C62828',
    'Developer': '#2E7D32',
    'Technology': '#2E7D32',
    'Education': '#F57C00',
    'Health': '#00695C',
    'General': '#4a4653',
  };
  return colors[category] || '#4a4653';
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

/**
 * TimelineScreen displays a chronological feed of email updates.
 * Supports Year/Month/Week/Day zoom levels, matching TuskerBrain design system.
 */
export function TimelineScreen({
  updates,
  weekSenders = [],
  monthStats = [],
  yearStats = [],
  onCardClick,
  onWeekSenderClick,
  onFilterChange,
  isLoading,
}: TimelineScreenProps): ReactNode {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isFilterBoxOpen, setIsFilterBoxOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<TimelineFilterState>({});

  // Calculate active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeFilters.emailTypes?.length) count += activeFilters.emailTypes.length;
    if (activeFilters.topics?.length) count += activeFilters.topics.length;
    if (activeFilters.priorities?.length) count += activeFilters.priorities.length;
    if (activeFilters.dateRange) count += 1;
    return count;
  }, [activeFilters]);

  const hasActiveFilters = activeFilterCount > 0;

  // Subtitle per zoom level
  const subtitles: Record<ZoomLevel, string> = {
    year: 'Aggregated yearly email activity on the main vertical timeline',
    month: 'Monthly aggregates shown on the same vertical timeline axis',
    week: 'Central rail timeline for weekly planning and milestones',
    day: 'Detailed email view for the selected day',
  };

  // Filter updates for day view
  const getUpdatesForDay = (date: Date): TimelineCardData[] =>
    updates.filter((u) => {
      const d = new Date(u.createdAt);
      return (
        d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate()
      );
    });

  const dayUpdates = useMemo(
    () =>
      getUpdatesForDay(selectedDate).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [selectedDate, updates]
  );

  // Get date range bounds for filter (relative to today)
  const getFilterDateRangeBounds = (range: string): { start: Date; end: Date } => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (range) {
      case 'today': {
        const end = new Date(today);
        end.setDate(end.getDate() + 1);
        return { start: today, end };
      }
      case 'week': {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay()); // Sunday
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        return { start, end };
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        return { start, end };
      }
      case 'quarter': {
        const quarter = Math.floor(today.getMonth() / 3);
        const start = new Date(today.getFullYear(), quarter * 3, 1);
        const end = new Date(today.getFullYear(), quarter * 3 + 3, 1);
        return { start, end };
      }
      default:
        return { start: new Date(0), end: new Date() }; // All time
    }
  };

  // Get date range for the current view based on selectedDate and zoomLevel
  const getViewDateRange = (): { start: Date; end: Date } => {
    switch (zoomLevel) {
      case 'day': {
        const start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { start, end };
      }
      case 'week': {
        const start = new Date(selectedDate);
        start.setDate(selectedDate.getDate() - selectedDate.getDay()); // Sunday
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        return { start, end };
      }
      case 'month': {
        const start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        const end = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
        return { start, end };
      }
      case 'year': {
        const start = new Date(selectedDate.getFullYear(), 0, 1);
        const end = new Date(selectedDate.getFullYear() + 1, 0, 1);
        return { start, end };
      }
      default:
        return { start: new Date(0), end: new Date() };
    }
  };

  // Helper to parse date from various formats
  const parseDate = (date: Date | string): Date => {
    return date instanceof Date ? date : new Date(date);
  };

  // Check if a date is within a range
  const isWithinRange = (date: Date | string, start: Date, end: Date): boolean => {
    const d = parseDate(date);
    return d >= start && d < end;
  };

  // Apply non-date filters to updates
  const applyNonDateFilters = (items: TimelineCardData[]): TimelineCardData[] => {
    let result = [...items];

    // Apply email type filter
    if (activeFilters.emailTypes?.length) {
      result = result.filter((u) =>
        activeFilters.emailTypes!.includes(u.emailType || 'regular')
      );
    }

    // Apply topic filter
    if (activeFilters.topics?.length) {
      result = result.filter((u) => {
        if (!u.topic) return false;
        return activeFilters.topics!.some(
          (t) => u.topic!.all.some(path => path === t || path.startsWith(t + '/'))
        );
      });
    }

    // Apply priority filter
    if (activeFilters.priorities?.length) {
      result = result.filter((u) =>
        activeFilters.priorities!.includes(u.priority || 'medium')
      );
    }

    return result;
  };

  // Filtered updates for day view
  const filteredDayUpdates = useMemo(() => {
    // Start with updates for the selected day
    let result = dayUpdates;

    // If date range filter is set, filter by that date range instead
    if (activeFilters.dateRange) {
      const { start, end } = getFilterDateRangeBounds(activeFilters.dateRange);
      result = updates.filter((u) => {
        const d = new Date(u.createdAt);
        return d >= start && d < end;
      });
    }

    // Apply other filters
    result = applyNonDateFilters(result);

    return result.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [dayUpdates, updates, activeFilters]);

  // Helper to extract sender domain from update
  const getSenderDomain = (u: TimelineCardData): string => {
    if (u.sender?.domain) {
      return u.sender.domain;
    }
    if (u.sender?.email) {
      const parts = u.sender.email.split('@');
      return parts[1] || parts[0];
    }
    // Fallback to title only as a last resort, but now sender info should be available
    return u.title?.split(' ')[0] || `Item-${u.id.slice(0, 4)}`;
  };

  // Filtered week senders - aggregate senders from the selected week
  const filteredWeekSenders = useMemo(() => {
    // If no filters and we have provided weekSenders, use those (they have better metadata)
    if (!hasActiveFilters && weekSenders.length > 0) {
      return weekSenders;
    }

    // Determine the date range to use
    let dateStart: Date;
    let dateEnd: Date;

    if (activeFilters.dateRange) {
      // Use the filter's date range directly
      const bounds = getFilterDateRangeBounds(activeFilters.dateRange);
      dateStart = bounds.start;
      dateEnd = bounds.end;
    } else {
      // Use the selected week
      const bounds = getViewDateRange();
      dateStart = bounds.start;
      dateEnd = bounds.end;
    }

    // Filter updates by date range
    let filtered = updates.filter((u) => isWithinRange(u.createdAt, dateStart, dateEnd));

    // Apply other filters (email type, topic, priority)
    filtered = applyNonDateFilters(filtered);

    // Aggregate by sender domain
    const senderMap = new Map<string, { count: number; summaries: string[]; category: string }>();
    filtered.forEach((u) => {
      const domain = getSenderDomain(u);
      const rootTopic = u.topic?.primary.split('/')[0] || u.emailType || 'General';
      const existing = senderMap.get(domain) || { 
        count: 0, 
        summaries: [], 
        category: rootTopic // Use the topic as the category badge!
      };
      existing.count++;
      if (u.summary) existing.summaries.push(u.summary);
      senderMap.set(domain, existing);
    });

    // Convert to WeekSenderItem format and sort by count
    return Array.from(senderMap.entries())
      .map(([domain, data], index) => ({
        id: `sender-${index}`,
        domain,
        category: data.category,
        count: data.count,
        summary: data.summaries[0] || '',
        badgeBg: getCategoryBadgeBg(data.category),
        badgeText: getCategoryBadgeText(data.category),
      }))
      .sort((a, b) => b.count - a.count);
  }, [updates, activeFilters, selectedDate, weekSenders, hasActiveFilters]);

  // Filtered month stats - use provided stats or recalculate with filters
  const filteredMonthStats = useMemo(() => {
    // If no filters, use provided monthStats
    if (!hasActiveFilters && monthStats.length > 0) {
      return monthStats;
    }

    // Otherwise, recalculate from all updates with filters applied
    let filtered = applyNonDateFilters(updates);

    // Apply date range filter if set
    if (activeFilters.dateRange) {
      const { start, end } = getFilterDateRangeBounds(activeFilters.dateRange);
      filtered = filtered.filter((u) => isWithinRange(u.createdAt, start, end));
    }

    // Aggregate by month
    const monthMap = new Map<string, { emails: number; actionItems: number; weeks: Set<number>; monthName: string }>();
    filtered.forEach((u) => {
      const d = parseDate(u.createdAt);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const existing = monthMap.get(monthKey) || { emails: 0, actionItems: 0, weeks: new Set<number>(), monthName };
      existing.emails++;
      if (u.hasActionItem) existing.actionItems++;
      const weekNum = Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7);
      existing.weeks.add(weekNum);
      monthMap.set(monthKey, existing);
    });

    return Array.from(monthMap.entries())
      .map(([key, data], index) => ({
        id: `month-${index}`,
        month: data.monthName,
        weeks: data.weeks.size,
        emails: data.emails,
        actionItems: data.actionItems,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [updates, activeFilters, monthStats, hasActiveFilters]);

  // Filtered year stats - use provided stats or recalculate with filters
  const filteredYearStats = useMemo(() => {
    // If no filters, use provided yearStats
    if (!hasActiveFilters && yearStats.length > 0) {
      return yearStats;
    }

    // Otherwise, recalculate from all updates with filters applied
    let filtered = applyNonDateFilters(updates);

    // Apply date range filter if set
    if (activeFilters.dateRange) {
      const { start, end } = getFilterDateRangeBounds(activeFilters.dateRange);
      filtered = filtered.filter((u) => {
        const d = new Date(u.createdAt);
        return d >= start && d < end;
      });
    }

    // Aggregate by year
    const yearMap = new Map<string, { emails: number; actionItems: number; deals: number }>();
    filtered.forEach((u) => {
      const d = new Date(u.createdAt);
      const yearKey = String(d.getFullYear());

      const existing = yearMap.get(yearKey) || { emails: 0, actionItems: 0, deals: 0 };
      existing.emails++;
      if (u.hasActionItem) existing.actionItems++;
      yearMap.set(yearKey, existing);
    });

    return Array.from(yearMap.entries())
      .map(([year, data], index) => ({
        id: `year-${index}`,
        year,
        emails: data.emails,
        actionItems: data.actionItems,
        deals: data.deals,
      }))
      .sort((a, b) => b.year.localeCompare(a.year));
  }, [updates, activeFilters, yearStats, hasActiveFilters]);

  // Navigation
  const navigatePrev = () => {
    const d = new Date(selectedDate);
    if (zoomLevel === 'day') d.setDate(d.getDate() - 1);
    else if (zoomLevel === 'week') d.setDate(d.getDate() - 7);
    else if (zoomLevel === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    setSelectedDate(d);
  };

  const navigateNext = () => {
    const d = new Date(selectedDate);
    if (zoomLevel === 'day') d.setDate(d.getDate() + 1);
    else if (zoomLevel === 'week') d.setDate(d.getDate() + 7);
    else if (zoomLevel === 'month') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    setSelectedDate(d);
  };

  const goToToday = () => setSelectedDate(new Date());

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-white animate-pulse rounded-xl border border-[#D2E0E5]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-2 pb-4">
        {/* Row 1: Title + Zoom + Nav + Filter */}
        <div className="flex items-start justify-between gap-4">
          {/* Left: Title + subtitle */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="font-display text-[28px] font-bold text-[#031f20] leading-tight">
              Timeline
            </h1>
            <p className="text-[13px] text-[#4a4653]">{subtitles[zoomLevel]}</p>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            {/* Zoom tabs */}
            <TimelineZoomControl value={zoomLevel} onChange={setZoomLevel} />

            {/* Prev / Today / Next */}
            <div className="flex items-center">
              <button
                onClick={navigatePrev}
                className="p-2 rounded-lg hover:bg-[#EEF5F6] transition-colors text-[#4a4653]"
                title="Previous"
              >
                <ChevronLeftIcon />
              </button>
              <button
                onClick={goToToday}
                className="px-2.5 py-1 text-[13px] font-medium text-[#0F848A] hover:bg-[#EEF5F6] rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                onClick={navigateNext}
                className="p-2 rounded-lg hover:bg-[#EEF5F6] transition-colors text-[#4a4653]"
                title="Next"
              >
                <ChevronRightIcon />
              </button>
            </div>

            {/* Filter button */}
            <button
              onClick={() => setIsFilterBoxOpen(!isFilterBoxOpen)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors ${
                isFilterBoxOpen || hasActiveFilters
                  ? 'bg-[#0F848A] text-white border-[#0F848A]'
                  : 'bg-white text-[#4a4653] border-[#D2E0E5] hover:border-[#0F848A]'
              }`}
            >
              <FilterIcon />
              {hasActiveFilters && (
                <span className="text-[11px] font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter Box */}
        <TimelineFilterBox
          isOpen={isFilterBoxOpen}
          onClose={() => setIsFilterBoxOpen(false)}
          filters={activeFilters}
          onFilterChange={(filters) => {
            setActiveFilters(filters);
            onFilterChange?.(filters);
          }}
        />

        {/* Day header (date pill selector) – only for day view */}
        {zoomLevel === 'day' && (
          <div className="mt-2">
            <TimelineDayHeader
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
            />
          </div>
        )}
      </div>

      {/* ── Timeline Canvas ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4">
        {zoomLevel === 'year' && (
          <VerticalTimeline
            items={filteredYearStats}
            getKey={(item) => item.id}
            renderCard={(item) => <YearStatsCard item={item} />}
          />
        )}

        {zoomLevel === 'month' && (
          <VerticalTimeline
            items={filteredMonthStats}
            getKey={(item) => item.id}
            renderCard={(item) => <MonthStatsCard item={item} />}
          />
        )}

        {zoomLevel === 'week' && (
          <VerticalTimeline
            items={filteredWeekSenders}
            getKey={(item) => item.id}
            renderCard={(item) => (
              <WeekSenderCard
                item={item}
                onClick={() => onWeekSenderClick?.(item.domain)}
              />
            )}
          />
        )}

        {zoomLevel === 'day' && (
          filteredDayUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#4a4653]">
              <CalendarSmIcon />
              <p className="text-[15px] font-semibold text-[#031f20] mt-4 mb-1">No updates for this day</p>
              <p className="text-[13px]">Try selecting a different date or zoom level.</p>
            </div>
          ) : (
            <DayVerticalTimeline updates={filteredDayUpdates} onCardClick={onCardClick} />
          )
        )}
      </div>
    </div>
  );
}

// ─── Day View: Vertical timeline with RichTimelineCards ───────────────────────

function DayVerticalTimeline({
  updates,
  onCardClick,
}: {
  updates: TimelineCardData[];
  onCardClick?: (u: TimelineCardData) => void;
}): ReactNode {
  return (
    <div className="relative w-full" style={{ minHeight: '600px' }}>
      {/* Rail */}
      <div
        className="absolute top-0 bottom-0 rounded-full bg-[#D2E0E5]"
        style={{ left: '50%', width: '4px', transform: 'translateX(-50%)' }}
      />

      <div className="relative flex flex-col pt-4 pb-12">
        {updates.map((update, index) => {
          const isLeft = index % 2 === 0;
          return (
            <div
              key={update.id}
              className="relative flex items-start mb-2"
              style={{ minHeight: '38px' }}
            >
              {/* Left slot */}
              <div className="flex justify-end pr-4" style={{ width: '50%' }}>
                {isLeft && (
                  <div style={{ width: '380px', maxWidth: '380px' }}>
                    <RichTimelineCard
                      data={{
                        ...update,
                        time: new Date(update.createdAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                      }}
                      onClick={() => onCardClick?.(update)}
                    />
                  </div>
                )}
              </div>

              {/* Rail dot */}
              <div className="relative flex-shrink-0" style={{ width: '0px' }}>
                <div
                  className="absolute rounded-full bg-[#0F848A] z-10"
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '3px solid #CFF7F9',
                    left: '-8px',
                    top: '12px',
                  }}
                />
                {/* connector */}
                {isLeft && (
                  <div className="absolute bg-[#D2E0E5]" style={{ height: '2px', width: '5px', right: '8px', top: '19px' }} />
                )}
                {!isLeft && (
                  <div className="absolute bg-[#D2E0E5]" style={{ height: '2px', width: '5px', left: '8px', top: '19px' }} />
                )}
              </div>

              {/* Right slot */}
              <div className="flex justify-start pl-4" style={{ width: '50%' }}>
                {!isLeft && (
                  <div style={{ width: '380px', maxWidth: '380px' }}>
                    <RichTimelineCard
                      data={{
                        ...update,
                        time: new Date(update.createdAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                      }}
                      onClick={() => onCardClick?.(update)}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
