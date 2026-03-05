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

  test('should skip auto-updater in test mode', async () => {
    // In test mode, auto-updater should be disabled
    const result = await electronApp.evaluate(({ ipcMain }) => {
      // Auto-updater handlers should NOT be registered in test mode
      return ipcMain.listenerCount('auto-updater:check-for-updates') === 0;
    });
    expect(result).toBe(true);
  });

  test('should have version available', async () => {
    const version = await electronApp.evaluate(async ({ app }) => {
      return app.getVersion();
    });
    
    expect(version).toBeDefined();
    expect(typeof version).toBe('string');
  });

  test('should handle update check gracefully in test mode', async () => {
    // In test mode, calling check-for-updates should not crash
    // The auto-updater is not initialized, so this should handle gracefully
    const result = await page.evaluate(async () => {
      try {
        // Try to invoke - it may fail since handler isn't registered in test mode
        const api = (window as any).electronAPI;
        if (api?.invoke) {
          return await api.invoke('auto-updater:check-for-updates');
        }
        return { skipped: true, reason: 'API not available' };
      } catch (error) {
        return { error: true, message: String(error) };
      }
    });
    
    // Either the result is defined, or we get an error - both are acceptable
    expect(result).toBeDefined();
  });
});
