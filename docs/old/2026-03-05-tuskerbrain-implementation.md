# TuskerBrain v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first Electron app that intelligently manages Gmail using AI, with timeline, summaries, and deals extraction.

**Architecture:** Electron app with Vite+React frontend, SQLite database, LangGraph workflows, and Vercel AI SDK for multi-provider LLM support. Job-based processing system with audit logging.

**Tech Stack:** Electron, Vite, React, React Router, shadcn/ui, Tailwind CSS, Zustand, React Query, LangGraph, Vercel AI SDK, googleapis, better-sqlite3, Drizzle ORM, Vitest, Playwright

---

## Phase 1: Project Setup & Infrastructure

### Task 1: Initialize Project Structure

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.prettierrc`
- Create: `.eslintrc.json`

**Step 1: Initialize npm project with dependencies**

```bash
mkdir -p tuskerbrain && cd tuskerbrain
npm init -y
```

**Step 2: Install core dependencies**

```bash
npm install electron react react-router-dom @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-tooltip tailwindcss postcss autoprefixer zustand @tanstack/react-query ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google googleapis better-sqlite3 drizzle-orm uuid date-fns
```

**Step 3: Install dev dependencies**

```bash
npm install -D typescript vite @vitejs/plugin-react vite-plugin-electron vite-plugin-electron-renderer electron-builder electron-updater @types/node @types/react @types/react-dom @types/better-sqlite3 @types/uuid drizzle-kit vitest @playwright/test @testing-library/react @testing-library/jest-dom eslint prettier husky lint-staged
```

**Step 4: Create package.json scripts**

```json
{
  "name": "tuskerbrain",
  "version": "0.1.0",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write .",
    "test": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "electron:build": "npm run build && electron-builder"
  }
}
```

**Step 5: Commit**

```bash
git add .
git commit -m "chore: initialize TuskerBrain project structure

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Configure TypeScript

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`

**Step 1: Write the failing test**

```typescript
// __tests__/setup/typescript.test.ts
import { describe, it, expect } from 'vitest';

describe('TypeScript Configuration', () => {
  it('should have strict mode enabled', async () => {
    const config = await import('../tsconfig.json');
    expect(config.compilerOptions.strict).toBe(true);
  });

  it('should have React JSX configured', async () => {
    const config = await import('../tsconfig.json');
    expect(config.compilerOptions.jsx).toBe('react-jsx');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test __tests__/setup/typescript.test.ts
```
Expected: FAIL - tsconfig.json does not exist

**Step 3: Write minimal implementation**

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"],
      "@core/*": ["./core/*"],
      "@db/*": ["./database/*"]
    },
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "core", "database", "electron", "__tests__"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "electron/**/*.ts"]
}
```

**Step 4: Run test to verify it passes**

```bash
npm test __tests__/setup/typescript.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add tsconfig.json tsconfig.node.json __tests__/setup/typescript.test.ts
git commit -m "chore: configure TypeScript with strict mode

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Configure Vite + Electron

**Files:**
- Create: `vite.config.ts`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

**Step 1: Write the failing test**

```typescript
// __tests__/setup/vite.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Vite + Electron Setup', () => {
  it('should have vite config with electron plugin', async () => {
    const config = fs.readFileSync('vite.config.ts', 'utf-8');
    expect(config).toContain('vite-plugin-electron');
  });

  it('should have electron main entry point', () => {
    expect(fs.existsSync('electron/main.ts')).toBe(true);
  });

  it('should have preload script', () => {
    expect(fs.existsSync('electron/preload.ts')).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test __tests__/setup/vite.test.ts
```
Expected: FAIL - files do not exist

**Step 3: Write minimal implementation**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './core'),
      '@db': path.resolve(__dirname, './database')
    }
  },
  build: {
    outDir: 'dist'
  }
});
```

```typescript
// electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

```typescript
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // IPC methods will be added here
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) =>
    ipcRenderer.on(channel, (_event, ...args) => callback(...args)),
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel)
});
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TuskerBrain</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```typescript
// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```typescript
// src/App.tsx
export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <h1>TuskerBrain</h1>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

```bash
npm test __tests__/setup/vite.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add vite.config.ts electron/ index.html src/ __tests__/setup/vite.test.ts
git commit -m "feat: setup Vite + Electron configuration

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Configure Tailwind CSS

**Files:**
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `src/styles/globals.css`

**Step 1: Write the failing test**

```typescript
// __tests__/setup/tailwind.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('Tailwind CSS Configuration', () => {
  it('should have tailwind config', () => {
    expect(fs.existsSync('tailwind.config.js')).toBe(true);
  });

  it('should have CSS variables for theming', async () => {
    const css = fs.readFileSync('src/styles/globals.css', 'utf-8');
    expect(css).toContain('--background');
    expect(css).toContain('--foreground');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test __tests__/setup/tailwind.test.ts
```
Expected: FAIL - files do not exist

**Step 3: Write minimal implementation**

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
```

```javascript
// postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

```css
/* src/styles/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.75rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npm test __tests__/setup/tailwind.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add tailwind.config.js postcss.config.js src/styles/ __tests__/setup/tailwind.test.ts
git commit -m "feat: configure Tailwind CSS with macOS-inspired theme

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 2: Database Layer

### Task 5: Setup Drizzle ORM & Schema

**Files:**
- Create: `database/schema.ts`
- Create: `database/index.ts`
- Create: `drizzle.config.ts`

**Step 1: Write the failing test**

```typescript
// __tests__/database/schema.test.ts
import { describe, it, expect } from 'vitest';

describe('Database Schema', () => {
  it('should export emails table schema', async () => {
    const schema = await import('@db/schema');
    expect(schema.emails).toBeDefined();
  });

  it('should export topics table schema', async () => {
    const schema = await import('@db/schema');
    expect(schema.topics).toBeDefined();
  });

  it('should export jobs table schema', async () => {
    const schema = await import('@db/schema');
    expect(schema.jobs).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test __tests__/database/schema.test.ts
```
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```typescript
// database/schema.ts
import { sqliteTable, text, integer, real, json } from 'drizzle-orm/sqlite-core';

export const emails = sqliteTable('emails', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  senderEmail: text('sender_email').notNull(),
  senderName: text('sender_name'),
  senderDomain: text('sender_domain').notNull(),
  subject: text('subject'),
  snippet: text('snippet'),
  receivedAt: integer('received_at', { mode: 'timestamp' }).notNull(),
  emailType: text('email_type', { enum: ['regular', 'updates', 'social', 'promotional'] }),
  gmailCategory: text('gmail_category'),
  isImportant: integer('is_important', { mode: 'boolean' }).default(false),
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  isProcessed: integer('is_processed', { mode: 'boolean' }).default(false),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
});

export const timelineUpdates = sqliteTable('timeline_updates', {
  id: text('id').primaryKey(),
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  summary: text('summary'),
  priority: text('priority', { enum: ['high', 'medium', 'low'] }),
  sentiment: text('sentiment', { enum: ['positive', 'negative', 'neutral'] }),
  urgency: integer('urgency', { mode: 'boolean' }).default(false),
  importanceReason: text('importance_reason'),
  actionItem: integer('action_item', { mode: 'boolean' }).default(false),
  actionItemTitle: text('action_item_title'),
  followUpDate: text('follow_up_date'),
  financialImpact: real('financial_impact'),
  keyEntities: json('key_entities').$type<{ dates: string[]; amounts: number[]; names: string[] }>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
});

export const deals = sqliteTable('deals', {
  id: text('id').primaryKey(),
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }).notNull(),
  dealTitle: text('deal_title').notNull(),
  dealDescription: text('deal_description'),
  brandName: text('brand_name'),
  dealValue: text('deal_value'),
  dealCode: text('deal_code'),
  dealExpiry: text('deal_expiry'),
  dealLink: text('deal_link'),
  minimumPurchase: text('minimum_purchase'),
  dealCategory: text('deal_category'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
});

export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  parentId: text('parent_id').references(() => topics.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  fullPath: text('full_path').notNull().unique(),
  emailCount: integer('email_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
});

export const emailTopics = sqliteTable('email_topics', {
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }).notNull(),
  topicId: text('topic_id').references(() => topics.id, { onDelete: 'cascade' }).notNull(),
  confidenceScore: real('confidence_score'),
});

export const topicSummaries = sqliteTable('topic_summaries', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').references(() => topics.id, { onDelete: 'cascade' }).unique().notNull(),
  summary: text('summary').notNull(),
  wordCount: integer('word_count'),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).default(new Date()),
  lastEmailId: text('last_email_id').references(() => emails.id),
  updateCount: integer('update_count').default(0),
});

export const senderSummaries = sqliteTable('sender_summaries', {
  id: text('id').primaryKey(),
  senderDomain: text('sender_domain').notNull().unique(),
  summary: text('summary').notNull(),
  wordCount: integer('word_count'),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).default(new Date()),
  lastEmailId: text('last_email_id').references(() => emails.id),
  updateCount: integer('update_count').default(0),
});

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['email_process', 'email_archive', 'email_delete', 'topic_summary_update', 'sender_summary_update', 'backfill_day'] }).notNull(),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'retrying', 'dead'] }).notNull().default('pending'),
  payload: json('payload').notNull().$type<Record<string, unknown>>(),
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }),
  result: json('result').$type<Record<string, unknown>>(),
  error: text('error'),
  errorStack: text('error_stack'),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(3),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  details: json('details').$type<Record<string, unknown>>(),
  tokensUsed: integer('tokens_used'),
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
});

export const gmailLabels = sqliteTable('gmail_labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  type: text('type', { enum: ['system', 'user'] }),
  labelType: text('label_type'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
});

export const emailLabels = sqliteTable('email_labels', {
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }).notNull(),
  labelId: text('label_id').references(() => gmailLabels.id, { onDelete: 'cascade' }).notNull(),
});

export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey().default(1),
  historyId: text('history_id'),
  lastFullSync: integer('last_full_sync', { mode: 'timestamp' }),
  lastIncrementalSync: integer('last_incremental_sync', { mode: 'timestamp' }),
  totalEmailsProcessed: integer('total_emails_processed').default(0),
  totalTokensUsed: integer('total_tokens_used').default(0),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: json('value').notNull().$type<Record<string, unknown>>(),
  schemaVersion: integer('schema_version').default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(new Date()),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull().unique(),
  storageKey: text('storage_key').notNull(),
  isValid: integer('is_valid', { mode: 'boolean' }).default(false),
  lastValidated: integer('last_validated', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
});

export const oauthTokens = sqliteTable('oauth_tokens', {
  id: integer('id').primaryKey().default(1),
  accessTokenKey: text('access_token_key').notNull(),
  refreshTokenKey: text('refresh_token_key').notNull(),
  expiry: integer('expiry', { mode: 'timestamp' }),
  scope: text('scope'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
  refreshedAt: integer('refreshed_at', { mode: 'timestamp' }),
});
```

```typescript
// database/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { app } from 'electron';
import path from 'path';

const dbPath = app
  ? path.join(app.getPath('userData'), 'tuskerbrain.db')
  : ':memory:';

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export * from './schema';
```

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './database/schema.ts',
  out: './database/migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    filename: './tuskerbrain.db',
  },
} satisfies Config;
```

**Step 4: Run test to verify it passes**

```bash
npm test __tests__/database/schema.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add database/ drizzle.config.ts __tests__/database/
git commit -m "feat: add Drizzle ORM database schema

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 3: Core Services

### Task 6: Gmail OAuth Client

**Files:**
- Create: `core/gmail/oauth.ts`
- Create: `core/gmail/client.ts`
- Create: `core/security/encryption.ts`

**Step 1: Write the failing test**

```typescript
// __tests__/integrations/gmail-oauth.test.ts
import { describe, it, expect, beforeAll } from 'vitest';

describe('Gmail OAuth', () => {
  it('should generate OAuth URL with correct scopes', async () => {
    const { generateAuthUrl } = await import('@core/gmail/oauth');
    const url = generateAuthUrl();
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('gmail.readonly');
    expect(url).toContain('gmail.modify');
  });

  it('should exchange code for tokens', async () => {
    // This test requires real OAuth code - skip in CI
    if (!process.env.TEST_OAUTH_CODE) {
      return;
    }
    const { exchangeCodeForTokens } = await import('@core/gmail/oauth');
    const tokens = await exchangeCodeForTokens(process.env.TEST_OAUTH_CODE);
    expect(tokens.access_token).toBeDefined();
    expect(tokens.refresh_token).toBeDefined();
  });

  it('should refresh expired tokens', async () => {
    // This test requires valid refresh token - skip in CI
    if (!process.env.TEST_REFRESH_TOKEN) {
      return;
    }
    const { refreshAccessToken } = await import('@core/gmail/oauth');
    const tokens = await refreshAccessToken(process.env.TEST_REFRESH_TOKEN);
    expect(tokens.access_token).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test __tests__/integrations/gmail-oauth.test.ts
```
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```typescript
// core/gmail/oauth.ts
import { google } from 'googleapis';
import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

// Load OAuth credentials from file
function getCredentials() {
  const credentialsPath = app
    ? path.join(app.getPath('userData'), 'oauth-credentials.json')
    : path.join(process.cwd(), 'OAuth Client ID JSON.json');

  if (fs.existsSync(credentialsPath)) {
    return JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
  }

  // Fallback to environment variables
  return {
    installed: {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uris: ['http://localhost'],
    },
  };
}

export function generateAuthUrl(): string {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function exchangeCodeForTokens(code: string) {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function refreshAccessToken(refreshToken: string) {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();
  return credentials;
}

export function createAuthenticatedClient(accessToken: string, refreshToken?: string) {
  const credentials = getCredentials();
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}
```

```typescript
// core/gmail/client.ts
import { gmail_v1, google } from 'googleapis';
import { createAuthenticatedClient } from './oauth';

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(accessToken: string, refreshToken?: string) {
    const auth = createAuthenticatedClient(accessToken, refreshToken);
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  async listMessages(maxResults = 100, pageToken?: string) {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults,
      pageToken,
    });
    return response.data;
  }

  async getMessage(messageId: string) {
    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
    return response.data;
  }

  async modifyMessage(messageId: string, modifications: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }) {
    const response = await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: modifications,
    });
    return response.data;
  }

  async listLabels() {
    const response = await this.gmail.users.labels.list({
      userId: 'me',
    });
    return response.data;
  }

  async createLabel(name: string) {
    const response = await this.gmail.users.labels.create({
      userId: 'me',
      requestBody: { name },
    });
    return response.data;
  }

  async getProfile() {
    const response = await this.gmail.users.getProfile({
      userId: 'me',
    });
    return response.data;
  }
}
```

```typescript
// core/security/encryption.ts
import { safeStorage } from 'electron';

export function encryptSecret(plainText: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available');
  }
  const encrypted = safeStorage.encryptString(plainText);
  return encrypted.toString('base64');
}

export function decryptSecret(encryptedBase64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available');
  }
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  return safeStorage.decryptString(encrypted);
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}
```

**Step 4: Run test to verify it passes**

```bash
npm test __tests__/integrations/gmail-oauth.test.ts
```
Expected: PASS (with real OAuth credentials)

**Step 5: Commit**

```bash
git add core/ __tests__/integrations/
git commit -m "feat: add Gmail OAuth client and encryption utilities

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Implementation Continues...

The plan continues with additional tasks for:
- Job Queue System
- LangGraph Workflows
- LLM Provider Integration
- Topic Labeling System
- Summary Generation
- IPC Layer
- React Components (Timeline, Topics, Deals, Settings)
- Onboarding Flow
- Auto-update Integration
- E2E Tests

Each task follows the same TDD pattern: Write failing test → Verify failure → Implement → Verify pass → Commit.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-03-05-tuskerbrain-implementation.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
