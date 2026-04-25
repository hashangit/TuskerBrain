# TuskerBrain — Senior Engineer Architecture & Implementation Assessment

**Date:** 2026-04-25
**Scope:** Full codebase — `core/`, `electron/`, `src/`, `database/`, `__tests__/`
**Reviewer mandate:** Read-only audit. No code changes. Report only.

---

## Overall verdict

This is an honest, working product that has been built fast — most likely with heavy LLM assistance — by a small team or solo engineer. The product surface is real: Gmail OAuth, incremental sync with history-id tracking, LangGraph email processing, encrypted local storage, optimistic UI. The plumbing works. But the codebase has the characteristic shape of a project that has grown by accretion rather than by deliberate design: a handful of god-files do most of the work, side-effects and business logic have leaked across process boundaries, and abstractions have been added one at a time without ever being audited as a whole. Nothing is broken, but a lot is misplaced.

The good news is that the rot is structural, not behavioural. Almost every problem described below can be fixed with movement (extract this, move that to the boundary) rather than rewrites. The bad news is that there are roughly ten of these movements, and as long as they remain undone the codebase will keep generating its own gravity — every new feature lands in a god file because that's where the gravity is.

---

## Blocking pre-merge defects

Two issues would prevent this branch from landing cleanly on any other developer's machine. They are not architectural — they are "this should not have shipped" defects, and they should be fixed regardless of any larger restructuring:

- **Hardcoded absolute path in `database/seed.ts:7`.** The file imports the schema as `import * as schema from '/Users/hashanw/Developer/TuskerBrain/database/schema';` rather than `'./schema'`. The seed does not compile on any other machine. One-line fix.
- **`src/components/ui/ThreadCard.tsx.bak` (193 lines) is tracked.** A backup file made during development was committed and remains in the renderer tree. `git rm` and a `.gitignore` entry for `*.bak` is the fix.

These are not architectural problems and shouldn't bias your reading of the rest of this report.

---

## The recurring shape of the problem

Five symptoms keep recurring. They aren't independent — they're all expressions of the same underlying habit: **doing things "where it's easiest to reach state" rather than where the boundary says they belong**.

1. **Sprawl in the highest-state files.** `electron/main.ts` (1,732 lines), `src/App.tsx` (1,430 lines), and `src/components/screens/{DealsScreen, TimelineScreen}.tsx` (1,000+ each) accumulate logic because they happen to be near the singletons (the `BrowserWindow`, the React tree root, the screen's local state). Once a function is in `main.ts` it tends to grow there because that's where every dependency is in scope.

2. **Layer leakage between renderer and database.** `src/App.tsx:13` imports `toDealDataList` and `DealRecord` directly from `../database/deals`. The renderer is reaching across the IPC boundary into a Drizzle-flavoured module — types and helpers that should never have crossed the process line. Not coincidentally, `database/deals.ts` (345 lines) and `core/repositories/deals.ts` (340 lines) are now two parallel "deals" modules that re-export each other "for backward compat." Two files about the same concept, no clear ownership, and the renderer is consuming both worlds.

3. **Test code in production paths.** `core/jobs/queue.ts` exposes `simulateInconsistentState()` and equivalents on the live `JobQueue` class (lines ~440–476). That's a method named `simulate…` sitting inside a production singleton, with comments referencing "Special marker for test detection." This is the textbook anti-pattern — mocks/stubs in production paths.

4. **Defensive null-coalescing and `!`-bangs everywhere.** Because `electron/main.ts` declares fourteen `let foo: T | null = null` module-level singletons (lines 28–44) and initialises them later, every consumer is forced to either bang-assert (`jobQueue!`, `syncManager!`) or guard (`if (!syncManager || !emailRepo || !utilityChild) return`) against an "impossible" null that the type system actually thinks is possible. The result is defensive code that is genuinely doing work — but only because the initialisation contract is unenforced, not because the values can really be null at the call site.

5. **Doubled scaffolding.** Three seed files (`seed.ts` 961, `seed-march-23-24.ts` 558, `seeder.ts` 360) with no clear ownership — one of them is *date-stamped*, which means historical demo data has accreted into the production folder. Two parallel mock systems (`__tests__/fixtures/*.json` and `database/seed*.ts`). 432 lines of `getMockTimelineData()` / `getMockTopicsData()` / `getMockDealsData()` sitting at the bottom of `App.tsx` (lines 999–1430) — example data masquerading as real code.

---

## The five issues that matter most

### 1. `electron/main.ts` is doing the job of three modules

**Where:** `electron/main.ts:506–1210` (the inline `registerDataHandlers()`), 1519–1655 (`runSyncCycle`/`performFullSync`), 707–754 vs 1119–1161 (AI summary generation duplicated for topics and senders).

**What's actually in there:** Roughly 615 lines of inline IPC data-fetch handlers that build queries, hit repositories, generate AI summaries, and shape DTOs. Another 135 lines of sync orchestration. Another 115 lines of utility-process forwarding. Plus the legitimate Electron lifecycle code, which would be ~150 lines on its own. Of the 1,732 lines, roughly **150 belong here, 1,000 belong in domain-specific handler files, and ~500 belong in `core/` as services or jobs.**

**Plain-English implication:** The Electron main process is supposed to be a thin coordinator — open windows, route IPC, supervise the utility process. Instead it's also the data layer, the AI summary service, and the sync orchestrator. This means (a) the entire main process has to load just to test anything, (b) UI freezes are more likely because long-running work executes on the same thread that paints, and (c) every new IPC message is a temptation to just append another handler in the same file.

Two specific tells worth flagging inside those 615 lines: the procedural numbered comments inside `topics:get-detail` and `senders:get-detail` (`// Step 1: Fetch the base email`, `// Step 2: …`, … `// Step 9: Assemble the response`, lines 1014–1163 and 1256–1410) are a multi-step service masquerading as an IPC handler — pull them out and you have a real service. And the `gmail-request` dispatch at `electron/main.ts:427` — `const fn = (client as any)[method]` — accepts any method name from the worker with no allowlist. In an Electron context the worker is trusted, so it's not an exploitable security hole, but it's a deliberate type-safety hole with no upside; an explicit dispatch table over `getMessages` / `getMessageDetail` / `applyLabels` would be both safer and shorter.

### 2. Renderer/main/database boundaries are not enforced

**Where:** `src/App.tsx:13` imports from `database/deals.ts`. `electron/main.ts` registers handlers in three places (channels.ts defines names, handlers.ts registers some, main.ts registers others inline). IPC payloads are typed at compile time but not validated at runtime — `payload?.limit` could arrive as a string from a misbehaving renderer and nothing would catch it.

**Plain-English implication:** Boundaries that aren't enforced aren't boundaries. The `database/` folder is reachable from the renderer because nothing physically prevents it — the import resolves, types compile, and a domain helper has now leaked across two layer lines. Once that import exists, the next person looking for "where do deal helpers live?" will find both options and the duplication self-perpetuates. The fix isn't a clean architecture diagram; it's a single rule applied consistently — *the renderer talks to main only via IPC, main talks to data only via repositories, and runtime payloads are parsed at the boundary with zod (parse, don't validate).*

The same boundary failure shows up two more times. The renderer has a typed IPC wrapper in `src/hooks/ipc.ts`, but `App.tsx` bypasses it five times via `as any` casts: `(window as any).electronAPI?.markDealAsUsed(...)` and the three sibling deal mutations (lines 573, 594, 614, 634), plus `(result as any)?.data?.authUrl || (result as any)?.authUrl` at line 319 unwrapping the OAuth response. The typed channels in `electron/ipc/channels.ts` are real; the renderer just opts out of them. And the preload surface itself is defined twice — `electron/preload.ts` (~16 KB, ~100 methods) and `electron/preload.cjs` (~6 KB, ~50 methods) — with the `.cjs` carrying the comment "This is the actual preload script used by Electron." The `.ts` is shadow-maintained alongside it and the two have meaningfully drifted. Whichever is "canonical" is unclear to anyone reading the tree, and any new IPC channel must be added in both places to keep them aligned. Pick one and delete the other.

### 3. Singletons-as-globals hide the real initialisation contract

**Where:** `electron/main.ts:28–44` (14 nullable module-level lets); the `getJobQueue()` getter at line 49 explicitly labelled "for testing"; `core/settings/manager.ts:31–42` storing settings, API keys, active provider, and validation status as **static class fields**.

**Plain-English implication:** The shape of the system is "everything is null at module load, then somebody calls `initializeRuntime()` and now everything is non-null forever." That's a real contract — but it's expressed only as `let x: T | null` plus convention. Every consumer has to re-prove the contract by bang-asserting or guarding. The cost compounds: handlers can't be tested without booting the whole main process, and a refactor that changes init order will fail at runtime in some random handler instead of at the seam where it actually broke.

The fix is structural, not stylistic: a `MainProcessContext` constructed once, passed to handlers, with no `null` in its public type. The `SettingsManager` problem is a sibling — instance methods reading and writing static state is just a singleton wearing an instance trenchcoat.

### 4. The renderer has god components and god hooks

**Where:** `App.tsx` (1,430 lines) holds 11 `useState`s, 4 `useEffect`s, an in-line OAuth poll with stale-closure risk (lines 321–327), four near-identical optimistic-mutation blocks for deals (lines 562–644: markUsed/unmarkUsed/dismiss/restore are the same 30-line pattern repeated four times), a 106-line `syncIndicator` `useMemo` that is really a state machine, and 432 lines of mock data generators. `TimelineScreen.tsx` (1,039 lines) wraps 300 lines of filter-and-aggregate logic around 700 lines of JSX. `useDeals.ts` (509 lines) duplicates the same mutation logic that `App.tsx` is doing locally.

**Plain-English implication:** When a single component holds the data, the navigation, the mutations, the empty states, the mock fallbacks, *and* the sync state machine, every change touches it. That's why the file keeps growing. The mock data is the most telling tell — it means the code path "render with no real data" was wired in early as a stand-in and was never excised. The four-times-copy-pasted optimistic update is the second tell — by the time you've written it twice, you've written it four times.

The fix is unglamorous: extract `useDealMutations`, `useSyncIndicator`, `useTimelineFilters` as plain hooks; move mocks to a fixtures file; let `App.tsx` shrink to routing + providers. None of this requires a router rewrite or a state-management migration.

### 5. The test pyramid is upside down

**Where:** `__tests__/features-pov/` has ~30 high-level scenario files including subfolders for `scenarios/` and `edge-cases/`. Meanwhile the three largest source files — `electron/main.ts` (1,732), `src/App.tsx` (1,430), `core/gmail/sync.ts` (1,065) — have **no dedicated test files**. Some `features-pov` tests assert on prompt *content* (`prompt.includes('Classify this email')`), which couples tests to wording rather than behaviour. There's also a `__tests__/tmp/test-sync-state-isPaused.test.ts` file orphaned in a `tmp/` directory.

**Plain-English implication:** "Features-POV" sounds like a thoughtful testing taxonomy, but in practice it's where every test that doesn't fit elsewhere has landed. Real outcome-level tests are valuable but expensive — having thirty of them, several testing implementation strings, means slow CI and brittle tests that break when you rename a prompt. The big files are untested because they're hard to test, and they're hard to test because of issues #1 and #3 above. Fixing the structural problems is also the fix for the testing problem.

---

## Additional findings — concrete defects

Smaller items that didn't make the top-five but are real, citable, and small enough to fix surgically:

- **Timeline endpoint loads the full mailbox on every fetch.** `electron/main.ts:515` calls `emailRepo.findAll()` on each `timeline:list` request, then joins with timeline updates and sorts in JavaScript. Cost scales linearly with mailbox size — a 5,000-email lookback loads 5,000 records into memory every time the timeline opens. The right shape is to push the join, the filter, and the sort into SQL via a Drizzle query and paginate at the repository layer.
- **`processEmail` encodes retryability in the error message string.** `core/orchestrator.ts:260–267` correctly distinguishes retryable from non-retryable LLM errors, but communicates the distinction by throwing `new Error('Retryable LLM error …')` vs `new Error('Non-retryable LLM error …')` — the only signal the job queue can read downstream is the prefix of the string. A typed error subclass (`RetryableLLMError`, `PermanentLLMError`) would carry the same information without string-parsing and would make the queue's retry policy refactor-safe.
- **`EmailRepository.upsert` does read-then-write.** `core/repositories/emails.ts:247–280` runs `findById` then either `update` or `create`. Drizzle supports `onConflictDoUpdate` natively, which is shorter and removes the (unlikely-but-real) TOCTOU race window between two concurrent sync passes. Low practical risk on a single-user desktop app, but the fix is cheaper than the explanation.
- **`console.log('[App] isElectron:', isElectron)` at module scope.** `src/App.tsx:48` runs at module load and every hot-reload. Debug noise that should be removed or guarded behind a `__DEV__` flag.
- **Migrations don't use `IF NOT EXISTS`.** `database/migrations/0000_initial.sql` uses bare `CREATE TABLE`. With the standard drizzle-kit migration runner this is fine — Drizzle tracks applied migrations in `__drizzle_migrations` and never re-runs them — but if startup code ever applies migration files outside that runner (the seeder is suspect here), the absence of `IF NOT EXISTS` becomes a re-run hazard. Worth verifying which path the app uses before treating this as a non-issue.

---

## Things that are genuinely well done

Calibration matters: this codebase isn't bad — it's misshapen. Specific things that a careful team would not change:

The Gmail sync layer (`core/gmail/sync.ts`, 1,065 lines) is large *because the problem is large*. It cleanly separates initial fetch, incremental history-id tracking, history-expiry fallback, label reconciliation, and the cleanup-rule policy table from the README. The retry/back-off and rate-limited client are real engineering, not ceremony. This is the one big file in the codebase that is big for the right reasons.

The LLM workflow (`core/workflows/langgraph-workflow.ts`) distinguishes retryable (429, 5xx, network) from non-retryable (401, 403, content-filter) errors with server-suggested-retry-delay extraction. That's senior-level error handling. The one defect is that the StateGraph is recompiled per email — a one-line fix.

The `preload.ts` IPC surface uses `contextBridge.exposeInMainWorld` correctly with full TypeScript types and unsubscribe-returning event subscriptions. The OAuth service is a coherent 418 lines doing genuinely complex token-lifecycle work — its size is justified.

The `ui/` design system (`src/components/ui/*`) is a real, used design system. Screens compose `<Card padding="lg">` and `<Button variant="primary">` rather than redefining buttons inline. That alone is rare in apps of this age.

`security/encryption.ts` (61 lines) is the right size for what it does: transparently fall back from `safeStorage` to base64 in test environments, encrypt on `setTokens`, decrypt on retrieval. No ceremony.

The label-format migration in `core/labeling/manager.ts` (`TuskerBrain/*` → `TB/*`) detects the legacy format on first sync and renames in-place rather than requiring a separate migration step. That is the right pattern for a one-time format change in a user-owned data store — and it's the kind of thing that's easy to half-implement.

The email-detail thread context — splitting thread emails chronologically into "earlier" and "later" relative to the focused email and computing `formatTimeGap` between adjacent ones — is real UX engineering, not generated filler. The thread-link construction (`https://mail.google.com/mail/u/0/#inbox/{threadId}`) is also correct for Gmail.

---

## Allergen checklist — what's there and what isn't

Of the specific anti-patterns to watch for:

- **Emoji in logs** — none seen.
- **`except Exception: pass` / empty catches** — none of the egregious form, though a few permissive `try/catch` wrappers exist.
- **Hallucinated APIs** — none detected; the Gmail and `@ai-sdk` calls are real.
- **Interface with one implementation** — present but mild: `EmailRepository` etc. have one Drizzle implementation each. Acceptable pending a second consumer (a memory-backed test impl is a reasonable second consumer to add).
- **DDD ceremony / event sourcing for a form** — absent.
- **Hand-rolled framework code** — `core/jobs/queue.ts` (477 lines for an in-memory queue) leans this direction; a Drizzle-backed table plus a simple loop would do most of the work.
- **Narrating docstrings on trivial helpers** — present but not pervasive (`// Loading spinner component` over `function LoadingSpinner` is typical density).
- **Mocks in production paths** — confirmed (`simulateInconsistentState`, mock data in `App.tsx`).

The headline observation: this codebase has *more* of the senior-engineer slop (over-layered, framework-y, premature abstraction in jobs and settings) than of the junior LLM slop (emojis, narrating comments, hallucinated APIs). The author has good instincts that have over-fired.

---

## Per-module verdicts

### `core/`

| Module | Verdict |
|--------|---------|
| `orchestrator.ts` (652) | B+. Good coordinator; minor schema-conversion leakage; LangGraph re-compiled per email is the one efficiency bug. |
| `gmail/sync.ts` (1065) | A−. Big because the problem is big. Phases cleanly separated. Cleanup-rules policy table is a clear win. |
| `workflows/langgraph-workflow.ts` (733) | B+. Solid error taxonomy. StateGraph should be compiled once and reused. |
| `jobs/queue.ts` (477) | C+. Hand-rolled framework. `simulate*` test helpers must move to a test subclass. |
| `repositories/emails.ts` (394) | A. Clean DAL. No leakage. |
| `settings/manager.ts` (415) | C. Singleton-pretending-to-be-instance via static fields. Decompose into a key-value store + provider manager. |
| `llm/provider*.ts` | A−. Validation cache and creation cleanly separated. |
| `auth/token-manager.ts` | A−. Refresh buffer + revocation handlers are correct. |
| `labeling/manager.ts` | A−. Cache + retry are appropriate scope. |
| `timeline/filter.ts` | A. Pure utility, no state. |
| `security/encryption.ts` | A. Right-sized. |

### `electron/`

| File | Verdict |
|------|---------|
| `main.ts` (1732) | God object. Extract data handlers per domain; replace nullable lets with a context object; move sync logic to jobs. |
| `preload.ts` | Good. Typed, isolated. Could add runtime validation on event payloads. |
| `ipc/channels.ts` (340) | Good. Typed pairs of request/response. Missing zod schemas. |
| `ipc/handlers.ts` (397) | Incomplete. Only registers a subset; the rest is in main.ts inline. |
| `ipc/gmail-proxy.ts` | Functional but ad-hoc. 30s hardcoded timeout. |
| `oauth-service.ts` (418) | Solid. Cohesive token-lifecycle logic. Size justified. |
| `window.ts`, `runtime.ts`, `sync-events.ts`, `auto-updater.ts` | Minimal and OK. |
| `utility/scheduler.ts`, `utility/index.ts` (390) | Functional sprawl in `index.ts`; "utility" name itself is a smell — it's actually the worker process and could be named so. |

### `src/`

| Area | Verdict |
|------|---------|
| `App.tsx` (1430) | **Critical.** Extract `useAppDataLoading`, `useDealMutations`, `useSyncIndicator`. Move mocks out. Direct cut to ~400 lines feasible without behaviour change. |
| Screens (1000+) | High. Filter/aggregation logic should be hooks. Each screen should be ~600 lines. |
| `hooks/ipc.ts` (629) | Keep. Genuinely well-designed IPC wrapper. App.tsx just doesn't use it consistently. |
| `hooks/useDeals.ts` (509) | Medium. Mutation logic is duplicated with App.tsx — consolidate to one source of truth. |
| Stores (zustand) | Low. Used minimally; clean. Consider react-query if data-fetching grows. |
| UI design system | Good. Coherent and consistently applied. |
| `Onboarding.tsx` (626) | Keep. Real four-step wizard, complexity justified. |
| `EmailDetailView.tsx` (477) | Keep. Real complexity; DOMPurify used correctly. |
| Routing | OK for current scope. Hash-based with a typed view union — fine until the app exceeds ~10 views. |

### `database/` and tests

| Area | Verdict |
|------|---------|
| Schema | Good. One workaround on `topics.parentId` self-reference left orphans possible — fix via raw-SQL migration or soft-delete. |
| Seeds | Three files, unclear ownership. Consolidate to `seeder.ts`; move date-stamped seed to fixtures; delete `seed.ts` (extract templates if reused). |
| `database/deals.ts` vs `core/repositories/deals.ts` | Layer leak. Move helpers into `core/`; keep `database/` schema-only. |
| Test pyramid | Inverted. Keep `features-pov` to ~5–10 end-to-end scenarios per feature; promote logic tests into `workflows/` and `integrations/`. |
| Coverage shape | The biggest source files are the least tested. Add direct integration tests for `electron/main.ts` and `core/gmail/sync.ts`. |
| Fixtures | Two systems running in parallel. Consolidate. |
| Mocks | Mostly well-isolated. Remove tests that assert on prompt wording. |
| Test state pollution | `__tests__/tmp/test-sync-state-isPaused.test.ts` should be deleted or relocated. |

---

## Highest-ROI moves, in order

If a senior were on this team for two weeks with no other work, this is the sequence:

**Day zero (before any architectural work).** Fix `database/seed.ts:7` to import schema by relative path. `git rm src/components/ui/ThreadCard.tsx.bak` and add `*.bak` to `.gitignore`. Delete the module-scope `console.log` at `App.tsx:48`. Replace the five `as any` casts in `App.tsx` (lines 319, 573, 594, 614, 634) with the typed wrappers in `src/hooks/ipc.ts`. Decide which preload script (`preload.ts` or `preload.cjs`) is canonical and delete the other — keeping both is an active maintenance trap. None of these are architecture; all of them are small, mechanical, and unblock a clean merge.

**Week 1.** Extract `registerDataHandlers()` from `electron/main.ts` into per-domain handler files (`ipc/timeline.ts`, `ipc/deals.ts`, `ipc/topics.ts`, `ipc/senders.ts`). Replace the 14 nullable module-level lets with a single `MainProcessContext` constructed in `runtime.ts`. Move the duplicated AI summary generation (topics:get-detail / senders:get-detail) into one `SummaryService` in `core/`. Delete `simulateInconsistentState` from `JobQueue` and put it in a test-only subclass.

**Week 2.** Pull the four optimistic-mutation blocks in `App.tsx` into a single `useDealMutations` hook. Move the 432 lines of mock data out of `App.tsx`. Extract `useSyncIndicator` and `useTimelineFilters`. Apply zod schemas to IPC payload boundaries (parse-don't-validate, both directions). Move `database/deals.ts` helpers into `core/repositories/deals.ts` so the renderer can no longer import from `database/`. Delete or relocate `seed-march-23-24.ts` and `__tests__/tmp/`.

After those two weeks, no file would be over ~600 lines, no module-level singleton would be nullable, no production class would have a `simulate…` method, and the renderer would talk to main only through typed-and-validated IPC. The behaviour would be identical. The code would be roughly 25–30% smaller. And — to the standard of a careful, experienced team having written it the first time — it would be hard to tell from the result that an LLM had ever been involved.
