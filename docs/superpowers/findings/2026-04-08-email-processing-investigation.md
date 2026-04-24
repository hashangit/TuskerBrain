# Email Processing & Sync UI — Investigation Findings

**Date:** 2026-04-08
**Method:** 5 parallel subagents investigating LLM pipeline, DB/data flow, orchestrator, UI/IPC wiring, Gmail sync/tests

---

## Critical Issues (9)

### C1. LLM Provider NOT restored on app restart
- **Files:** `electron/main.ts`, `electron/utility/index.ts:227-228`
- After restart, utility process `orchestrator` is `null` — persisted API key never forwarded
- `process-emails` silently fails: "LLM provider not configured"
- No visible error in UI

### C2. Separate JobQueues — recovery path broken
- **Files:** `electron/main.ts:156,419`, `electron/utility/index.ts:86`
- Main process and utility process each have their own in-memory `JobQueue`
- `recoverUnprocessedJobs()` enqueues into main process queue (no runner)
- Backfill (`scheduleBackfill`) has same problem

### C3. Sync events never emitted — SyncPill never renders
- **Files:** `core/gmail/sync.ts`, `electron/main.ts:434-443`, `src/hooks/ipc.ts`, `src/App.tsx:651-714`
- `fetchAndStoreToday()` is atomic — no `'progress'` or `'sync:completed'` events
- `main.ts` never manually emits `sync:progress` or `sync:complete`
- `useSyncProgress()` stays at idle → `syncIndicator` always `undefined` → SyncPill never renders

### C4. NoOpGmailClient — all Gmail mutations silently fail
- **Files:** `electron/utility/index.ts:23-35`, `core/orchestrator.ts:256-279,420-422,513-536`
- Every Gmail API call throws, caught by try/catch
- No labels applied, no archive/delete, no `TB/Processed` in Gmail

### C5. Seed data commented out — empty DB on fresh install
- **Files:** `electron/main.ts:137-142`
- Seeding disabled for "real-flow testing"
- Even if enabled, 53/55 seed emails are `isProcessed: true`

### C6. Missing `findByTopic` method on EmailRepository
- **Files:** `electron/utility/index.ts:140`, `core/repositories/emails.ts`
- `emailRepo!.findByTopic(topicId)` — method doesn't exist
- Crashes at runtime if `topic_summary` job runs

### C7. No backfill or incremental sync in production
- **Files:** `electron/main.ts:314-318`
- `startInitialSync()` exists but never called
- `startIncrementalSync()` exists but never called
- No periodic sync timer — `syncInterval` setting unused

### C8. `@core/llm/types` import non-existent
- **Files:** `core/settings/manager.ts:2`, `core/llm/provider.ts`
- File doesn't exist; `// @ts-nocheck` suppresses error
- `LLMProvider` resolves to `any`

### C9. Error handling swallows LLM failures silently
- **Files:** `core/workflows/langgraph-workflow.ts:236,424,473-487,519`
- Invalid API keys → degraded results, not visible errors
- User never sees that processing failed

## Warning Issues (7)

| # | Issue | Location |
|---|-------|----------|
| W1 | Main process JobQueue has no JobRunner | `electron/main.ts:156` |
| W2 | `processedAt` defaults to `new Date()` when null | `core/repositories/emails.ts:372` |
| W3 | Seed script uses raw SQL | `database/seed-march-23-24.ts` |
| W4 | Race condition: process-emails before LLM set | `electron/utility/index.ts:222-227` |
| W5 | `preload.cjs` manually maintained | `electron/preload.cjs` |
| W6 | Hardcoded model names may not exist | `core/llm/provider.ts:36-49` |
| W7 | `EmailProcessor` class unused | `core/processing/processor.ts` |

## What IS Working

- Schema consistent between `schema.ts` and migration SQL
- FK constraints properly set up
- Component tree wiring correct (App → AppLayout → TopBar → SyncPill)
- LangGraph workflow graph properly structured
- AI SDK packages installed and compatible
- IPC channel names match across preload/main/renderer
- Repository methods cover full processing pipeline
