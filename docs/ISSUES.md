# TuskerBrain Implementation Issues

**Audited**: 2026-03-28 (database), 2026-03-28 (features)
**Validated**: 2026-03-28 (database), 2026-03-28 (features — full code audit)
**Re-validated**: 2026-03-28 (features — deep source code verification)
**Scope**: `database/`, `core/`, `electron/`, `src/`, `__tests__/features-pov/`

---

# Part 1: Database Implementation

---

## Open Issues

### H3. `async` Wrapper on Synchronous Library
**Files**: All repositories
**Status**: Deferred — cosmetic, not functional

`better-sqlite3` is entirely synchronous, yet every repository method is `async`. This adds unnecessary microtask overhead and misleadingly implies I/O-bound operations. The Drizzle wrapper for better-sqlite3 also returns synchronously — these should not be awaited.

### H5. Topics Self-Referencing FK — Blocked by Drizzle
**Files**: `database/schema.ts:70`
**Status**: Blocked — TypeScript TS2577 circular reference

The design doc specifies `parent_id TEXT REFERENCES topics(id) ON DELETE SET NULL`. Drizzle ORM triggers a circular type error when a table references itself via the builder API. See the inline comment in `schema.ts` for details. The `TopicsRepository` handles parent deletion in application code as a workaround.

---

## Fixed (2026-03-28)

| Issue | Description | Fix |
|-------|-------------|-----|
| C1 | Dual DDL/Drizzle source of truth | Replaced raw SQL with Drizzle `migrate()` |
| C2 | Timestamp mode mismatch (year 56000+) | Changed all columns to `timestamp_ms` |
| C3 | `@ts-nocheck` on 3 repository files | Removed, fixed all type errors |
| H1 | No transactions on multi-table ops | Added `db.transaction()` to critical paths |
| H2 | Dead channel definitions in channels.ts | Removed unused `DB_*` entries |
| H4 | Missing composite PKs on junction tables | Added `primaryKey()` to `emailTopics`, `emailLabels` |
| M1 | Types file used `$inferInsert` only | Now exports both `$inferSelect` and `$inferInsert` |
| M2 | Duplicate type definitions | Consolidated to single source, re-exported |
| M3 | Labels `count()` returned ID, not count | Fixed to `sql<number>\`count(*)\`` |
| M4 | Dead `inClause` variable in `getTopicDetail` | Removed |
| M5 | Timeline `findAll` produced duplicate rows | Two-query approach with `TopicInfo` |
| M6 | `findExpiring` compared int vs ISO string | Fixed to compare ms timestamps |
| M7 | seed.ts wrote `emailCount` to `update_count` | Fixed to use `1` |
| L1 | Unused `app` import in database/index.ts | Removed with DDL deletion |
| L2 | No migration strategy | Added Drizzle migrations + `migrate()` |

---

# Part 2: Feature & Capability Gaps

**Audited**: 2026-03-28
**Re-validated**: 2026-03-28 (deep source code audit of all 57 issues)
**Source**: 215 failing tests across 23 files in `__tests__/features-pov/`

## Validation Methodology

Each issue was validated against the actual production source code (not the test harness). Three categories emerged:

| Category | Description | Count | Action |
|----------|-------------|-------|--------|
| **A: Implemented** | Feature exists in production code. Test uses mock harness, not real code. | 21 | Switch test to real code, verify wiring passes |
| **B: Partial Gap** | Feature partially exists with specific integration gaps. | 20 | Fix specific gaps, switch test to real code, verify |
| **C: Not Implemented** | Feature does not exist in production code. | 16 | Implement feature, then test against real code |

**Root cause of test failures**: All features-pov tests import `TuskerBrainApp` from `@test-helpers/app` — a mock implementation that simulates app behavior without calling any real production code. Tests fail because the mock doesn't simulate features that actually exist in production code.

**Fix path for all categories**: Switch tests from `@test-helpers/app` mock to real production imports → run tests → fix any wiring issues that surface.

---

## Category A: Implemented — Needs Real Test + Wiring Verification (21 issues)

These features exist and work in production code. Tests fail only because they use the mock harness.

### H-F1. Topic Name Normalization
**Implemented in**: `core/labeling/labeler.ts:111-127` (normalization map), `labeler.ts:294-314` (`normalizeChildTopic()`)
**Tests**: `__tests__/features-pov/topic-labeling.test.ts` (2 failures)

Normalization strips TLDs (`.com`, `.net`), company suffixes (`Inc`, `LLC`), bank suffixes, and applies a predefined mapping (e.g., `amazon.com` → `Amazon`, `amazon prime` → `Amazon`, `chase bank` → `Chase`, `jpmorgan chase` → `Chase`). Test mock doesn't simulate this.

### H-F3. Gmail Label Integration
**Implemented in**: `core/labeling/manager.ts:68-257`
**Tests**: `__tests__/features-pov/topic-labeling.test.ts` (4 failures)

Full implementation: `ensureTopicLabels()` creates `TuskerBrain/Topic/{parent}/{child}` labels, `applyProcessedLabel()` creates and applies `TuskerBrain/Processed`, `applyAllLabels()` applies all labels in one API call. Includes retry with exponential backoff and graceful handling of "already exists" (HTTP 409).

### H-F4. Structured Summary Paragraphs
**Implemented in**: `core/workflows/prompts/summarization.ts:40-60` (prompt), `core/summaries/generator.ts:212-256` (generator)
**Tests**: `__tests__/features-pov/topic-summaries.test.ts`, `__tests__/features-pov/sender-summaries.test.ts` (5 failures)

Summarization prompt enforces "3-4 paragraphs" with "First paragraph: Always high-level overview". Generator builds structured paragraphs: Overview → Key themes → Recent updates → Older context (optional). `MIN_PARAGRAPHS = 3`, `MAX_PARAGRAPHS = 4` enforced.

### H-F7. Dollar Amount and Discount Extraction
**Implemented in**: `core/workflows/prompts/extraction.ts:52-63, 132-137` (prompt + schema), `core/workflows/nodes/extract.ts:417-429` (`extractDealValue()`)
**Tests**: `__tests__/features-pov/deals.test.ts` (3 failures)

Prompt requests "Deal value: The discount percentage or amount". Schema has `dealValue: z.string().optional()` and `dealValueType`. `extractDealValue()` extracts percentage discounts (`\d+% off`) and dollar amounts (`save $\d+`). Stored in `deals` table.

### H-F8. Deal Category Extraction
**Implemented in**: `core/workflows/prompts/extraction.ts:61, 137`, `database/schema.ts:49`
**Tests**: `__tests__/features-pov/deals.test.ts` (3 failures)

Prompt requests "Category: Product category". Schema has `dealCategory: text('deal_category')`. Field is populated by LLM extraction.

### H-F10. Batch Operations for Gmail Sync
**Implemented in**: `core/gmail/sync.ts:489-520` (`applyCleanupRules()`), `core/gmail/client.ts:47-59` (`batchModifyMessages()`)
**Tests**: `__tests__/features-pov/gmail-sync.test.ts` (2 failures)

`applyCleanupRules()` batches archive and delete operations. Uses `batchModifyMessages()` with fallback to individual `modifyMessage()` calls. Operations execute in parallel via `Promise.all()`.

### H-F11. Rate Limit Handling for Gmail API
**Implemented in**: `core/gmail/rate-limited-client.ts:6-89` (token bucket), `core/gmail/sync.ts:172-210` (`withRetry()`)
**Tests**: `__tests__/features-pov/gmail-sync.test.ts`, `__tests__/features-pov/edge-cases/api-failures.test.ts` (4 failures)

`TokenBucket` class implements configurable rate limiting (default 250 quota/sec). `withRetry()` adds exponential backoff (max 5 retries, base 1000ms) for rate limit errors (429) and network errors (ECONNRESET, ENOTFOUND, ETIMEDOUT). All Gmail API calls wrapped with retry.

### H-F13. Phase 1 Cleanup Rules
**Implemented in**: `core/gmail/sync.ts:452-536` (`applyCleanupRules()`)
**Tests**: `__tests__/features-pov/synchronization.test.ts` (4 failures)

Cleanup uses `ProcessingDecision.decide(email)` from workflow engine. Maps decisions to actions: `process` → archive, `delete` → trash, `extract_deals` → no cleanup. Batch operations for efficiency.

### M-F2. Low-Content Emails Get Topic Assignment
**Implemented in**: `core/labeling/labeler.ts:140-174` (`classifyTopic()`), `labeler.ts:204-253` (`determineParentTopic()`)
**Tests**: `__tests__/features-pov/edge-cases/low-content.test.ts`, `__tests__/features-pov/topic-labeling.test.ts` (6 failures)

`classifyTopic()` always returns a topic. `determineParentTopic()` defaults to "Personal" for unclassifiable emails. `determineChildTopic()` extracts from sender name/domain even with minimal content.

### M-F3. Sentiment and Entity Extraction
**Implemented in**: `core/workflows/nodes/extract.ts:337-347` (`determineSentiment()`)
**Tests**: `__tests__/features-pov/inbox-manager.test.ts` (5 failures)

Sentiment extraction (positive/neutral/negative) exists. `ExtractedUpdate` includes `financialImpact` field and `keyEntities` with dates, amounts, names arrays. All stored in `timelineUpdates` table.

### M-F4. Gmail Important Flag Used for Priority
**Implemented in**: `core/workflows/nodes/extract.ts:276-289` (`determinePriority()`)
**Tests**: `__tests__/features-pov/inbox-manager.test.ts` (3 failures)

`determinePriority()` checks `email.isImportant` first — always returns `'high'` when true. Additional logic for urgency keywords and sender patterns.

### M-F5. Promotional Email Without Deal Handling
**Implemented in**: `core/workflows/nodes/extract.ts:244-250`
**Tests**: `__tests__/features-pov/deals.test.ts` (1 failure)

If promotional classification AND deal extraction returns null, `extractFromEmail()` returns `{ type: 'none' }` — no deal record created. Test mock doesn't simulate this path correctly.

### M-F6. Summary Schema Fields Populated
**Implemented in**: `database/schema.ts:92-100` (schema), `core/repositories/topics.ts:206-248` (`upsertSummary()`)
**Tests**: `__tests__/features-pov/topic-summaries.test.ts` (2 failures)

`wordCount` and `lastEmailId` are defined in schema and populated by `upsertSummary()`.

### M-F8. Back Navigation in Onboarding
**Implemented in**: `src/components/Onboarding.tsx:29, 212-223, 413-422`
**Tests**: `__tests__/features-pov/onboarding.test.ts` (3 failures)

`onGoBack` prop defined and wired. Back buttons rendered in PreferencesStep and LLMStep.

### M-F9. Skip Onboarding Option
**Implemented in**: `src/components/Onboarding.tsx`
**Tests**: `__tests__/features-pov/onboarding.test.ts` (2 failures)

Skip functionality exists and is tested in the test file (lines 345-358, 619-647).

### M-F26. Config Export/Import
**Implemented in**: `core/settings/manager.ts:287-305` (`exportSettings()`, `importSettings()`)
**Tests**: `__tests__/features-pov/settings.test.ts` (1 failure)

Export returns processingInterval, lookbackDays, version. Import accepts partial settings and applies them.

### M-F27. Settings Reset
**Implemented in**: `core/settings/manager.ts:310-340` (`resetAllSettings()`, `resetSetting()`)
**Tests**: `__tests__/features-pov/settings.test.ts` (1 failure)

`resetAllSettings()` clears all settings and reinitializes defaults. `resetSetting()` resets individual settings.

### M-F28. OAuth Token Persistence
**Implemented in**: `electron/oauth-service.ts:358-406` (`saveTokens()`, `loadTokens()`)
**Tests**: `__tests__/features-pov/settings.test.ts` (1 failure)

Tokens encrypted and saved to `app.getPath('userData')/oauth-tokens.enc`. Loaded and decrypted on initialization.

### L-F2. Sender Summary Word Count Validation
**Implemented in**: `core/summaries/generator.ts:13, 258-286` (`enforceWordLimit()`)
**Tests**: `__tests__/features-pov/sender-summaries.test.ts` (1 failure)

`MAX_WORDS = 500` enforced by `enforceWordLimit()` method. Applied to all summary generation.

### L-F3. Full Deal Description Extraction
**Implemented in**: `core/workflows/prompts/extraction.ts:52-54, 128-131` (prompt + schema)
**Tests**: `__tests__/features-pov/deals.test.ts` (1 failure)

`dealDescription: z.string().optional()` in schema. Prompt requests "Description: A brief description of the deal".

### L-F5. Default Sync Configuration Applied
**Implemented in**: `core/settings/manager.ts:42-43, 118-119, 128, 146`
**Tests**: `__tests__/features-pov/configurations/sync-configuration-matrix.test.ts` (2 failures)

`DEFAULT_PROCESSING_INTERVAL = 30`, `DEFAULT_LOOKBACK_DAYS = 30`. Applied in constructor, returned by getters when not set.

---

## Category B: Partial Gap — Needs Specific Fixes + Real Tests (20 issues)

Feature partially exists but has specific integration gaps or incomplete wiring.

### C-F1. Gmail Sync State Not Persisted Across Restarts
**Files**: `core/gmail/sync.ts`, `database/schema.ts`
**Tests**: `__tests__/features-pov/scenarios/restart-recovery-journey.scenarios.test.ts` (2 relevant failures)

**What works**: Database emails/deals/topics persist to SQLite. Settings persist via `settings.json`. OAuth tokens persist encrypted. Job queue recovers via `recoverUnprocessedJobs()`.

**Gap**: Gmail `historyId` stored in `SharedSyncState` (static in-memory class) — lost on restart. Database `syncState` table exists but never populated. After restart, incremental sync cannot resume.

### C-F2. Summaries Not Intelligently Merged with New Emails
**Files**: `core/orchestrator.ts:387-411`, `core/repositories/summaries.ts:42-80`
**Tests**: `__tests__/features-pov/topic-summaries.test.ts` (4 relevant failures)

**What works**: `upsertSenderSummary()` increments `updateCount` via SQL. `lastUpdated` timestamp updates. Both are called from `orchestrator.ts:326`.

**Gap**: Topic summaries just overwrite (`orchestrator.ts:390` — comment: "In production, this would merge with existing summary using LLM"). Sender summaries only update metadata, not content (lines 406-409). Neither merges new email insights into existing summary.

### H-F2. Multi-Topic Assignment Not Used in Workflow
**Files**: `core/workflows/email-processing.ts:258-270`, `database/schema.ts:84-90`
**Tests**: `__tests__/features-pov/topic-labeling.test.ts` (1 failure)

**What works**: `emailTopics` junction table with composite PK supports multiple topics. `topics.ts:148-157` has `linkEmail()` method for linking.

**Gap**: `email-processing.ts:268` sets `state.labels = []` — workflow only assigns single topic. No multi-topic classification logic in the processing pipeline.

### H-F5. Sender Summary Orphans on Email Deletion
**Files**: `database/schema.ts:94, 108`, `core/repositories/summaries.ts:136-140`
**Tests**: `__tests__/features-pov/topic-summaries.test.ts`, `__tests__/features-pov/sender-summaries.test.ts` (2 failures)

**What works**: Topic summaries have `onDelete: 'cascade'` in schema (line 94). `emailTopics` junction cascades on topic delete.

**Gap**: `senderSummaries` table has no FK to emails — no cascade. When all emails from a sender are deleted, sender summary remains orphaned. `deleteSenderSummary()` exists but never called automatically.

### H-F6. Sender Summaries Not Wired into Processing Workflow
**Files**: `core/summaries/generator.ts:62-99`, `core/orchestrator.ts`
**Tests**: `__tests__/features-pov/sender-summaries.test.ts` (5 failures)

**What works**: `generateSenderSummary()` method exists in generator. `upsertSenderSummary()` exists in repository. `orchestrator.ts:326` calls `updateSenderSummary()`.

**Gap**: Auto-creation on first email not triggered. `updateSenderSummary()` only updates metadata, not content. Sender-topic relationship not tracked.

### H-F12. OAuth Token Refresh Not Proactive During Long Syncs
**Files**: `core/auth/token-manager.ts:95-151`, `electron/oauth-service.ts:260-283`, `core/gmail/sync.ts`
**Tests**: `__tests__/features-pov/gmail-sync.test.ts` (2 failures)

**What works**: `getValidToken()` auto-refreshes with 5-minute buffer. `refreshTokenWithRetry()` retries up to 3 times. Invalid grant detection clears tokens and returns `needsReauth: true`.

**Gap**: Token refresh not proactively called during long-running sync operations. `sync.ts` doesn't check token validity mid-batch.

### H-F15. Two Settings Methods Missing
**Files**: `electron/ipc/handlers.ts:308-335`, `core/settings/manager.ts:345-383`
**Tests**: `__tests__/features-pov/settings.test.ts` (2 relevant failures)

**What works**: `setSyncInterval` → generic `settings:set`, `setLookbackDays` → generic `settings:set`, `saveApiKey` → `llm:provider:set`, `clearSettings` → `settings:reset`, `setLLMProvider` → `llm:provider:set`, `getLLMConfig` → `settings:get`.

**Gap**: `configureTokenBudget` and `getGmailConnectionStatus` — not implemented in any handler or settings method.

### H-F16. LLM API Calls Lack Retry Logic
**Files**: `core/llm/provider.ts:75-175`, `core/gmail/sync.ts:172-210`
**Tests**: `__tests__/features-pov/edge-cases/api-failures.test.ts`, `__tests__/features-pov/edge-cases/network-interruptions.test.ts` (4 relevant failures)

**What works**: Gmail API calls use `withRetry()` with exponential backoff (max 5 retries).

**Gap**: `core/llm/provider.ts` `generateText()` and `generateObject()` make direct calls to AI SDK without retry, error handling, or exponential backoff.

### H-F17. Missing getAppState for Fresh Install Detection
**Files**: `electron/ipc/handlers.ts`, `src/components/Onboarding.tsx:109-482`
**Tests**: `__tests__/features-pov/scenarios/fresh-install-journey.scenarios.test.ts` (2 relevant failures)

**What works**: Full onboarding flow in Onboarding.tsx (Gmail connection, LLM config, start processing). Sync triggered via `syncManager.startSync()`.

**Gap**: No `getAppState` IPC handler to detect fresh install vs returning user. Onboarding cannot be triggered conditionally.

### H-F18. Pause/Resume State Not Displayed in Frontend
**Files**: `core/gmail/sync.ts:126-134`, `electron/utility/sync-manager.ts:189-198`, `electron/ipc/handlers.ts:351-357`
**Tests**: `__tests__/features-pov/scenarios/pause-resume-journey.test.ts` (2 failures)

**What works**: Backend `pause()`/`resume()` methods exist. `sync:status` IPC returns `isPaused` in progress object.

**Gap**: Frontend components may not consume and display the pause state or show a resume button.

### M-F1. Topic Merging Limited to Predefined Map
**Files**: `core/labeling/labeler.ts:111-127`, `core/labeling/labeler.ts:294-315`
**Tests**: `__tests__/features-pov/topic-labeling.test.ts` (1 failure)

**What works**: `CHILD_NORMALIZATIONS` maps known variations (`chase bank` → `Chase`, `jpmorgan chase` → `Chase`). `normalizeChildTopic()` strips TLDs, company/bank suffixes.

**Gap**: Only predefined mappings — no fuzzy matching for unknown variations, no automatic alias discovery.

### M-F10. API Key Security Needs Verification
**Files**: `core/llm/provider-manager.ts:86`, `database/schema.ts:172-179`
**Tests**: `__tests__/features-pov/onboarding.test.ts` (2 relevant failures)

**What works**: Architecture uses `storageKey` reference pattern (not plaintext). `core/security/encryption.ts` provides encryption utilities.

**Gap**: Need audit verification that: encryption is applied consistently, keys are never logged, UI displays masked keys.

### M-F17. Sync Errors Logged but Not Shown to Users
**Files**: `core/gmail/sync.ts:172-210` (`withRetry()` logs to `console.warn`)
**Tests**: `__tests__/features-pov/synchronization.test.ts`, `__tests__/features-pov/edge-cases/network-interruptions.test.ts` (4 failures)

**What works**: Errors caught and logged with retry logic.

**Gap**: No user-facing notification mechanism. Rate limit hits, network interruptions, and recovery events are console-only.

### M-F18. Network Recovery Retries but Misses Emails During Extended Outage
**Files**: `core/gmail/sync.ts:172-210` (`withRetry()` retries up to 5 times)
**Tests**: `__tests__/features-pov/edge-cases/network-interruptions.test.ts` (2 failures)

**What works**: `withRetry()` implements exponential backoff for network errors.

**Gap**: After extended outage exceeds retry limit, no catch-up mechanism for emails that arrived during outage. Manual sync restart required.

### M-F19. Duplicate Detection In-Memory Only
**Files**: `core/gmail/sync.ts:110, 376-394` (`processedEmailIds` Set, `MAX_PROCESSED_IDS = 10000`)
**Tests**: `__tests__/features-pov/scenarios/edge-case-orchestrator.scenarios.test.ts` (2 failures)

**What works**: `processedEmailIds` tracks Gmail message IDs in memory. `fetchNewEmailsSince()` filters already-processed.

**Gap**: In-memory only, not persisted across restarts. Capped at 10,000 entries — older entries evicted.

### M-F20. Long Email Bodies Not Truncated
**Files**: `core/gmail/sync.ts:548-585` (`processEmail()`)
**Tests**: `__tests__/features-pov/scenarios/edge-case-orchestrator.scenarios.test.ts` (3 failures)

**What works**: Missing subjects handled with `|| ''` fallbacks. Empty snippets handled gracefully. `null` headers handled.

**Gap**: Extremely long email bodies not truncated before LLM processing — could cause token overflow or excessive cost.

### M-F24. Sender Parsing Edge Cases Not Handled
**Files**: `core/gmail/sync.ts:587-595` (`extractName()`, `extractDomain()`)
**Tests**: `__tests__/features-pov/scenarios/edge-case-orchestrator.scenarios.test.ts` (2 failures)

**What works**: `extractName()` handles `Name <email>` format. `extractDomain()` extracts from `@domain>`.

**Gap**: No explicit handling for special characters in names or system emails with no domain.

### M-F25. Topic Labeling Placeholder in Workflow
**Files**: `core/labeling/labeler.ts` (has determineParentTopic, determineChildTopic), `core/workflows/email-processing.ts:268` (`state.labels = []`)
**Tests**: `__tests__/features-pov/topic-labeling.test.ts` (2 failures)

**What works**: Labeler has full topic determination logic — parent categories, child topics, normalization.

**Gap**: `email-processing.ts:268` is a placeholder (`state.labels = []`). Labeler logic not wired into processing workflow.

### L-F1. Single-Email Summaries Could Be Enhanced
**Files**: `core/summaries/generator.ts:101-109`
**Tests**: `__tests__/features-pov/topic-summaries.test.ts` (1 failure)

**What works**: `createEmptySummary()` handles no-email case. Single-email summaries are generated with standard structure.

**Gap**: Could provide richer context for sparse topics — sender info, email metadata, suggested related topics.

### L-F4. No Memory Monitoring During Large Batches
**Files**: `core/gmail/sync.ts:116` (`MAX_PROCESSED_IDS = 10000`), `__tests__/features-pov/edge-cases/rapid-updates.test.ts`
**Tests**: `__tests__/features-pov/edge-cases/rapid-updates.test.ts` (2 failures)

**What works**: `processedEmailIds` capped at 10,000 with cleanup. Performance scaling tests exist.

**Gap**: No explicit memory monitoring or bounding during large batch processing. No abort mechanism if memory exceeds threshold.

---

## Category C: Not Implemented — Needs Full Implementation (16 issues)

Feature does not exist in production code.

### C-F3. Incremental Sync via Gmail historyId Not Integrated
**Files**: `core/gmail/sync.ts`
**Tests**: `__tests__/features-pov/gmail-sync.test.ts`, `__tests__/features-pov/synchronization.test.ts` (3 failures)

`SharedSyncState` class tracks `historyId` in-memory. `startIncrementalSync()` and `fetchNewEmailsSince()` methods exist (lines 333, 359). But: historyId never persisted to database, never restored on startup, never used in main `fetchAndQueueEmails()` workflow, no periodic incremental sync scheduled.

### H-F9. No Multiple Deals Per Email
**Files**: `core/workflows/nodes/extract.ts:178-225`
**Tests**: `__tests__/features-pov/deals.test.ts` (1 failure)

`extractDeal()` returns single `ExtractedDeal | null`. No array extraction, no loop to create multiple deal records. Database supports multiple deals per email (`deals.findByEmailId()` returns array).

### H-F14. Only 3 LLM Providers Supported
**Files**: `src/components/Onboarding.tsx:296-300`, `core/llm/provider.ts:8, 46-50`, `core/llm/provider-manager.ts:179`
**Tests**: `__tests__/features-pov/onboarding.test.ts`, `__tests__/features-pov/scenarios/llm-provider-switching.test.ts` (8 failures)

Only `openai`, `anthropic`, `google` in `ProviderName` type and `AVAILABLE_MODELS`. Onboarding shows only these 3. ZAI, OpenRouter, and Groq require: SDK dependencies, type extension, provider factory functions, UI updates.

### M-F7. No Contradictory Email Resolution in Summaries
**Files**: `core/workflows/prompts/summarization.ts`, `core/repositories/topics.ts:206-248`
**Tests**: `__tests__/features-pov/edge-cases/conflicting-info.test.ts`, `__tests__/features-pov/topic-summaries.test.ts` (7 failures)

Summarization prompt says "Highlight key changes and updates" but has no contradiction detection instructions. `upsertSummary()` replaces old summary — no timeline ordering, no "latest wins" logic.

### M-F11. No OAuth Timeout Handling
**Files**: `electron/oauth-service.ts`
**Tests**: `__tests__/features-pov/onboarding.test.ts` (2 failures)

No timeout on OAuth flow. No state invalidation if user abandons. Users can be stuck indefinitely on OAuth screen.

### M-F12. No Multi-Gmail Account Support
**Files**: `database/schema.ts:181-189` (`oauthTokens` has `default(1)` — single row)
**Tests**: `__tests__/features-pov/onboarding.test.ts` (2 failures)

Schema only allows one account. No disconnect-and-reconnect flow. No warning when attempting to add a second account.

### M-F13. No Token Budget Management
**Files**: `core/gmail/sync.ts:46` (tracks `totalTokensUsed` but no enforcement)
**Tests**: `__tests__/features-pov/edge-cases/token-limits.test.ts` (8 failures)

No daily/monthly budget setting, no warning thresholds, no hard stop when exhausted, no cost estimation, no per-provider breakdown.

### M-F14. No Long Email Chunking
**Files**: `core/llm/provider.ts`
**Tests**: `__tests__/features-pov/edge-cases/token-limits.test.ts` (2 failures)

No content length check before LLM call. No chunking strategy for emails exceeding context limits. Long emails either fail or get truncated by the API.

### M-F15. No Large Mailbox Handling Strategy
**Files**: `core/gmail/sync.ts`
**Tests**: `__tests__/features-pov/gmail-sync.test.ts` (3 failures)

No special handling for 10,000+ email mailboxes. No progressive sync. No memory bounding. No multi-session backfill. No progress preservation.

### M-F16. Phase Transitions Not Visible to Users
**Files**: `core/gmail/sync.ts` (3-phase architecture described in comments)
**Tests**: `__tests__/features-pov/synchronization.test.ts`, `__tests__/features-pov/scenarios/full-sync-journey.test.ts` (5 failures)

No phase state tracking exposed to UI. No progress percentage per phase. No transition notifications. No token usage display during sync.

### M-F21. No Unicode/Special Character Handling
**Files**: `core/workflows/prompts/extraction.ts`
**Tests**: `__tests__/features-pov/scenarios/edge-case-orchestrator.scenarios.test.ts` (2 failures)

No Unicode normalization in extraction pipeline. Emojis and non-Latin characters (CJK, Arabic) may cause extraction failures.

### M-F22. No Email Threading Support
**Files**: `core/gmail/sync.ts:562` (`threadId` captured but not used)
**Tests**: `__tests__/features-pov/scenarios/edge-case-orchestrator.scenarios.test.ts` (2 failures)

`threadId` captured from Gmail API but no threading logic associates replies with originals. No thread context passed to extraction.

### M-F23. No Timezone Normalization
**Files**: `core/gmail/sync.ts:568` (`new Date(parseInt(message.internalDate))`)
**Tests**: `__tests__/features-pov/scenarios/edge-case-orchestrator.scenarios.test.ts` (1 failure)

Dates stored as UTC timestamps but no normalization to user's local timezone for display.

### M-F29. No Rapid Update Batching
**Files**: `core/repositories/summaries.ts`
**Tests**: `__tests__/features-pov/edge-cases/rapid-updates.test.ts` (3 failures)

No debouncing or batching for summary updates. Each email triggers separate summary update for its topic.

### M-F30. No LLM Provider Fallback
**Files**: `core/llm/provider.ts:8, 46-50`
**Tests**: `__tests__/features-pov/configurations/llm-provider-matrix.test.ts` (10 failures)

Only 3 providers supported. No fallback to secondary provider on failure. No consistency check across providers.

### M-F31. No Processing Cost Estimation
**Files**: `core/llm/provider.ts`
**Tests**: `__tests__/features-pov/edge-cases/token-limits.test.ts` (2 failures)

Token usage tracked after processing but no cost estimation before processing begins. No cost-per-email or total cost display.

---

## Issue Index by Feature Area

| Area | Category A | Category B | Category C | Total |
|------|-----------|-----------|-----------|-------|
| Data Persistence | | C-F1 | C-F3 | 2 |
| Topic Summaries | H-F4, M-F6 | C-F2, H-F5 | M-F7 | 5 |
| Gmail Sync (Core) | H-F10, H-F11 | H-F12, M-F19 | C-F3, M-F15 | 6 |
| Topic Labeling | H-F1, H-F3 | H-F2, M-F1, M-F25 | | 5 |
| Sender Summaries | | H-F5, H-F6 | | 2 |
| Deal Extraction | H-F7, H-F8, M-F5 | | H-F9 | 4 |
| Sync Lifecycle | H-F13 | H-F16, H-F18 | M-F16 | 4 |
| Onboarding | M-F8, M-F9 | H-F17 | H-F14 | 4 |
| Settings | M-F26, M-F27, M-F28 | H-F15, M-F10 | | 5 |
| Inbox Intelligence | M-F3, M-F4 | | | 2 |
| API Resilience | | H-F16 | M-F13, M-F14, M-F30 | 4 |
| Edge Cases | M-F2 | M-F17, M-F18, M-F19, M-F20, M-F24 | M-F21, M-F22, M-F23, M-F29 | 9 |
| LLM Providers | L-F5 | | M-F30, M-F31 | 3 |
| Journey Scenarios | | L-F1, L-F4 | | 2 |
| **Total** | **21** | **20** | **16** | **57** |

## Severity Breakdown

| Severity | Cat A | Cat B | Cat C | Total | Description |
|----------|-------|-------|-------|-------|-------------|
| Critical (C) | 0 | 2 | 1 | 3 | Feature non-functional or data loss |
| High (H) | 8 | 5 | 2 | 15 | Core UX broken, feature unusable |
| Medium (M) | 12 | 12 | 13 | 37 | Feature gap, degraded experience |
| Low (L) | 1 | 2 | 0 | 3 | Nice to have, minor polish |

## Recommended Fix Order

1. **Category A** (21 issues): Switch tests from `@test-helpers/app` to real production imports. Run tests. Fix any wiring issues that surface. These are quick wins — features already work in production.

2. **Category B** (20 issues): For each, fix the specific integration gap documented above, then switch test to real code. Most gaps are small (wiring a method call, adding a cascade, adding proactive token refresh).

3. **Category C** (16 issues): Full implementation needed. Prioritize by severity: C-F3 first (incremental sync), then H-F14 (provider support), H-F9 (multi-deal), then Medium issues.
