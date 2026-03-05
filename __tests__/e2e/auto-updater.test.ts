import { test, expect, ElectronApplication, Page, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let electronApp: ElectronApplication;
let page: Page;

test.describe('Auto-Updater', () => {
  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('should check for updates on startup', async () => {
    // In test mode, auto-updater should be disabled or mock checking
    const result = await electronApp.evaluate(({ ipcMain }) => {
      return ipcMain.listenerCount('auto-updater:check-for-updates') > 0;
    });
    expect(result).toBe(true);
  });

  test('should have IPC handlers for auto-updater', async () => {
    const handlers = await electronApp.evaluate(({ ipcMain }) => {
      return {
        checkForUpdates: ipcMain.listenerCount('auto-updater:check-for-updates') > 0,
        downloadUpdate: ipcMain.listenerCount('auto-updater:download-update') > 0,
        quitAndInstall: ipcMain.listenerCount('auto-updater:quit-and-install') > 0,
      };
    });
    
    expect(handlers.checkForUpdates).toBe(true);
    expect(handlers.downloadUpdate).toBe(true);
    expect(handlers.quitAndInstall).toBe(true);
  });

  test('should get current version', async () => {
    const version = await electronApp.evaluate(async ({ app }) => {
      return app.getVersion();
    });
    
    expect(version).toBeDefined();
    expect(typeof version).toBe('string');
  });

  test('should handle update check in development mode', async () => {
    // In development/test mode, updates should not be checked from GitHub
    const result = await page.evaluate(() => {
      return (window as any).electronAPI?.invoke('auto-updater:check-for-updates');
    });
    
    // Should not throw error even in dev mode
    expect(result).toBeDefined();
  });
});
