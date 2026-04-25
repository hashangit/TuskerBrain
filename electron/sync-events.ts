import type { BrowserWindow } from 'electron';
import type { GmailSyncManager } from '@core/gmail/sync';

export function forwardSyncProgress(
  syncManager: GmailSyncManager,
  getWindow: () => BrowserWindow | null
): void {
  syncManager.on('progress', (data) => {
    getWindow()?.webContents.send('sync:progress', data);
  });
  syncManager.on('sync:completed', (data) => {
    getWindow()?.webContents.send('sync:complete', data);
  });
  syncManager.on('sync:error', (data) => {
    getWindow()?.webContents.send('sync:error', data);
  });
}

export function startPeriodicSync(
  intervalMinutes: number,
  runSyncCycle: () => Promise<void>,
  existingTimer: NodeJS.Timeout | null
): NodeJS.Timeout {
  if (existingTimer) clearInterval(existingTimer);

  const syncTimer = setInterval(async () => {
    console.log('[main] Running periodic sync');
    await runSyncCycle();
  }, intervalMinutes * 60 * 1000);

  console.log(`[main] Periodic sync started: every ${intervalMinutes} minutes`);
  return syncTimer;
}
