import { create } from 'zustand';

/**
 * Timeline update type matching the database schema
 */
export interface TimelineUpdate {
  id: string;
  emailId: string;
  title: string;
  description?: string;
  summary?: string;
  priority?: 'high' | 'medium' | 'low';
  sentiment?: 'positive' | 'negative' | 'neutral';
  urgency: boolean;
  importanceReason?: string;
  actionItem: boolean;
  actionItemTitle?: string;
  followUpDate?: string;
  financialImpact?: number;
  keyEntities?: {
    dates?: string[];
    amounts?: number[];
    names?: string[];
  };
  createdAt: string;
}

/**
 * Timeline filter state
 */
export interface TimelineFilter {
  priority?: 'high' | 'medium' | 'low';
  sentiment?: 'positive' | 'negative' | 'neutral';
  hasActionItem?: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
  searchQuery?: string;
}

/**
 * Timeline store state interface
 */
interface TimelineState {
  // Data
  updates: TimelineUpdate[];
  selectedUpdateId: string | null;

  // UI State
  filter: TimelineFilter;
  isLoading: boolean;
  error: string | null;

  // Pagination
  page: number;
  pageSize: number;
  totalCount: number;

  // Actions
  setUpdates: (updates: TimelineUpdate[]) => void;
  addUpdate: (update: TimelineUpdate) => void;
  updateUpdate: (id: string, update: Partial<TimelineUpdate>) => void;
  removeUpdate: (id: string) => void;
  setSelectedUpdateId: (id: string | null) => void;
  setFilter: (filter: Partial<TimelineFilter>) => void;
  clearFilter: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPage: (page: number) => void;
  setTotalCount: (count: number) => void;
  reset: () => void;
}

const defaultFilter: TimelineFilter = {};

/**
 * Zustand store for timeline state management.
 */
export const useTimelineStore = create<TimelineState>((set) => ({
  updates: [],
  selectedUpdateId: null,
  filter: defaultFilter,
  isLoading: false,
  error: null,
  page: 1,
  pageSize: 50,
  totalCount: 0,

  setUpdates: (updates) => set({ updates }),
  addUpdate: (update) => set((state) => ({
    updates: [update, ...state.updates],
    totalCount: state.totalCount + 1,
  })),
  updateUpdate: (id, update) => set((state) => ({
    updates: state.updates.map((u) =>
      u.id === id ? { ...u, ...update } : u
    ),
  })),
  removeUpdate: (id) => set((state) => ({
    updates: state.updates.filter((u) => u.id !== id),
    selectedUpdateId: state.selectedUpdateId === id ? null : state.selectedUpdateId,
    totalCount: state.totalCount - 1,
  })),
  setSelectedUpdateId: (id) => set({ selectedUpdateId: id }),
  setFilter: (filter) => set((state) => ({
    filter: { ...state.filter, ...filter },
    page: 1, // Reset to first page when filter changes
  })),
  clearFilter: () => set({ filter: defaultFilter, page: 1 }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setPage: (page) => set({ page }),
  setTotalCount: (count) => set({ totalCount: count }),
  reset: () => set({
    updates: [],
    selectedUpdateId: null,
    filter: defaultFilter,
    isLoading: false,
    error: null,
    page: 1,
    totalCount: 0,
  }),
}));

/**
 * Selector to get filtered and sorted timeline updates
 */
export const selectFilteredUpdates = (state: TimelineState): TimelineUpdate[] => {
  let filtered = [...state.updates];

  // Apply priority filter
  if (state.filter.priority) {
    filtered = filtered.filter((u) => u.priority === state.filter.priority);
  }

  // Apply sentiment filter
  if (state.filter.sentiment) {
    filtered = filtered.filter((u) => u.sentiment === state.filter.sentiment);
  }

  // Apply action item filter
  if (state.filter.hasActionItem !== undefined) {
    filtered = filtered.filter((u) => u.actionItem === state.filter.hasActionItem);
  }

  // Apply date range filter
  if (state.filter.dateRange) {
    const start = new Date(state.filter.dateRange.start).getTime();
    const end = new Date(state.filter.dateRange.end).getTime();
    filtered = filtered.filter((u) => {
      const created = new Date(u.createdAt).getTime();
      return created >= start && created <= end;
    });
  }

  // Apply search query
  if (state.filter.searchQuery) {
    const query = state.filter.searchQuery.toLowerCase();
    filtered = filtered.filter((u) =>
      u.title.toLowerCase().includes(query) ||
      u.description?.toLowerCase().includes(query) ||
      u.summary?.toLowerCase().includes(query)
    );
  }

  // Sort by created date descending (newest first)
  filtered.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return filtered;
};

/**
 * Selector to get high priority updates
 */
export const selectHighPriorityUpdates = (state: TimelineState): TimelineUpdate[] => {
  return state.updates.filter((u) => u.priority === 'high');
};

/**
 * Selector to get updates with action items
 */
export const selectActionItems = (state: TimelineState): TimelineUpdate[] => {
  return state.updates.filter((u) => u.actionItem);
};
