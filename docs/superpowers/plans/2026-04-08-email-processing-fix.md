# Email Processing & Sync UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 critical bugs preventing email AI processing and the sync UI from working, enabling full end-to-end Gmail sync → AI processing → timeline display.

**Architecture:** Two-process Electron app. Main process handles Gmail sync, OAuth, UI, and job coordination. Utility process handles AI processing, LLM calls, and job execution. Data flows via IPC messages between processes and events to the React renderer.

**Tech Stack:** Electron 28+, SQLite + Drizzle ORM, Vercel AI SDK (OpenAI/Anthropic/Google), LangGraph, React 18+, TypeScript 5+

---

## Build Sequence

### Phase 1: Foundation Fixes (C8, C6, W2)

### Task 1.1: Fix `@core/llm/types` import path (C8)

**Files:**
- Modify: `core/settings/manager.ts:2`

- [ ] **Step 1: Read the file and confirm the broken import**
```bash
head -5 core/settings/manager.ts
```
Expected: `import type { LLMProvider } from '@core/llm/types';` with `// @ts-nocheck` at line 1

- [ ] **Step 2: Fix the import and remove @ts-nocheck**
```typescript
// core/settings/manager.ts — Line 1-2
// BEFORE:
// @ts-nocheck
import type { LLMProvider } from '@core/llm/types';

// AFTER:
import type { LLMProvider } from '@core/llm/provider';
```

- [ ] **Step 3: Verify type-check passes**
```bash
npx tsc --noEmit core/settings/manager.ts
```

- [ ] **Step 4: Commit**
```bash
git add core/settings/manager.ts
git commit -m "fix: correct LLMProvider import path in settings manager"
```

---

### Task 1.2: Add `findByTopic` method to EmailRepository (C6)

**Files:**
- Modify: `core/repositories/emails.ts`

- [ ] **Step 1: Read the file to find insertion point**
```bash
grep -n "async findBy" core/repositories/emails.ts
```
Expected: Find existing query methods to place new method near them

- [ ] **Step 2: Add the method**
```typescript
// core/repositories/emails.ts — Add after the last find method

/**
 * Find emails by topic ID via email_topics join
 */
async findByTopic(topicId: string, limit = 50): Promise<EmailRecord[]> {
  const results = await this.db.getDatabase()
    .select({
      id: schema.emails.id,
      threadId: schema.emails.threadId,
      senderEmail: schema.emails.senderEmail,
      senderName: schema.emails.senderName,
      senderDomain: schema.emails.senderDomain,
      subject: schema.emails.subject,
      snippet: schema.emails.snippet,
      bodyPlain: schema.emails.bodyPlain,
      bodyHtml: schema.emails.bodyHtml,
      receivedAt: schema.emails.receivedAt,
      emailType: schema.emails.emailType,
      gmailCategory: schema.emails.gmailCategory,
      isImportant: schema.emails.isImportant,
      isRead: schema.emails.isRead,
      isArchived: schema.emails.isArchived,
      isDeleted: schema.emails.isDeleted,
      isProcessed: schema.emails.isProcessed,
      processedAt: schema.emails.processedAt,
      messageIdHeader: schema.emails.messageIdHeader,
      referencesHeader: schema.emails.referencesHeader,
      inReplyToHeader: schema.emails.inReplyToHeader,
      createdAt: schema.emails.createdAt,
    })
    .from(schema.emails)
    .innerJoin(schema.emailTopics, eq(schema.emails.id, schema.emailTopics.emailId))
    .where(eq(schema.emailTopics.topicId, topicId))
    .orderBy(desc(schema.emails.receivedAt))
    .limit(limit);

  return results.map(row => this.toRecord(row));
}
```

- [ ] **Step 3: Verify schema imports are present**
```bash
grep -n "emailTopics\|email_topics" core/repositories/emails.ts
```
If missing, add: `import { emailTopics } from '../schema';` or use `schema.emailTopics`

- [ ] **Step 4: Run existing tests**
```bash
npx vitest run __tests__/repositories/ --reporter=verbose
```

- [ ] **Step 5: Commit**
```bash
git add core/repositories/emails.ts
git commit -m "feat: add findByTopic method to EmailRepository"
```

---

### Task 1.3: Fix `processedAt` default to null (W2)

**Files:**
- Modify: `core/repositories/emails.ts:372`

- [ ] **Step 1: Read the exact line**
```bash
sed -n '370,375p' core/repositories/emails.ts
```

- [ ] **Step 2: Fix the default**
```typescript
// core/repositories/emails.ts — in toRecord() method
// BEFORE:
processedAt: row.processedAt ?? new Date(),

// AFTER:
processedAt: row.processedAt ?? null,
```

- [ ] **Step 3: Verify the EmailRecord type allows null**
```bash
grep -n "processedAt" core/types/email.ts
```
Ensure the type is `Date | null` not just `Date`

- [ ] **Step 4: Run tests**
```bash
npx vitest run __tests__/ --reporter=verbose
```

- [ ] **Step 5: Commit**
```bash
git add core/repositories/emails.ts
git commit -m "fix: processedAt defaults to null for unprocessed emails"
```

---

### Phase 2: LLM Provider Restore on Startup (C1)

### Task 2.1: Forward persisted provider to utility process on startup

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Read the startup sequence**
```bash
grep -n "utilityChild.postMessage\|type: 'start'\|type: 'init'" electron/main.ts
```
Find the exact line where `utilityChild.postMessage({ type: 'start' })` is sent

- [ ] **Step 2: Add provider restore after utility process starts**

Insert AFTER the `utilityChild.postMessage({ type: 'start' })` line:

```typescript
// Restore LLM provider from persisted settings
const activeProvider = await llmProviderManager?.getActiveProvider();
if (activeProvider && utilityChild) {
  const apiKey = await llmProviderManager.getApiKey(activeProvider);
  if (apiKey) {
    console.log(`[main] Restoring LLM provider: ${activeProvider}`);
    utilityChild.postMessage({
      type: 'set-llm-provider',
      provider: activeProvider,
      apiKey,
    });
  }
}
```

- [ ] **Step 3: Verify `llmProviderManager` is accessible at that point**
```bash
grep -n "llmProviderManager" electron/main.ts | head -10
```
Ensure it's initialized before the utility process start

- [ ] **Step 4: Add acknowledgment message in utility process**

In `electron/utility/index.ts`, after `setLLMProvider()` creates the orchestrator, add:
```typescript
// After orchestrator creation (around line 216)
parentPort?.postMessage({ type: 'llm-provider-set', provider: msg.provider });
```

- [ ] **Step 5: Test manually — set API key, restart app, verify processing works**
```bash
npm run dev
# Set API key in settings
# Restart app
# Check console for "Restoring LLM provider: ..."
# Trigger sync and verify processing runs
```

- [ ] **Step 6: Commit**
```bash
git add electron/main.ts electron/utility/index.ts
git commit -m "feat: restore LLM provider on app startup"
```

---

### Phase 3: Job Recovery Fix (C2)

### Task 3.1: Forward recovered jobs to utility process

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Find the current recovery code**
```bash
grep -n "recoverUnprocessedJobs" electron/main.ts
```

- [ ] **Step 2: Replace with utility process forwarding**

Replace the existing `recoverUnprocessedJobs(db, jobQueue)` call:

```typescript
// BEFORE: recoverUnprocessedJobs(db, jobQueue); — puts jobs in wrong queue

// AFTER: Query unprocessed emails and forward to utility process
const recoveredEmails = await db.getDatabase()
  .select({ id: schema.emails.id })
  .from(schema.emails)
  .where(eq(schema.emails.isProcessed, false))
  .limit(100);

if (recoveredEmails.length > 0 && utilityChild) {
  const emailIds = recoveredEmails.map(e => e.id);
  console.log(`[main] Recovering ${emailIds.length} unprocessed emails`);
  utilityChild.postMessage({
    type: 'process-emails',
    emailIds,
  });
  mainWindow?.webContents.send('processing:started', { total: emailIds.length });
}
```

- [ ] **Step 3: Find and fix backfill job creation**
```bash
grep -n "scheduleBackfill\|jobQueue.*create\|job.*email_process" electron/main.ts
```
Replace any `jobQueue` enqueue with `utilityChild.postMessage({ type: 'process-emails', emailIds })`

- [ ] **Step 4: Run tests**
```bash
npx vitest run __tests__/core/ --reporter=verbose
```

- [ ] **Step 5: Commit**
```bash
git add electron/main.ts
git commit -m "fix: forward recovered jobs to utility process instead of orphaned main queue"
```

---

### Phase 4: Sync Events (C3)

### Task 4.1: Emit sync events from main.ts after fetchAndStoreToday

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Find the sync:start handler**
```bash
grep -n "sync:start\|fetchAndStoreToday\|processing:started" electron/main.ts | head -20
```

- [ ] **Step 2: Add sync progress/complete emission**

In the `sync:start` IPC handler, AFTER `fetchAndStoreToday` returns and BEFORE forwarding to utility:

```typescript
// After fetchAndStoreToday returns { emailIds, total }
mainWindow?.webContents.send('sync:progress', {
  processed: total,
  total,
  phase: 'sync',
});

mainWindow?.webContents.send('sync:complete', {
  total,
  emailCount: emailIds.length,
});
```

- [ ] **Step 3: Verify event listeners exist in main.ts**
```bash
grep -n "syncManager.on\|sync:progress\|sync:complete" electron/main.ts
```
The `syncManager.on('progress')` and `syncManager.on('sync:completed')` listeners at lines 434-443 forward internal events. Also verify these match the events `useSyncProgress` listens for.

- [ ] **Step 4: Verify preload exposes the channels**
```bash
grep -n "sync:progress\|sync:complete\|onSyncProgress\|onSyncComplete" electron/preload.ts electron/preload.cjs
```

- [ ] **Step 5: Verify useSyncProgress hook subscribes correctly**
```bash
grep -n "onSyncProgress\|onSyncComplete\|syncPhase" src/hooks/ipc.ts
```

- [ ] **Step 6: Test manually — start sync, verify SyncPill appears in TopBar**
```bash
npm run dev
# Trigger sync
# Verify SyncPill appears in TopBar
# Verify progress updates show
```

- [ ] **Step 7: Commit**
```bash
git add electron/main.ts
git commit -m "fix: emit sync progress and complete events for UI updates"
```

---

### Phase 5: Gmail Client Bridge (C4)

### Task 5.1: Create IPC proxy for Gmail operations

**Files:**
- Create: `electron/ipc/gmail-proxy.ts`
- Modify: `electron/utility/index.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Create the Gmail proxy handler in utility process**

Create `electron/ipc/gmail-proxy.ts`:
```typescript
import type { GmailClient } from '@core/gmail/client';

/**
 * Creates a GmailClient that proxies all operations to the main process via parentPort.
 * Used in the utility process where the real GmailClient (with OAuth) lives in main.
 */
export function createProxiedGmailClient(): GmailClient {
  const request = (method: string, args: any[]): Promise<any> => {
    return new Promise((resolve, reject) => {
      const requestId = `gmail_${method}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const { parentPort } = require('worker_threads');

      const timeout = setTimeout(() => {
        parentPort.removeListener('message', handler);
        reject(new Error(`Gmail proxy timeout for ${method}`));
      }, 30000);

      const handler = (msg: any) => {
        if (msg.type === 'gmail-response' && msg.requestId === requestId) {
          clearTimeout(timeout);
          parentPort.removeListener('message', handler);
          if (msg.error) reject(new Error(msg.error));
          else resolve(msg.result);
        }
      };

      parentPort.on('message', handler);
      parentPort.postMessage({
        type: 'gmail-request',
        method,
        args,
        requestId,
      });
    });
  };

  return {
    listMessages: async (q, maxResults) => request('listMessages', [q, maxResults]),
    getMessage: async (id) => request('getMessage', [id]),
    modifyMessage: async (id, mods) => request('modifyMessage', [id, mods]),
    batchModifyMessages: async (ids, mods) => request('batchModifyMessages', [ids, mods]),
    createLabel: async (name) => request('createLabel', [name]),
    listLabels: async () => request('listLabels', []),
  } as GmailClient;
}
```

- [ ] **Step 2: Add Gmail request handler in main process**

In `electron/main.ts`, add a message listener for the utility process:

```typescript
// In the utilityChild.on('message') handler, add:
if (msg.type === 'gmail-request') {
  try {
    const client = authClient; // The real GmailClient
    if (!client) throw new Error('No Gmail client available');

    const { method, args, requestId } = msg;
    const fn = (client as any)[method];
    if (typeof fn !== 'function') throw new Error(`Method ${method} not found`);

    const result = await fn.apply(client, args);
    utilityChild?.postMessage({
      type: 'gmail-response',
      requestId,
      result,
    });
  } catch (error) {
    utilityChild?.postMessage({
      type: 'gmail-response',
      requestId: msg.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

- [ ] **Step 3: Replace NoOpGmailClient in utility process**

In `electron/utility/index.ts`, replace the `createNoOpGmailClient()` function:

```typescript
// BEFORE:
function createNoOpGmailClient(): GmailClient { ... }

// AFTER:
import { createProxiedGmailClient } from '../ipc/gmail-proxy';

// In setLLMProvider, use:
const gmailClient = createProxiedGmailClient();
```

- [ ] **Step 4: Test — process an email and verify Gmail labels are applied**
```bash
npm run dev
# Set API key, trigger sync
# Check Gmail for TB/Processed label on processed emails
```

- [ ] **Step 5: Commit**
```bash
git add electron/ipc/gmail-proxy.ts electron/utility/index.ts electron/main.ts
git commit -m "feat: proxy Gmail operations from utility to main process via IPC"
```

---

### Phase 6: Sync Scheduling (C7)

### Task 6.1: Wire up backfill after initial sync

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add backfill trigger after first sync completes**

In the sync handler, after `fetchAndStoreToday` succeeds:

```typescript
// After initial today sync, trigger backfill for previous days
if (syncManager) {
  const lookbackDays = 30; // Default lookback
  console.log(`[main] Starting backfill for ${lookbackDays} days`);
  // The sync manager's startInitialSync creates per-day sync jobs
  // Forward any backfill email IDs to utility process
}
```

- [ ] **Step 2: Add periodic sync timer**

```typescript
// electron/main.ts — After app.whenReady()

let syncTimer: NodeJS.Timeout | null = null;

function startPeriodicSync(intervalMinutes: number) {
  if (syncTimer) clearInterval(syncTimer);

  syncTimer = setInterval(async () => {
    console.log('[main] Running periodic sync');
    if (!syncManager || !emailRepo || !utilityChild) return;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { emailIds } = await syncManager.fetchAndStoreToday(today, emailRepo);

      if (emailIds.length > 0) {
        mainWindow?.webContents.send('sync:progress', {
          processed: emailIds.length,
          total: emailIds.length,
          phase: 'sync',
        });

        utilityChild.postMessage({
          type: 'process-emails',
          emailIds,
        });

        mainWindow?.webContents.send('sync:complete', {
          total: emailIds.length,
          emailCount: emailIds.length,
        });
      }
    } catch (error) {
      console.error('[main] Periodic sync failed:', error);
    }
  }, intervalMinutes * 60 * 1000);

  console.log(`[main] Periodic sync started: every ${intervalMinutes} minutes`);
}

app.on('before-quit', () => {
  if (syncTimer) clearInterval(syncTimer);
});
```

- [ ] **Step 3: Read the syncInterval from settings and start timer**
```bash
grep -n "syncInterval\|processingInterval\|getProcessingInterval" electron/main.ts core/settings/
```

- [ ] **Step 4: Commit**
```bash
git add electron/main.ts
git commit -m "feat: add periodic sync timer with configurable interval"
```

---

### Phase 7: Seed Data (C5)

### Task 7.1: Re-enable seed data for development mode

**Files:**
- Modify: `electron/main.ts:137-142`

- [ ] **Step 1: Read the commented section**
```bash
sed -n '135,145p' electron/main.ts
```

- [ ] **Step 2: Replace with dev-only seeding**
```typescript
// electron/main.ts — Replace the commented section

// Seed database if empty (dev mode only)
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;
if (isDev) {
  const existingEmails = await db.getDatabase()
    .select({ id: schema.emails.id })
    .from(schema.emails)
    .limit(1);

  if (existingEmails.length === 0) {
    console.log('[main] Database is empty (dev mode), running seed...');
    await seed(db.getDatabase());
  }
}
```

- [ ] **Step 3: Commit**
```bash
git add electron/main.ts
git commit -m "feat: re-enable seed data for development mode"
```

---

### Phase 8: Error Surfacing (C9)

### Task 8.1: Add error tracking to processing results

**Files:**
- Modify: `core/workflows/langgraph-workflow.ts`
- Modify: `core/orchestrator.ts`

- [ ] **Step 1: Read workflow state definition**
```bash
grep -n "WorkflowState\|interface.*State" core/workflows/langgraph-workflow.ts | head -10
```

- [ ] **Step 2: Ensure error fields exist on workflow state**

The workflow state should already have an `error` field. Verify and enhance:

```typescript
// In the state annotation, ensure these exist:
error: Annotation<string>({
  reducer: (_, newVal) => newVal,
  default: () => undefined,
}),
errorStep: Annotation<string>({
  reducer: (_, newVal) => newVal,
  default: () => undefined,
}),
```

- [ ] **Step 3: Update orchestrator to persist errors**

In `core/orchestrator.ts`, after `processEmailWithWorkflow` returns:

```typescript
if (result.error) {
  console.error(`[orchestrator] Processing error for ${email.id}: ${result.error} at ${result.errorStep}`);

  // The email should still be marked as processed to prevent infinite retry
  await this.repos.emails.markProcessed(email.id);
}
```

- [ ] **Step 4: Add error display in timeline**

In the UI, check if timeline items have error states and display them.

- [ ] **Step 5: Commit**
```bash
git add core/workflows/langgraph-workflow.ts core/orchestrator.ts
git commit -m "feat: add error tracking to workflow processing pipeline"
```

---

## Post-Implementation Verification

### Smoke Test
1. `npm run dev` — app starts without errors
2. Authenticate Gmail — OAuth flow works
3. Set LLM provider — API key saved and restored on restart
4. Trigger sync — SyncPill appears, progress shows
5. Emails processed — timeline updates with topics/deals
6. Gmail labels applied — TB/Processed visible in Gmail
7. Restart app — provider restored, recovered jobs processed

### Restart Test
1. Quit app while emails are being processed
2. Restart — verify LLM provider restored
3. Verify unprocessed emails recovered and processed

### Error Test
1. Set invalid API key
2. Verify error visible in UI (not silently degraded)
3. Fix API key, verify processing resumes
