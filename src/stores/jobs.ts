import { create } from 'zustand';

/**
 * Job type matching the database schema
 */
export interface Job {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'dead';
  payload: Record<string, unknown>;
  emailId?: string;
  result?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Job queue statistics
 */
export interface JobQueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
  total: number;
}

/**
 * Jobs store state interface
 */
interface JobsState {
  // Data
  jobs: Job[];
  selectedJobId: string | null;
  stats: JobQueueStats;

  // UI State
  statusFilter: string | null;
  isLoading: boolean;
  error: string | null;
  isPaused: boolean;

  // Pagination
  page: number;
  pageSize: number;

  // Actions
  setJobs: (jobs: Job[]) => void;
  addJob: (job: Job) => void;
  updateJob: (id: string, update: Partial<Job>) => void;
  removeJob: (id: string) => void;
  setSelectedJobId: (id: string | null) => void;
  setStats: (stats: JobQueueStats) => void;
  setStatusFilter: (status: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setIsPaused: (paused: boolean) => void;
  setPage: (page: number) => void;
  reset: () => void;
}

const defaultStats: JobQueueStats = {
  pending: 0,
  running: 0,
  completed: 0,
  failed: 0,
  dead: 0,
  total: 0,
};

/**
 * Zustand store for job queue state management.
 */
export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  selectedJobId: null,
  stats: defaultStats,
  statusFilter: null,
  isLoading: false,
  error: null,
  isPaused: false,
  page: 1,
  pageSize: 50,

  setJobs: (jobs) => set({ jobs }),
  addJob: (job) => set((state) => ({
    jobs: [job, ...state.jobs],
    stats: {
      ...state.stats,
      total: state.stats.total + 1,
      pending: state.stats.pending + 1,
    },
  })),
  updateJob: (id, update) => set((state) => {
    const oldJob = state.jobs.find((j) => j.id === id);
    const oldStatus = oldJob?.status;

    return {
      jobs: state.jobs.map((j) =>
        j.id === id ? { ...j, ...update } : j
      ),
      stats: oldStatus && update.status && oldStatus !== update.status
        ? {
            ...state.stats,
            [oldStatus]: state.stats[oldStatus as keyof JobQueueStats] - 1,
            [update.status]: (state.stats[update.status as keyof JobQueueStats] || 0) + 1,
          }
        : state.stats,
    };
  }),
  removeJob: (id) => set((state) => {
    const job = state.jobs.find((j) => j.id === id);
    return {
      jobs: state.jobs.filter((j) => j.id !== id),
      selectedJobId: state.selectedJobId === id ? null : state.selectedJobId,
      stats: job
        ? {
            ...state.stats,
            total: state.stats.total - 1,
            [job.status]: state.stats[job.status as keyof JobQueueStats] - 1,
          }
        : state.stats,
    };
  }),
  setSelectedJobId: (id) => set({ selectedJobId: id }),
  setStats: (stats) => set({ stats }),
  setStatusFilter: (status) => set({ statusFilter: status, page: 1 }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setIsPaused: (paused) => set({ isPaused: paused }),
  setPage: (page) => set({ page }),
  reset: () => set({
    jobs: [],
    selectedJobId: null,
    stats: defaultStats,
    statusFilter: null,
    isLoading: false,
    error: null,
    isPaused: false,
    page: 1,
  }),
}));

/**
 * Selector to get filtered jobs
 */
export const selectFilteredJobs = (state: JobsState): Job[] => {
  if (!state.statusFilter) {
    return state.jobs;
  }
  return state.jobs.filter((j) => j.status === state.statusFilter);
};

/**
 * Selector to get pending and running jobs count
 */
export const selectActiveJobsCount = (state: JobsState): number => {
  return state.stats.pending + state.stats.running;
};

/**
 * Selector to check if queue is processing
 */
export const selectIsProcessing = (state: JobsState): boolean => {
  return state.stats.running > 0;
};

/**
 * Selector to get recent failed jobs
 */
export const selectRecentFailedJobs = (state: JobsState, limit: number = 10): Job[] => {
  return state.jobs
    .filter((j) => j.status === 'failed')
    .sort((a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime())
    .slice(0, limit);
};
