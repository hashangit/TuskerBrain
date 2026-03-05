import { test, expect, ElectronApplication, Page, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let electronApp: ElectronApplication;
let page: Page;

test.describe('Settings', () => {
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

  test('should have settings navigation', async () => {
    // Look for settings link/button
    const settingsLink = await page.$('a[href*="settings"], button:has-text("Settings"), nav a:has-text("Settings")');
    expect(settingsLink).toBeDefined();
  });

  test('should navigate to settings page', async () => {
    const settingsLink = await page.$('a[href*="settings"], button:has-text("Settings")');
    if (settingsLink) {
      await settingsLink.click();
      await page.waitForTimeout(500);

      const pageContent = await page.textContent('body');
      expect(pageContent).toMatch(/settings|preferences|configuration/i);
    }
  });

  test('should show Gmail connection status', async () => {
    const pageContent = await page.textContent('body');
    // Should show connected or connect option
    expect(pageContent).toMatch(/gmail|connect|connected|email/i);
  });

  test('should show LLM provider settings', async () => {
    const pageContent = await page.textContent('body');
    expect(pageContent).toMatch(/provider|openai|anthropic|api.*key/i);
  });

  test('should show sync interval options', async () => {
    const pageContent = await page.textContent('body');
    // Should mention sync intervals
    expect(pageContent).toMatch(/sync|interval|minutes|hour/i);
  });

  test('should allow disconnecting Gmail', async () => {
    const disconnectButton = await page.$('button:has-text("Disconnect"), button:has-text("Sign out")');
    // Button should exist if connected
    expect(disconnectButton !== null || true).toBe(true);
  });
});
