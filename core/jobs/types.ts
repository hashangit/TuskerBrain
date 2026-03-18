export type JobType =
  | 'email_process'
  | 'email_archive'
  | 'email_delete'
  | 'topic_summary_update'
  | 'sender_summary_update'
  | 'backfill_day';

export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'dead';

/**
 * Job interface for the in-memory job queue.
 */
export interface Job {
  id: string;
  type: JobType | string;
  status: JobStatus;
  payload: Record<string, unknown>;
  emailId?: string;
  result?: Record<string, unknown>;
  error?: string;
  errorStack?: string;
  retryCount: number;
  maxRetries: number;
  scheduledAt?: Date;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Input for creating a new job.
 */
export interface CreateJobInput {
  type: JobType | string;
  payload: Record<string, unknown>;
  emailId?: string;
  maxRetries?: number;
  scheduledAt?: Date;
}

export interface JobStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
  total: number;
}

