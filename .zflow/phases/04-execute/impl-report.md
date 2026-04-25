# Phase 4 Implementation Report

Status: in progress.

## Approved Scope

User approved all Phase 3 batches.

## Batch Log

### Batch 0: Generated Baseline Artifacts

- Status: complete.
- Intent: restore or isolate Playwright-generated artifacts from the cleanup diff.
- Action: restored `playwright-report/index.html` and `test-results/.last-run.json`.
- Verification: `git status --short -- playwright-report/index.html test-results/.last-run.json .zflow` now shows only untracked `.zflow/`.
- Public surface delta: none.
- Rollback: no source change to roll back.

### Batch 1: Build Syntax Repair

- Status: complete.
- Intent: repair the known-red `electron/main.ts:1753` parse failure without changing runtime behavior.
- Finding: `runSyncCycle` already closed its catch at lines 1731-1734; lines 1752-1754 were a duplicate orphaned catch tail after `performFullSync`.
- Action: deleted only the orphaned three-line fragment.
- Verification:
  - `pnpm exec tsc --noEmit`: pass.
  - `pnpm run build`: pass.
  - `pnpm test -- --run`: pass, 63 files and 1016 tests.
  - `pnpm run lint`: still fails. The prior parser error is gone; ESLint now reports 584 errors and 1 warning because it can continue through `electron/main.ts`.
- Public surface delta: none.
- Rollback: revert the three-line deletion in `electron/main.ts`.

### Batch 2: E2E Launch Recovery

- Status: complete.
- Intent: root-cause Electron launch failure now that the build parser blocker is gone.
- Finding: after Batch 1, Electron launched successfully but E2E still failed because onboarding/settings tests manipulated `localStorage` or expected a nonexistent simulated OAuth shortcut while the app reads Electron settings and OAuth token state through IPC.
- Action:
  - Added an E2E helper that launches Electron with isolated temp user data.
  - Seeded settings and encrypted OAuth token state at the Electron boundary for tests that need onboarded/authenticated state.
  - Collapsed placeholder/non-realistic onboarding checks into one authenticated onboarding flow. Existing component tests continue to cover the individual onboarding steps.
- Verification:
  - `pnpm exec tsc --noEmit`: pass.
  - `pnpm exec playwright test __tests__/e2e/onboarding.test.ts __tests__/e2e/settings.test.ts`: pass, 9 tests.
  - `pnpm test:e2e`: pass, 16 tests.
  - `pnpm test -- --run`: pass, 63 files and 1016 tests.
  - `pnpm run build`: pass.
  - `pnpm run lint`: still fails, now 583 errors and 1 warning. This remains the known-red lint baseline; the parser blocker is gone.
- Public surface delta: none.
- Rollback: revert E2E helper/test edits; Batch 1 build repair can remain independent.

### Batch 3: Main Window Split

- Status: complete.
- Intent: move BrowserWindow construction out of `electron/main.ts` without changing lifecycle ownership.
- Action: added `electron/window.ts` with `createMainWindow`; `main.ts` still owns the `mainWindow` global and closed-window behavior.
- Verification:
  - `pnpm exec tsc --noEmit`: pass.
  - `pnpm run build`: pass.
  - `pnpm exec playwright test __tests__/e2e/app-launch.test.ts`: pass, 4 tests.
- Public surface delta: none.
- Rollback: inline `createMainWindow` back into `main.ts` and remove `electron/window.ts`.

### Batch 4: Runtime Composition Split

- Status: complete.
- Intent: move startup composition for database, repositories, settings, OAuth, job queue, and sync manager out of `electron/main.ts`.
- Action: added `electron/runtime.ts` with `initializeRuntime`; IPC handlers and lifecycle code remain in `main.ts`.
- Verification:
  - `pnpm exec tsc --noEmit`: pass.
  - `pnpm run build`: pass.
  - `pnpm exec playwright test __tests__/e2e/app-launch.test.ts`: pass, 4 tests.
- Public surface delta: none.
- Rollback: move `initializeRuntime` body back into the `app.whenReady` block and remove `electron/runtime.ts`.

### Batch 5: Sync Event And Timer Split

- Status: complete.
- Intent: move sync event forwarding and periodic timer setup out of `electron/main.ts` while leaving the sync algorithm local.
- Action: added `electron/sync-events.ts` with `forwardSyncProgress` and `startPeriodicSync`.
- Verification:
  - `pnpm exec tsc --noEmit`: pass.
  - `pnpm run build`: pass.
  - `pnpm exec playwright test __tests__/e2e/app-launch.test.ts __tests__/e2e/onboarding.test.ts`: pass, 7 tests.
  - `pnpm test:e2e`: pass, 16 tests.
  - `pnpm test -- --run`: pass, 63 files and 1016 tests.
- Public surface delta: none.
- Rollback: inline event listeners and timer setup back into `main.ts`, then remove `electron/sync-events.ts`.

### Batch 6: IPC Typing Cleanup

- Status: complete.
- Intent: remove the broad renderer IPC type bypass and clean no-payload IPC request types.
- Action:
  - Removed `// @ts-nocheck` from `src/hooks/ipc.ts`.
  - Replaced repeated ad hoc IPC response unwrapping with one local typed helper.
  - Removed unused IPC response imports from `electron/ipc/handlers.ts`.
  - Changed no-payload request types in `electron/ipc/channels.ts` from `{}` to `undefined`.
- Verification:
  - `pnpm exec tsc --noEmit`: pass.
  - `pnpm exec eslint src/hooks/ipc.ts electron/ipc/channels.ts electron/ipc/handlers.ts`: pass.
  - `pnpm run build`: pass.
  - `pnpm test:e2e`: pass, 16 tests.
  - `pnpm test -- --run`: pass, 63 files and 1016 tests.
  - `pnpm run lint`: still fails, now 559 errors and 1 warning.
- Public surface delta: type-only; runtime channel names and payloads unchanged.
- Rollback: restore the prior imports/types and `@ts-nocheck`; no data or runtime migration involved.

### Batch 7: Local Dead Matter Cleanup

- Status: complete.
- Intent: remove dead symbols created or exposed by the main-process split without broad type churn.
- Action:
  - Removed unused `SyncStateRepository`, `LabelsRepository`, `labelsRepo`, and `ProviderNameAlias` from `electron/main.ts`.
  - Marked unused sync adapter parameters with `_`.
  - Removed an unused `emailDeals` result and its associated query from the email-detail handler.
- Verification:
  - `pnpm exec tsc --noEmit`: pass.
  - Targeted ESLint on touched runtime/e2e files still fails on 11 existing `any` uses in `electron/main.ts`; no unused-symbol errors remain in those files.
- Public surface delta: none.
- Rollback: restore the removed dead symbols/query if a hidden consumer is found; no schema or IPC change involved.

### Batch 8: Seed And Demo Boundary

- Status: assessed, no code change.
- Intent: determine whether committed seed/demo data is leaking into production paths.
- Finding: `database/seed.ts` contains realistic sample email data, including banking, travel, commerce, and healthcare-like examples. The active runtime composition only invokes the seed path for an empty database while `VITE_DEV_SERVER_URL` is present, so this remains a development bootstrap boundary rather than a production path in this pass.
- Action: left seed data unchanged. Renaming or relocating it would be documentation and import churn without reducing runtime risk.
- Verification:
  - `pnpm run build`: pass.
  - `pnpm test:e2e`: pass, 16 tests.
  - `pnpm test -- --run`: pass, 63 files and 1016 tests.
- Public surface delta: none.
- Rollback: no source change to roll back.

### Batch 9: Security And Dependency Follow-Up

- Status: assessed, blocked by security hard stop.
- Intent: re-run dependency audit and separate cleanup-safe work from security remediation.
- Finding: `pnpm audit --audit-level moderate` still fails with 24 advisories, unchanged in count from Phase 1: 16 moderate and 8 high. High findings include Vite dev-server advisories and transitive `electron-builder` `lodash`/`@xmldom/xmldom` advisories. Moderate findings include DOMPurify, uuid, langsmith, axios/follow-redirects, postcss, and esbuild paths.
- Action: no dependency upgrades in this cleanup batch. Dependency upgrades change non-functional/security posture and need their own review and rollback window.
- Verification:
  - `pnpm audit --audit-level moderate`: fails, 24 vulnerabilities.
- Public surface delta: none.
- Rollback: no source change to roll back.

## Current Verification Snapshot

- Branch observed: `april-ai-rot-cleanup`.
- `pnpm run build`: pass.
- `pnpm test -- --run`: pass, 63 files and 1016 tests.
- `pnpm test:e2e`: pass, 16 tests.
- `pnpm run lint`: still fails, now 545 errors and 1 warning. This is better than the post-parser known-red count and no longer includes the original parse blocker.
- `pnpm audit --audit-level moderate`: still fails, 24 vulnerabilities.
- Playwright-generated `playwright-report/index.html` was restored after verification.
- Current dirty worktree is limited to pre-existing/unrelated `CLAUDE.md`, `CODEX.md`, untracked `.zflow/`, and untracked `docs/reviews/architecture-assessment-2026-04-25.md`.

## Diff Metrics For Implemented Cleanup Commit

- Commit observed at `HEAD`: `d9572ef refactor(electron): decompose main process and tighten IPC types`.
- Files changed: 10.
- Insertions/deletions: 378 added, 287 removed.
- New files: `__tests__/e2e/helpers.ts`, `electron/runtime.ts`, `electron/sync-events.ts`, `electron/window.ts`.
- Public API surface delta: none intended; IPC channel names, settings file shape, DB schema, and OAuth token file format unchanged.
