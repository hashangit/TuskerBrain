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

export interface Job {
  id: string;
  type: JobType;
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

export interface CreateJobInput {
  type: JobType;
  payload: Record<string, unknown>;
  emailId?: string;
  maxRetries?: number;
  scheduledAt?: Date;
}

export interface UpdateJobInput {
  status?: JobStatus;
  result?: Record<string, unknown>;
  error?: string;
  errorStack?: string;
}

export interface JobStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
  total: number;
}
