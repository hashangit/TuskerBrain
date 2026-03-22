import { useState, useMemo, type ReactNode } from 'react';
import { TimelineZoomControl, type ZoomLevel } from '../TimelineZoomControl';
import { TimelineDayHeader } from '../TimelineDayHeader';
import { RichTimelineCard, type RichTimelineCardData } from '../RichTimelineCard';
import {
  TimelineFilterBox,
  type TimelineFilterState,
} from '../TimelineFilterBox';

export interface TimelineCardData extends Omit<RichTimelineCardData, 'time' | 'actionItemCount'> {
  actionItemCount?: number;
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
  onCardClick?: (update: TimelineCardData) => void;
  /** Called when a sender card in the Week view is clicked. Receives the sender's domain name. */
  onWeekSenderClick?: (domain: string) => void;
  onFilterChange?: (filter: TimelineFilterState) => void;
  isLoading?: boolean;
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

// ─── Mock Data ────────────────────────────────────────────────────────────────

const WEEK_SENDERS = [
  { id: 'w1', domain: 'amazon.com', category: 'Shopping', badgeBg: '#FFF3E0', badgeText: '#E65100', count: 45, summary: 'Summary of Amazon emails including 3 tracking updates, 2 promotional offers, and a recent order confirmation.' },
  { id: 'w2', domain: 'chase.com', category: 'Banking', badgeBg: '#EEF5F6', badgeText: '#4a4653', count: 12, summary: 'Payment confirmations and monthly statements.' },
  { id: 'w3', domain: 'linkedin.com', category: 'Social', badgeBg: '#EDECF9', badgeText: '#4a4653', count: 89, summary: 'Weekly digest, new connection requests, and trending articles in your network.' },
  { id: 'w4', domain: 'delta.com', category: 'Travel', badgeBg: '#E1F0FF', badgeText: '#4a4653', count: 3, summary: 'Flight confirmations for your upcoming trip.' },
  { id: 'w5', domain: 'netflix.com', category: 'Entertainment', badgeBg: '#FCE4E4', badgeText: '#C62828', count: 1, summary: 'New sign-ins and top picks.' },
  { id: 'w6', domain: 'github.com', category: 'Developer', badgeBg: '#FCE4E4', badgeText: '#C62828', count: 24, summary: 'Pull requests and issue notifications.' },
];

const MONTH_STATS = [
  { id: 'm1', month: 'March 2026', weeks: 4, emails: 1240, actionItems: 45 },
  { id: 'm2', month: 'February 2026', weeks: 4, emails: 4120, actionItems: 126 },
  { id: 'm3', month: 'January 2026', weeks: 4, emails: 5430, actionItems: 189 },
];

const YEAR_STATS = [
  { id: 'y1', year: '2026', emails: 12450, actionItems: 432, deals: 89 },
  { id: 'y2', year: '2025', emails: 45210, actionItems: 2143, deals: 450 },
  { id: 'y3', year: '2024', emails: 38400, actionItems: 1890, deals: 320 },
];

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
      <div className="relative flex flex-col pt-8 pb-16">
        {items.map((item, index) => {
          const isLeft = index % 2 === 0;
          return (
            <div
              key={getKey(item)}
              className="relative flex items-start mb-10"
              style={{ minHeight: '120px' }}
            >
              {/* Left slot */}
              <div
                className="flex justify-end pr-10"
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
                    style={{ height: '2px', width: '12px', right: '8px', top: '19px' }}
                  />
                )}
                {/* Connector to right card */}
                {!isLeft && (
                  <div
                    className="absolute bg-[#D2E0E5]"
                    style={{ height: '2px', width: '12px', left: '8px', top: '19px' }}
                  />
                )}
              </div>

              {/* Right slot */}
              <div
                className="flex justify-start pl-10"
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

function WeekSenderCard({ item, onClick }: { item: typeof WEEK_SENDERS[0]; onClick?: () => void }): ReactNode {
  return (
    <div
      className="bg-white rounded-xl border border-[#D2E0E5] p-5 flex flex-col gap-3 cursor-pointer hover:border-[#0F848A] hover:shadow-md transition-all duration-150"
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
      <p className="text-[13px] text-[#4a4653] leading-[1.4] line-clamp-3">
        {item.summary}
      </p>
    </div>
  );
}

// ─── Month Stats Card ─────────────────────────────────────────────────────────

function MonthStatsCard({ item }: { item: typeof MONTH_STATS[0] }): ReactNode {
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

function YearStatsCard({ item }: { item: typeof YEAR_STATS[0] }): ReactNode {
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

/**
 * TimelineScreen displays a chronological feed of email updates.
 * Supports Year/Month/Week/Day zoom levels, matching TuskerBrain design system.
 */
export function TimelineScreen({
  updates,
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
          <div className="mt-4">
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
            items={YEAR_STATS}
            getKey={(item) => item.id}
            renderCard={(item) => <YearStatsCard item={item} />}
          />
        )}

        {zoomLevel === 'month' && (
          <VerticalTimeline
            items={MONTH_STATS}
            getKey={(item) => item.id}
            renderCard={(item) => <MonthStatsCard item={item} />}
          />
        )}

        {zoomLevel === 'week' && (
          <VerticalTimeline
            items={WEEK_SENDERS}
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
          dayUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#4a4653]">
              <CalendarSmIcon />
              <p className="text-[15px] font-semibold text-[#031f20] mt-4 mb-1">No updates for this day</p>
              <p className="text-[13px]">Try selecting a different date or zoom level.</p>
            </div>
          ) : (
            <DayVerticalTimeline updates={dayUpdates} onCardClick={onCardClick} />
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

      <div className="relative flex flex-col pt-8 pb-16">
        {updates.map((update, index) => {
          const isLeft = index % 2 === 0;
          return (
            <div
              key={update.id}
              className="relative flex items-start mb-10"
              style={{ minHeight: '120px' }}
            >
              {/* Left slot */}
              <div className="flex justify-end pr-10" style={{ width: '50%' }}>
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
                  <div className="absolute bg-[#D2E0E5]" style={{ height: '2px', width: '12px', right: '8px', top: '19px' }} />
                )}
                {!isLeft && (
                  <div className="absolute bg-[#D2E0E5]" style={{ height: '2px', width: '12px', left: '8px', top: '19px' }} />
                )}
              </div>

              {/* Right slot */}
              <div className="flex justify-start pl-10" style={{ width: '50%' }}>
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
