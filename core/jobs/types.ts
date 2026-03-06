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

