# Phase 3 Test Action Matrix

**Date:** 2026-03-30
**Purpose:** Categorize all problematic tests from Phase 3 reviews for prioritized fixes.
**Methodology:** Each test classified by reading the ACTUAL production source code to verify claims from reviews files.

**Verification date:** Source code read on 2026-03-30

---

## Category A: Mocked but Real Code EXISTS
Tests that mock functionality where the actual production implementation exists and could be exercised. These tests give false confidence and need to be rewritten to exercise real code.

| # | Test File | Test Name | What's Mocked | Real Code That Exists | Fix Required |
|---|-----------|-----------|---------------|----------------------|--------------|
| A1 | `oauth-connection-flow.test.ts` | "exchanges authorization code for tokens and stores them" | `exchangeCodeForTokens()` -- never called; the `exchangeCodeForTokens()` in `core/gmail/oauth.ts` lines 76-89 | Rewrite test to call real `exchangeCodeForTokens()` with a mock OAuth2 client, and verify the real tokens are returned. Also remove the disconnected `oauth_tokens` DB INSERT/SELECT assertions since `TokenManager` uses static in-memory storage, not that table. |
| A2 | `oauth-connection-flow.test.ts` | "handles revoked Gmail access gracefully" | `GmailClient.getProfile()` is `TokenManager.validateTokens()` (real method in `core/auth/token-manager.ts` lines 190-197), `TokenManager.handleRevocation()` (real method, `core/auth/token-manager.ts` lines 202-211), Replace mock `gmailClient.getProfile` with aspy` that `TokenManager` that intercepts the constructor. The `validateTokens()` and `handleRevocation()` methods are real and testable, just need a GmailClient mock for the external API call. |
| A3 | `oauth-connection-flow.test.ts` | "handles user denying OAuth consent" | `GmailClient` fully mocked, `TokenManager` constructor, `getStoredTokens`, `getValidToken` -- all real in `core/auth/token-manager.ts` | Rewrite test to exercise real `TokenManager` empty-state behavior (calling `getValidToken()` when no tokens stored) with a fresh `TokenManager`), or delete the fake `callbackError` tautology (first assertion is trivially true). |
| A4 | `oauth-connection-flow.test.ts` | "handles invalid authorization code" | `GmailClient` fully mocked | `TokenManager` constructor, `getValidToken` | `TokenManager` constructor, `getStoredTokens`, `getValidToken` | Same as A3 -- both test the same trivial `TokenManager` empty-state behavior. Consolidate into one test. |
| A5 | `oauth-connection-flow.test.ts` | "allows reconnection after token revocation" | Full reconnection lifecycle mocked via `createMockGmailClient()` | `TokenManager.setTokens`, `getStoredTokens`, `refreshToken` | `validateTokens`, `getValidToken` in `core/auth/token-manager.ts` | Rewrite to exercise real `TokenManager` lifecycle: `setTokens` -> `handleRevocation` -> `setTokens` again -> `getValidToken`. Remove mock reGmailClient` and pass a real `GmailClient` constructor, or test the `getProfile()` only for the validation check. |
| A6 | `email-processing-pipeline.test.ts` | "classifies regular email and extracts update" | `createMockLLM` returns all classification/extraction/topic/summary values | `processEmailWithWorkflow` + real `decideNode` + real routing | `buildClassificationPrompt`, `buildUpdateExtractionPrompt`, `buildSummaryPrompt` in `core/workflows/langgraph-workflow.ts` | Rewrite test to assert on PROMPT arguments passed to `llm.generateObject`/`generateText` (e.g., verify `buildClassificationPrompt` is called with correct email data subject/snippet/sender domain). Replace assertions on mock return values with assertions on `decideNode` output (action, routing path). |
| A7 | `email-processing-pipeline.test.ts` | "processes email with action items" | `createMockLLM` returns classification, extraction with action items | Same as A6` -- mock passthrough with same code path. Replace mock field assertions with real `decideNode` assertions. Consolidate with A6`. |
| A8 | `email-processing-pipeline.test.ts` | "classifies promotional email and extracts deal" | `createMockLLM` returns promotional classification, deal extraction | `decideNode` promotional routing + `routeAfterExtract` skipping label node | Real promotional routing logic in `decideNode` (line 226-243 in `langgraph-workflow.ts`), The promotional branch of `decideNode` returns `action: 'extract_deals'` with `needsTopicLabeling: false`, and `routeAfterExtract` checks `needsTopicLabeling` to skip label node. Keep assertion on `result.topic === null` to verify real routing. Replace deal field assertions (mock passthrough) with assertions on thedecideNode` routing output (action= `needsTopicLabeling` flag). |
| A9 | `email-processing-pipeline.test.ts` | "extracts deal with expiry date" | `createMockLLM` returns deal with `dealExpiry: '2025-12-31'` and `minimumPurchase: '$200'` | `extractNode` in `core/workflows/langgraph-workflow.ts` lines 315-392 | `extractNode` copies deal fields from mock with zero transformation. The assertions on `dealExpiry` and `minimumPurchase` are mock passthrough. Delete test -- adds no value beyond what test C8 already covers. |
| A10 | `email-processing-pipeline.test.ts` | "gives high priority to Gmail important-flagged email" | `createMockLLM` returns high priority/urgency values. `isImportant` flag is `decideNode` in `core/workflows/langgraph-workflow.ts` lines 220-311), Delete or rewrite test. The `isImportant` flag has no effect on the workflow (`decideNode` only looks at `classification.type` and `email.receivedAt`). The flag is is `Email` type but `is never read by any node function. The test gives false confidence that important emails get special treatment. |
| A11 | `email-processing-pipeline.test.ts` | "handles LLM failure gracefully" | None of `createMockLLM` LLM rejection | `classifyNode` catch block + `inferTypeFromDomain` fallback | `classifyNode` catch block in `core/workflows/langgraph-workflow.ts` lines 204-216 | Real fallback logic. Test is good. |
| A12 | `topic-summaries.test.ts` | "first paragraph is always a high-level overview" | `createMockLLM` returns hardcoded summary with "Overview:" in first paragraph | `buildSummaryPrompt` in `core/workflows/prompts/classification.ts` + `buildSummaryPrompt` in `core/orchestrator.ts` line 448 | `updateTopicSummary` in `core/orchestrator.ts` line 435-461 | Rewrite to assert on the PROMPT arguments passed to `llm.generateText` in `updateTopicSummary`, not on the mock's return value. Specifically: capture the prompt call to `buildSummaryPrompt({ topic, currentSummary, newContent, maxWords: 500 }))` verify it contains "First paragraph: high-level overview" constraint. |
| A13 | `topic-summaries.test.ts` | "summary stays within 500 words after 50+ updates" | `createMockLLM` returns ~30-word summary | 500-word limit | No application code en ** Verified: No truncation, rejection, or word-count guard exists anywhere in `core/orchestrator.ts` or `core/workflows/langgraph-workflow.ts` or Rewrite to add a test that sends a 600`-word summary to the mock LLM and verifies the application does NOT truncate it or reject it it. Then add a word-count guard to production code in `core/orchestrator.ts` (after `updateTopicSummary` / `updateSenderSummary`) call `buildSummaryPrompt`/`buildSenderSummaryPrompt`). Alternatively, rewrite test to assert on prompt arguments. |
| A14 | `topic-summaries.test.ts` | "older information gets progressively less emphasis" | `createMockLLM` returns summary about "new policy" on second call | `buildSummaryPrompt` in `core/orchestrator.ts` line 448 | `updateTopicSummary` in `core/orchestrator.ts` line 435-461 | Rewrite to assert on the PROMPT arguments passed to `llm.generateText`. Specifically, verify `buildSummaryPrompt` is called with `currentSummary` parameter and existing summary) and `newContent` parameter (new email content). Replace assertions on mock content with assertions on `currentSummary` and `newContent` values. |
| A15 | `topic-summaries.test.ts` | "handles conflicting information across updates" | `createMockLLM` returns "$19.99" in second summary | `updateTopicSummary` in `core/orchestrator.ts` line 435-461 | Rewrite to assert on ` PROMPT arguments passed to `llm.generateText` in `updateTopicSummary`. Verify `currentSummary` parameter contains the old value ($29.99) and `newContent` parameter contains the corrected value ($19.99). Replace content assertion on mock value with assertion on prompt structure. |
| A16 | `sender-summaries.test.ts` | "sender summary reflects email frequency" | `createMockLLM` returns summary containing "frequent", "daily", "volume" | `buildSenderSummaryPrompt` in `core/orchestrator.ts` line 474-502 | `updateSenderSummary` in `core/orchestrator.ts` line 468-511 | Rewrite to assert on the PROMPT arguments passed to `llm.generateText` in `updateSenderSummary`. Verify `currentSummary` parameter contains existing summary and `newContent` parameter (new email). Replace content assertion (mock output) with assertion on prompt structure. |
| A17 | `sender-summaries.test.ts` | "handles conflicting information from same sender" | `createMockLLM` returns "Q4" in second summary | `updateSenderSummary` in `core/orchestrator.ts` line 468-511 | Rewrite to assert on the PROMPT arguments passed to `llm.generateText`. Verify `currentSummary` parameter contains old value (Q3) and `newContent` parameter contains corrected value (Q4). Replace content assertion (mock output) with assertion on prompt structure. |

**Total: 17 tests**

---

## Category B: Mocked because Feature NOT IMPLEMENTED
Tests that test aspirational behavior for features that don't exist in the codebase. These tests should be marked as `todo`/`skip` until the feature is built, OR the feature should be built first.
| # | Test File | Test Name | Missing Feature | Production Code Needed | Action |
|---|-----------|-----------|-----------------|----------------------|--------|
| B1 | `job-system.test.ts` | "kills job that runs too long" | Timeout mechanism in `JobRunner` -- no timeout, no AbortController, no Promise.race with timeout, no timer-based kill logic exists | Add `AbortController` signal to `processNextJob()`, add timeout logic with `Promise.race`, add `timeoutMs` config option to `JobRunnerConfig` | Skip test with `todo` until timeout feature is implemented |
| B2 | `job-system.test.ts` | "records timeout in audit log" | Same as B1 -- timeout does not exist in `JobRunner` | Same as B1 | Skip test with `todo` until timeout feature is implemented (or rewrite as generic "audit entries survive job failure" test) |
| B3 | `job-system.test.ts` | "cancels running job when user requests" | `cancelJob()` method -- no cancellation API, no abort signal propagation, no `cancelled` status in `JobStatus` type | Add `cancelJob(jobId: string)` method to `JobQueue`, add `AbortController` integration in `JobRunner.processNextJob()`, add `'cancelled'` to `JobStatus` union type | Skip test with `todo` until cancellation feature is implemented |
| B4 | `job-system.test.ts` | "cleans up resources after cancellation" | Same as B3 -- cancellation doesn't exist; no resource cleanup logic | Same as B3 | Rewrite to remove "cancellation" framing -- test is really about "audit entries survive job failure" which is real code. Or skip until cancellation is implemented |
| B5 | `job-system.test.ts` | "cannot cancel already completed job" | Status transition guards in `updateJobStatus()` -- no guard against transitioning from terminal states | Add terminal-state guard to `updateJobStatus()`: reject transitions from `completed`/`failed`/`dead` to any other status | Skip test with `todo` or rewrite as a regression test asserting correct behavior (`expect(status).toBe('completed')`) |

**Total: 5 tests**

---

## Category C: Appears Real -- Needs Verification
Tests that look real but the reviewer wasn't confident enough, or tests where the review flagged concerns but couldn't classify definitively. Need manual code-path tracing to verify.
| # | Test File | Test Name | Claims to Verify | Code Path to Trace | What to Check |
|---|-----------|-----------|-----------------|-------------------|---------------|
| C1 | `oauth-connection-flow.test.ts` | "updates stored tokens after refresh" | `TokenManager.refreshToken` calls mocked `refreshAccessToken`, then calls real `setTokens` and `getStoredTokens` | Verify that the mock of `refreshAccessToken` is appropriate (only external API call is mocked). Confirm `refreshToken` in `core/auth/token-manager.ts:172-185` correctly preserves the `refresh_token` from stored tokens. |
| C2 | `oauth-connection-flow.test.ts` | "automatically refreshes expired access token" | `TokenManager.shouldRefreshToken` and `isTokenExpired` do real date math | Verify that `shouldRefreshToken` (line 156-160 in token-manager.ts) correctly computes the5-minute buffer. Verify that `isTokenExpired` (line 165-167) correctly compares against `Date.now()`. |
| C3 | `oauth-connection-flow.test.ts` | "stores refresh token for long-term access" | `TokenManager.setTokens` -> `encryptSecret` -> static field -> `getStoredTokens` -> `decryptSecret` -> `getRawStorage` | Verify that `getRawStorage` (token-manager.ts:224-236) double-encrypts values. Confirm the encrypt/decrypt round-trip through base64 fallback is correct. |
| C4 | `email-processing-pipeline.test.ts` | "handles malformed email data" | `processEmailWithWorkflow` with null fields; prompt builders use `??` and `||` null coalescing | Trace `buildClassificationPrompt` to confirm it handles `null` subject/snippet/senderDomain without throwing. Verify `decideNode` handles emails with missing fields. |
| C5 | `settings.test.ts` | "migrates settings when version changes" | `SettingsManager.initializeWithFilePath()` -> `loadFromDisk()` -> `JSON.parse` -> Map population | Verify in `core/settings/manager.ts` that there is NO migration logic (no version field, no migration function, no schema evolution). Test actually tests JSON round-trip persistence. Rename test. |
| C6 | `settings.test.ts` | "resets all settings to defaults" (resilience block) | `resetAllSettings()` clears Maps and reinitializes with defaults | Verify in `core/settings/manager.ts:310-323` that `resetAllSettings()` clears all storage and reinitializes. Confirm this test is near-duplicate of existing "Settings Reset" test that only adds `customKey` verification. |
| C7 | `topic-summaries.test.ts` | "sender summary accumulates across multiple emails from same domain" | Full pipeline 6x with real `upsertSenderSummary` SQL increment | Verify that `updateCount === 6` assertion tests real SQL increment logic. Content regex is on mock output is not testing real behavior. Separate the two concerns. |
| C8 | `job-system.test.ts` | "audit log is queryable by date range" | `AuditLogger.getEntriesByDateRange()` filter logic + `simulateAging()` timestamp mutation | Verify `getEntriesByDateRange` (audit.ts:146-150) filtering works correctly. Verify that `simulateAging` (audit.ts:202-212) is production code but exists only for tests -- consider moving to test helpers. |
| C9 | `job-system.test.ts` | "tracks token usage per job type" | Cross-referencing `getAllEntries()` with `getJob()` lookups; aggregation in test | Verify that `getTokensByJobType()` does not exist in production code (confirmed). Test verifies raw data integrity, not a built-in method. Real value but documents missing API. |

**Total: 9 tests**

---

## Summary
| Category | Count | Priority | Status |
|----------|-------|----------|--------|
| A: Use real code | 17 | HIGH -- rework tests | **12 FIXED, 5 remaining** |
| B: Feature missing | 5 | MEDIUM -- skip or build feature | **5 SKIPPED (todo)** |
| C: Verify realness | 9 | MEDIUM -- trace code paths | **9 VERIFIED** |
| **Total action items** | **31** | | **26 resolved, 5 deferred** |

---

## Resolution Status

### Phase 1: Skip Fantasy Tests (Category B) -- DONE
- B1-B5 marked as `test.todo()` in `job-system.test.ts` (39 pass, 5 todo)

### Phase 2: Rework Mock Tautologies (Category A) -- PARTIALLY DONE
**Fixed (12 of 17):**
- A6-A9 (email pipeline): Reworked to assert on `decideNode` routing output (action, needsExtraction, needsTopicLabeling) and workflow graph traversal instead of mock return values
- A10 (isImportant): Deleted — workflow never reads the flag
- A12-A15 (topic summaries): Reworked to assert on prompt arguments via `buildSummaryPrompt` capture; verify structural properties (has `Current Summary:`, `New Content:`, 500-word limit, recency instruction)
- A16-A17 (sender summaries): Reworked to assert on prompt arguments via `buildSenderSummaryPrompt` capture

**Remaining (5 of 17):**
- A1 (OAuth exchangeCodeForTokens): Needs rewrite to call real function with mock OAuth2 client
- A2 (OAuth revocation): Needs rewrite to exercise real `validateTokens()`/`handleRevocation()`
- A3+A4 (OAuth consent denial): Need consolidation — both test same empty-TokenManager path
- A5 (OAuth reconnection): Needs rewrite to exercise real `TokenManager` lifecycle

### Phase 3: Verify Category C Tests -- DONE
- C1-C3 (OAuth token refresh/storage): Verified real date math and encrypt/decrypt round-trip. Tests exercise real `shouldRefreshToken`, `isTokenExpired`, `refreshToken`, `setTokens`/`getStoredTokens`. Added inline verification comments.
- C4 (email pipeline malformed data): Verified — prompt builders use null coalescing (`??`, `||`), `decideNode` handles missing fields. Test exercises real null-safety.
- C5 (settings migration): Verified no migration logic exists. Test renamed to "loads settings from an existing file on disk" / "preserves unknown keys when loading existing settings".
- C6 (settings reset): Verified real `resetAllSettings()` clears all storage. Test renamed to "resets all settings including arbitrary custom keys" to differentiate from existing test.
- C7 (sender accumulation updateCount): Verified `updateCount` assertion tests real SQL increment. Content regex portion still uses mock output.
- C8-C9 (job audit): Verified `getEntriesByDateRange` does real date filtering, token aggregation exercises real `AuditLogger` data. Both verified as testing real code with inline comments added.

### Phase 4: Structural Issues -- NOT STARTED
1. `AuditLogger.simulateAging()` still in production code
2. Dead DB scaffolding in `email-processing-pipeline.test.ts` removed by A6-A10 rework agent
3. `getTokensByJobType()` not added to `AuditLogger`
4. Duplicate OAuth tests (A3 + A4) not yet consolidated

---

## Detailed Verification Notes

### Source Code Files Verified
- `core/gmail/oauth.ts` -- `exchangeCodeForTokens()` at line 76, `refreshAccessToken()` at line 92, `generateAuthUrl()` at line 44
- `core/auth/token-manager.ts` -- `TokenManager` class with `setTokens`, `getStoredTokens`, `refreshToken`, `validateTokens`, `handleRevocation`, `getValidToken`, `shouldRefreshToken`, `isTokenExpired`, `onRevocation`, `getRawStorage`
- `core/workflows/langgraph-workflow.ts` -- `decideNode` (line 220), `extractNode` (line 315), `classifyNode` (line 182), `routeAfterDecide` (line 496), `routeAfterExtract` (line 504), `isImportant` NOT used (confirmed)
- `core/orchestrator.ts` -- `updateTopicSummary` (line 435), `updateSenderSummary` (line 468), `buildSummaryPrompt` import (line 9)
- `core/jobs/runner.ts` -- NO timeout, NO cancellation, NO abort signal (confirmed)
- `core/jobs/queue.ts` -- NO `cancelJob()`, `updateJobStatus` has NO terminal-state guards (confirmed)
- `core/jobs/audit.ts` -- `simulateAging()` in production code (line 202, test helper)
- `core/settings/manager.ts` -- NO migration logic, NO version field (confirmed)
- `core/workflows/processing-decision.ts` -- `ProcessingDecision` class exists but duplicated by `decideNode` in workflow

### Key Findings from Verification
1. **`exchangeCodeForTokens()` exists at `core/gmail/oauth.ts:76-89` but is never called in any test.** The "exchanges authorization code" test manually creates tokens and calls `setTokens` instead.
2. **`isImportant` is read by `core/orchestrator.ts:355` but NOT by the LangGraph workflow.** The workflow's `decideNode` only checks `classification.type` and `email.receivedAt`.
3. **500-word limit is only enforced by prompt text**, not by any application code. No truncation or rejection logic exists in `orchestrator.ts` or `langgraph-workflow.ts`.
4. **`JobRunner` has zero timeout and zero cancellation support.** No `AbortController`, no `Promise.race`, no timer-based kill logic, no `cancelJob()` method.
5. **`updateJobStatus()` in `queue.ts:137-168` has no guards against transitions from terminal states** (completed/failed/dead).
6. **`ProcessingDecision` class in `processing-decision.ts` duplicates logic from `decideNode` in `langgraph-workflow.ts`.** Neither is imported by the tests.
