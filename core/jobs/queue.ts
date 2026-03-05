import { v4 as uuidv4 } from 'uuid';
import type { Job, CreateJobInput, UpdateJobInput, JobStats, JobStatus } from './types';

/**
 * In-memory job queue for development and testing.
 * In production, this will be replaced with database-backed queue using Drizzle.
 */
export class JobQueue {
  private jobs: Map<string, Job> = new Map();

  async createJob(input: CreateJobInput): Promise<Job> {
    const job: Job = {
      id: uuidv4(),
      type: input.type,
      status: 'pending',
      payload: input.payload,
      emailId: input.emailId,
      maxRetries: input.maxRetries ?? 3,
      retryCount: 0,
      scheduledAt: input.scheduledAt,
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);
    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) ?? null;
  }

  async getNextJob(): Promise<Job | null> {
    const pendingJobs = Array.from(this.jobs.values())
      .filter((job) => job.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return pendingJobs[0] ?? null;
  }

  async updateJobStatus(
    id: string,
    status: JobStatus,
    updates?: { result?: Record<string, unknown>; error?: string; errorStack?: string }
  ): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job) return null;

    const updatedJob: Job = {
      ...job,
      status,
      ...updates,
    };

    // Set timestamps based on status
    if (status === 'running' && !job.startedAt) {
      updatedJob.startedAt = new Date();
    }

    if (status === 'completed' || status === 'failed' || status === 'dead') {
      updatedJob.completedAt = new Date();
    }

    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async scheduleRetry(id: string): Promise<Job | null> {
    const job = this.jobs.get(id);
    if (!job) return null;

    const newRetryCount = job.retryCount + 1;

    // Check if max retries exceeded - mark as dead with updated retry count
    if (newRetryCount >= job.maxRetries) {
      const deadJob: Job = {
        ...job,
        status: 'dead',
        retryCount: newRetryCount,
        completedAt: new Date(),
      };
      this.jobs.set(id, deadJob);
      return deadJob;
    }

    // Calculate exponential backoff: 1min -> 2min -> 4min -> 8min -> 16min
    const backoffMinutes = Math.pow(2, newRetryCount - 1);
    const scheduledAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

    const updatedJob: Job = {
      ...job,
      status: 'pending',
      retryCount: newRetryCount,
      scheduledAt,
    };

    this.jobs.set(id, updatedJob);
    return updatedJob;
  }

  async getStats(): Promise<JobStats> {
    const allJobs = Array.from(this.jobs.values());

    return {
      pending: allJobs.filter((j) => j.status === 'pending').length,
      running: allJobs.filter((j) => j.status === 'running').length,
      completed: allJobs.filter((j) => j.status === 'completed').length,
      failed: allJobs.filter((j) => j.status === 'failed').length,
      dead: allJobs.filter((j) => j.status === 'dead').length,
      total: allJobs.length,
    };
  }

  async getJobsByStatus(status: JobStatus): Promise<Job[]> {
    return Array.from(this.jobs.values()).filter((job) => job.status === status);
  }

  async getJobsByEmailId(emailId: string): Promise<Job[]> {
    return Array.from(this.jobs.values()).filter((job) => job.emailId === emailId);
  }

  async clear(): Promise<void> {
    this.jobs.clear();
  }

  async close(): Promise<void> {
    // No-op for in-memory queue
    // In database-backed version, this would close the connection
  }
}
