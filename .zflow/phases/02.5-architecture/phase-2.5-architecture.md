# Phase 2.5 Architectural Assessment

Status: awaiting gate. App code stayed read-only.

## Findings Ranked By Value-Per-Risk

### 1. IPC Contract Surface Is Wider Than Its Typed Contract

**Principle at stake:** Public API surface and narrow interfaces.

**Current state:** `electron/ipc/channels.ts` defines typed contracts for OAuth, LLM providers, jobs, settings, and sync. `electron/preload.ts` exposes those plus timeline, topics, deals, senders, action-items, emails, shell, backfill, sync progress, processing progress, and backfill events. `src/hooks/ipc.ts` then compensates with `// @ts-nocheck`, `any`, and ad hoc response unwrapping.

**Minimal intervention:** Add or align type definitions for the already-existing preload surface. Do not rename channels, do not change payloads, and do not normalize runtime response envelopes yet.

**Blast radius:** `electron/ipc/channels.ts`, `electron/preload.ts`, `src/hooks/ipc.ts`, renderer callers of `window.electronAPI`, and IPC handlers.

**Behavior change:** Can be done without behavior change if limited to types and compile-time checks.

**Recommendation:** Worth doing in this pass after the build syntax error is fixed, but only in small families: one channel group at a time.

### 2. Electron Main Is The Runtime Junction For Too Many Concerns

**Principle at stake:** Module depth, effects at the edges, and locality of behavior.

**Current state:** `electron/main.ts` wires app lifecycle, BrowserWindow creation, database, seed import, OAuth, sync manager, repositories, IPC handlers, auto-updater, utility process, timers, and likely representative log output. It is also the current build failure location.

**Minimal intervention:** Do not split it architecturally in this pass. First fix the syntax error. Then remove only clearly dead scaffolding or local duplicates found in the inventory.

**Blast radius:** Electron startup, app launch, sync scheduling, IPC handlers, database initialization, OAuth flow, e2e tests, and build output.

**Behavior change:** Broad extraction is high risk and likely behavior-affecting. Local syntax/dead-code cleanup can be behavior-preserving.

**Recommendation:** Defer architectural extraction. Treat `electron/main.ts` as a guarded integration boundary until tests and e2e launch are green.

### 3. Persistence Depends Upward Into Core Job Logic

**Principle at stake:** Dependency direction and boundaries define the design.

**Current state:** `database/index.ts` exports schema/deals and defines `TuskerBrainDatabase`, but also imports `@core/jobs/queue` for `recoverUnprocessedJobs`. That makes the database layer know about job queue behavior.

**Minimal intervention:** Leave it alone during initial cleanup. If touched later, move recovery orchestration to startup/application code and keep the database wrapper focused on persistence.

**Blast radius:** `database/index.ts`, startup recovery tests, Electron initialization, job queue behavior, and any imports of `recoverUnprocessedJobs`.

**Behavior change:** Can be behavior-preserving with characterization tests, but it is cross-module.

**Recommendation:** Defer until after build and e2e are fixed. This is a good later L2 refactor, not first-pass cleanup.

### 4. Domain Shapes Drift Across Runtime, UI, And Tests

**Principle at stake:** Bounded contexts, make illegal states unrepresentable, and DRY by reason-to-change.

**Current state:** The same nouns appear with different shapes: `TimelineUpdate` exists in test helpers, timeline store/UI types exist elsewhere, deals map from DB names like `dealTitle`/`brandName` to UI names like `title`/`brand`, and test fixtures define their own email/deal/update expectations. Some duplication is legitimate context separation; some is drift-prone.

**Minimal intervention:** Do not introduce a shared mega-type package. When touching a boundary, add a local parser/mapper or typed adapter for that boundary only.

**Blast radius:** `src/hooks/useTimeline.ts`, `src/components/screens/*`, `database/deals.ts`, test fixtures/helpers, repository result shapes, and preload API types.

**Behavior change:** Type-only mapping can be behavior-preserving. Cross-context unification risks accidental coupling.

**Recommendation:** Act only where Phase 2 already found local `any` or dead shape drift. Do not DRY across contexts by name alone.

### 5. Seed/Demo Data Sits Near Runtime And Database Bootstrapping

**Principle at stake:** Effects at the edges and production path cleanliness.

**Current state:** `database/seed.ts`, `database/seeder.ts`, and `database/seed-march-23-24.ts` contain realistic sample data. `electron/main.ts` imports `seed` from `@db/seed`. Phase 2 did not prove when or whether it runs in production, but its proximity to runtime startup is risky.

**Minimal intervention:** First trace whether seed executes in packaged or normal app startup. If it is only development/test-only, make that boundary explicit. If it can run in production, require approval before changing behavior.

**Blast radius:** Database bootstrapping, first-run behavior, dev data, e2e fixtures, and any manual `db:seed` workflows.

**Behavior change:** Unknown until execution path is traced.

**Recommendation:** Investigate in Phase 3 planning. Do not remove seed code blindly.

## Architectural Non-Actions

- Do not wrap Electron, Drizzle, Vite, or React in new framework abstractions.
- Do not introduce repository interfaces while there is one implementation.
- Do not normalize all error handling strategies across the app in one pass.
- Do not merge test fixture types with runtime UI types unless a concrete boundary needs it.
- Do not change database schema, IPC channel names, persisted settings shape, or OAuth token file format in cleanup batches.

## Suggested Architectural Direction For Phase 3

Start with L1/L2 batches that restore the baseline and shrink obvious drift:

1. Build syntax repair in `electron/main.ts`.
2. Generated Playwright artifact handling or reset policy.
3. Small lint/dead-code batches with tests green before and after.
4. Type-only IPC/preload alignment by channel family.
5. Separate security/dependency plan for L3 items.

The largest architectural smell is not worth attacking directly yet. Make the code runnable, tighten contracts at existing seams, and avoid drawing new architecture over unstable ground.
