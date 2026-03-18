import { v4 as uuidv4 } from 'uuid';
import type { Job, CreateJobInput, JobStats, JobStatus } from './types';
import { AuditLogger, type AuditEntry } from './audit';

/**
 * In-memory job queue for development and testing.
 * In production, this will be replaced with database-backed queue using Drizzle.
 */
export class JobQueue {
  private jobs: Map<string, Job> = new Map();
  private auditLogger: AuditLogger | null = null;
  private processingPaused: boolean = false;
  private retentionDays: number = 7; // Keep completed/dead jobs for 7 days

  /**
   * Set the audit logger for this queue.
   */
  setAuditLogger(logger: AuditLogger): void {
    this.auditLogger = logger;
  }

  /**
   * Pause job processing.
   */
  async pauseProcessing(): Promise<void> {
    this.processingPaused = true;
  }

  /**
   * Resume job processing.
   */
  async resumeProcessing(): Promise<void> {
    this.processingPaused = false;
  }

  /**
   * Check if processing is paused.
   */
  isPaused(): boolean {
    return this.processingPaused;
  }

  /**
   * Get audit log entries for a specific job.
   */
  async getAuditLogForJob(jobId: string): Promise<AuditEntry[]> {
    if (!this.auditLogger) {
      return [];
    }
    return await this.auditLogger.getEntriesForJob(jobId);
  }

  /**
   * Log token usage for a job.
   */
  async logTokenUsage(
    jobId: string,
    usage: { inputTokens: number; outputTokens: number }
  ): Promise<void> {
    if (!this.auditLogger) {
      return;
    }
    await this.auditLogger.logTokenUsage(jobId, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
    });
  }

  /**
   * Create a new job with deduplication.
   * If a pending or running job with the same emailId and type exists,
   * returns the existing job instead of creating a duplicate.
   */
  async createJob(input: CreateJobInput): Promise<Job> {
    // Check for existing pending/running job for same email (deduplication)
    if (input.emailId) {
      const existing = Array.from(this.jobs.values()).find(
        (job) =>
          job.emailId === input.emailId &&
          job.type === input.type &&
          (job.status === 'pending' || job.status === 'running')
      );
      if (existing) {
        return existing; // Return existing job instead of creating duplicate
      }
    }

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

    // Log job creation to audit logger
    if (this.auditLogger) {
      await this.auditLogger.logEntry(job.id, 'created', {
        entityType: job.emailId ? 'email' : undefined,
        entityId: job.emailId,
      });
    }

    return job;
  }

  async getJob(id: string): Promise<Job | null> {
    return this.jobs.get(id) ?? null;
  }

  async getNextJob(): Promise<Job | null> {
    // Return null when processing is paused
    if (this.processingPaused) {
      return null;
    }

    const now = new Date();
    const pendingJobs = Array.from(this.jobs.values())
      .filter((job) => {
        if (job.status !== 'pending') return false;
        // If job is scheduled for future, skip it
        if (job.scheduledAt && job.scheduledAt > now) return false;
        return true;
      })
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

    // Log to audit logger if available
    if (this.auditLogger) {
      await this.auditLogger.recordJobStatusUpdate(updatedJob, status, updates);
    }

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

      // Log job death to audit logger
      if (this.auditLogger) {
        await this.auditLogger.logEntry(deadJob.id, 'job_died', {
          entityType: deadJob.emailId ? 'email' : undefined,
          entityId: deadJob.emailId,
          reason: deadJob.error || 'Max retries exceeded',
        });
      }

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

  /**
   * Clean up old completed/dead jobs past retention period.
   * Returns the number of jobs deleted.
   */
  async cleanupOldJobs(): Promise<number> {
    const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    const toDelete: string[] = [];

    for (const [id, job] of this.jobs) {
      if (
        (job.status === 'completed' || job.status === 'dead') &&
        job.completedAt &&
        job.completedAt < cutoffDate
      ) {
        toDelete.push(id);
      }
    }

    toDelete.forEach((id) => this.jobs.delete(id));
    return toDelete.length;
  }

  async clear(): Promise<void> {
    this.jobs.clear();
  }

  /**
   * Simulate aging of jobs for testing purposes.
   * Sets completedAt to be daysAgo days in the past for completed/dead jobs.
   */
  async simulateJobAging(jobId: string, daysAgo: number): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job && (job.status === 'completed' || job.status === 'dead')) {
      job.completedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    }
  }

  async close(): Promise<void> {
    // No-op for in-memory queue
    // In database-backed version, this would close the connection
  }

  // ===== Test Helper Methods =====

  /**
   * Simulate unprocessed emails for testing recovery scenarios.
   * This is used to test crash recovery by simulating emails that
   * were not processed before a crash.
   *
   * In production, recovery would query the emails table for isProcessed=false.
   * For testing, we track these separately to simulate that state.
   */
  async simulateUnprocessedEmails(emailIds: string[]): Promise<void> {
    // Store unprocessed email IDs for recovery to pick up
    (this as { _unprocessedEmails?: Set<string> })._unprocessedEmails =
      (this as { _unprocessedEmails?: Set<string> })._unprocessedEmails || new Set();

    for (const emailId of emailIds) {
      (this as { _unprocessedEmails?: Set<string> })._unprocessedEmails!.add(emailId);
    }
  }

  /**
   * Simulate a crash for testing recovery scenarios.
   */
  simulateCrash(): void {
    // Mark all running jobs as interrupted
    for (const job of this.jobs.values()) {
      if (job.status === 'running') {
        job.status = 'pending';
        job.error = 'Interrupted by crash';
      }
    }
  }

  /**
   * Simulate an inconsistent state for testing recovery scenarios.
   * @param emailId - Optional email ID to simulate specific inconsistency
   * @param options - Options for simulating specific inconsistent state
   */
  simulateInconsistentState(
    emailId?: string,
    options?: { auditLogSaysCompleted?: boolean; emailIsProcessed?: boolean }
  ): void {
    // If specific email and options provided, simulate that exact scenario
    if (emailId && options) {
      // Find or create a job for this email
      let job = Array.from(this.jobs.values()).find((j) => j.emailId === emailId);

      if (!job) {
        // Create a job that looks completed
        job = {
          id: uuidv4(),
          type: 'email_process',
          status: 'completed',
          payload: { emailId },
          emailId,
          maxRetries: 3,
          retryCount: 0,
          createdAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date(),
        };
        this.jobs.set(job.id, job);
      }

      // If audit log says completed but email is not processed,
      // we need to track this for recovery
      if (options.auditLogSaysCompleted && !options.emailIsProcessed) {
        // Store the inconsistent state info for recovery to use
        (this as { _inconsistentEmails?: Set<string> })._inconsistentEmails =
          (this as { _inconsistentEmails?: Set<string> })._inconsistentEmails || new Set();
        (this as { _inconsistentEmails?: Set<string> })._inconsistentEmails!.add(emailId);

        // Make sure job looks completed in audit but we'll recover it
        job.status = 'completed';
        job.completedAt = new Date();
      }
    } else {
      // Original behavior: reset running jobs to pending
      for (const job of this.jobs.values()) {
        if (job.status === 'running') {
          job.status = 'pending';
        }
      }
    }
  }

  /**
   * Recover from crash by re-queuing interrupted jobs.
   * This method is called on startup to handle jobs that were interrupted
   * by a previous crash.
   *
   * Design Spec Reference: Lines 591-599
   * - Jobs are derived state, not source state - recreate from emails.isProcessed on startup
   * - Source of truth is emails.isProcessed, not audit log
   */
  async recoverFromCrash(): Promise<{ recovered: number }> {
    let recovered = 0;
    let jobsCreated = 0;

    // Find all jobs that were running but not completed
    for (const job of this.jobs.values()) {
      if (job.status === 'running') {
        // Reset to pending so they can be picked up again
        job.status = 'pending';
        job.startedAt = undefined;
        recovered++;

        if (this.auditLogger) {
          await this.auditLogger.logEntry(job.id, 'recovered', {
            entityType: job.emailId ? 'email' : undefined,
            entityId: job.emailId,
            reason: 'Recovered from crash',
          });
        }
      }
    }

    // Handle unprocessed emails from simulateUnprocessedEmails
    // This simulates the real behavior of querying emails.isProcessed = false
    const unprocessedEmails = (this as { _unprocessedEmails?: Set<string> })._unprocessedEmails;
    if (unprocessedEmails) {
      for (const emailId of unprocessedEmails) {
        // Check if there's already a pending job for this email
        const existingJob = Array.from(this.jobs.values()).find(
          (j) =>
            j.emailId === emailId &&
            (j.status === 'pending' || j.status === 'running')
        );

        if (!existingJob) {
          // Create job for unprocessed email - isProcessed is source of truth
          const newJob: Job = {
            id: uuidv4(),
            type: 'email_process',
            status: 'pending',
            payload: { emailId },
            emailId,
            maxRetries: 3,
            retryCount: 0,
            createdAt: new Date(),
          };
          this.jobs.set(newJob.id, newJob);
          jobsCreated++;

          if (this.auditLogger) {
            await this.auditLogger.logEntry(newJob.id, 'created', {
              entityType: 'email',
              entityId: emailId,
              reason: 'Recovered from unprocessed emails',
            });
          }
        }
      }
      // Clear the unprocessed emails set after recovery
      (this as { _unprocessedEmails?: Set<string> })._unprocessedEmails = undefined;
    }

    // Handle inconsistent states where audit says completed but email is not processed
    // This uses emails.isProcessed as the source of truth (Design Spec Lines 586-588)
    const inconsistentEmails = (this as { _inconsistentEmails?: Set<string> })._inconsistentEmails;
    if (inconsistentEmails) {
      for (const emailId of inconsistentEmails) {
        // Check if there's already a pending job for this email
        const existingJob = Array.from(this.jobs.values()).find(
          (j) =>
            j.emailId === emailId &&
            (j.status === 'pending' || j.status === 'running')
        );

        if (!existingJob) {
          // Re-queue the email for processing - isProcessed is source of truth
          const newJob: Job = {
            id: uuidv4(),
            type: 'email_process',
            status: 'pending',
            payload: { emailId },
            emailId,
            maxRetries: 3,
            retryCount: 0,
            createdAt: new Date(),
          };
          this.jobs.set(newJob.id, newJob);
          jobsCreated++;

          if (this.auditLogger) {
            await this.auditLogger.logEntry(newJob.id, 'created', {
              entityType: 'email',
              entityId: emailId,
              reason: 'Re-queued due to inconsistent state (isProcessed=false)',
            });
          }
        }
      }
      // Clear the inconsistent emails set after recovery
      (this as { _inconsistentEmails?: Set<string> })._inconsistentEmails = undefined;
    }

    // Log recovery completion with summary
    if (this.auditLogger && (recovered > 0 || jobsCreated > 0)) {
      await this.auditLogger.logEntry('system', 'recovery_completed', {
        details: {
          jobsRecovered: recovered,
          jobsCreated,
          totalJobsAffected: recovered + jobsCreated,
        },
      });
    }

    return { recovered: recovered + jobsCreated };
  }

  /**
   * Get all jobs associated with an email ID.
   */
  async getJobsForEmail(emailId: string): Promise<Job[]> {
    return Array.from(this.jobs.values()).filter((job) => job.emailId === emailId);
  }

  /**
   * Get audit log for a specific job or all jobs.
   */
  async getAuditLog(jobId?: string): Promise<AuditEntry[]> {
    if (!this.auditLogger) {
      return [];
    }
    if (jobId) {
      return await this.auditLogger.getEntriesForJob(jobId);
    }
    // Return all audit entries
    return await this.auditLogger.getAllEntries();
  }
}
