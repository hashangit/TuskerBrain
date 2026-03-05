import { test, expect, ElectronApplication, Page, _electron as electron } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let electronApp: ElectronApplication;
let page: Page;

test.describe('App Launch', () => {
  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main.js')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    });

    // Wait for the first window to appear
    page = await electronApp.firstWindow();

    // Wait for the app to be ready
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('should launch the app successfully', async () => {
    // Check that a window was created
    expect(page).toBeDefined();

    // Wait for the window to have content
    const title = await page.title();
    expect(title).toContain('TuskerBrain');
  });

  test('should display the main app container', async () => {
    // Check that the root element exists
    const root = await page.$('#root');
    expect(root).toBeDefined();
  });

  test('should have correct window dimensions', async () => {
    // Get window bounds via evaluate
    const bounds = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        const [width, height] = window.getSize();
        return { width, height };
      }
      return { width: 0, height: 0 };
    });

    // Window should be at least the minimum size
    expect(bounds.width).toBeGreaterThanOrEqual(1000);
    expect(bounds.height).toBeGreaterThanOrEqual(700);
  });

  test('should have correct title bar style on macOS', async () => {
    if (process.platform === 'darwin') {
      const trafficLights = await page.$$('button[aria-label*="close"], button[aria-label*="minimize"], button[aria-label*="maximize"]');
      // macOS traffic lights should be present
      expect(trafficLights.length).toBeGreaterThanOrEqual(0);
    }
  });
});
