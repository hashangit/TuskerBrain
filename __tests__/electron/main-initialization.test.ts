import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobQueue } from '@core/jobs/queue';
import { JobRunner } from '@core/jobs/runner';
import { TuskerBrainDatabase, recoverUnprocessedJobs } from '@db/index';
import { emails } from '@db/schema';
import { eq } from 'drizzle-orm';

// Mock Electron modules
vi.mock('electron', () => ({
  app: {
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
    show: vi.fn(),
    webContents: { openDevTools: vi.fn() },
  })),
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    listenerCount: vi.fn().mockReturnValue(1),
  },
}));

describe('Main Process Initialization', () => {
  let jobQueue: JobQueue;
  let jobRunner: JobRunner;
  let db: TuskerBrainDatabase;

  beforeEach(async () => {
    jobQueue = new JobQueue();
    jobRunner = new JobRunner(jobQueue);
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
  });

  afterEach(async () => {
    await jobQueue.clear();
    await jobRunner.stop();
    await db.close();
  });

  describe('JobQueue', () => {
    it('should be instantiable with createJob method', () => {
      expect(jobQueue).toBeDefined();
      expect(typeof jobQueue.createJob).toBe('function');
    });

    it('should create jobs with pending status', async () => {
      const job = await jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: 'test-123' },
        emailId: 'test-123',
      });

      expect(job.status).toBe('pending');
      expect(job.id).toBeDefined();
      expect(job.type).toBe('email_process');
    });
  });

  describe('JobRunner', () => {
    it('should be instantiable with start method', () => {
      expect(jobRunner).toBeDefined();
      expect(typeof jobRunner.start).toBe('function');
    });

    it('should not be running before start() is called', () => {
      expect(jobRunner.isRunning()).toBe(false);
    });

    it('should be running after start() is called', async () => {
      await jobRunner.start();
      expect(jobRunner.isRunning()).toBe(true);
    });

    it('should stop running after stop() is called', async () => {
      await jobRunner.start();
      expect(jobRunner.isRunning()).toBe(true);

      await jobRunner.stop();
      expect(jobRunner.isRunning()).toBe(false);
    });
  });

  describe('Startup Recovery', () => {
    it('should recover unprocessed emails as jobs', async () => {
      // Seed unprocessed emails directly into database
      await db.getDatabase().insert(emails).values([
        {
          id: 'email-recovery-1',
          threadId: 'thread-1',
          senderEmail: 'test@example.com',
          senderName: 'Test Sender',
          senderDomain: 'example.com',
          subject: 'Test Subject',
          snippet: 'Test snippet',
          receivedAt: new Date(),
          isProcessed: false,
        },
        {
          id: 'email-recovery-2',
          threadId: 'thread-2',
          senderEmail: 'test2@example.com',
          senderName: 'Test Sender 2',
          senderDomain: 'example.com',
          subject: 'Test Subject 2',
          snippet: 'Test snippet 2',
          receivedAt: new Date(),
          isProcessed: false,
        },
      ]);

      // Run recovery
      const recoveredCount = await recoverUnprocessedJobs(db, jobQueue);

      // Verify jobs were created
      expect(recoveredCount).toBe(2);
      const stats = await jobQueue.getStats();
      expect(stats.pending).toBe(2);

      // Verify jobs have correct emailIds
      const job1 = await jobQueue.getJobsByEmailId('email-recovery-1');
      const job2 = await jobQueue.getJobsByEmailId('email-recovery-2');
      expect(job1.length).toBe(1);
      expect(job2.length).toBe(1);
    });

    it('should not create jobs for already processed emails', async () => {
      // Seed a processed email
      await db.getDatabase().insert(emails).values([
        {
          id: 'email-processed-1',
          threadId: 'thread-processed',
          senderEmail: 'processed@example.com',
          senderName: 'Processed Sender',
          senderDomain: 'example.com',
          subject: 'Processed Subject',
          snippet: 'Processed snippet',
          receivedAt: new Date(),
          isProcessed: true,
        },
      ]);

      // Run recovery
      const recoveredCount = await recoverUnprocessedJobs(db, jobQueue);

      // No jobs should be created
      expect(recoveredCount).toBe(0);
      const stats = await jobQueue.getStats();
      expect(stats.pending).toBe(0);
    });

    it('should return 0 when no unprocessed emails exist', async () => {
      const recoveredCount = await recoverUnprocessedJobs(db, jobQueue);
      expect(recoveredCount).toBe(0);
    });
  });
});
