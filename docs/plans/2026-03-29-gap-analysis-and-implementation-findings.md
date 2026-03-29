# TuskerBrain Gap Analysis & Implementation Findings

**Created:** 2026-03-29
**Source:** Design doc (`2026-03-05-tuskerbrain-design.md`) vs codebase analysis
**Status:** Reference document for test fixes, missing tests, and implementation gaps

---

## Part 1: Current State

### Test Health

| Metric | Value |
|--------|-------|
| Total tests | 1,051 |
| Passing | 1,051 (100%) |
| Failing | 0 (0%) |
| Failing test files | 0 of 65 |

**All tests pass.** Migrated from `better-sqlite3` (C++ native) to `@libsql/client` (pure JS/WASM) to permanently eliminate the Electron/system Node.js ABI version conflict. No native modules remain.

### Implementation Completeness Matrix

| Feature Area | Design Spec | Implemented | Status |
|---|---|---|---|
| Database schema (15 tables) | Lines 207-430 | `database/schema.ts` + migrations | DONE |
| Database indexes (9+) | Lines 318-330 | `database/migrations/0000_initial.sql` lines 205-231 | DONE |
| Gmail OAuth | Lines 1197-1203 | `core/gmail/oauth.ts`, `electron/oauth-service.ts` | DONE |
| Gmail client + rate limiting | Lines 63-64, 567 | `core/gmail/client.ts`, `core/gmail/rate-limited-client.ts` (TokenBucket) | DONE |
| Gmail sync (initial + incremental) | Lines 100-117 | `core/gmail/sync.ts` (692 lines) | DONE |
| Email classification | Lines 82-98 | `core/workflows/nodes/classify.ts` | DONE |
| Age-based action rules | Lines 86-98 | `core/workflows/email-processing.ts` (ProcessingDecision) | DONE |
| LLM provider abstraction | Lines 71, 621-626 | `core/llm/provider.ts` (generateText, generateObject via Vercel AI SDK) | DONE |
| **LangGraph workflow** | Lines 434-462 | `core/workflows/langgraph-workflow.ts` (607 lines, uses LLM) | **HAS @ts-nocheck** |
| **Extraction (standalone node)** | Lines 254-295 | `core/workflows/nodes/extract.ts` | **RULE-BASED, no LLM** |
| **Summary generation** | Lines 137-150, 541-548 | `core/summaries/generator.ts` | **RULE-BASED, no LLM** |
| **Orchestrator summary methods** | Lines 541-558 | `core/orchestrator.ts` lines 387-411 | **STUB** ("In production, this would merge with existing summary using LLM") |
| Gmail label manager | Lines 183-205 | `core/labeling/manager.ts` | DONE |
| Topic labeling logic | Lines 151-181 | `core/labeling/labeler.ts`, `core/labeling/manager.ts` | DONE |
| Job queue + audit | Lines 541-598 | `core/jobs/queue.ts`, `core/jobs/audit.ts`, `core/jobs/runner.ts` | DONE |
| Timeline filtering | Lines 499-510 | `core/timeline/filter.ts` | DONE |
| Settings management | Lines 1060-1091 | `core/settings/manager.ts` | DONE |
| Security/encryption | Lines 1203-1217 | `core/security/encryption.ts` | DONE (untested in Electron) |
| IPC channels + handlers | Lines 459-493 | `electron/ipc/channels.ts`, `electron/ipc/handlers.ts` | DONE |
| Onboarding UI | Lines 1195-1200 | `src/components/Onboarding.tsx` | DONE |
| Timeline UI | Lines 499-510 | `src/components/screens/TimelineScreen.tsx` | DONE |
| Topics/Senders/Deals UI | Lines 1189-1194 | `src/components/screens/TopicsScreen.tsx`, `SendersScreen.tsx`, `DealsScreen.tsx` | DONE |
| Settings UI | Lines 1194 | `src/components/screens/SettingsScreen.tsx` | DONE |
| Zustand stores | Lines 489-498 | `src/stores/jobs.ts`, `settings.ts`, `timeline.ts` | DONE |
| **Utility process worker** | Lines 45-55 | `electron/utility/worker.ts` | **PLACEHOLDER** |

### Architecture: Dual Workflow Problem

Two parallel email processing paths exist:

1. **LangGraph workflow** (`core/workflows/langgraph-workflow.ts`) — Full graph with 7 nodes, uses LLM for classification/extraction/summarization/topic labeling. Has `@ts-nocheck`.
2. **Simple workflow** (`core/workflows/email-processing.ts`) — `ProcessingDecision` class with age-based rules + standalone `extractFromEmail()` in `extract.ts`. No LLM.

The **orchestrator** (`core/orchestrator.ts`) calls the LangGraph path via `processEmailWithWorkflow()`. But the standalone `extract.ts` and `email-processing.ts` are also imported by tests and potentially by other code. This creates confusion about which is the canonical path.

---

## Part 2: Fix Broken Tests

**Status: FIXED (2026-03-29) - Permanent solution implemented**

### Root Cause: better-sqlite3 Native Module + Electron ABI Conflict

**Symptom:** `TypeError: Cannot read properties of undefined (reading 'close')` in `afterEach` across 25 test files (484 of 1,051 tests failing).

**Actual cause:** `better-sqlite3` is a C++ native module compiled for a specific Node.js ABI. Electron bundles its own Node.js runtime (NODE_MODULE_VERSION 143) while the system Node.js uses a different ABI (141). Rebuilding for one broke the other - `pnpm dev` and `pnpm test` were mutually exclusive.

### Permanent Fix: Replace better-sqlite3 with @libsql/client

**What changed:**
- Replaced `better-sqlite3` (C++ native, sync) with `@libsql/client` (pure JS/WASM, async)
- Updated `drizzle-orm/better-sqlite3` driver to `drizzle-orm/libsql`
- Converted all raw SQL from sync (`db.getSqlite().exec()`) to async (`await db.execSql()`)
- Converted `core/repositories/sync-state.ts` from raw SQL to Drizzle ORM queries
- Updated seed files to use libsql client directly

**Files modified:** `database/index.ts`, `core/repositories/sync-state.ts`, `vite.config.ts`, `package.json`, 3 seed files, 20+ test files

**Dependencies removed:** `better-sqlite3`, `@types/better-sqlite3`, `@electron/rebuild`
**Dependencies added:** `@libsql/client`
**Scripts removed:** `postinstall` (electron-rebuild), `rebuild`

**Result:** All 1,051 tests pass. Both `pnpm dev` (Electron) and `pnpm test` (vitest) work without any native module rebuilding.

**Design spec:** `docs/superpowers/specs/2026-03-29-replace-better-sqlite3-with-libsql-design.md`

---

## Part 3: Implementation Gaps (Production Code)

### GAP-IMPL-1: LangGraph Workflow Has @ts-nocheck
- **Severity:** HIGH
- **Files:** `core/workflows/langgraph-workflow.ts:1`
- **Problem:** `@ts-nocheck` suppresses all TypeScript errors. The file is 607 lines and is the primary processing pipeline.
- **What "done" looks like:** Remove `@ts-nocheck`, fix all TypeScript errors, ensure `tsc --noEmit` passes.
- **Risk:** Runtime type errors in production because TS errors were hidden.

### GAP-IMPL-2: Orchestrator Has @ts-nocheck
- **Severity:** HIGH
- **Files:** `core/orchestrator.ts:1`
- **Problem:** Same as above. The orchestrator coordinates all email processing.
- **What "done" looks like:** Remove `@ts-nocheck`, fix all errors.

### GAP-IMPL-3: Summary Methods Are Stubs
- **Severity:** HIGH
- **Files:** `core/orchestrator.ts:387-411`
- **Problem:**
  - `updateTopicSummary()` (line 387) — Comment says "In production, this would merge with existing summary using LLM". Currently just stores the raw summary string without LLM merging.
  - `updateSenderSummary()` (line 396) — Creates a placeholder string `"Emails from ${domain}"` for new senders and doesn't update the summary text for existing senders.
- **What "done" looks like:**
  - `updateTopicSummary()` should fetch existing summary, call LLM to merge with new email content, enforce 3-4 paragraph / 500 word structure.
  - `updateSenderSummary()` should use the `SummaryGenerator` to produce actual summaries, not placeholder text.
  - Both should integrate with `core/summaries/generator.ts` or call LLM directly.

### GAP-IMPL-4: Standalone Extract Node Has No LLM
- **Severity:** MEDIUM
- **Files:** `core/workflows/nodes/extract.ts`
- **Problem:** `extractFromEmail()` uses regex and keyword matching. It never calls `generateObject()` or the LLM provider. The LangGraph workflow DOES use LLM for extraction (line 364), but the standalone function does not.
- **Context:** If the LangGraph path is the canonical path (called by orchestrator), the standalone function may only be used by tests. Needs clarification.
- **What "done" looks like:** Either (a) make standalone extract use LLM, or (b) remove it if LangGraph is the only consumer.

### GAP-IMPL-5: Summary Generator Has No LLM
- **Severity:** MEDIUM
- **Files:** `core/summaries/generator.ts`
- **Problem:** Template-based generation only. No `import` of LLM provider, no `generateText`/`generateObject` calls. The LangGraph summarize node (line 464) does call `llmProvider.generateText()`, but `SummaryGenerator` class does not.
- **Context:** Same dual-path issue as extract. LangGraph handles summarization in-workflow, but `SummaryGenerator` is a standalone class.
- **What "done" looks like:** Either integrate LLM into `SummaryGenerator`, or confirm it's only used by tests and the LangGraph path handles all production summarization.

### GAP-IMPL-6: Utility Process Worker Is Placeholder
- **Severity:** MEDIUM
- **Files:** `electron/utility/worker.ts`
- **Problem:** Structure exists but handlers are default/empty. Job processing runs in main process instead.
- **What "done" looks like:** Implement real job handlers in utility process, wire up message passing from main process. Or remove if main-process processing is acceptable for v1.
- **Design spec reference:** Lines 45-55, 393-404 specify UtilityProcess for background processing.

### GAP-IMPL-7: Dual Workflow Confusion
- **Severity:** MEDIUM
- **Files:** `core/workflows/email-processing.ts`, `core/workflows/langgraph-workflow.ts`, `core/workflows/nodes/extract.ts`, `core/summaries/generator.ts`
- **Problem:** Two parallel processing paths exist. The orchestrator uses LangGraph. But `email-processing.ts` (ProcessingDecision + decide) and `extract.ts` (extractFromEmail) provide a simpler parallel path. Tests import from both. It's unclear which is canonical.
- **What "done" looks like:** Decide on one path. If LangGraph is canonical (it is — orchestrator calls it), then `email-processing.ts`'s `ProcessingDecision` should be extracted as a shared utility and `extract.ts`'s standalone function should be removed or clearly marked as test-only.

### GAP-IMPL-8: safeStorage Untested in Electron Context
- **Severity:** LOW (for findings doc, HIGH for production)
- **Files:** `core/security/encryption.ts`
- **Problem:** Falls back to base64 encoding outside Electron. All tests run outside Electron, so encryption is never tested with real `safeStorage`. The fallback means secrets are stored in plaintext during testing.
- **What "done" looks like:** E2E test using Playwright in Electron context that verifies safeStorage encryption works. This is noted in design spec line 968: "safeStorage: Test in Electron context (Playwright)".

---

## Part 4: Missing Test Coverage (New features-pov Tests Needed)

### Testing Principles (from Design Spec)

- "No mocking or faking — Test against real dependencies" (except external APIs)
- Tests organized by feature, not code structure
- POV tests = user outcome tests ("user can do X")
- Feature tests = internal implementation tests

### GAP-TEST-1: OAuth Connection Flow
- **Severity:** HIGH
- **Design ref:** Lines 692-716
- **What exists:** Token management tests exist but test internals (storage, refresh). No POV test for the actual OAuth authorization journey.
- **Missing tests:**
  - User clicks "Connect Gmail" → OAuth URL is generated with correct scopes
  - OAuth callback is received → tokens are exchanged and stored
  - Access token expires mid-session → automatic refresh happens transparently
  - User revokes Gmail access → app handles 401 gracefully, shows re-connect prompt
  - User denies OAuth consent → app shows appropriate error
- **File to create:** `__tests__/features-pov/oauth-connection-flow.test.ts`

### GAP-TEST-2: LangGraph Workflow End-to-End
- **Severity:** HIGH
- **Design ref:** Lines 434-462
- **What exists:** `__tests__/workflows/langgraph-workflow.test.ts` exists but tests individual nodes. No POV test for the full pipeline from raw email to stored results.
- **Missing tests:**
  - Regular email → classified → update extracted → topic assigned → labeled → summarized → marked processed
  - Promotional email → classified → deal extracted → topic assigned → labeled → summarized
  - Old promotional email → classified → routed to delete (no AI extraction)
  - Old regular email → routed to archive
  - Email with Gmail "important" flag → gets high priority in extraction
- **File to create:** `__tests__/features-pov/email-processing-pipeline.test.ts`

### GAP-TEST-3: Gmail Label Sync
- **Severity:** HIGH
- **Design ref:** Lines 183-205
- **What exists:** `core/labeling/manager.ts` is implemented but tests only verify the logic, not actual Gmail API integration.
- **Missing tests:**
  - New topic created → `TuskerBrain/Topic/Parent/Child` label created in Gmail
  - New sender domain → `TuskerBrain/Sender/domain` label created in Gmail
  - Email processed → `TuskerBrain/Processed` label applied in Gmail
  - Label hierarchy is correct (parent labels exist before children)
  - Existing labels are reused (not duplicated)
- **File to create:** `__tests__/features-pov/gmail-label-sync.test.ts`

### GAP-TEST-4: Topic Assignment 5-Step Logic
- **Severity:** MEDIUM
- **Design ref:** Lines 159-167 (5-step AI topic assignment)
- **What exists:** `__tests__/features-pov/topic-labeling.test.ts` has 51 tests covering basic scenarios.
- **Missing tests (explicit step verification):**
  - Step 1: Email matches existing topic by name → assigned to that topic (no new topic created)
  - Step 2: Email doesn't match existing but fits predefined parent → new child created under parent
  - Step 3: Email doesn't fit any predefined parent → new parent AND child created
  - Step 4: Topic names are normalized ("Chase Bank" → "Chase", "Amazon.com" → "Amazon")
  - Step 5: Multiple topics can be assigned to single email with confidence scores
- **File to add tests to:** `__tests__/features-pov/topic-labeling.test.ts`

### GAP-TEST-5: Settings Migration & Validation
- **Severity:** MEDIUM
- **Design ref:** Lines 1060-1091
- **What exists:** `__tests__/features-pov/settings.test.ts` has 40 tests covering basic CRUD.
- **Missing tests:**
  - Settings schema migration when version changes
  - Corrupted/incomplete settings file → graceful fallback to defaults
  - Invalid setting values → rejected with clear error
  - Settings reset → all values return to defaults
- **File to add tests to:** `__tests__/features-pov/settings.test.ts`

### GAP-TEST-6: Summary Generation Quality
- **Severity:** MEDIUM
- **Design ref:** Lines 541-548, 957-998
- **What exists:** `__tests__/features-pov/topic-summaries.test.ts` (25 tests) and `sender-summaries.test.ts` (14 tests) cover structure and counts.
- **Missing tests:**
  - First paragraph is always high-level overview (not detail)
  - Summary stays within 500 words after 50+ updates
  - Older information gets progressively less emphasis
  - Conflicting information is handled (e.g., price went up then down)
  - Topic summary survives app restart (DB persistence)
  - Sender summary accumulates across multiple emails from same domain
- **File to add tests to:** `__tests__/features-pov/topic-summaries.test.ts`, `sender-summaries.test.ts`

### GAP-TEST-7: Job Queue Advanced Scenarios
- **Severity:** LOW
- **Design ref:** Lines 541-598
- **What exists:** `__tests__/features-pov/job-system.test.ts` has 50 tests covering core lifecycle.
- **Missing tests:**
  - Job timeout (job running too long gets killed)
  - Job cancellation (user cancels mid-processing)
  - Concurrent job processing limits
  - Audit log queries (user can see processing history)
  - Token usage aggregation across jobs
- **File to add tests to:** `__tests__/features-pov/job-system.test.ts`

### GAP-TEST-8: Security & Encryption
- **Severity:** LOW (in findings doc — requires Playwright/Electron E2E)
- **Design ref:** Lines 1203-1217
- **What exists:** `core/security/encryption.ts` has fallback logic but no Electron-context test.
- **Missing tests:**
  - API keys stored via safeStorage are not plaintext in DB
  - OAuth tokens stored via safeStorage are not plaintext
  - Encryption key rotation works
- **Note:** These require Playwright tests in Electron, not vitest. Track separately.
- **File to create:** `__tests__/e2e/security-encryption.e2e.test.ts`

---

## Part 5: Code Quality Issues

### CQ-1: @ts-nocheck on Critical Files

Two core files suppress TypeScript:
- `core/workflows/langgraph-workflow.ts` (607 lines, primary processing pipeline)
- `core/orchestrator.ts` (420 lines, coordinates everything)

These must be fixed before the codebase can be considered stable.

### CQ-2: Dual Workflow Paths

See GAP-IMPL-7. Resolution needed:
- **Recommended:** Keep LangGraph as canonical path. Extract `ProcessingDecision` (age/type rules) as a shared utility. Remove or clearly deprecate the standalone `extractFromEmail()` function.
- `email-processing.ts` should export only `ProcessingDecision` (shared logic used by both paths)
- `extract.ts` should either use LLM or be removed

### CQ-3: Repository Pattern Consistency

`core/repositories/` has 8 files. Verify they follow a consistent pattern:
- All should use Drizzle ORM (not raw SQL)
- All should have corresponding tests in `__tests__/repositories/`
- Return types should be the Drizzle inferred types from `database/schema.ts`

### CQ-4: Import Path Aliasing

Codebase uses `@core/` path aliases. Verify `tsconfig.json` and `vitest.config.ts` both resolve these identically to prevent test/prod divergence.

---

## Part 6: Execution Priority

### Phase 1: Stabilize (fix broken tests first)
1. Fix database lifecycle bug causing 484 test failures
2. Re-run tests and categorize remaining failures
3. Fix all remaining test failures (schema mismatches, logic changes, etc.)
4. Goal: 0 failing tests

### Phase 2: Fix Production Code Gaps
1. Remove `@ts-nocheck` from `langgraph-workflow.ts` and `orchestrator.ts` (GAP-IMPL-1, GAP-IMPL-2)
2. Implement proper summary methods in orchestrator (GAP-IMPL-3)
3. Resolve dual workflow confusion (GAP-IMPL-7)
4. Decide on utility process: implement or explicitly defer to v2 (GAP-IMPL-6)
5. Clarify role of standalone extract/summary vs LangGraph path (GAP-IMPL-4, GAP-IMPL-5)

### Phase 3: Fill Test Coverage Gaps
1. OAuth connection flow POV tests (GAP-TEST-1)
2. Full email processing pipeline POV tests (GAP-TEST-2)
3. Gmail label sync POV tests (GAP-TEST-3)
4. Topic assignment 5-step logic tests (GAP-TEST-4)
5. Settings resilience tests (GAP-TEST-5)
6. Summary quality tests (GAP-TEST-6)
7. Job queue advanced tests (GAP-TEST-7)

### Phase 4: Security & E2E
1. safeStorage E2E tests in Electron (GAP-IMPL-8, GAP-TEST-8)
2. Requires Playwright setup in Electron context
