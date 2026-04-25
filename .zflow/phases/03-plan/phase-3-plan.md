# Phase 3 Cleanup Plan

Status: awaiting approval. No app code has been changed.

## Planning Assumptions

- Observable behavior remains sacred unless explicitly approved.
- Known-red baselines are allowed scope: build, lint, e2e launch, dependency audit.
- `electron/main.ts` split is included because the user explicitly requested it.
- The split is not one giant refactor. It is staged behind a build repair and characterization checks.
- Every L2 batch below still needs explicit approval before execution.
- Every L3 item needs explicit approval and should usually be a separate PR or commit series.

## Batch 0: Generated Baseline Artifacts

**Change:** Decide what to do with Playwright-generated artifacts modified by `pnpm test:e2e`: `playwright-report/index.html` and `test-results/.last-run.json`.

**Risk class:** L1.

**Blast radius:** Working tree only; no app behavior.

**Behavior-preservation argument:** Restoring generated report artifacts or leaving them uncommitted does not affect runtime code.

**Verification:** `git status --short`.

**Commit shape:** No commit unless the team intentionally tracks updated reports.

**Rollback:** Restore those two generated files from git if they should not be part of cleanup.

**Approval needed:** Yes, because the files were changed by baseline commands, not by an intentional source edit.

## Batch 1: Build Syntax Repair

**Change:** Root-cause and repair the `electron/main.ts:1753` unexpected `}` failure without moving code or changing behavior.

**Risk class:** L1.

**Blast radius:** `electron/main.ts`, Electron build, app startup, e2e launch.

**Behavior-preservation argument:** A syntax repair should restore the intended existing control flow. Before editing, inspect the surrounding block and identify whether the extra brace is orphaned code, a broken catch/finally, or a merge artifact.

**Verification:** `pnpm exec tsc --noEmit`, `pnpm run build`, `pnpm test -- --run`, then `pnpm test:e2e` to see whether launch improves.

**Characterization first:** If the surrounding function has existing unit coverage, run that test before editing. If it has no local coverage and the syntax prevents building, use the pre-existing full test suite as the baseline and keep the patch minimal.

**Commit shape:** `fix: repair electron main build syntax`.

**Rollback:** `git revert` the commit or apply reverse patch for the exact syntax repair.

**Approval needed:** Already in scope as known-red cleanup. Proceed only when execution phase starts.

## Batch 2: App Launch / E2E Recovery

**Change:** Investigate why Playwright cannot launch Electron after Batch 1. Fix only the root cause. If teardown still calls `.close()` on an undefined app after launch is fixed, make teardown robust in the same e2e-only batch.

**Risk class:** L2.

**Blast radius:** E2E harness, Electron startup path, test environment setup, possibly `electron/main.ts` if startup code is the root cause.

**Behavior-preservation argument:** Intended behavior is unchanged: the app should launch. Test teardown changes are test-only.

**Verification:** `pnpm test:e2e`, `pnpm test -- --run`, `pnpm run build`.

**Characterization first:** Preserve the failing e2e output from Phase 1 as the reproduction. Do not change teardown before confirming launch root cause.

**Commit shape:** `fix: restore electron e2e launch`.

**Rollback:** Revert the e2e/startup commit.

**Approval needed:** L2 approval required.

## Batch 3: Split `electron/main.ts` - Window And App Lifecycle

**Change:** Extract BrowserWindow creation and app lifecycle helpers from `electron/main.ts` into an Electron-local module, likely under `electron/main/` or `electron/app/`, while preserving function names or call order where possible.

**Risk class:** L2.

**Blast radius:** Electron app startup, BrowserWindow options, dev/prod loading, auto-updater timing, shell/window event handlers, e2e launch tests.

**Behavior-preservation argument:** This is a move-only refactor for one seam. No BrowserWindow options, load URLs, event names, log lines, or app lifecycle conditions should change.

**Verification:** `pnpm exec tsc --noEmit`, `pnpm run build`, `pnpm test -- --run`, `pnpm test:e2e`. Compare relevant startup log output if the app launches.

**Characterization first:** After Batch 2, keep the app-launch e2e tests green before moving code. If no test covers a specific lifecycle branch, do not alter that branch beyond moving it.

**Commit shape:** `refactor: move electron window lifecycle from main`.

**Rollback:** Revert this single refactor commit.

**Approval needed:** L2 approval required.

## Batch 4: Split `electron/main.ts` - Runtime Services Composition

**Change:** Extract initialization and ownership of database, repositories, settings manager, LLM provider manager, OAuth service, job queue, sync manager, and utility process references into a small runtime-services module. Keep construction order identical.

**Risk class:** L2.

**Blast radius:** Database initialization, seed import behavior, repository construction, OAuth, settings, sync, job queue, utility process, IPC handler registration.

**Behavior-preservation argument:** The new module only groups existing mutable runtime references and initialization code. It should not introduce dependency injection frameworks, interfaces, or new lifecycle abstractions.

**Verification:** `pnpm exec tsc --noEmit`, `pnpm run build`, `pnpm test -- --run`, `pnpm test:e2e`. Re-run affected tests such as Electron initialization and startup recovery tests.

**Characterization first:** Run existing Electron initialization tests before and after. If construction order is unclear, stop and document the coupling instead of moving code.

**Commit shape:** `refactor: group electron runtime services`.

**Rollback:** Revert the runtime-services commit.

**Approval needed:** L2 approval required.

## Batch 5: Split `electron/main.ts` - Sync Scheduling And Progress Events

**Change:** Extract sync timer setup, sync progress event bridging, backfill event bridging, and periodic/incremental sync coordination from `electron/main.ts` into an Electron-local sync coordinator module.

**Risk class:** L2.

**Blast radius:** Gmail sync, sync timers, progress events, renderer sync UI, backfill flow, job queue interactions, OAuth-token refresh interactions.

**Behavior-preservation argument:** This is the riskiest part of the split. Preserve event names, payloads, timer intervals, logging, state transitions, and call order exactly.

**Verification:** `pnpm exec tsc --noEmit`, `pnpm run build`, `pnpm test -- --run`, sync-related unit/feature tests, and `pnpm test:e2e` if launch is green. Manual log comparison for representative sync/startup flow if possible.

**Characterization first:** Identify existing sync/backfill tests that cover event payloads. If coverage is missing, add characterization tests before extraction.

**Commit shape:** `refactor: move electron sync coordination`.

**Rollback:** Revert the sync-coordinator commit.

**Approval needed:** L2 approval required.

## Batch 6: IPC Contract Tightening

**Change:** Align `electron/ipc/channels.ts`, `electron/preload.ts`, and `src/hooks/ipc.ts` one channel family at a time. Start with type definitions only. Do not rename channels or normalize response envelopes yet.

**Risk class:** L2.

**Blast radius:** Renderer hooks, preload bridge, main IPC handlers, TypeScript checks.

**Behavior-preservation argument:** Type-only changes should not alter runtime output. Runtime normalization is excluded from this batch.

**Verification:** `pnpm exec tsc --noEmit`, `pnpm test -- --run`, targeted renderer/electron tests, lint delta for touched files.

**Characterization first:** Existing passing tests are sufficient for type-only channel declarations. Add tests only if a response shape is ambiguous and runtime code must change.

**Commit shape:** `refactor: type existing ipc contracts`.

**Rollback:** Revert channel-family commit.

**Approval needed:** L2 approval required.

## Batch 7: Local Lint And Dead-Matter Cleanup

**Change:** Remove local unused imports, unused types, narrating comments, and obvious dead stubs only where Phase 2 identified concrete evidence. Start with test helpers and UI files with L1 findings. Do not run `prettier --write .`.

**Risk class:** L1 unless deleting exported symbols, then L2.

**Blast radius:** Touched file and direct imports.

**Behavior-preservation argument:** Removing unused imports/comments has no runtime effect. Deleting exported stubs requires import graph confirmation.

**Verification:** `pnpm exec tsc --noEmit`, `pnpm test -- --run`, `pnpm run lint` and compare total lint errors to baseline. No new lint errors allowed.

**Characterization first:** Not needed for unused imports/comments. Required before deleting any exported runtime component.

**Commit shape:** `refactor: remove local dead test and ui scaffolding`.

**Rollback:** Revert the local cleanup commit.

**Approval needed:** L1 can proceed in execution. L2 deletions require approval.

## Batch 8: Seed/Demo Data Boundary Investigation

**Change:** Trace whether `database/seed.ts` can run in production or normal app startup because `electron/main.ts` imports it. If it is runtime-reachable, propose a behavior-preserving guard or a behavior-changing removal separately.

**Risk class:** Investigation is L1. Any runtime behavior change is L3.

**Blast radius:** First-run data, dev/test seed flows, database contents, e2e fixtures, app startup.

**Behavior-preservation argument:** Investigation changes nothing. Guarding or removing seed execution may change observable data.

**Verification:** Static call trace, `pnpm test -- --run`, app startup/e2e if modified.

**Characterization first:** If seed execution is changed, add a startup/seed characterization test first.

**Commit shape:** Investigation only: no commit. If changed later: `fix:` or `refactor:` depending on behavior.

**Rollback:** Revert seed-boundary commit if any.

**Approval needed:** L3 approval required for any runtime seed behavior change.

## Batch 9: Security And Dependency Follow-Up

**Change:** Address OAuth callback HTML escaping/redaction and dependency advisories.

**Risk class:** L3.

**Blast radius:** OAuth callback UX/logs, dependency graph, dev server/build tooling, DOMPurify usage, UUID behavior, LangSmith/LangChain transitive dependencies, electron-builder transitive dependencies.

**Behavior-preservation argument:** Security fixes may intentionally change logs, HTML output, or package versions. They should not be bundled with refactors.

**Verification:** `pnpm audit --audit-level moderate`, `pnpm test -- --run`, `pnpm exec tsc --noEmit`, `pnpm run build`, OAuth tests, and manual OAuth callback behavior if practical.

**Characterization first:** Add/identify tests for OAuth callback error rendering before changing HTML. For dependencies, inspect changelogs and lockfile delta.

**Commit shape:** Separate `fix:` commits per security issue or dependency family.

**Rollback:** Revert each security/dependency commit independently.

**Approval needed:** Explicit L3 approval required.

## Recommended Execution Order

1. Batch 0: generated artifact decision.
2. Batch 1: build syntax repair.
3. Batch 2: e2e launch recovery.
4. Batch 3: move Electron window lifecycle.
5. Batch 4: group Electron runtime services.
6. Batch 5: move sync coordination.
7. Batch 6: type existing IPC contracts.
8. Batch 7: local lint/dead-matter cleanup.
9. Batch 8: seed/demo boundary investigation.
10. Batch 9: security/dependency follow-up.

## Approval Matrix

| Batch | Risk | Approval before execution |
| --- | --- | --- |
| 0 | L1 | Yes, because generated artifacts changed during baseline |
| 1 | L1 | Included in approved cleanup scope |
| 2 | L2 | Required |
| 3 | L2 | Required |
| 4 | L2 | Required |
| 5 | L2 | Required |
| 6 | L2 | Required |
| 7 | L1/L2 | Required only for exported-symbol deletion |
| 8 | L1/L3 | Required for any behavior change |
| 9 | L3 | Required |

## What This Plan Deliberately Does Not Do

- No database schema changes.
- No IPC channel renames.
- No settings file format changes.
- No OAuth token file format changes.
- No app-wide error-handling rewrite.
- No single massive `electron/main.ts` extraction.
- No dependency upgrades bundled with source refactors.
