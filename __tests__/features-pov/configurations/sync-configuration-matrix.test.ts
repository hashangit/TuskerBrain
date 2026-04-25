import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SettingsManager, SettingsStore } from '@core/settings/manager';
import { GmailSyncManager, type GmailClient } from '@core/gmail/sync';

/**
 * Scenario: Sync Configuration Matrix
 *
 * Tests various combinations of sync interval and lookback period
 * configurations using real SettingsManager and GmailSyncManager.
 *
 * Configuration Matrix:
 * - Sync intervals: 15min, 30min, 1hr, 2hr, daily
 * - Lookback periods: 7, 14, 30, 60, 90 days
 */

function createMockGmailClient(): GmailClient {
  return {
    listMessages: async () => ({ messages: [], resultSizeEstimate: 0 }),
    getMessage: async () => null,
    getProfile: async () => ({ emailAddress: 'test@test.com', historyId: '12345', messagesTotal: 0 }),
    modifyMessage: async () => {},
  };
}

describe('Scenario: Sync Configuration Matrix', () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-config-test-'));
    settingsPath = path.join(tmpDir, 'settings.json');
  });

  function createSettingsManager(): SettingsManager {
    const store = new SettingsStore();
    store.initializeWithFilePath(settingsPath);
    return new SettingsManager(store);
  }

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Sync Interval Configurations', () => {
    it('15-minute sync interval is persisted', async () => {
      const settings = createSettingsManager();
      await settings.setProcessingInterval(15);

      const interval = await settings.getProcessingInterval();
      expect(interval).toBe(15);

      // Wait for debounced saveToDisk (setImmediate) to flush
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify persisted to disk
      const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(onDisk.settings.processingInterval).toBe(15);
    });

    it('60-minute (1hr) sync interval is persisted', async () => {
      const settings = createSettingsManager();
      await settings.setProcessingInterval(60);

      const interval = await settings.getProcessingInterval();
      expect(interval).toBe(60);

      await new Promise(resolve => setTimeout(resolve, 10));

      const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(onDisk.settings.processingInterval).toBe(60);
    });

    it('1440-minute (daily) sync interval is persisted', async () => {
      const settings = createSettingsManager();
      await settings.setProcessingInterval(1440);

      const interval = await settings.getProcessingInterval();
      expect(interval).toBe(1440);

      await new Promise(resolve => setTimeout(resolve, 10));

      const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(onDisk.settings.processingInterval).toBe(1440);
    });
  });

  describe('Lookback Period Configurations', () => {
    it('7-day lookback is persisted', async () => {
      const settings = createSettingsManager();
      await settings.setLookbackDays(7);

      const lookback = await settings.getLookbackDays();
      expect(lookback).toBe(7);

      await new Promise(resolve => setTimeout(resolve, 10));

      const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(onDisk.settings.lookbackDays).toBe(7);
    });

    it('90-day lookback is persisted', async () => {
      const settings = createSettingsManager();
      await settings.setLookbackDays(90);

      const lookback = await settings.getLookbackDays();
      expect(lookback).toBe(90);

      await new Promise(resolve => setTimeout(resolve, 10));

      const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(onDisk.settings.lookbackDays).toBe(90);
    });

    it('7-day lookback creates exactly 7 backfill jobs via GmailSyncManager', async () => {
      const client = createMockGmailClient();
      const syncManager = new GmailSyncManager(client);

      await syncManager.startInitialSync(7);
      const jobs = await syncManager.getBackfillJobs();

      expect(jobs).toHaveLength(7);
      jobs.forEach(job => {
        expect(job.type).toBe('backfill_day');
        expect(job.status).toBe('pending');
      });
    });

    it('90-day lookback creates exactly 90 backfill jobs via GmailSyncManager', async () => {
      const client = createMockGmailClient();
      const syncManager = new GmailSyncManager(client);

      await syncManager.startInitialSync(90);
      const jobs = await syncManager.getBackfillJobs();

      expect(jobs).toHaveLength(90);
    });
  });

  describe('Configuration Combinations', () => {
    it('15min sync + 7-day lookback both persist', async () => {
      const settings = createSettingsManager();
      await settings.setProcessingInterval(15);
      await settings.setLookbackDays(7);

      expect(await settings.getProcessingInterval()).toBe(15);
      expect(await settings.getLookbackDays()).toBe(7);

      await new Promise(resolve => setTimeout(resolve, 10));

      const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(onDisk.settings.processingInterval).toBe(15);
      expect(onDisk.settings.lookbackDays).toBe(7);
    });

    it('60min sync + 90-day lookback both persist', async () => {
      const settings = createSettingsManager();
      await settings.setProcessingInterval(60);
      await settings.setLookbackDays(90);

      expect(await settings.getProcessingInterval()).toBe(60);
      expect(await settings.getLookbackDays()).toBe(90);

      await new Promise(resolve => setTimeout(resolve, 10));

      const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(onDisk.settings.processingInterval).toBe(60);
      expect(onDisk.settings.lookbackDays).toBe(90);
    });
  });

  describe('Configuration Persistence', () => {
    it('Sync configuration persists across new SettingsManager instances', async () => {
      // First instance sets configuration
      const first = createSettingsManager();
      await first.setProcessingInterval(60);
      await first.setLookbackDays(14);

      // Wait for debounced save to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate restart: fresh store reads from same file on disk
      const second = createSettingsManager();
      expect(await second.getProcessingInterval()).toBe(60);
      expect(await second.getLookbackDays()).toBe(14);
    });
  });

  describe('Default Values', () => {
    it('Default sync interval is 30 minutes', async () => {
      const settings = createSettingsManager();
      const interval = await settings.getProcessingInterval();
      expect(interval).toBe(30);
    });

    it('Default lookback period is 30 days', async () => {
      const settings = createSettingsManager();
      const lookback = await settings.getLookbackDays();
      expect(lookback).toBe(30);
    });
  });

  describe('Invalid Values', () => {
    it('Rejects invalid sync interval with error', async () => {
      const settings = createSettingsManager();
      await expect(settings.setProcessingInterval(5)).rejects.toThrow(
        'Invalid processing interval: 5'
      );
    });

    it('Rejects invalid lookback days with error', async () => {
      const settings = createSettingsManager();
      await expect(settings.setLookbackDays(45)).rejects.toThrow(
        'Invalid lookback days: 45'
      );
    });
  });
});
