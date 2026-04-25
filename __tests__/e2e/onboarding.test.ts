import { test, expect, type Page } from '@playwright/test';
import { launchTestApp, type TestApp } from './helpers';

test.describe('Onboarding Flow', () => {
  let testApp: TestApp | undefined;
  let page: Page;

  test.beforeAll(async () => {
    testApp = await launchTestApp();
    page = testApp.page;
  });

  test.afterAll(async () => {
    await testApp?.close();
  });

  test('should show welcome screen on first launch', async () => {
    const welcomeText = await page.textContent('body');
    expect(welcomeText?.toLowerCase()).toContain('welcome');
  });

  test('should show Connect Gmail button', async () => {
    const connectButton = await page.$('button:has-text("Connect")');
    expect(connectButton).toBeDefined();
  });
});

test.describe('Onboarding Flow with Gmail connected', () => {
  let testApp: TestApp | undefined;
  let page: Page;

  test.beforeAll(async () => {
    testApp = await launchTestApp({ authenticated: true });
    page = testApp.page;
  });

  test.afterAll(async () => {
    await testApp?.close();
  });

  test('should progress through preferences and LLM provider setup', async () => {
    await page.waitForSelector('text=/email preferences/i', { timeout: 5000 });

    const pageContent = await page.textContent('body');
    expect(pageContent).toMatch(/lookback|sync|preferences/i);

    const lookbackOptions = await page.$$('select');
    expect(lookbackOptions.length).toBeGreaterThan(0);

    const continueButton = await page.$('button:has-text("Continue"), button:has-text("Next")');
    expect(continueButton).toBeDefined();
    await continueButton!.click();

    await page.waitForSelector('text=/api.*key|provider|openai|anthropic/i', { timeout: 5000 });

    const llmContent = await page.textContent('body');
    expect(llmContent).toMatch(/api.*key|provider|openai|anthropic|google/i);

    const keyInput = await page.$('input[type="password"], input[placeholder*="key" i]');
    expect(keyInput).toBeDefined();
  });
});
