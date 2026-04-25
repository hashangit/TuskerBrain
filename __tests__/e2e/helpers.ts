import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainEntry = path.join(__dirname, '../../dist-electron/main.js');

export interface TestApp {
  electronApp: ElectronApplication;
  page: Page;
  userDataDir: string;
  close: () => Promise<void>;
}

export async function launchTestApp(
  options: { authenticated?: boolean; onboarded?: boolean } = {}
): Promise<TestApp> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuskerbrain-e2e-'));

  if (options.onboarded) {
    seedSettings(userDataDir);
  }

  if (options.authenticated) {
    await seedOAuthTokens(userDataDir);
  }

  const electronApp = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, mainEntry],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return {
    electronApp,
    page,
    userDataDir,
    close: async () => {
      await electronApp.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function seedOAuthTokens(userDataDir: string): Promise<void> {
  const seedApp = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, mainEntry],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  try {
    const seed = await seedApp.evaluate(({ app, safeStorage }) => {
      const encrypt = (value: string) => safeStorage.encryptString(value).toString('base64');

      return {
        userDataPath: app.getPath('userData'),
        tokens: {
          access_token: encrypt('e2e-access-token'),
          refresh_token: encrypt('e2e-refresh-token'),
          expiry_date: Date.now() + 60 * 60 * 1000,
          email: 'e2e@example.com',
        },
      };
    });

    fs.writeFileSync(
      path.join(seed.userDataPath, 'oauth-tokens.enc'),
      JSON.stringify(seed.tokens),
      'utf-8'
    );
  } finally {
    await seedApp.close();
  }
}

function seedSettings(userDataDir: string): void {
  const settings = {
    settings: {
      onboarding_complete: true,
      processingInterval: 30,
      lookbackDays: 30,
    },
    apiKeys: {},
    activeProvider: null,
    providerValidationStatus: {},
    activeModels: {},
  };

  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf-8');
}
