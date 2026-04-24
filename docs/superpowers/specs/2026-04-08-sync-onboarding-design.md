# Sync-Onboarding Design

Date: 2026-04-08
Status: Draft

## Problem

After connecting Gmail and adding an API key, nothing happens. The user sees no emails, no sync, no LLM processing. The pipeline exists (GmailSyncManager → JobQueue → EmailProcessingOrchestrator) but is not wired up end-to-end.

## Solution

Three parts:
1. **Wire the backend pipeline** so that sync → store → queue → process actually works
2. **Add a sync progress screen** to onboarding showing real-time Gmail sync and AI processing progress
3. **Add a compact sync indicator** to the main app's top bar with hover popover

### Design Decisions

- **Today only during onboarding, backfill later** — fast onboarding, silent background backfill
- **Event-based IPC** for real-time progress (not polling)
- **Approach A**: Use existing JobQueue + utility process + orchestrator infrastructure

### Visual Reference

Mockups in `docs/design-system.pen`:
- `MLha9` — Onboarding Sync Progress Screen
- `pikjQ` — Top Bar Sync Indicator States (syncing, processing, synced)
- `MUbE3` — Sync Pill Popover

---

## Part 1: Backend Pipeline

### 1.1 GmailSyncManager — fetch and store emails

`startInitialSync` currently only fetches message IDs. Replace with actual email download and storage:

1. Accept `EmailRepository` as a new constructor dependency
2. Fetch today's messages via `listMessages` with date filter (after = start of today)
3. For each message, call `processEmail()` to download and parse it
4. Store parsed email in the database via `EmailRepository`
5. Emit `sync:progress` events: `{ processed, total, phase: 'sync' }`
6. After all emails are synced, emit `sync:complete` with total count
7. Return the list of stored email IDs

**New method signature:**
```ts
async fetchAndStoreToday(since: Date): Promise<{ emailIds: string[]; total: number }>
```

**Files changed:** `core/gmail/sync.ts`

### 1.2 Main process — enqueue processing jobs

After `fetchAndStoreToday` returns, main process creates `email_process` jobs for each email ID:

```ts
for (const emailId of emailIds) {
  await jobQueue.createJob({
    type: 'email_process',
    payload: { emailId },
    emailId,
  });
}
```

Then emit `processing:started` with total count to the renderer.

**Files changed:** `electron/main.ts` (syncManager IPC handler)

### 1.3 Utility process — instantiate orchestrator

The utility process section in `electron/main.ts` currently forks and sends `init` + `start` messages but doesn't process emails. Add:

1. On `init`: create DB, repos, LLM provider, and `EmailProcessingOrchestrator` instance
2. On `start`: call `orchestrator.start()` which hooks into `jobQueue.startProcessing()`
3. After each email is processed, send `{ type: 'emailProcessed', emailId, processed, total }` back to main process
4. On `stop`: call `orchestrator.stop()`

The utility process needs its own entry point or the existing `index.js` needs to handle these messages.

**Files changed:** `electron/main.ts` (utility process message handling), possibly a new `electron/worker.ts`

### 1.4 Event bridge — utility → main → renderer

Main process listens for messages from utility process:

```ts
utilityChild.on('message', (msg) => {
  if (msg.type === 'emailProcessed') {
    mainWindow?.webContents.send('processing:progress', {
      processed: msg.processed,
      total: msg.total,
    });
  }
  if (msg.type === 'processingComplete') {
    mainWindow?.webContents.send('processing:complete');
  }
});
```

Main process also emits sync progress during `fetchAndStoreToday`:
```ts
syncManager.on('progress', (data) => {
  mainWindow?.webContents.send('sync:progress', data);
});
syncManager.on('sync:completed', (data) => {
  mainWindow?.webContents.send('sync:complete', data);
});
```

**Files changed:** `electron/main.ts`, `electron/preload.ts` (add IPC event listeners)

### 1.5 Backfill scheduler

After initial sync + processing completes, main process schedules backfill:

1. Calculate remaining days: `lookbackDays - 1` (today already done)
2. Create one backfill job per day, spaced 5 seconds apart
3. Each backfill job: fetch that day's emails → store → queue for processing
4. Emit `backfill:progress` events: `{ day, totalDays, emailsProcessed }`
5. Runs entirely in background, user is already in the main app

**Files changed:** `electron/main.ts` (new backfill scheduling logic)

---

## Part 2: Onboarding Sync Progress Screen

### 2.1 Replace CompleteStep with SyncProgressStep

In `src/components/Onboarding.tsx`:

- Remove the current `CompleteStep` ("You're All Set!")
- Add new `SyncProgressStep` component that shows:
  - Title: "Setting Up Your TuskerBrain"
  - Subtitle: "We're syncing and processing your emails. This won't take long."
  - Two progress cards side by side:
    1. **Gmail Sync**: label, status badge (In Progress / Complete / Error), progress bar, count
    2. **AI Processing**: label, status badge (Waiting / In Progress / Complete / Error), progress bar, count
  - AI Processing card stays "Waiting" until sync completes
- Step indicator changes to 3 dots (welcome → setup → syncing)
- On completion: shows green checkmark + "Start Using TuskerBrain" button

**Files changed:** `src/components/Onboarding.tsx`

### 2.2 useSyncProgress hook

New React hook in `src/hooks/ipc.ts`:

```ts
interface SyncProgressState {
  syncPhase: 'idle' | 'syncing' | 'complete' | 'error';
  syncProgress: { processed: number; total: number };
  processingPhase: 'idle' | 'waiting' | 'processing' | 'complete' | 'error';
  processingProgress: { processed: number; total: number };
}

export function useSyncProgress(): SyncProgressState
```

Subscribes to IPC events: `sync:progress`, `sync:complete`, `processing:progress`, `processing:complete`.

**Files changed:** `src/hooks/ipc.ts`, `electron/preload.ts` (add event listener bindings)

### 2.3 Completion transition

When both sync and processing are complete:
- Show "All done!" with green checkmark
- Show "Start Using TuskerBrain" button
- On click:
  1. Mark onboarding complete (persist setting)
  2. Schedule backfill for remaining lookback days
  3. Transition to main app

### 2.4 Error handling

- **Sync failure**: Show "Retry" button on sync card
- **Processing failure**: Allow continuing — partial results are fine, JobQueue handles retries
- **Auth expired mid-sync**: Show "Gmail connection lost" with reconnect button

---

## Part 3: Main App — Top Bar Sync Indicator

### 3.1 Sync Pill component

New component in `src/components/SyncPill.tsx`.

**Must match `pikjQ` mockup in `docs/design-system.pen` exactly.**

Three visual states:

1. **Syncing**: Teal pill with animated spinner icon + "Syncing" text
2. **Processing**: Teal pill with "12/247" count text
3. **Synced**: Green pill with checkmark + "Synced" text

The pill is compact (border-radius: full), positioned between search bar and user avatar in the TopBar.

On hover, shows a popover below the pill.

### 3.2 Sync Popover component

**Must match `MUbE3` mockup in `docs/design-system.pen` exactly.**

Popover card shown on pill hover:
- Gmail Sync row: status icon (checkmark or spinner) + "Gmail Sync" + "Complete" / "In Progress"
- AI Processing row: status icon + "AI Processing" + progress count
- Mini progress bar
- If backfilling: additional row showing "Backfilling day X of Y"

### 3.3 TopBar changes

Replace `processingStatus` prop with `syncIndicator`:

```ts
syncIndicator?: {
  state: 'idle' | 'syncing' | 'processing' | 'backfilling';
  label: string;
  progress?: { processed: number; total: number };
  details?: {
    syncComplete: boolean;
    processingComplete: boolean;
    syncProgress?: { processed: number; total: number };
    processingProgress?: { processed: number; total: number };
    backfillDay?: number;
    backfillTotal?: number;
  };
}
```

**Files changed:** `src/components/TopBar.tsx`

### 3.4 App.tsx wiring

Replace current polling-based sync status with event-based `useSyncProgress` hook:
- Derive `syncIndicator` prop from hook state
- Keep 5s polling as fallback for missed events

**Files changed:** `src/App.tsx`

---

## Files Summary

| File | Change |
|------|--------|
| `core/gmail/sync.ts` | Add `fetchAndStoreToday()` method, accept EmailRepository dependency |
| `electron/main.ts` | Wire sync→store→queue pipeline, event bridge, backfill scheduler |
| `electron/preload.ts` | Add IPC event listener bindings for sync/processing progress |
| `src/components/Onboarding.tsx` | Replace CompleteStep with SyncProgressStep |
| `src/components/SyncPill.tsx` | New component — pill + popover, match mockups exactly |
| `src/components/TopBar.tsx` | Replace processingStatus with syncIndicator prop |
| `src/hooks/ipc.ts` | Add useSyncProgress hook |
| `src/App.tsx` | Wire sync progress to onboarding and top bar |
| `electron/worker.ts` | (possibly new) Utility process entry point with orchestrator |

## Testing Strategy

- **Unit tests**: `fetchAndStoreToday` with mocked GmailClient and EmailRepository
- **Unit tests**: `useSyncProgress` hook with mocked IPC events
- **Integration test**: Full pipeline — fetch → store → queue → process → progress events
- **Visual verification**: Sync pill and popover match Pencil mockups in design-system.pen
