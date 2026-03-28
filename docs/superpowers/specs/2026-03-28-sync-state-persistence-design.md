# C-F1: Sync State Persistence & Manager Consolidation

**Date**: 2026-03-28
**Issue**: C-F1 — Gmail sync state (historyId) lost on restart; syncState table exists but never populated
**Approach**: Consolidate two sync managers into one with DB-backed persistence via dependency injection

## Problem

Two redundant sync manager classes exist:
- `GmailSyncManager` (`core/gmail/sync.ts`) — the real engine, used by `main.ts`
- `SyncManager` (`electron/utility/sync-manager.ts`) — unused, never imported by main process

Both store `historyId` in memory only. `SharedSyncState` (a singleton in `core/gmail/sync.ts`) holds sync state but calls `reset()` on restart, losing all state. The `sync_state` database table exists with the right columns but is never read or written.

**Impact**: After restart, incremental sync cannot resume. Gmail must do a full re-sync, wasting API quota and user time.

## Design

### Architecture

Single `GmailSyncManager` class with:
1. Core sync logic (already exists)
2. Event emitter for status tracking (absorbed from utility `SyncManager`)
3. `SyncStateStore` interface for persistence (dependency injection)

```
GmailSyncManager
  ├── accepts SyncStateStore (interface)
  ├── emits events: sync:started, sync:completed, sync:error, progress
  ├── persists state at key sync points
  └── loads persisted state on construction

SyncStateRepository (implements SyncStateStore)
  ├── uses Drizzle ORM + existing sync_state table
  ├── load() → reads singleton row
  └── save(state) → upserts singleton row
```

### SyncStateStore Interface

```typescript
interface SyncStateData {
  historyId?: string;
  lastFullSync?: Date;
  lastIncrementalSync?: Date;
  totalEmailsProcessed: number;
  totalTokensUsed: number;
}

interface SyncStateStore {
  load(): Promise<SyncStateData>;
  save(state: SyncStateData): Promise<void>;
}
```

### SyncStateRepository

Follows existing repository pattern (accepts `TuskerBrainDatabase`, uses Drizzle).

- `load()`: `SELECT` from `sync_state` where `id = 1`. Returns defaults if no row.
- `save(state)`: `INSERT INTO sync_state ... ON CONFLICT (id) DO UPDATE`. Single-row upsert.

No migration needed — `sync_state` table already exists in schema and initial migration.

### Persistence Points

State is persisted at these points (not per-email):

| Point | What's saved |
|-------|-------------|
| After `startInitialSync()` | `historyId`, `lastFullSync` |
| After `startIncrementalSync()` | `historyId`, `lastIncrementalSync` |
| After `fetchAndQueueEmails()` page | `historyId` |
| After `processEmail()` batch | `totalEmailsProcessed`, `totalTokensUsed` |

### Event Emitter

Absorbed from utility `SyncManager`. Events:

- `sync:started` — sync operation begins (includes `{ type, lookbackDays? }`)
- `sync:completed` — sync finished
- `sync:error` — error occurred (includes `{ error }`)
- `progress` — progress update (includes `{ total, processed, failed }`)

Uses a simple `Map<event, Set<handler>>` pattern (same as utility class).

### Startup Flow

```
1. Create TuskerBrainDatabase
2. Create SyncStateRepository(db)
3. Create GmailSyncManager(client, jobQueue, syncStateRepository)
   └── constructor calls syncStateStore.load() → restores historyId, etc.
4. If historyId exists → can do incremental sync
5. If no historyId → fresh install, do initial sync
```

## Files Changed

### Create
- `core/repositories/sync-state.ts` — `SyncStateRepository` class

### Modify
- `core/gmail/sync.ts` — Remove `SharedSyncState`, add `SyncStateStore` dependency, add event emitter, persist at key points
- `core/repositories/index.ts` — Add `SyncStateRepository` export and factory entry
- `electron/main.ts` — Create repository, pass to `GmailSyncManager`, restore state on startup
- `electron/ipc/handlers.ts` — Update type signatures if `getStatus()` return shape changes

### Delete (dead code)
- `electron/utility/sync-manager.ts` — Unused redundant class
- `__tests__/electron/utility/sync-manager.test.ts` — Tests for dead class

### Unchanged
- `database/schema.ts` — `syncState` table already exists, correct shape
- `database/migrations/0000_initial.sql` — Table already in migration
- `database/types.ts` — `SyncStateSelect`/`SyncStateInsert` already exported

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Interface injection over direct DB access | Testability, decoupling, matches codebase pattern |
| Singleton-row upsert over multi-row | Sync state is inherently global; one row is correct |
| Persist at phase boundaries, not per-email | Balance between durability and write overhead |
| Remove utility SyncManager entirely | Dead code; consolidating is cleaner than maintaining two |
| Load state in constructor, not lazy | Ensures state is available before any sync call |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| DB write fails mid-sync | State is also in-memory; next successful write recovers. Worst case: redundant re-sync on next restart. |
| Existing tests break | `SharedSyncState.reset()` used in tests — replace with mock `SyncStateStore` |
| main.ts wiring complexity | Constructor injection is explicit; no hidden globals |
