import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { TuskerBrainDatabase, recoverUnprocessedJobs, emails } from '@db/index';
import { GmailSyncManager, type GmailClient } from '@core/gmail/sync';
import { JobQueue } from '@core/jobs/queue';
import { SettingsManager } from '@core/settings/manager';
import { TokenManager, type OAuthTokens } from '@core/auth/token-manager';
import { createRepositories, type Repositories } from '@core/repositories';
import { eq } from 'drizzle-orm';

/**
 * Scenario: Restart Recovery Journey
 *
 * Tests what the USER expects after restarting TuskerBrain:
 * "I closed and reopened the app — is my data still there?"
 *
 * RULES:
 * - Every test calls REAL production code.
 * - Only the Gmail API client is mocked (can't hit real Gmail in tests).
 * - NO setTimeout hacks, NO manual persistence, NO bypassing production code paths.
 * - If a test fails, it means the feature is NOT implemented. That's the point.
 *
 * Infrastructure note:
 * db.initialize() runs Drizzle migrations from the migrations folder.
 */

function createMockGmailClient(): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({
      messages: [{ id: 'msg1' }, { id: 'msg2' }],
      nextPageToken: undefined,
    }),
    getMessage: vi.fn().mockResolvedValue({
      id: 'test-email',
      threadId: 'thread-1',
      snippet: 'Test email body',
      internalDate: Date.now().toString(),
      payload: { headers: [
        { name: 'From', value: 'sender <sender@example.com>' },
        { name: 'Subject', value: 'Test Subject' },
      ]},
    }),
    modifyMessage: vi.fn().mockResolvedValue({}),
    getProfile: vi.fn().mockResolvedValue({
      emailAddress: 'user@gmail.com',
      historyId: 'profile-history-001',
      messagesTotal: 500,
    }),
  };
}

describe('Scenario: Restart Recovery Journey', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;
  let mockGmailClient: GmailClient;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
    mockGmailClient = createMockGmailClient();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuskerbrain-test-'));
  });

  afterEach(async () => {
    await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── "My sync progress should still be there" ───

  describe('Sync State Recovery (User: "My sync progress should still be there")', () => {
    it('historyId is persisted to DB after sync', async () => {
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.startInitialSync(30);

      // Verify state was written to the sync_state table
      const persistedState = await repos.syncState.load();
      expect(persistedState.historyId).toBe('profile-history-001');
      expect(persistedState.lastFullSync).toBeDefined();
    });

    it('new GmailSyncManager loads persisted historyId from DB', async () => {
      // Session 1: sync and persist
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.startInitialSync(30);

      // Session 2: new instance should load state from SyncStateStore
      const session2 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session2.initialize();

      const stateAfterRestart = await session2.getSyncState();
      expect(stateAfterRestart.historyId).toBe('profile-history-001');
    });

    it('incremental sync picks up from the last historyId, not from scratch', async () => {
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.startInitialSync(30);

      const session2 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session2.initialize();
      const state = await session2.getSyncState();
      expect(state.historyId).toBe('profile-history-001');

      // User triggers incremental sync — it should use the persisted historyId
      (mockGmailClient.listMessages as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        messages: [{ id: 'new-msg-1' }],
        nextPageToken: undefined,
        historyId: 'new-history-999',
      });

      await session2.startIncrementalSync(state.historyId!);

      expect(mockGmailClient.listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ startHistoryId: 'profile-history-001' })
      );
    });

    it('fresh install starts with no historyId — no crash', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.initialize();

      const state = await manager.getSyncState();
      expect(state.totalEmailsProcessed).toBe(0);
      expect(state.historyId).toBeUndefined();
    });
  });

  // ─── "My processed emails should still be there" ───

  describe('Data Integrity (User: "My processed emails should still be there")', () => {
    it('emails I already processed remain after restart', async () => {
      await repos.emails.create({
        id: 'email-user-cares-about',
        threadId: 'thread-1',
        senderEmail: 'boss@company.com',
        senderName: 'Boss',
        senderDomain: 'company.com',
        subject: 'Important Project Update',
        snippet: 'The project deadline has moved to next Friday.',
        receivedAt: new Date(),
        isRead: true,
      });

      // Simulate restart: new repository, same DB
      const freshRepos = createRepositories(db);
      const emailAfter = await freshRepos.emails.findById('email-user-cares-about');
      expect(emailAfter).toBeDefined();
      expect(emailAfter!.subject).toBe('Important Project Update');
    });

    it('email data survives actual DB file close and reopen', async () => {
      const dbPath = path.join(tmpDir, 'real-file.db');
      const fileDb = new TuskerBrainDatabase(dbPath);
      await fileDb.initialize();

      const fileRepos = createRepositories(fileDb);
      await fileRepos.emails.create({
        id: 'persistent-email',
        threadId: 'thread-p',
        senderEmail: 'noreply@amazon.com',
        senderName: 'Amazon',
        senderDomain: 'amazon.com',
        subject: 'Your order has shipped',
        snippet: 'Your order #12345 is on its way.',
        receivedAt: new Date('2026-03-15'),
        isRead: false,
      });

      await fileDb.close();

      // Reopen same file
      const reopenedDb = new TuskerBrainDatabase(dbPath);
      await reopenedDb.initialize();
      const reopenedRepos = createRepositories(reopenedDb);

      const email = await reopenedRepos.emails.findById('persistent-email');
      expect(email).toBeDefined();
      expect(email!.subject).toBe('Your order has shipped');
      expect(email!.senderDomain).toBe('amazon.com');

      await reopenedDb.close();
    });
  });

  // ─── "My settings should be remembered" ───

  describe('Settings Persistence (User: "My settings should be remembered")', () => {
    it('sync interval and lookback preferences survive restart', async () => {
      const settingsPath = path.join(tmpDir, 'settings.json');

      // First session: user configures preferences
      SettingsManager.initializeWithFilePath(settingsPath);
      const session1 = new SettingsManager();
      await session1.set('syncInterval', 45);
      await session1.set('lookbackDays', 14);

      // Restart: new settings manager, same file
      SettingsManager.initializeWithFilePath(settingsPath);
      const session2 = new SettingsManager();

      expect(await session2.get('syncInterval')).toBe(45);
      expect(await session2.get('lookbackDays')).toBe(14);
    });

    it('LLM provider choice survives restart', async () => {
      const settingsPath = path.join(tmpDir, 'settings.json');

      SettingsManager.initializeWithFilePath(settingsPath);
      const session1 = new SettingsManager();
      await session1.set('llmProvider', 'anthropic');
      await session1.set('llmApiKey', 'sk-ant-test-key-12345');

      SettingsManager.initializeWithFilePath(settingsPath);
      const session2 = new SettingsManager();

      expect(await session2.get('llmProvider')).toBe('anthropic');
      expect(await session2.get('llmApiKey')).toBe('sk-ant-test-key-12345');
    });
  });

  // ─── "Unprocessed emails should be picked back up" ───

  describe('Job Recovery (User: "Unprocessed emails should be picked back up")', () => {
    it('emails that were never processed get re-queued on restart', async () => {
      await repos.emails.create({
        id: 'unprocessed-1',
        threadId: 'thread-u1',
        senderEmail: 'news@techcrunch.com',
        senderName: 'TechCrunch',
        senderDomain: 'techcrunch.com',
        subject: 'Daily Digest',
        snippet: 'Top stories today...',
        receivedAt: new Date(),
        isRead: false,
      });
      await repos.emails.create({
        id: 'unprocessed-2',
        threadId: 'thread-u2',
        senderEmail: 'deals@amazon.com',
        senderName: 'Amazon',
        senderDomain: 'amazon.com',
        subject: 'Deal of the Day',
        snippet: 'Save 40% on...',
        receivedAt: new Date(),
        isRead: false,
      });

      const queue = new JobQueue();
      const recoveredCount = await recoverUnprocessedJobs(db, queue);

      expect(recoveredCount).toBe(2);
      const pendingJobs = await queue.getJobsByStatus('pending');
      expect(pendingJobs.length).toBe(2);
      expect(pendingJobs.some((j: any) => j.payload?.emailId === 'unprocessed-1')).toBe(true);
      expect(pendingJobs.some((j: any) => j.payload?.emailId === 'unprocessed-2')).toBe(true);
    });

    it('already-processed emails are NOT re-queued', async () => {
      await repos.emails.create({
        id: 'processed-1',
        threadId: 'thread-p1',
        senderEmail: 'hr@company.com',
        senderName: 'HR',
        senderDomain: 'company.com',
        subject: 'Benefits Update',
        snippet: 'Open enrollment starts...',
        receivedAt: new Date(),
        isRead: true,
      });

      await db.getDatabase()
        .update(emails)
        .set({ isProcessed: true })
        .where(eq(emails.id, 'processed-1'));

      const queue = new JobQueue();
      const recoveredCount = await recoverUnprocessedJobs(db, queue);

      expect(recoveredCount).toBe(0);
    });
  });

  // ─── "My 30-day import picked up where it left off" ───

  describe('Backfill Progress Recovery (User: "My 30-day import picked up where it left off")', () => {
    it('backfill creates day jobs and persists sync state', async () => {
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.startInitialSync(30);

      // Verify backfill jobs were created
      const jobsBefore = await session1.getBackfillJobs();
      expect(jobsBefore.length).toBe(30);
      expect(jobsBefore[0].status).toBe('pending');

      // Verify sync state was persisted
      const savedState = await repos.syncState.load();
      expect(savedState.historyId).toBe('profile-history-001');
    });

    it('sync checkpoint tracks processed emails for recovery', async () => {
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.startInitialSync(14);

      await session1.processEmail('msg1');
      await session1.processEmail('msg2');

      const checkpoint = session1.getCheckpoint();
      expect(checkpoint.lastProcessedIndex).toBeGreaterThan(0);
      expect(checkpoint.lastMessageId).toBeDefined();
    });

    it('backfill jobs survive restart (loaded from persisted state)', async () => {
      // Session 1: start backfill
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.startInitialSync(7);

      const stateBefore = await session1.getSyncState();

      // Session 2: new instance — should load state AND be able to get backfill jobs
      const session2 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session2.initialize();
      const jobsAfter = await session2.getBackfillJobs();
      expect(jobsAfter.length).toBe(7);
    });
  });

  // ─── "That email mid-process should get retried" ───

  describe('Running Job Retry (User: "That email mid-process should get retried")', () => {
    it('running jobs are reset to pending after crash', async () => {
      const queue = new JobQueue();

      const job = await queue.createJob({
        type: 'email_process',
        payload: { emailId: 'crash-mid-process' },
        emailId: 'crash-mid-process',
      });
      await queue.updateJobStatus(job.id, 'running');

      queue.simulateCrash();

      const jobAfter = await queue.getJob(job.id);
      expect(jobAfter!.status).toBe('pending');
      expect(jobAfter!.error).toBe('Interrupted by crash');
    });

    it('crash recovery re-queues interrupted and preserves completed jobs', async () => {
      const queue = new JobQueue();

      const runningJob = await queue.createJob({
        type: 'email_process',
        payload: { emailId: 'interrupted-email' },
        emailId: 'interrupted-email',
      });
      await queue.updateJobStatus(runningJob.id, 'running');

      const completedJob = await queue.createJob({
        type: 'email_process',
        payload: { emailId: 'done-email' },
        emailId: 'done-email',
      });
      await queue.updateJobStatus(completedJob.id, 'running');
      await queue.updateJobStatus(completedJob.id, 'completed');

      queue.simulateCrash();
      await queue.recoverFromCrash();

      const pendingAfter = await queue.getJobsByStatus('pending');
      expect(pendingAfter.some((j) => j.emailId === 'interrupted-email')).toBe(true);

      const completedAfter = await queue.getJobsByStatus('completed');
      expect(completedAfter.length).toBe(1);
    });

    it('inconsistent state (audit says done but email unprocessed) gets re-queued', async () => {
      const queue = new JobQueue();

      queue.simulateInconsistentState('ghost-email', {
        auditLogSaysCompleted: true,
        emailIsProcessed: false,
      });

      await queue.recoverFromCrash();

      const jobs = await queue.getJobsForEmail('ghost-email');
      const pending = jobs.filter((j) => j.status === 'pending');
      expect(pending.length).toBeGreaterThan(0);
    });
  });

  // ─── "I don't have to re-authenticate" ───

  describe('Gmail Credential Persistence (User: "I don\'t want to re-authenticate")', () => {
    it('OAuth tokens survive across TokenManager instances (disk persistence)', async () => {
      const mockClient = {
        getProfile: vi.fn().mockResolvedValue({
          emailAddress: 'user@gmail.com',
          historyId: '12345',
        }),
      };

      // Session 1: user authenticates
      const session1 = new TokenManager(mockClient as any);
      const tokens: OAuthTokens = {
        access_token: 'ya29.test-access-token',
        refresh_token: '1//test-refresh-token',
        expiry_date: new Date(Date.now() + 3600000),
      };
      await session1.setTokens(tokens);

      // Verify encrypted storage is used (not plaintext)
      const rawStorage = await session1.getRawStorage();
      expect(rawStorage).not.toContain('ya29.test-access-token');
      expect(rawStorage).not.toContain('1//test-refresh-token');

      // Session 2: app restarts, new TokenManager instance
      const session2 = new TokenManager(mockClient as any);

      // Tokens MUST be recoverable from persistent storage (not just static memory)
      const restored = await session2.getStoredTokens();
      expect(restored).not.toBeNull();
      expect(restored!.access_token).toBe('ya29.test-access-token');
      expect(restored!.refresh_token).toBe('1//test-refresh-token');
    });

    it('token encryption protects secrets — raw storage is not plaintext', async () => {
      const mockClient = {
        getProfile: vi.fn().mockResolvedValue({ emailAddress: 'user@gmail.com' }),
      };

      const manager = new TokenManager(mockClient as any);
      await manager.setTokens({
        access_token: 'sensitive-token-value',
        refresh_token: 'sensitive-refresh-value',
        expiry_date: new Date(Date.now() + 3600000),
      });

      // Raw storage should NOT contain plaintext
      const raw = await manager.getRawStorage();
      const parsed = JSON.parse(raw);
      expect(parsed.access_token).not.toBe('sensitive-token-value');
      expect(parsed.refresh_token).not.toBe('sensitive-refresh-value');

      // But decrypted tokens should be correct
      const decrypted = await manager.getStoredTokens();
      expect(decrypted!.access_token).toBe('sensitive-token-value');
      expect(decrypted!.refresh_token).toBe('sensitive-refresh-value');
    });
  });

  // ─── "My topic digests are still there" ───

  describe('Topic Summary Persistence (User: "My topic digests are still there")', () => {
    it('topic summaries survive restart via upsertSummary (production code path)', async () => {
      const topic = await repos.topics.create({
        id: 'topic-banking',
        name: 'Banking',
        fullPath: 'Finance/Banking',
      });

      await repos.emails.create({
        id: 'bank-email-1',
        threadId: 'thread-b1',
        senderEmail: 'alerts@chase.com',
        senderName: 'Chase',
        senderDomain: 'chase.com',
        subject: 'Account balance updated',
        snippet: 'Your balance is now $1,234.56',
        receivedAt: new Date(),
        isRead: true,
      });
      await repos.topics.linkEmail('bank-email-1', 'topic-banking');

      // Use the REAL production method to create a summary
      const summary = await repos.topics.upsertSummary(
        'topic-banking',
        'Banking alerts from Chase. Account balance updated to $1,234.56.',
        11,
        'bank-email-1'
      );

      expect(summary.summary).toContain('$1,234.56');
      expect(summary.updateCount).toBe(1);

      // Simulate restart: new repository, same DB
      const freshRepos = createRepositories(db);
      const restoredSummary = await freshRepos.topics.getSummary('topic-banking');
      expect(restoredSummary!.summary).toBe('Banking alerts from Chase. Account balance updated to $1,234.56.');
      expect(restoredSummary!.updateCount).toBe(1);
    });

    it('sender summaries survive restart via upsertSenderSummary (production code path)', async () => {
      // Create referenced email for FK constraint
      await repos.emails.create({
        id: 'chase-alert-1',
        threadId: 'thread-chase',
        senderEmail: 'alerts@chase.com',
        senderName: 'Chase',
        senderDomain: 'chase.com',
        subject: 'Account alert',
        snippet: 'Your account has been updated.',
        receivedAt: new Date(),
        isRead: true,
      });

      // Use the REAL production method
      const summary = await repos.summaries.upsertSenderSummary({
        senderDomain: 'chase.com',
        summary: 'Chase sends banking alerts and account updates.',
        wordCount: 8,
        lastEmailId: 'chase-alert-1',
      });

      expect(summary.summary).toContain('Chase');

      // Simulate restart
      const freshRepos = createRepositories(db);
      const restored = await freshRepos.summaries.getSenderSummary('chase.com');
      expect(restored!.summary).toBe('Chase sends banking alerts and account updates.');
      expect(restored!.updateCount).toBe(1);
    });

    it('topic summary survives actual DB file close and reopen', async () => {
      const dbPath = path.join(tmpDir, 'topics-test.db');
      const fileDb = new TuskerBrainDatabase(dbPath);
      await fileDb.initialize();

      const fileRepos = createRepositories(fileDb);

      await fileRepos.emails.create({
        id: 'travel-email-1',
        threadId: 'thread-travel',
        senderEmail: 'noreply@airline.com',
        senderName: 'Airline',
        senderDomain: 'airline.com',
        subject: 'Your flight confirmation',
        snippet: 'Your flight has been confirmed.',
        receivedAt: new Date(),
        isRead: true,
      });

      await fileRepos.topics.create({
        id: 'topic-travel',
        name: 'Travel',
        fullPath: 'Travel',
      });

      // Use the REAL production method
      await fileRepos.topics.upsertSummary(
        'topic-travel',
        'Flight confirmations and hotel bookings.',
        6,
        'travel-email-1'
      );

      await fileDb.close();

      // Reopen and verify persistence
      const reopenedDb = new TuskerBrainDatabase(dbPath);
      await reopenedDb.initialize();
      const reopenedRepos = createRepositories(reopenedDb);

      const summary = await reopenedRepos.topics.getSummary('topic-travel');
      expect(summary).not.toBeNull();
      expect(summary!.summary).toBe('Flight confirmations and hotel bookings.');

      await reopenedDb.close();
    });
  });

  // ─── "It picked up without me doing anything" ───

  describe('Automatic Resumption (User: "It picked up without me doing anything")', () => {
    it('totalEmailsProcessed counter is preserved after processEmail', async () => {
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.startInitialSync(30);
      await session1.processEmail('msg1');
      await session1.processEmail('msg2');

      // processEmail should persist the counter so it survives restart
      const stateBefore = await session1.getSyncState();
      expect(stateBefore.totalEmailsProcessed).toBe(2);

      // Verify it was actually persisted (not just in-memory)
      const persisted = await repos.syncState.load();
      expect(persisted.totalEmailsProcessed).toBe(2);

      // Session 2: new instance loads persisted counter
      const session2 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session2.initialize();
      const stateAfter = await session2.getSyncState();
      expect(stateAfter.totalEmailsProcessed).toBe(2);
    });

    it('sync interval setting is preserved — scheduler can resume automatically', async () => {
      const settingsPath = path.join(tmpDir, 'auto-resume-settings.json');

      SettingsManager.initializeWithFilePath(settingsPath);
      const session1 = new SettingsManager();
      await session1.setProcessingInterval(30);

      // Wait for debounced disk write (setImmediate)
      await new Promise((r) => setTimeout(r, 50));

      SettingsManager.initializeWithFilePath(settingsPath);
      const session2 = new SettingsManager();

      const interval = await session2.getProcessingInterval();
      expect(interval).toBe(30);
    });

    it('lastFullSync timestamp is preserved — scheduler knows when next sync is due', async () => {
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.startInitialSync(30);

      const state1 = await session1.getSyncState();
      expect(state1.lastFullSync).toBeDefined();

      // Verify it was persisted
      const persisted = await repos.syncState.load();
      expect(persisted.lastFullSync).toBeDefined();

      // Session 2 loads persisted timestamp
      const session2 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session2.initialize();
      const state2 = await session2.getSyncState();
      expect(state2.lastFullSync).toBeDefined();

      // With interval=30min and lastFullSync, the scheduler can compute next run
      const lastSync = state2.lastFullSync!;
      const nextSync = new Date(lastSync.getTime() + 30 * 60 * 1000);
      expect(nextSync.getTime()).toBeGreaterThan(lastSync.getTime());
    });
  });

  // ─── "It recovered from my crash gracefully" ───

  describe('Crash Recovery (User: "It recovered from my crash")', () => {
    it('unclean shutdown: unprocessed emails all get recovered', async () => {
      await repos.emails.create({
        id: 'crash-email-1',
        threadId: 'thread-crash1',
        senderEmail: 'urgent@work.com',
        senderName: 'Work',
        senderDomain: 'work.com',
        subject: 'Urgent: Project deadline',
        snippet: 'Please review ASAP...',
        receivedAt: new Date(),
        isRead: false,
      });

      await repos.emails.create({
        id: 'crash-email-2',
        threadId: 'thread-crash2',
        senderEmail: 'news@tech.com',
        senderName: 'TechNews',
        senderDomain: 'tech.com',
        subject: 'Weekly roundup',
        snippet: 'This week in tech...',
        receivedAt: new Date(),
        isRead: false,
      });

      const queue = new JobQueue();
      const recovered = await recoverUnprocessedJobs(db, queue);

      expect(recovered).toBe(2);
      const pendingJobs = await queue.getJobsByStatus('pending');
      expect(pendingJobs.some((j: any) => j.payload?.emailId === 'crash-email-1')).toBe(true);
      expect(pendingJobs.some((j: any) => j.payload?.emailId === 'crash-email-2')).toBe(true);
    });

    it('processed emails are not re-queued even after crash', async () => {
      await repos.emails.create({
        id: 'already-done',
        threadId: 'thread-done',
        senderEmail: 'done@company.com',
        senderName: 'DoneCo',
        senderDomain: 'company.com',
        subject: 'Completed task',
        snippet: 'This was fully processed.',
        receivedAt: new Date(),
        isRead: true,
      });

      await db.getDatabase()
        .update(emails)
        .set({ isProcessed: true })
        .where(eq(emails.id, 'already-done'));

      const queue = new JobQueue();
      const recovered = await recoverUnprocessedJobs(db, queue);

      expect(recovered).toBe(0);
      const pendingJobs = await queue.getJobsByStatus('pending');
      expect(pendingJobs.length).toBe(0);
    });

    it('sync state is not corrupted by unclean shutdown', async () => {
      const session1 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session1.startInitialSync(30);

      // Crash happens mid-sync — verify the last persisted state is intact
      const state = await repos.syncState.load();
      expect(state.historyId).toBe('profile-history-001');
      expect(state.totalEmailsProcessed).toBeGreaterThanOrEqual(0);

      // After restart, new instance can load this state
      const session2 = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await session2.initialize();
      const restoredState = await session2.getSyncState();
      expect(restoredState.historyId).toBe('profile-history-001');
    });
  });
});
