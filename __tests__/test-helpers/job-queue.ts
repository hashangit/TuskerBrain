import { JobQueue } from '@core/jobs/queue';
import type { Job } from '@core/jobs/types';

type JobQueueTestInternals = {
  jobs: Map<string, Job>;
};

function getTestInternals(queue: JobQueue): JobQueueTestInternals {
  return queue as unknown as JobQueueTestInternals;
}

export function simulateCrash(queue: JobQueue): void {
  const { jobs } = getTestInternals(queue);

  for (const job of jobs.values()) {
    if (job.status === 'running') {
      job.status = 'pending';
      job.startedAt = undefined;
      job.error = 'Interrupted by crash';
    }
  }
}
