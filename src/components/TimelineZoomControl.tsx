import type { ReactNode } from 'react';

export type ZoomLevel = 'year' | 'month' | 'week' | 'day';

export interface TimelineZoomControlProps {
  value: ZoomLevel;
  onChange: (level: ZoomLevel) => void;
}

/**
 * Segmented pill-tab control for Timeline zoom level selection.
 * Matches TuskerBrain design system — each tab is a bordered button,
 * active tab has a teal border and slightly bolder text.
 */
export function TimelineZoomControl({
  value,
  onChange,
}: TimelineZoomControlProps): ReactNode {
  const options: { value: ZoomLevel; label: string }[] = [
    { value: 'year', label: 'Year' },
    { value: 'month', label: 'Month' },
    { value: 'week', label: 'Week' },
    { value: 'day', label: 'Day' },
  ];

  return (
    <div className="flex items-center" style={{ border: '1px solid #D2E0E5', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
      {options.map((option, idx) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className="transition-all duration-200"
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: active ? 600 : 400,
              color: active ? '#031f20' : '#6b7280',
              backgroundColor: active ? '#EEF5F6' : 'transparent',
              borderRight: idx < options.length - 1 ? '1px solid #D2E0E5' : 'none',
              cursor: 'pointer',
              lineHeight: '1.4',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
