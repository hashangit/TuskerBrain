import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { TuskerBrainDatabase } from '@db/index';
import { GmailSyncManager, type GmailClient } from '@core/gmail/sync';
import { SettingsManager, SettingsStore } from '@core/settings/manager';
import { TokenManager, type OAuthTokens } from '@core/auth/token-manager';
import { createRepositories, type Repositories } from '@core/repositories';

/**
 * Scenario: Fresh Install Journey
 *
 * Tests what the USER expects when installing TuskerBrain for the first time:
 * "I just installed the app — does the onboarding flow work?"
 *
 * RULES:
 * - Every test calls REAL production code.
 * - Only the Gmail API client is mocked (can't hit real Gmail in tests).
 * - NO TuskerBrainApp import, NO test helper abstractions.
 * - If a test fails, it means the feature is NOT implemented. That's the point.
 *
 * Infrastructure note:
 * db.initialize() runs Drizzle migrations from the migrations folder.
 */

function createMockGmailClient(): GmailClient {
  return {
    listMessages: vi.fn().mockResolvedValue({
      messages: [{ id: 'msg1' }],
      nextPageToken: undefined,
    }),
    getMessage: vi.fn().mockResolvedValue({
      id: 'test-email-id',
      threadId: 'thread-1',
      snippet: 'Test email body content',
      internalDate: Date.now().toString(),
      payload: {
        headers: [
          { name: 'From', value: 'sender <sender@example.com>' },
          { name: 'Subject', value: 'Test Subject' },
        ],
      },
    }),
    modifyMessage: vi.fn().mockResolvedValue({}),
    getProfile: vi.fn().mockResolvedValue({
      emailAddress: 'user@gmail.com',
      historyId: 'initial-history-001',
      messagesTotal: 42,
    }),
  };
}

function createSettingsManager(settingsPath: string): SettingsManager {
  const store = new SettingsStore();
  store.initializeWithFilePath(settingsPath);
  return new SettingsManager(store);
}

describe('Scenario: Fresh Install Journey', () => {
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-install-test-'));
  });

  afterEach(async () => {
    await db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- "Is this really a fresh install?" ---

  describe('Fresh Install Detection (User: "Is this really a fresh install?")', () => {
    it('no sync state exists on fresh install', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);

      const state = await manager.getSyncState();
      expect(state.historyId).toBeUndefined();
      expect(state.lastFullSync).toBeUndefined();
      expect(state.totalEmailsProcessed).toBe(0);
    });

    it('no emails exist in database on fresh install', async () => {
      const emailCount = await repos.emails.count();
      expect(emailCount).toBe(0);
    });

    it('no timeline updates exist on fresh install', async () => {
      const count = await repos.timeline.count();
      expect(count).toBe(0);
    });

    it('onboarding is not marked complete by default', async () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = createSettingsManager(settingsPath);

      const onboardingComplete = await settings.get('onboarding_complete');
      expect(onboardingComplete).toBe(false);
    });
  });

  // --- "I connected my Gmail" ---

  describe('Gmail Connection (User: "I connected my Gmail")', () => {
    it('TokenManager stores OAuth tokens after authentication', async () => {
      const mockClient = {
        getProfile: vi.fn().mockResolvedValue({
          emailAddress: 'user@gmail.com',
          historyId: '12345',
        }),
      };

      const tokenManager = new TokenManager(mockClient as any);
      const tokens: OAuthTokens = {
        access_token: 'ya29.a0-test-access-token',
        refresh_token: '1//test-refresh-token',
        expiry_date: new Date(Date.now() + 3600000),
      };

      await tokenManager.setTokens(tokens);

      const stored = await tokenManager.getStoredTokens();
      expect(stored).not.toBeNull();
      expect(stored!.access_token).toBe('ya29.a0-test-access-token');
      expect(stored!.refresh_token).toBe('1//test-refresh-token');
    });

    it('tokens are encrypted in storage, not plaintext', async () => {
      const mockClient = {
        getProfile: vi.fn().mockResolvedValue({ emailAddress: 'user@gmail.com' }),
      };

      const tokenManager = new TokenManager(mockClient as any);
      await tokenManager.setTokens({
        access_token: 'sensitive-access-token',
        refresh_token: 'sensitive-refresh-token',
        expiry_date: new Date(Date.now() + 3600000),
      });

      const raw = await tokenManager.getRawStorage();
      expect(raw).not.toContain('sensitive-access-token');
      expect(raw).not.toContain('sensitive-refresh-token');
    });
  });

  // --- "I configured my LLM provider" ---

  describe('LLM Configuration (User: "I configured my LLM provider")', () => {
    it('settings manager stores LLM provider choice and API key', async () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = createSettingsManager(settingsPath);

      await settings.setApiKey('anthropic', 'sk-ant-valid-key-12345');
      await settings.setActiveProvider('anthropic');

      const activeProvider = await settings.getActiveProvider();
      expect(activeProvider).toBe('anthropic');

      const apiKey = await settings.getApiKey('anthropic');
      expect(apiKey).toBe('sk-ant-valid-key-12345');
    });

    it('provider choice persists across instances', async () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const session1 = createSettingsManager(settingsPath);

      await session1.setApiKey('anthropic', 'sk-ant-valid-key-12345');
      await session1.setActiveProvider('anthropic');

      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate restart
      const session2 = createSettingsManager(settingsPath);

      const provider = await session2.getActiveProvider();
      expect(provider).toBe('anthropic');
    });
  });

  // --- "I set my sync preferences" ---

  describe('Sync Preferences (User: "I set my sync preferences")', () => {
    it('processing interval and lookback days are persisted', async () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = createSettingsManager(settingsPath);

      await settings.setProcessingInterval(60);
      await settings.setLookbackDays(14);

      expect(await settings.getProcessingInterval()).toBe(60);
      expect(await settings.getLookbackDays()).toBe(14);
    });

    it('sync preferences survive restart', async () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const session1 = createSettingsManager(settingsPath);

      await session1.setProcessingInterval(15);
      await session1.setLookbackDays(7);

      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate restart
      const session2 = createSettingsManager(settingsPath);

      expect(await session2.getProcessingInterval()).toBe(15);
      expect(await session2.getLookbackDays()).toBe(7);
    });

    it('defaults are sensible for fresh install', async () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const settings = createSettingsManager(settingsPath);

      const interval = await settings.getProcessingInterval();
      const lookback = await settings.getLookbackDays();

      expect(interval).toBeGreaterThan(0);
      expect(lookback).toBeGreaterThan(0);
    });
  });

  // --- "Sync started after I finished setup" ---

  describe('Auto Sync Start (User: "Sync started after I finished setup")', () => {
    it('GmailSyncManager.startInitialSync begins the sync process', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);

      await manager.startInitialSync(30);

      expect(mockGmailClient.getProfile).toHaveBeenCalled();
      expect(mockGmailClient.listMessages).toHaveBeenCalled();

      // Verify from persisted state (avoids race with async constructor load)
      const persistedState = await repos.syncState.load();
      expect(persistedState.historyId).toBe('initial-history-001');
      expect(persistedState.lastFullSync).toBeDefined();
    });

    it('sync state is persisted to database after initial sync', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.startInitialSync(30);

      const persistedState = await repos.syncState.load();
      expect(persistedState.historyId).toBe('initial-history-001');
      expect(persistedState.lastFullSync).toBeDefined();
    });
  });

  // --- "I can see the sync is running" ---

  describe('Sync Progress (User: "I can see the sync is running")', () => {
    it('getProgress returns running state during sync', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.startInitialSync(30);

      const progress = manager.getProgress();
      expect(progress.isRunning).toBe(true);
      expect(progress.total).toBeGreaterThanOrEqual(0);
    });

    it('progress shows emails fetched from Gmail', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.startInitialSync(7);

      const progress = manager.getProgress();
      // Mock returns 1 message
      expect(progress.total).toBe(1);
    });

    it('backfill jobs are created for each lookback day', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.startInitialSync(14);

      const jobs = await manager.getBackfillJobs();
      expect(jobs.length).toBe(14);
      expect(jobs[0].status).toBe('pending');
      expect(jobs[0].type).toBe('backfill_day');
    });
  });

  // --- "I can see my first email" ---

  describe('First Email (User: "I can see my first email")', () => {
    it('processEmail returns a valid Email object from Gmail message', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);

      const email = await manager.processEmail('msg1');

      expect(email).not.toBeNull();
      expect(email!.id).toBe('test-email-id');
      expect(email!.threadId).toBe('thread-1');
      expect(email!.subject).toBe('Test Subject');
      expect(email!.senderEmail).toContain('sender@example.com');
      expect(email!.snippet).toBe('Test email body content');
    });

    it('processEmail increments processed counter in sync state', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      await manager.processEmail('msg1');

      const state = await manager.getSyncState();
      expect(state.totalEmailsProcessed).toBe(1);

      const progress = manager.getProgress();
      expect(progress.processed).toBe(1);
    });

    it('email can be saved to database after processing', async () => {
      const manager = new GmailSyncManager(mockGmailClient, undefined, repos.syncState);
      const email = await manager.processEmail('msg1');

      expect(email).not.toBeNull();

      await repos.emails.create({
        id: email!.id,
        threadId: email!.threadId,
        senderEmail: email!.senderEmail,
        senderName: email!.senderName,
        senderDomain: email!.senderDomain,
        subject: email!.subject ?? undefined,
        snippet: email!.snippet ?? undefined,
        receivedAt: email!.receivedAt,
        isRead: false,
      });

      const saved = await repos.emails.findById(email!.id);
      expect(saved).not.toBeNull();
      expect(saved!.subject).toBe('Test Subject');
      expect(saved!.senderDomain).toBe('example.com');
    });
  });

  // --- "My first email appeared in the timeline" ---

  describe('First Email in Timeline (User: "My first email appeared in the timeline")', () => {
    it('timeline update can be created for a processed email', async () => {
      await repos.emails.create({
        id: 'test-email-id',
        threadId: 'thread-1',
        senderEmail: 'sender@example.com',
        senderName: 'Sender',
        senderDomain: 'example.com',
        subject: 'Test Subject',
        snippet: 'Test email body',
        receivedAt: new Date(),
        isRead: false,
      });

      const timelineUpdate = await repos.timeline.create({
        id: 'timeline-1',
        emailId: 'test-email-id',
        title: 'Test Subject',
        description: 'Email from example.com',
        summary: 'Brief summary of the email content',
        priority: 'medium',
        sentiment: 'neutral',
        urgency: false,
        actionItem: false,
      });

      expect(timelineUpdate.id).toBe('timeline-1');
      expect(timelineUpdate.emailId).toBe('test-email-id');
      expect(timelineUpdate.title).toBe('Test Subject');
      expect(timelineUpdate.summary).toBe('Brief summary of the email content');
    });

    it('topic can be assigned to processed email', async () => {
      await repos.emails.create({
        id: 'test-email-id',
        threadId: 'thread-1',
        senderEmail: 'sender@example.com',
        senderName: 'Sender',
        senderDomain: 'example.com',
        subject: 'Test Subject',
        snippet: 'Test email body',
        receivedAt: new Date(),
        isRead: false,
      });

      const topic = await repos.topics.create({
        id: 'topic-work',
        name: 'Work',
        fullPath: 'Work',
      });

      expect(topic.name).toBe('Work');

      await repos.topics.linkEmail('test-email-id', 'topic-work');

      const emailTopics = await repos.topics.findTopicsForEmail('test-email-id');
      expect(emailTopics.length).toBeGreaterThan(0);
      expect(emailTopics.some(t => t.name === 'Work')).toBe(true);
    });
  });

  // --- "Onboarding doesn't show again after completion" ---

  describe('Onboarding Completion (User: "Onboarding doesn\'t show again")', () => {
    it('setting onboarding_complete persists across restart', async () => {
      const settingsPath = path.join(tmpDir, 'settings.json');
      const session1 = createSettingsManager(settingsPath);

      await session1.set('onboarding_complete', true);

      // Wait for debounced save
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate restart
      const session2 = createSettingsManager(settingsPath);

      const isComplete = await session2.get('onboarding_complete');
      expect(isComplete).toBe(true);
    });

    it('onboarding_complete defaults to false on truly fresh install', async () => {
      const settingsPath = path.join(tmpDir, 'fresh-settings.json');
      if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);

      const settings = createSettingsManager(settingsPath);

      // Reset to factory defaults to simulate truly fresh state
      await settings.resetAllSettings();

      const isComplete = await settings.get('onboarding_complete');
      expect(isComplete).toBe(false);
    });
  });
});
