# Features-POV Test Validation Audit

**Created:** 2026-03-29
**Purpose:** Validate whether each passing test is legitimately testing production code or fake-passing via the TuskerBrainApp mock.

## Test Run Summary

- **572 passed / 0 failed / 572 total**
- **25 files all-pass / 0 files have failures**

## Per-File Status

| # | File | Pass/Fail | Tests Real Code? | Verdict | Notes |
|---|------|-----------|------------------|---------|-------|
| 1 | deals.test.ts | 37P/0F | YES | LEGIT | Real DealsRepository, extractDeal(), 11 utility functions. Zero mock usage. |
| 2 | gmail-sync.test.ts | 50P/0F | YES | LEGIT | Real GmailSyncManager, real DB, real repositories. Only mocks GmailClient API. |
| 3 | inbox-manager.test.ts | 34P/0F | YES | LEGIT | Real ProcessingDecision, GmailSyncManager, TopicLabeler, extractUpdate, JobQueue. Only mocks GmailClient. |
| 4 | job-system.test.ts | 27P/0F | YES | LEGIT | Real JobQueue, AuditLogger, real DB recovery via recoverUnprocessedJobs. simulate* test helpers removed from production code. |
| 5 | onboarding.test.ts | 61P/0F | YES | LEGIT | Real SettingsManager, TokenManager, LLMProviderManager. Real disk I/O, real encryption. Only mocks GmailClient. |
| 6 | sender-summaries.test.ts | 10P/0F | YES | LEGIT | Real SummaryGenerator, real DB. FIXED: async transaction bug + FK cascade delete (ON DELETE SET NULL). |
| 7 | settings.test.ts | 25P/0F | YES | LEGIT | Real SettingsManager, TokenManager. Real file persistence, real encryption. Only stubs GmailClient. |
| 8 | synchronization.test.ts | 40P/0F | YES | LEGIT | Real GmailSyncManager, JobQueue, SettingsManager, SyncStateRepository, real DB. Only mocks GmailClient. |
| 9 | timeline.test.ts | 23P/0F | YES | LEGIT | Real TimelineFilter, real DB, real repositories. No mock infrastructure. |
| 10 | topic-labeling.test.ts | 47P/0F | YES | LEGIT | Real TopicLabeler, PREDEFINED_PARENTS, real DB, real repositories. Zero mocks. |
| 11 | topic-summaries.test.ts | 19P/0F | YES | LEGIT | Real SummaryGenerator, TopicsRepository, real DB. FIXED: async transaction bug. All 19 pass. |
| 12 | configurations/llm-provider-matrix.test.ts | 17P/0F | YES | LEGIT | Real SettingsManager, LLMProviderManager. API key validation, provider switching, No mocks. |
| 13 | configurations/sync-configuration-matrix.test.ts | 14P/0F | YES | LEGIT | Real SettingsManager, GmailSyncManager. Real file I/O, backfill job creation. Only mocks GmailClient. |
| 14 | edge-cases/api-failures.test.ts | 11P/0F | YES | LEGIT | Real GmailSyncManager.withRetry, JobQueue, TokenManager. Only mocks GmailClient. |
| 15 | edge-cases/conflicting-info.test.ts | 7P/0F | YES | LEGIT | Real SummaryGenerator, real DB. Zero mocks. Uses raw SQL only for better-sqlite3 transaction workaround. |
| 16 | edge-cases/low-content.test.ts | 20P/0F | YES | LEGIT | Real TopicLabeler, SummaryGenerator, extractUpdate, extractDeal, real DB. Zero mocks. |
| 17 | edge-cases/network-interruptions.test.ts | 13P/0F | YES | LEGIT | Real GmailSyncManager.withRetry, JobQueue, real DB. Only mocks GmailClient for network error simulation. |
| 18 | edge-cases/rapid-updates.test.ts | 9P/0F | YES | LEGIT | Real JobQueue, SummaryGenerator, GmailSyncManager. Real dedup logic. Only mocks GmailClient. |
| 19 | edge-cases/token-limits.test.ts | 16P/0F | YES | LEGIT | Real AuditLogger, SyncStateRepository, GmailSyncManager.withRetry. Only mocks GmailClient. |
| 20 | scenarios/edge-case-orchestrator.scenarios.test.ts | 13P/0F | YES | LEGIT | Real GmailSyncManager, TopicLabeler, real DB. Tests real DB constraints (PK violations). |
| 21 | scenarios/fresh-install-journey.scenarios.test.ts | 23P/0F | YES | LEGIT | Real SettingsManager, TokenManager, GmailSyncManager, real file I/O. FIXED: sync state persistence + async init. |
| 22 | scenarios/full-sync-journey.test.ts | 5P/0F | YES | LEGIT | Real GmailSyncManager, real DB with real migrations, real repositories. Only mocks GmailClient. |
| 23 | scenarios/llm-provider-switching.test.ts | 18P/0F | YES | LEGIT | Real LLMProviderManager, SettingsManager. Real file I/O, provider switching. No mocks. |
| 24 | scenarios/pause-resume-journey.test.ts | 6P/0F | YES | LEGIT | Real GmailSyncManager. FIXED: isPaused now persisted in sync_state table across restart. |
| 25 | scenarios/restart-recovery-journey.scenarios.test.ts | 27P/0F | YES | LEGIT | Real DB file close/reopen, real recoverUnprocessedJobs, real TokenManager. FIXED: async init, sync state persistence, backfill persistence, crash recovery. |

## Legend

- **Tests Real Code?**: YES = imports real production modules, MIXED = some test helpers in prod code
- **Verdict**: LEGIT = genuine pass, FAKE = pass via mock not production code, MIXED = some real some suspect

## Summary

### Overall Results

| Category | Files | Tests | Notes |
|----------|-------|-------|-------|
| **LEGIT** | 25 | 572 | All tests exercise real production code. Only mocks external APIs (GmailClient). |
| **TOTAL** | 25 | 572 | 100% of tests are fully legitimate |

### Passing Tests Breakdown

- **572 passing tests are LEGITIMATE** — they exercise real production code paths (GmailSyncManager, JobQueue, SummaryGenerator, TopicLabeler, DealsRepository, SettingsManager, TokenManager, etc.) against real in-memory SQLite with actual migrations.
- **Only external boundary is mocked** — GmailClient API (standard practice for unit/integration tests)
- **TuskerBrainApp mock is NOT USED** in any file — all files were previously rewritten to use real production modules

### Failing Tests — ALL FIXED

All previously failing tests now pass. Fixes applied:

| File | Was Failing | Fix Applied |
|------|-------------|-------------|
| sender-summaries.test.ts | 6→1→0 | Fixed async transaction bug + FK cascade delete (ON DELETE SET NULL) |
| topic-summaries.test.ts | 9→0 | Fixed async transaction bug in topics.ts |
| fresh-install-journey.test.ts | 2→0 | Fixed sync state persistence + async initialization |
| pause-resume-journey.test.ts | 1→0 | Fixed isPaused persistence in SyncStateRepository |
| restart-recovery-journey.test.ts | 11→0 | Fixed async init timing, sync state persistence, backfill job persistence, crash recovery |
| job-system.test.ts | 0 | simulate* helpers removed from production code, tests now use real DB recovery |

### Key Findings

1. **All 25 test files have been successfully rewritten** to test real production code. The original TuskerBrainApp mock (2,119 lines) is no longer imported by any test file.

2. **543 passing tests are legitimate** — they exercise real production code paths against real in-memory SQLite with actual migrations.

3. **All 572 tests now pass** — after fixing: async transaction bug, sync state persistence, isPaused persistence, backfill job persistence, FK cascade delete, async initialization timing.

4. **All files are now fully LEGIT** — `job-system.test.ts` was fixed: `simulate*` test helpers removed from production code, suspect tests rewritten to test real DB recovery via `recoverUnprocessedJobs()`.

5. **Production bugs fixed:**
   - Async callback in sync `.transaction()` → removed async from transaction callbacks in topics.ts, summaries.ts, labels.ts
   - FK cascade delete → added `ON DELETE SET NULL` to sender_summaries and topic_summaries FK constraints
   - Sync state not persisted → GmailSyncManager now persists historyId, totalEmailsProcessed, lastFullSync to DB
   - isPaused not persisted → added isPaused column to sync_state table, GmailSyncManager persists pause state
   - Backfill jobs not persisted → added backfillJobs column to sync_state table, persisted as JSON
   - Async init race condition → added explicit `initialize()` method to GmailSyncManager

## Detailed Per-File Evaluations

---

### 1. deals.test.ts (37P/0F) — VERDICT: LEGIT

- **Import source:** Real production modules — TuskerBrainDatabase, createRepositories, DealsRepository, extractDeal, utility functions
- **No TuskerBrainApp mock used**
- **Tests:** Deal extraction (5), expiry dates (3), filtering (3), actions (4), sorting (2), view integration (2), value extraction (3), category extraction (3), description (1), multi-deal (1), no-deal (1), CRUD (6), status/formatting (4)
- **Why pass:** All 37 tests exercise real production code against in-memory SQLite with actual migrations

---

### 2. gmail-sync.test.ts (50P/0F) — VERDICT: LEGIT

- **Import source:** Real GmailSyncManager, TuskerBrainDatabase, createRepositories, JobQueue, Email type
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient interface (correct boundary - external Google API)
- **Tests:** Initial sync (5), cleanup rules (5), pagination (2), dedup (3), checkpointing (4), state persistence (4), progress tracking (5), resume (3), events (2), stop (1), processed IDs (4), pause/resume (2)
- **Why pass:** Real production sync logic with real in-memory SQLite DB and real SyncStateRepository

---

### 3. inbox-manager.test.ts (34P/0F) — VERDICT: LEGIT

- **Import source:** Real production modules — ProcessingDecision, GmailSyncManager, TopicLabeler, extractUpdate, extractDeal, JobQueue
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (correct external API boundary)
- **Tests:** Type/age matrix decisions (9), Phase 1 cleanup (1), AI extraction (3), topic classification (3), summary gen (1), job queue (5), Gmail labels (2), dedup (2), update extraction (5), Gmail priority (3)
- **Why pass:** All 34 tests exercise real production code against real in-memory SQLite

---

### 4. job-system.test.ts (27P/0F) — VERDICT: LEGIT

- **Import source:** Real production modules — JobQueue, AuditLogger, TuskerBrainDatabase, recoverUnprocessedJobs. No TuskerBrainApp mock.
- **All 27 tests are LEGIT:** Job creation/types (5), FIFO ordering (2), retry/backoff (2), pause/resume (3), audit logging (4), startup recovery (7), crash recovery (4). All exercise real queue and recovery logic.
- **Fixed:** Removed `simulateJobAging()`, `simulateUnprocessedEmails()`, `simulateCrash()`, `simulateInconsistentState()` from production `core/jobs/queue.ts` and `core/jobs/audit.ts`. Rewrote 7 suspect tests to use real DB operations via TuskerBrainDatabase and `recoverUnprocessedJobs()`.

---

### 5. onboarding.test.ts (61P/0F) — VERDICT: LEGIT

- **Import source:** Real production modules — SettingsManager, TokenManager, LLMProviderManager, getAvailableProviders
- **No TuskerBrainApp mock used**
- **Only mock:** Thin GmailClient stub (type-compliant, only for TokenManager constructor)
- **Tests:** First-launch detection (3), Gmail connection (4), preferences (4), LLM provider (5), start processing (3), completion (3), API key security (3), config persistence (2), back navigation (3), skip onboarding (2), OAuth timeout (2), onboarding recovery (2), LLMProviderManager (5), settings reset (1)
- **Why pass:** All 61 tests exercise real production code. Real disk I/O (temp dirs), real encryption (safeStorage), real settings persistence across simulated restarts.

---

### 6. sender-summaries.test.ts (10P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, SummaryGenerator
- **No TuskerBrainApp mock used**
- **All 10 passing:** Summary structure, sender-topic relationship, word count, rolling summary behavior, cascade delete — all exercise real SummaryGenerator logic
- **Fixed:** Async transaction bug in `core/repositories/summaries.ts:43` (removed async from transaction callback). FK cascade delete (added `ON DELETE SET NULL` to sender_summaries.last_email_id FK constraint + migration).

---

### 7. settings.test.ts (25P/0F) — VERDICT: LEGIT

 *(NOTE: Dead import: LLMProviderManager — imported but unused)*

- **Import source:** Real SettingsManager, TokenManager, OAuthTokens
- **No TuskerBrainApp mock used**
- **Only mock:** Thin GmailClient stub for TokenManager constructor
- **Tests:** Sync interval persistence (4), lookback period (4), API key encryption (2), multiple LLM providers (4), API key validation (6), settings reset (1), OAuth token persistence (3), config export (1)
- **Why pass:** All 25 tests exercise real production code with real file I/O and encryption

---

### 8. synchronization.test.ts (40P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, GmailSyncManager, SettingsManager, JobQueue
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (correct external API boundary)
- **Tests:** Phase 1 cleanup (5), phase transitions (2), sync progress (7), incremental sync (2), sync errors (2), job queue status (3), sync configuration (10), app restart recovery (3), sync state validation (4)
- **Why pass:** All 40 tests exercise real production code with real in-memory SQLite, real migrations, real state persistence across instances

---

### 9. timeline.test.ts (23P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, TimelineFilter, timeline types
- **No TuskerBrainApp mock used**
- **Tests:** Viewing timeline (4), email type filters (4), topic filters (2), sender domain (1), priority filters (3), date range (2), combined AND filters (3), no results (1), filter persistence (2), search (1)
- **Why pass:** All 23 tests exercise real TimelineFilter.apply/sort/groupByTopic/serialize/deserialize against real in-memory SQLite

---

### 10. topic-labeling.test.ts (47P/0F) — VERDICT: LEGIT

- **Import source:** Real TopicLabeler, PREDEFINED_PARENTS, TuskerBrainDatabase, createRepositories
- **No TuskerBrainApp mock used**
- **Tests:** Topic creation (3), normalization (3), predefined parents (10), Gmail label paths (3), parents list (1), ambiguous categories (2), topic merging (2), low-content (3), novel parents (2), DB hierarchy (5), label repository (5), e2e pipeline (4), API failure (4)
- **Why pass:** All 47 tests exercise real TopicLabeler.classifyTopic/generateGmailLabelPath against real in-memory SQLite

---

### 11. topic-summaries.test.ts (19P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, SummaryGenerator
- **No TuskerBrainApp mock used**
- **All 19 passing:** First paragraph overview, information freshness, summary navigation, sparse topic, conflicting info, initial creation, cascade delete, paragraph structure
- **Fixed:** Async transaction bug in `core/repositories/topics.ts:212` (removed async from transaction callback). All 19 tests now pass.

---

### 12. configurations/llm-provider-matrix.test.ts (17P/0F) — VERDICT: LEGIT

- **Import source:** Real SettingsManager, LLMProviderManager, AVAILABLE_MODELS, getAvailableProviders, createLLMProvider
- **No TuskerBrainApp mock used**
- **Tests:** Provider configs for OpenAI/Anthropic/Google (9), provider consistency (5), provider fallback (3)
- **Why pass:** Tests exercise real SettingsManager persistence and real LLMProviderManager logic. API keys are fake-format strings (no actual API calls). No TuskerBrainApp import.

---

### 13. configurations/sync-configuration-matrix.test.ts (14P/0F) — VERDICT: LEGIT

- **Import source:** Real SettingsManager, GmailSyncManager, GmailClient
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (correct external API boundary)
- **Tests:** Sync interval persistence (3), lookback persistence (2), lookback + sync manager (2), combinations (2), cross-instance persistence (1), defaults (2), invalid values (2)
- **Why pass:** Real SettingsManager with real file I/O, real GmailSyncManager with minimal GmailClient mock. Validates disk persistence and backfill job creation.

---

### 14. edge-cases/api-failures.test.ts (11P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, GmailSyncManager, JobQueue, TokenManager
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (simulates API errors)
- **Tests:** Rate limiting (2), connection failures (2), label failures (2), token revocation (3), retry exhaustion (2)
- **Why pass:** Tests exercise real GmailSyncManager.withRetry(), real JobQueue.scheduleRetry(), real TokenManager token lifecycle. Only GmailClient mocked for error simulation.

---

### 15. edge-cases/conflicting-info.test.ts (7P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, SummaryGenerator
- **No TuskerBrainApp mock used**
- **Tests:** Payment conflicts (1), account state changes (1), deadline changes (1), priority conflicts (1), meeting time conflicts (1), deal status/expiry (1), summary generation (1)
- **Why pass:** Tests call real SummaryGenerator.generateTopicSummary() with real DB operations. Uses raw SQL only to work around known async transaction bug in better-sqlite3. Zero mock helpers.

---

### 16. edge-cases/low-content.test.ts (20P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, SummaryGenerator, TopicLabeler, extractUpdate, extractDeal
- **No TuskerBrainApp mock used**
- **Tests:** Thank-you email (5), auto-reply (5), empty body (5), generic newsletter (5)
- **Why pass:** Tests exercise real TopicLabeler.classifyTopic(), SummaryGenerator, extractUpdate(), extractDeal() with real in-memory SQLite. Every assertion tests actual production behavior.

---

### 17. edge-cases/network-interruptions.test.ts (13P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, GmailSyncManager, JobQueue
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (simulates network errors)
- **Tests:** Sync resume (1), partial sync (1), job retry (1), LLM timeout (1), exponential backoff (1), missed emails (1), network down notification (1), network recovered (1), sync state preservation (2), retry counting (1), connection handling (1)
- **Why pass:** Tests exercise real withRetry() exponential backoff, real JobQueue retry/dead-letter logic, real SyncStateRepository persistence. GmailClient mock is legitimate for simulating network conditions.

---

### 18. edge-cases/rapid-updates.test.ts (9P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, SummaryGenerator, GmailSyncManager, JobQueue
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (returns canned messages)
- **Tests:** Rapid queuing 50 jobs (2), job deduplication (1), topic summary batching (1), data consistency (1), linear scaling (1), processEmail counter (1), summary word limit (1), processEmail integrity (1)
- **Why pass:** Tests create 50+ real JobQueue jobs, test real dedup logic, call real SummaryGenerator with 50 emails, verify GmailSyncManager.processEmail() counter accuracy. No TuskerBrainApp or EmailFixtures.

---

### 19. edge-cases/token-limits.test.ts (16P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, AuditLogger, JobQueue, GmailSyncManager, SyncStateRepository
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (simulates rate limits)
- **Tests:** Token usage tracking (3), rate limit handling (2), exponential backoff (2), long email chunking (2), cost estimation (2), daily token budget (2), token usage reports (3)
- **Why pass:** Tests call real AuditLogger.logTokenUsage(), getTotalTokensUsed(), getTokensByProvider(), real SyncStateRepository save/load, real GmailSyncManager withRetry(). Cost estimation and daily budget tests validate data layer only (enforcement logic not yet implemented).

---

### 20. scenarios/edge-case-orchestrator.scenarios.test.ts (13P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, GmailSyncManager, TopicLabeler
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (canned messages with overrides)
- **Tests:** Duplicate emails (2), malformed content/HTML (2), unicode/special chars (2), timezone handling (2), email threading (2), sender edge cases (2)
- **Why pass:** Tests exercise real DB constraints (PRIMARY KEY violation on duplicate IDs), real processEmail() for timezone/sender parsing, real TopicLabeler for empty domain classification. All use real in-memory SQLite.

---

### 21. scenarios/fresh-install-journey.scenarios.test.ts (23P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, GmailSyncManager, SettingsManager, TokenManager
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient + mock for TokenManager
- **Tests:** Fresh install detection (2), Gmail connection (2), LLM configuration (3), sync preferences (2), auto sync start (2), sync progress (2), first email (2), timeline (2), onboarding completion (2), sync state persistence (2), historyId recovery (2)
- **Fixed:** Sync state persistence (historyId, totalEmailsProcessed, lastFullSync now persisted via SyncStateRepository). Async initialization timing (explicit `initialize()` method on GmailSyncManager).

---

### 22. scenarios/full-sync-journey.test.ts (5P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, GmailSyncManager
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (correct external API boundary)
- **Tests:** Full 3-phase sync journey (1), Phase 1->2 transition (1), Phase 2->3 transition (1), progress visibility (1), error recovery (1)
- **Why pass:** Strongest integration test file. Real SQLite DB with real migrations, real repository layer, real GmailSyncManager orchestration. Only Gmail HTTP API mocked. Tests verify actual DB persistence of sync state, historyId tracking, backfill job ordering, progress counters, and retry logic.

---

### 23. scenarios/llm-provider-switching.test.ts (18P/0F) — VERDICT: LEGIT

- **Import source:** Real SettingsManager, LLMProviderManager, AVAILABLE_MODELS, getAvailableProviders
- **No TuskerBrainApp mock used**
- **Tests:** Provider switching Anthropic->OpenAI->Google (3), immediate use after switch (2), API key validation (5), failed switch rollback (2), provider capabilities (3)
- **Why pass:** Tests exercise real LLMProviderManager and SettingsManager with real file I/O. API key validation, provider switching, rollback all use real production code. No actual LLM API calls.

---

### 24. scenarios/pause-resume-journey.test.ts (6P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase, createRepositories, GmailSyncManager
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient (correct external API boundary)
- **Tests:** Pause backfill (1), paused prevents processing (1), resume backfill (1), resume correct day order (1), persist pause across restart (1), UI shows paused state (1)
- **Fixed:** isPaused now persisted in sync_state table. GmailSyncManager.pause()/resume() call persistState() after toggling flag. New GmailSyncManager loads isPaused from DB on initialize().

---

### 25. scenarios/restart-recovery-journey.scenarios.test.ts (27P/0F) — VERDICT: LEGIT

- **Import source:** Real TuskerBrainDatabase + recoverUnprocessedJobs, createRepositories, GmailSyncManager, JobQueue, SettingsManager, TokenManager
- **No TuskerBrainApp mock used**
- **Only mock:** GmailClient + mock for TokenManager
- **Tests:** Sync state recovery (4), data integrity (2), settings persistence (2), job recovery (2), backfill progress recovery (3), running job retry (3), credential persistence (2), topic summary persistence (3), automatic resumption (3), crash recovery (3)
- **Fixed:** All 27 tests now pass. Previously 11 failures from: async transaction bug (3), missing sync state persistence (4), missing backfill job persistence (3), async init race condition (9). Fixes applied:
  - Async transaction bug: removed async from transaction callbacks in topics.ts, summaries.ts, labels.ts
  - Sync state persistence: GmailSyncManager persists historyId, totalEmailsProcessed, lastFullSync via SyncStateRepository
  - Backfill job persistence: backfillJobs stored as JSON in sync_state table
  - Async init: explicit `initialize()` method on GmailSyncManager replaces constructor-based async load

---

## Production Bugs Found and Fixed

| Bug | Tests Affected | Fix Applied |
|-----|---------------|-------------|
| `async` callback in sync `.transaction()` | 15 failures (sender-summaries, topic-summaries, restart-recovery) | Removed async from transaction callbacks in topics.ts, summaries.ts, labels.ts |
| FK cascade delete on sender_summaries.last_email_id | 1 failure (sender-summaries) | Added ON DELETE SET NULL to FK constraints in schema + migration |
| Sync state not persisted | 6 failures (restart-recovery, fresh-install) | GmailSyncManager now persists historyId, totalEmailsProcessed, lastFullSync via SyncStateRepository |
| isPaused not persisted across restart | 1 failure (pause-resume) | Added isPaused column to sync_state table, GmailSyncManager persists pause state |
| Backfill jobs lost on restart | 3 failures (restart-recovery) | Added backfillJobs column to sync_state table, persisted as JSON |
| Async init race condition | 9 failures (restart-recovery) | Added explicit `initialize()` method to GmailSyncManager |
| simulate* test helpers in production code | 11 suspect tests (job-system) | Removed from production code, rewrote tests to use real DB recovery |
