# Phase 1 Map

Status: awaiting gate. App code stayed read-only.

## Area Map

| Area | Purpose | Evidence | Health |
| --- | --- | --- | --- |
| Electron main process | Owns app lifecycle, BrowserWindow creation, database setup, OAuth, sync, repositories, IPC handlers, auto-updater, and utility process wiring. | `electron/main.ts` | Rotten |
| Preload bridge | Exposes `window.electronAPI` methods and event subscriptions to the renderer. | `electron/preload.ts` | Mixed |
| IPC contracts | Defines typed request/response shapes for OAuth, LLM providers, jobs, settings, and sync. | `electron/ipc/channels.ts` | Mixed |
| Renderer UI | React screens and hooks render timeline, deals, topics, settings, onboarding, and data views. | `src/components/screens/*`, `src/hooks/*` | Mixed |
| Domain/core | Handles Gmail sync, processing decisions, jobs, LLM providers, settings, repositories, and security helpers. | `core/gmail/sync.ts`, `core/workflows/processing-decision.ts`, `core/repositories/*` | Mixed |
| Database | SQLite/libSQL with Drizzle tables for emails, timeline updates, deals, topics, labels, jobs, audit log, sync state, settings, API keys, and OAuth token references. | `database/schema.ts`, `database/index.ts` | Mixed |
| Seed/demo data | Creates realistic-looking emails, topics, senders, deals, and date-specific samples. Imported by Electron main and exposed through a seed script. | `database/seed.ts`, `database/seeder.ts`, `database/seed-march-23-24.ts`, `electron/main.ts` | Rotten |
| Tests | Vitest suite spans unit, feature POV, integration, repository, and Electron initialization tests; Playwright covers Electron e2e. | `__tests__/*` | Mixed |
| Build/deploy | Vite + TypeScript + Electron builder, with pnpm scripts for dev/build/e2e/db seed. | package scripts, `pnpm-lock.yaml` | Rotten |
| Generated/vendor | No hand-inspected generated code yet. Dependencies live under `node_modules`; Drizzle migrations were not mapped in this pass. | Baseline query only | Unknown |

## Architecture Summary

This is an Electron desktop modular monolith. The renderer is a React app that calls a preload-exposed API. The Electron main process acts as the application shell and orchestration layer. Core modules contain Gmail sync, LLM, settings, job, repository, and workflow code. Persistence is SQLite/libSQL through Drizzle. The intended seam appears to be renderer -> preload IPC -> main handlers -> core/repositories -> database. The actual code diverges because `electron/main.ts` directly owns many infrastructure and domain responsibilities, the preload surface is broader than `electron/ipc/channels.ts`, and some domain decisions are duplicated or explicitly noted as duplicated in `core/workflows/processing-decision.ts`.

## Bounded Contexts And Domain Nouns

Core nouns: email, thread, sender, topic, Gmail label, timeline update, action item, deal, summary, job, audit log, sync state, OAuth token, API key, LLM provider, model, setting.

The main contexts are email ingestion/sync, AI processing/classification, timeline presentation, deal extraction, topic/label management, settings/provider configuration, OAuth/authentication, and background jobs. Language leaks across contexts: deals use DB names like `dealTitle`/`brandName` and UI names like `title`/`brand`; sync uses both `BackfillJob` state and persisted job rows; IPC channel types cover only part of the preload-exposed surface; job status includes `retrying` in the database schema but not in the IPC request status union.

## Dependency Direction

Observed direction is mostly renderer -> hooks/stores -> preload IPC -> Electron main -> core/repositories -> database. Core repositories depend on the database wrapper and schema. `electron/main.ts` imports downward into core and database, but also centralizes many concerns. `database/index.ts` imports `@core/jobs/queue` for startup job recovery, which is an upward dependency from persistence into core job logic. `core/workflows/processing-decision.ts` says LangGraph duplicates its decision logic rather than importing it, so the intended shared domain seam is not fully enforced.

## Public Contract Surface

Protected contracts found in Phase 1:

- IPC channel names and response shapes in `electron/ipc/channels.ts`.
- Renderer API method names and event names in `electron/preload.ts`.
- Extra preload-only channels not represented in `CHANNEL`: timeline, topics, deals, senders, action-items, emails, shell, backfill, sync progress, and processing progress.
- SQLite table and column names in `database/schema.ts`.
- Settings file shape: `settings`, `apiKeys`, `activeProvider`, `providerValidationStatus`, and `activeModels` in `core/settings/manager.ts::SettingsFile`.
- OAuth token file path/name: `oauth-tokens.enc` under Electron `app.getPath('userData')` in `electron/oauth-service.ts`.
- CLI/package scripts: `dev`, `build`, `preview`, `lint`, `format`, `test`, `test:e2e`, `db:generate`, `db:push`, `db:seed`, `electron:dev`, `electron:build`, `prepare`.
- User-visible OAuth callback HTML and error text in `electron/oauth-service.ts`.
- Log lines used during sync/auth/debug flows, especially `[OAuth] ...` and `[Frontend] ...` logs.

## Baseline Capture

| Check | Result |
| --- | --- |
| Branch | `april-build` |
| Git status before cleanup | untracked `.zflow/` only |
| Git status after baseline commands | `.zflow/` plus Playwright-generated report changes |
| Package manager | `pnpm`, via `pnpm-lock.yaml` |
| Node | `v25.9.0` |
| pnpm | `10.30.3` |
| `pnpm test -- --run` | Pass: 63 test files, 1016 tests |
| `pnpm exec tsc --noEmit` | Pass |
| `pnpm run lint` | Fail: 569 errors, 1 warning |
| `pnpm run build` | Fail: `electron/main.ts:1753:2` unexpected `}` |
| `pnpm test:e2e` | Fail: Electron process failed to launch; 4 failed, 17 not run |
| `pnpm audit --audit-level moderate` | Fail: 24 advisories, 16 moderate and 8 high |
| Secrets scan | No configured project command found |
| Bundle size | Renderer partial build emitted JS 394.82 kB / gzip 111.31 kB and CSS 42.68 kB / gzip 8.53 kB before Electron build failed |
| Startup/perf | Not captured; app launch e2e fails before assertions |

## Non-Functional Posture

Error handling is mixed. Some edges catch and rethrow, some catch and return `null`, and renderer hooks often normalize errors into strings. Logging is mostly `console.log`/`console.error`, including verbose OAuth token-flow logs. Metrics/tracing are not evident from mapped files. Secrets posture uses encryption helpers for OAuth token storage and stores token keys in schema, but Phase 1 did not inspect the encryption implementation. Auth is Gmail OAuth with CSRF state and local callback server. Input validation is scattered across IPC handlers, settings methods, component props, and schema types; no single boundary parser was mapped. Concurrency/async appears manual: timers, polling hooks, callback servers, sync progress events, in-memory state, and backfill jobs. Caching/state appears split across Zustand stores, React state, `SettingsManager` static state, and sync-manager in-memory state.

## Health Heatmap

| Area | Assessment |
| --- | --- |
| Build foundation | Rotten: build and lint are red before cleanup starts. |
| Electron main | Rotten: centralizes too many responsibilities and currently fails Electron bundling. |
| IPC/preload boundary | Mixed: contracts exist, but preload exposes more channels than `channels.ts` captures. |
| Database schema | Mixed: coherent table set, but self-referential topic FK is intentionally absent and must be preserved. |
| Repositories | Mixed: clear repository shape, but `createRepositories` is a shallow factory and database imports job code. |
| Sync/jobs | Mixed: real behavior exists, but state is split across jobs, sync manager, sync-state table, and events. |
| UI/screens | Mixed: typed component props exist, but lint shows unused types/imports and `any` in hooks. |
| Settings/OAuth | Mixed: state and encrypted token storage exist, but logging and error handling are noisy/inconsistent. |
| Tests | Mixed: broad Vitest coverage passes, but lint is red and e2e launch is red. |
| Dependencies/security | Rotten: audit reports 8 high and 16 moderate advisories. |
| Seed/demo data | Rotten: realistic demo data is present in database scripts and seed is imported in main. |

## Known Red Items To Carry Forward

- Build failure at `electron/main.ts:1753`.
- Lint failure with 569 errors and 1 warning.
- Playwright e2e launch failure.
- Dependency audit failure with 24 advisories.
- No configured local secrets scan.

## Phase 1 Limits

- No source code was changed.
- `pnpm test:e2e` updated generated Playwright report artifacts: `playwright-report/index.html` and `test-results/.last-run.json`.
- No migration folder was hand-inspected.
- No generated-code inventory was completed.
- No runtime representative flow was captured because e2e app launch failed.
- Parallel subagent assessment was abandoned because multiple graph calls stalled; this report used single-threaded graph-first reads.
