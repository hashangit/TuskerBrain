import type { JobQueue } from '@core/jobs/queue';
import type { Job, JobStatus } from '@core/jobs/types';

const JOB_STATUSES: readonly JobStatus[] = [
  'pending',
  'running',
  'completed',
  'failed',
  'retrying',
  'dead',
  'cancelled',
];

export interface SerializedJob {
  id: string;
  type: string;
  status: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  retryCount?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface JobQueueIPCAdapter {
  listJobs: (status?: string, limit?: number) => Promise<{
    jobs: SerializedJob[];
    total: number;
  }>;
  createJob: (
    type: string,
    payload: Record<string, unknown>,
    emailId?: string,
    scheduledAt?: string
  ) => Promise<string>;
  cancelJob: (jobId: string) => Promise<void>;
  getJobStatus: (jobId: string) => Promise<SerializedJob & {
    payload: Record<string, unknown>;
    retryCount: number;
  }>;
  pause: () => void;
  resume: () => void;
}

export function createJobQueueAdapter(queue: JobQueue): JobQueueIPCAdapter {
  return {
    listJobs: async (status?: string, limit?: number) => {
      const jobs = status
        ? await queue.getJobsByStatus(parseJobStatus(status))
        : await queue.getAllJobs();
      const limited = limit ? jobs.slice(0, limit) : jobs;

      return {
        jobs: limited.map(serializeJob),
        total: limited.length,
      };
    },
    createJob: async (
      type: string,
      payload: Record<string, unknown>,
      emailId?: string,
      scheduledAt?: string
    ) => {
      const job = await queue.createJob({
        type,
        payload,
        emailId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      });
      return job.id;
    },
    cancelJob: async (jobId: string) => {
      await queue.updateJobStatus(jobId, 'dead');
    },
    getJobStatus: async (jobId: string) => {
      const job = await queue.getJob(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);
      return {
        ...serializeJob(job),
        payload: job.payload,
        result: job.result,
        error: job.error,
        retryCount: job.retryCount,
      };
    },
    pause: () => {
      void queue.pauseProcessing();
    },
    resume: () => {
      void queue.resumeProcessing();
    },
  };
}

function parseJobStatus(status: string): JobStatus {
  if (isJobStatus(status)) return status;
  throw new Error(`Invalid job status: ${status}`);
}

function isJobStatus(status: string): status is JobStatus {
  return JOB_STATUSES.includes(status as JobStatus);
}

function serializeJob(job: Job): SerializedJob {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
  };
}
