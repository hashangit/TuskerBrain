import type { ReactNode } from 'react';

export interface TimelineDayHeaderProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  visibleDays?: number;
}

/**
 * Horizontal date navigation for Timeline Day view.
 * Shows surrounding dates with selected date highlighted.
 * Matches TuskerBrain design system.
 */
export function TimelineDayHeader({
  selectedDate,
  onDateChange,
  visibleDays = 5,
}: TimelineDayHeaderProps): ReactNode {
  const getVisibleDates = (): Date[] => {
    const dates: Date[] = [];
    const halfRange = Math.floor(visibleDays / 2);

    for (let i = -halfRange; i <= halfRange; i++) {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }

    return dates;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const isSameDay = (date1: Date, date2: Date): boolean => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const isToday = (date: Date): boolean => {
    return isSameDay(date, new Date());
  };

  const isSelected = (date: Date): boolean => {
    return isSameDay(date, selectedDate);
  };

  const dates = getVisibleDates();

  return (
    <div className="flex items-center justify-center gap-4 py-2 px-4 bg-surface-subtle/75 backdrop-blur-sm rounded-xl">
      {dates.map((date, index) => {
        const selected = isSelected(date);
        const today = isToday(date);
        const distanceFromCenter = Math.abs(index - Math.floor(visibleDays / 2));

        // Opacity decreases for dates further from center
        const opacity = selected ? 1 : Math.max(0.4, 1 - distanceFromCenter * 0.2);

        return (
          <button
            key={date.toISOString()}
            onClick={() => onDateChange(date)}
            className={`
              transition-all duration-200
              ${selected
                ? 'bg-brand text-white px-3 py-1 rounded-full font-bold text-sm'
                : 'text-text-muted hover:text-text-secondary text-[13px] font-normal'
              }
            `}
            style={{ opacity: selected ? 1 : opacity }}
          >
            {formatDate(date)}
          </button>
        );
      })}
    </div>
  );
}
