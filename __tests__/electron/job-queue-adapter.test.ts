import { describe, expect, it } from 'vitest';
import { JobQueue } from '@core/jobs/queue';
import { createJobQueueAdapter } from '@electron/ipc/job-queue-adapter';

describe('createJobQueueAdapter', () => {
  it('lists serialized jobs without reaching into queue internals', async () => {
    const queue = new JobQueue();
    const adapter = createJobQueueAdapter(queue);

    const firstId = await adapter.createJob('email_process', { emailId: 'email-1' }, 'email-1');
    await adapter.createJob('backfill_day', { day: 1 });

    const result = await adapter.listJobs(undefined, 1);

    expect(result.total).toBe(1);
    expect(result.jobs[0]).toMatchObject({
      id: firstId,
      type: 'email_process',
      status: 'pending',
    });
    expect(result.jobs[0].createdAt).toEqual(expect.any(String));
  });

  it('filters by a valid job status', async () => {
    const queue = new JobQueue();
    const adapter = createJobQueueAdapter(queue);

    const jobId = await adapter.createJob('email_process', {});
    await adapter.cancelJob(jobId);

    const result = await adapter.listJobs('dead');

    expect(result.total).toBe(1);
    expect(result.jobs[0].status).toBe('dead');
  });

  it('rejects invalid status filters before querying the queue', async () => {
    const adapter = createJobQueueAdapter(new JobQueue());

    await expect(adapter.listJobs('mystery')).rejects.toThrow(/invalid job status/i);
  });
});
