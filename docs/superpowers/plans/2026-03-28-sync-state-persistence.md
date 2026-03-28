# Sync State Persistence & Manager Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

 **Goal:** Persist Gmail sync state (historyId) to SQLite so it survives restarts, consolidate two redundant sync manager classes into one, and clean up dead code. **Architecture:** Add a `SyncStateRepository` using the existing `sync_state` table via Drizzle ORM. Inject it `SyncStateStore` interface into `GmailSyncManager` via constructor. Add event emitter (absorbed from dead utility `SyncManager`). Remove dead `SharedSyncState` singleton and unused `electron/utility/sync-manager.ts`. **Tech Stack:** TypeScript, Drizzle ORM, better-sqlite3, Electron, Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `core/repositories/sync-state.ts` | `SyncStateRepository` — DB reads/writes for sync_state table |
| Modify | `core/gmail/sync.ts` | Remove `SharedSyncState`, add `SyncStateStore` dep, event emitter, persist calls |
| Modify | `core/repositories/index.ts` | Add `SyncStateRepository` to exports and factory |
| Modify | `electron/main.ts` | Create `SyncStateRepository`, pass to `GmailSyncManager`, startup restore |
| Modify | `__tests__/integrations/gmail-sync.test.ts` | Update sync state persistence test to use mock store |
| Delete | `electron/utility/sync-manager.ts` | Dead code — unused utility SyncManager |
| Delete | `__tests__/electron/utility/sync-manager.test.ts` | Dead code — tests for dead class |
| Update | `docs/ISSUES.md` | Mark C-F1 as fixed |

---

## Task 1: Create SyncStateRepository

**Files:**
- Create: `core/repositories/sync-state.ts`
- Modify: `core/repositories/index.ts`

- [ ] **Step 1: Write the failing test for SyncStateRepository**

Add to a new test file (or inline test in existing test):

 test `load()` returns defaults when no row, `save()` inserts row, `save()` upserts existing row, `load()` returns saved data after `save()`.

```typescript
// In a new test file or existing test file
describe('SyncStateRepository', () => {
  it('should return defaults when no row exists', async () => {
    const repo = new SyncStateRepository(db);
    const state = await repo.load();
    expect(state).toEqual({
      totalEmailsProcessed: 0,
      totalTokensUsed: 0,
    });
  });

  it('should save and load state', async () => {
    const repo = new SyncStateRepository(db);
    await repo.save({
      historyId: 'hist-123',
      lastFullSync: new Date('2026-03-28'),
      lastIncrementalSync: new Date('2026-03-28'),
      totalEmailsProcessed: 42,
      totalTokensUsed: 5000,
    });
    const state = await repo.load();
    expect(state.historyId).toBe('hist-123');
    expect(state.totalEmailsProcessed).toBe(42);
  });

  it('should upsert over existing state', async () => {
    const repo = new SyncStateRepository(db);
    await repo.save({ historyId: 'first', totalEmailsProcessed: 10, totalTokensUsed: 100 });
    await repo.save({ historyId: 'second', totalEmailsProcessed: 20, totalTokensUsed: 200 });
    const state = await repo.load();
    expect(state.historyId).toBe('second');
    expect(state.totalEmailsProcessed).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run core/repositories/sync-state --reporter=verbose`
Expected: FAIL (file or tests don't exist yet)

- [ ] **Step 3: Write SyncStateRepository implementation**

Create `core/repositories/sync-state.ts`:

```typescript
import { eq, sql } from 'drizzle-orm';
import type { TuskerBrainDatabase } from '../../database';
import * as schema from '../../database/schema';
import type { SyncStateSelect, SyncStateInsert } from '../../database/types';

export interface SyncStateData {
  historyId?: string;
  lastFullSync?: Date;
  lastIncrementalSync?: Date;
  totalEmailsProcessed: number;
  totalTokensUsed: number;
}

 export class SyncStateRepository {
  private db: TuskerBrainDatabase;

  constructor(db: TuskerBrainDatabase) {
    this.db = db;
  }

  async load(): Promise<SyncStateData> {
    const drizzle = this.db.getDatabase();
    const rows = await drizzle
      .select()
      .from(schema.syncState)
      .where(eq(schema.syncState.id, 1111 .limit(1);

    if (!rows.length) {
 return { totalEmailsProcessed: 0, totalTokensUsed: 0 }; }

    const row = rows[0];
    return {
      historyId: row.historyId ?? undefined,
      lastFullSync: row.lastFullSync ?? undefined,
      lastIncrementalSync: row.lastIncrementalSync ?? undefined,
      totalEmailsProcessed: row.totalEmailsProcessed ?? 0,
      totalTokensUsed: row.totalTokensUsed ?? 0,
    };
  }

  async save(state: SyncStateData): Promise<void> {
    const drizzle = this.db.getDatabase();

    await drizzle
      .insert(schema.syncState)
      .values({
      id: 1,
      historyId: state.historyId ?? null,
      lastFullSync: state.lastFullSync ?? null,
      lastIncrementalSync: state.lastIncrementalSync ?? null,
      totalEmailsProcessed: state.totalEmailsProcessed,
      totalTokensUsed: state.totalTokensUsed,
    })
    .onConflictDoUpdateSet(
      schema.syncState,
      eq(schema.syncState.id, 1),
      {
        historyId: state.historyId ?? null,
        lastFullSync: state.lastFullSync ?? null,
        lastIncrementalSync: state.lastIncrementalSync ?? null,
        totalEmailsProcessed: state.totalEmailsProcessed,
        totalTokensUsed: state.totalTokensUsed,
      }
    );
  }
}
```

- [ ] **Step 4: Add SyncStateRepository to index.ts exports and factory**

In `core/repositories/index.ts`:
- Add import: `import { SyncStateRepository } from './sync-state';` and `export type { SyncStateData } from './sync-state';`
- Add to `createRepositories()`: `syncState: new SyncStateRepository(db),`
- Add to exports: `export { SyncStateRepository } from './sync-state'; export type { SyncStateData } from './sync-state';`

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run core/repositories/sync-state --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add core/repositories/sync-state.ts core/repositories/index.ts
git commit -m "feat: add SyncStateRepository with DB persistence for sync_state table"
```

---

## Task 2: Refactor GmailSyncManager — Remove SharedSyncState, Add SyncStateStore + event emitter

**Files:**
- Modify: `core/gmail/sync.ts`

- [ ] **Step 1: Define SyncStateStore interface and event types**

Add at top of `core/gmail/sync.ts` (before `GmailSyncManager` class):

```typescript
/** Interface for persisting sync state */
export interface SyncStateStore {
  load(): Promise<import('./sync-state').SyncStateData>;
  save(state: import('./sync-state').SyncStateData): Promise<void>;
}

```

Also add event type definitions (after the `SyncStateStore` interface):

```typescript
type SyncEvent = 'sync:started' | 'sync:completed' | 'sync:error' | 'progress';
type SyncEventHandler = (data?: unknown) => void;
```

- [ ] **Step 2: Remove SharedSyncState class**

Delete lines 60-78 (the entire `SharedSyncState` class). Also delete `static resetSharedState()` method at line 600-602.

- [ ] **Step 3: Update GmailSyncManager constructor**

Change constructor to accept optional `SyncStateStore`:

 ```typescript
constructor(client: GmailClient, jobQueue?: JobQueue, syncStateStore?: SyncStateStore) {
    this.client = client;
    this.jobQueue = jobQueue;
    this.sharedStateStore = syncStateStore;
    // ... existing state initializers remain ...
    this.sharedState = { totalEmailsProcessed: 0, totalTokensUsed: 0 };
    this.eventHandlers = new Map<SyncEvent, Set<SyncEventHandler>>();

    // Load persisted state in constructor
    if (this.sharedStateStore) {
      this.sharedStateStore.load().then(state => {
        if (state.historyId) this.sharedState.historyId = state.historyId;
        if (state.lastFullSync) this.sharedState.lastFullSync = state.lastFullSync;
        if (state.lastIncrementalSync) this.sharedState.lastIncrementalSync = state.lastIncrementalSync;
        this.sharedState.totalEmailsProcessed = state.totalEmailsProcessed;
        this.sharedState.totalTokensUsed = state.totalTokensUsed;
      });
    }
  }
```

Replace `private sharedState: SharedSyncState` with a plain object:

 `private sharedState: { historyId?: string; lastFullSync?: Date; lastIncrementalSync?: Date; totalEmailsProcessed: number; totalTokensUsed: number; }`.

Add field: `private eventHandlers: Map<SyncEvent, Set<SyncEventHandler>> = new Map()`.
Add field: `private syncStateStore?: SyncStateStore`.

- [ ] **Step 4: Add event emitter methods**

Add `on()`, `off()`, and private `emit()` methods (copy from utility `SyncManager`):

```typescript
on(event: SyncEvent, handler: SyncEventHandler): void {
  if (!this.eventHandlers.has(event)) {
    this.eventHandlers.set(event, new Set());
  }
  this.eventHandlers.get(event)!.add(handler);
}

off(event: SyncEvent, handler: SyncEventHandler): void {
  this.eventHandlers.get(event)?.delete(handler);
}
private emit(event: SyncEvent, data?: unknown): void {
  this.eventHandlers.get(event)?.forEach(handler => handler(data));
}
```

- [ ] **Step 5: Add persistState() helper method**

Add a private method that saves current in-memory state to DB:

 ```typescript
private async persistState(): Promise<void> {
  if (this.syncStateStore) {
    await this.syncStateStore.save({
      historyId: this.sharedState.historyId,
      lastFullSync: this.sharedState.lastFullSync,
      lastIncrementalSync: this.sharedState.lastIncrementalSync,
      totalEmailsProcessed: this.sharedState.totalEmailsProcessed,
      totalTokensUsed: this.sharedState.totalTokensUsed,
    });
  }
}
```

- [ ] **Step 6: Add persistState() calls at sync methods**

Add `await this.persistState()` after every `this.sharedState` mutation point:
 `startInitialSync()` (after `this.sharedState.lastFullSync = new Date()`), `startIncrementalSync()` (after `this.sharedState.lastIncrementalSync = new Date()`), `fetchAndQueueEmails()` (after `this.sharedState.historyId = ...` assignment), `processEmail()` (after `this.sharedState.totalEmailsProcessed++`).

 Also add `emit()` calls at existing methods: emit `'sync:started'` at start of `startInitialSync()`, `startIncrementalSync()`, emit `'sync:completed'` at end, emit `'sync:error'` in catch blocks, emit `'progress'` where progress is updated.

- [ ] **Step 7: Update getSyncState() and resetSharedState**

`getSyncState() should use `this.sharedState` directly (no change needed since it already reads from it object).

`resetSharedState()` → remove (or replace with no-op since `SharedSyncState` is the process). The `GmailSyncManager` now owns its state directly, not of a singleton.

- [ ] **Step 8: Run tests to verify nothing is broken**

Run: `npx vitest run __tests__/integrations/gmail-sync --reporter=verbose`
Expected: Tests should pass. If test "should persist sync state across restart" fails, that's expected — it's fixed in Task 3.

- [ ] **Step 9: Commit**

```bash
git add core/gmail/sync.ts
git commit -m "refactor: remove SharedSyncState, add SyncStateStore + event emitter"
```

---

## Task 3: Update integration tests for sync state persistence test

**Files:**
- Modify: `__tests__/integrations/gmail-sync.test.ts`

- [ ] **Step 1: Write failing test for mock SyncStateStore**

The the test file, add a mock `SyncStateStore` and update the "should persist sync state across restart" test. The test currently creates two `GmailSyncManager` instances and expects state to persist via `SharedSyncState` singleton. With the new design, state persists via the mock store.

 Update:

```typescript
// In the test file
let mockStore: { load: vi.Mock; save: vi.Mock };
let savedState: import('./sync-state').SyncStateData | undefined;

beforeEach(() => {
  // ... existing mock setup ...

  mockStore = {
    load: vi.fn().mockImplementation(async () => {
      if (savedState) return savedState;
      return { totalEmailsProcessed: 0, totalTokensUsed: 0 };
    }),
    save: vi.fn().mockImplementation(async (state: any) => {
      savedState = state;
    }),
  };
});

// Update the persistence test:
it('should persist sync state across restart', async () => {
  const manager = new GmailSyncManager(mockGmailClient, undefined, mockStore as any);

  await manager.startInitialSync(30);
  const stateBefore = await manager.getSyncState();

  // Simulate restart — state now comes from mock store, not singleton
  const newManager = new GmailSyncManager(mockGmailClient, undefined, mockStore as any);
  const stateAfter = await newManager.getSyncState();

  expect(stateAfter.historyId).toBe(stateBefore.historyId);
  expect(stateAfter.lastFullSync).toEqual(stateBefore.lastFullSync);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/integrations/gmail-sync --reporter=verbose`
Expected: FAIL (constructor signature changed, test not updated yet)

- [ ] **Step 3: Update all GmailSyncManager instantiations in test file**

Every `new GmailSyncManager(mockGmailClient)` needs to become `new GmailSyncManager(mockGmailClient, undefined, mockStore as any)`. Scan for all `new GmailSyncManager` calls in the test file and update them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/integrations/gmail-sync --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add __tests__/integrations/gmail-sync.test.ts
git commit -m "test: update sync state persistence tests to use mock SyncStateStore"
```

---

## Task 4: Wire SyncStateRepository in electron/main.ts

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Import SyncStateRepository**

Add import: `import { SyncStateRepository } from '@core/repositories/sync-state';`

- [ ] **Step 2: Create SyncStateRepository after DB initialization**

After line 150 (`summariesRepo = new SummariesRepository(db);`), add: `const syncStateRepo = new SyncStateRepository(db);`

- [ ] **Step 3: Pass syncStateRepo to GmailSyncManager constructor**

Change line 178 from `syncManager = new GmailSyncManager(gmailClient, jobQueue);` to `syncManager = new GmailSyncManager(gmailClient, jobQueue, syncStateRepo);`

- [ ] **Step 4: Build and verify**

Run: `npx tsc --noEmit` to verify no type errors.
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat: wire SyncStateRepository in electron/main.ts"
```

---

## Task 5: Delete dead code — utility SyncManager + tests

**Files:**
- Delete: `electron/utility/sync-manager.ts`
- Delete: `__tests__/electron/utility/sync-manager.test.ts`

- [ ] **Step 1: Verify no other production code imports the utility SyncManager**

Run: `grep -r "from.*electron/utility/sync-manager" --include="*.ts" .` excluding test files and the file itself.
Expected: No production imports (only test file references)

- [ ] **Step 2: Delete the dead files**

```bash
rm electron/utility/sync-manager.ts
rm __tests__/electron/utility/sync-manager.test.ts
```

- [ ] **Step 3: Build and verify**

Run: `npx tsc --noEmit`
Expected: No errors (no references to deleted files)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead utility SyncManager and tests"
```

---

## Task 6: Update ISSUES.md — mark C-F1 as fixed

**Files:**
- Modify: `docs/ISSUES.md`

- [ ] **Step 1: Move C-F1 to Fixed table**

Remove C-F1 from "Category B: Partial Gap" section. Add to a new "Fixed" subsection at the end of the category, or add to the existing "Fixed" table format at the top of Part 2.

- [ ] **Step 2: Commit**

```bash
git add docs/ISSUES.md
git commit -m "docs: mark C-F1 as fixed in ISSUES.md"
```
