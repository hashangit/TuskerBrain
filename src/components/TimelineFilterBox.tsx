import { useState, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FilterOption {
  value: string;
  label: string;
}

export interface ActiveFilter {
  id: string;
  value: string;
  label: string;
  color: 'teal' | 'orange' | 'purple' | 'blue';
}

export interface TimelineFilterState {
  emailTypes?: string[];
  topics?: string[];
  priorities?: string[];
  dateRange?: string;
}

export interface TimelineFilterBoxProps {
  isOpen: boolean;
  onClose: () => void;
  filters: TimelineFilterState;
  onFilterChange: (filters: TimelineFilterState) => void;
  emailTypeOptions?: FilterOption[];
  topicOptions?: FilterOption[];
  priorityOptions?: FilterOption[];
  dateRangeOptions?: FilterOption[];
}

// ─── Default Options ───────────────────────────────────────────────────────────

const DEFAULT_EMAIL_TYPES: FilterOption[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'updates', label: 'Updates' },
  { value: 'social', label: 'Social' },
  { value: 'promotional', label: 'Promotional' },
];

const DEFAULT_TOPICS: FilterOption[] = [
  { value: 'banking', label: 'Banking' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'travel', label: 'Travel' },
  { value: 'health', label: 'Health' },
  { value: 'projects', label: 'Projects' },
  { value: 'education', label: 'Education' },
];

const DEFAULT_PRIORITIES: FilterOption[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const DEFAULT_DATE_RANGES: FilterOption[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

const XIcon = ({ className = 'w-4 h-4', style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const TrashIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

// ─── Color Mappings for Active Filter Pills ────────────────────────────────────

const PILL_COLORS = {
  teal: { bg: '#E0F2F1', text: '#0a585c' },
  orange: { bg: '#FFF4E5', text: '#c7762a' },
  purple: { bg: '#F4EDF1', text: '#635D6F' },
  blue: { bg: '#E1F0FF', text: '#1e40af' },
};

const FILTER_COLORS: Record<string, 'teal' | 'orange' | 'purple' | 'blue'> = {
  emailTypes: 'blue',
  topics: 'teal',
  priorities: 'orange',
  dateRange: 'purple',
};

// ─── Multi-Select Filter Dropdown ──────────────────────────────────────────────

interface MultiSelectDropdownProps {
  label: string;
  selectedValues: string[];
  options: FilterOption[];
  onChange: (values: string[]) => void;
  isSingleSelect?: boolean;
}

function MultiSelectDropdown({
  label,
  selectedValues,
  options,
  onChange,
  isSingleSelect = false,
}: MultiSelectDropdownProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const hasSelection = selectedValues.length > 0;
  const selectedLabels = options
    .filter(opt => selectedValues.includes(opt.value))
    .map(opt => opt.label);
  const displayLabel = hasSelection
    ? selectedLabels.length > 2
      ? `${selectedLabels.slice(0, 2).join(', ')} +${selectedLabels.length - 2}`
      : selectedLabels.join(', ')
    : label;

  const handleToggle = (value: string) => {
    if (isSingleSelect) {
      // Single select: replace the selection
      onChange(selectedValues.includes(value) ? [] : [value]);
    } else {
      // Multi-select: toggle the value
      if (selectedValues.includes(value)) {
        onChange(selectedValues.filter(v => v !== value));
      } else {
        onChange([...selectedValues, value]);
      }
    }
  };

  return (
    <div className="relative w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center w-full px-4 py-3 rounded-xl border transition-all duration-200 ${
          hasSelection
            ? 'bg-white border-[#0F848A] text-[#0F848A] shadow-sm'
            : 'bg-white border-[#CFE0E4] hover:border-[#0F848A] text-[#031f20]'
        }`}
      >
        <span className="text-[15px] font-medium truncate">{displayLabel}</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-[#D2E0E5] shadow-lg z-20 py-1 max-h-60 overflow-y-auto">
            {options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => handleToggle(option.value)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-[14px] transition-colors ${
                    isSelected
                      ? 'bg-[#0F848A]/5 text-[#0F848A] font-semibold'
                      : 'text-[#031f20] hover:bg-[#EEF5F6]'
                  }`}
                >
                  <span>{option.label}</span>
                  {isSelected && <CheckIcon className="w-4 h-4 text-[#0F848A]" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Active Filter Pill ────────────────────────────────────────────────────────

interface ActiveFilterPillProps {
  filter: ActiveFilter;
  onRemove: () => void;
}

function ActiveFilterPill({ filter, onRemove }: ActiveFilterPillProps): ReactNode {
  const colors = PILL_COLORS[filter.color];

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all hover:ring-1 hover:ring-inset hover:ring-[#0F848A]/20"
      style={{ backgroundColor: colors.bg }}
    >
      <span className="text-[13px] font-semibold" style={{ color: colors.text }}>
        {filter.label}
      </span>
      <button onClick={onRemove} className="hover:opacity-60 transition-opacity">
        <XIcon className="w-3.5 h-3.5" style={{ color: colors.text }} />
      </button>
    </div>
  );
}

// ─── Main Filter Box Component ─────────────────────────────────────────────────

export function TimelineFilterBox({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  emailTypeOptions = DEFAULT_EMAIL_TYPES,
  topicOptions = DEFAULT_TOPICS,
  priorityOptions = DEFAULT_PRIORITIES,
  dateRangeOptions = DEFAULT_DATE_RANGES,
}: TimelineFilterBoxProps): ReactNode {
  if (!isOpen) return null;

  // Build active filters list for display
  const activeFilters: ActiveFilter[] = [];

  filters.emailTypes?.forEach(value => {
    const option = emailTypeOptions.find(o => o.value === value);
    if (option) activeFilters.push({ id: 'emailTypes', value, label: option.label, color: 'blue' });
  });

  filters.topics?.forEach(value => {
    const option = topicOptions.find(o => o.value === value);
    if (option) activeFilters.push({ id: 'topics', value, label: option.label, color: 'teal' });
  });

  filters.priorities?.forEach(value => {
    const option = priorityOptions.find(o => o.value === value);
    if (option) activeFilters.push({ id: 'priorities', value, label: option.label, color: 'orange' });
  });

  if (filters.dateRange) {
    const option = dateRangeOptions.find(o => o.value === filters.dateRange);
    if (option) activeFilters.push({ id: 'dateRange', value: filters.dateRange, label: option.label, color: 'purple' });
  }

  const hasActiveFilters = activeFilters.length > 0;

  const handleRemoveFilter = (filterId: string, value: string) => {
    if (filterId === 'dateRange') {
      onFilterChange({ ...filters, dateRange: undefined });
    } else {
      const currentValues = filters[filterId as keyof TimelineFilterState] as string[] | undefined;
      onFilterChange({
        ...filters,
        [filterId]: currentValues?.filter(v => v !== value),
      });
    }
  };

  const handleClearAll = () => {
    onFilterChange({});
  };

  return (
    <>
      {/* Backdrop for mobile/small screens */}
      <div className="fixed inset-0 bg-black/10 z-20 lg:hidden" onClick={onClose} />

      {/* Filter Box Panel */}
      <div
        className="fixed right-4 top-20 z-30 w-[340px] bg-white rounded-2xl border border-[#D2E0E5]"
        style={{ boxShadow: '0 12px 40px rgba(3,31,32,0.12)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5">
          <h3 className="text-[20px] font-bold text-[#031f20] font-display">Filters</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#EEF5F6] transition-colors text-[#635D6F]"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 flex flex-col gap-5">
          {/* Filter By Label */}
          <span className="text-[15px] font-semibold text-[#635D6F]">
            Filter by
          </span>

          {/* Filter Dropdowns - One per row */}
          <div className="flex flex-col gap-3">
            <MultiSelectDropdown
              label="Email Type"
              selectedValues={filters.emailTypes || []}
              options={emailTypeOptions}
              onChange={(values) => onFilterChange({ ...filters, emailTypes: values })}
            />

            <MultiSelectDropdown
              label="Topic"
              selectedValues={filters.topics || []}
              options={topicOptions}
              onChange={(values) => onFilterChange({ ...filters, topics: values })}
            />

            <MultiSelectDropdown
              label="Priority"
              selectedValues={filters.priorities || []}
              options={priorityOptions}
              onChange={(values) => onFilterChange({ ...filters, priorities: values })}
            />

            <MultiSelectDropdown
              label="Date Range"
              selectedValues={filters.dateRange ? [filters.dateRange] : []}
              options={dateRangeOptions}
              onChange={(values) => onFilterChange({ ...filters, dateRange: values[0] })}
              isSingleSelect
            />
          </div>

          {/* Active Filters Section */}
          {hasActiveFilters && (
            <div className="flex flex-col gap-4 mt-2">
              <div className="h-px bg-[#E8F0F2]" />

              <span className="text-[14px] font-semibold text-[#635D6F]">
                Active Filters
              </span>

              <div className="flex flex-wrap gap-2.5">
                {activeFilters.map((filter, index) => (
                  <ActiveFilterPill
                    key={`${filter.id}-${filter.value}-${index}`}
                    filter={filter}
                    onRemove={() => handleRemoveFilter(filter.id, filter.value)}
                  />
                ))}
              </div>

              <button
                onClick={handleClearAll}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#CFE0E4] hover:bg-[#EEF5F6] transition-all self-start mt-2"
              >
                <TrashIcon className="w-4 h-4 text-[#635D6F]" />
                <span className="text-[14px] font-semibold text-[#635D6F]">Clear All Filters</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
