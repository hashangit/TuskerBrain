# Phase 3 Test Review Summary

**Date:** 2026-03-30 (Phase 3) / Updated 2026-03-31 (Post-Phase 4 Final Audit)
**Scope:** 64 test files, 1024 tests, 0 failures, 6 todo
**Detailed reviews:** See `docs/reviews/*-test-review.md`

---

## Scorecard

| # | Test File | GAP | New Tests | Phase 3 | Phase 4 | Verdict | Action Needed |
|---|-----------|-----|-----------|---------|---------|---------|---------------|
| 1 | `oauth-connection-flow.test.ts` | TEST-1 | 9 | ~40% | **~65%** | MIXED — improved | ~~Rework 6 tests~~ 2 duplicates deleted, 2 now real |
| 2 | `email-processing-pipeline.test.ts` | TEST-2 | 9 | ~40% | **~75%** | MIXED — improved | ~~Rework 6 tests~~ Wired to real DB, real routing |
| 3 | `gmail-label-sync.test.ts` | TEST-3 | 11+8 | ~85% | **~95%** | TESTING REAL | ~~429, 409, normalizeName gaps~~ 8 new tests added |
| 4 | `topic-labeling.test.ts` | TEST-4 | +14 | ~95% | **100%** | TESTING REAL | ~~Excellent, no action~~ Fully rewritten — complete |
| 5 | `settings.test.ts` | TEST-5 | +10 | ~90% | **~95%** | TESTING REAL | ~~Rename 2 tests~~ Migration tests renamed/deleted |
| 6 | `topic-summaries.test.ts` | TEST-6 | +5 | ~35% | **~70%** | TESTING REAL | ~~3 mock tautologies~~ Now assert on prompt args via promptLog |
| 7 | `sender-summaries.test.ts` | TEST-6 | +4 | ~35% | **~70%** | TESTING REAL | ~~2 mock tautologies~~ Now test buildSenderSummaryPrompt pure function |
| 8 | `job-system.test.ts` | TEST-7 | +12 | ~50% | **7 real** | MIXED — honest | 5 fake tests -> `test.todo()`, 7 real remain |

**Phase 3: ~60% real behavior. 23 of 64 tests needed rework.**
**Phase 4: ~90%+ real behavior. All mock tautologies fixed. 1024 tests, 0 failures, 6 todo.**

**Cross-cutting fix:** 15 tests across `archival-rules`, `gmail-sync`, `synchronization`, `orchestrator` needed `gmailCategory` field added due to `processing-decision.ts` refactor (`classifyFromGmailCategory`).
**Orchestrator:** Real error handling added (try/catch around `updateSenderSummary`, `updateTopicSummary`).

### Additional Files Verified (Phase 4 cleanup, not in original review)

| File | Status | Notes |
|------|--------|-------|
| `inbox-manager.test.ts` | **100% REAL** | TopicLabeler import removed, adapted to LLM workflow |
| `low-content.test.ts` | **100% REAL** | TopicLabeler import removed |
| `edge-case-orchestrator.scenarios.test.ts` | **100% REAL** | TopicLabeler removed, mock topic format updated |
| `gmail-labels.test.ts` | **100% REAL** | No changes needed (GmailLabelManager, TuskerBrain/Topic/ format) |

---

## Detailed Findings

### 1. OAuth Connection Flow — ~40% Real -> ~65% Real (Phase 4)

| Test | Phase 3 | Phase 4 | Change |
|------|---------|---------|--------|
| generates OAuth URL with correct scopes | REAL | REAL | — |
| exchanges authorization code for tokens and stores them | REAL | REAL | — |
| stores refresh token for long-term access | REAL | REAL | — |
| automatically refreshes expired access token | REAL | REAL | — |
| updates stored tokens after refresh | MIXED | MIXED | — |
| handles revoked Gmail access gracefully | MOCK | **PARTIALLY REAL** | Now exercises real `validateTokens` + `handleRevocation` |
| ~~handles user denying OAuth consent~~ | MOCK | **DELETED** | Duplicate test removed |
| ~~handles invalid authorization code~~ | MOCK | **DELETED** | Duplicate test removed |
| allows reconnection after token revocation | MOCK | **PARTIALLY REAL** | Real TokenManager lifecycle with encrypt/decrypt |

**Remaining gaps:**
- `exchangeCodeForTokens()` is still never called in any test
- `GmailOAuthService` (Electron callback server, CSRF, disk persistence) is completely untested
- `refreshTokenWithRetry` retry logic is untested
- `TokenManager` uses static in-memory storage, not the DB — still disconnected

---

### 2. Email Processing Pipeline — ~40% Real -> ~75% Real (Phase 4 Final)

| Test | Phase 3 | Phase 4 | Change |
|------|---------|---------|--------|
| classifies regular email and extracts update | MOCK | **PARTIALLY REAL** | Now exercises real `decideNode` routing, but LLM extraction values still from mock |
| processes email with action items | MOCK | **PARTIALLY REAL** | Same — real routing, mock LLM values |
| classifies promotional email and extracts deal | MOCK | **PARTIALLY REAL** | Same — real routing, mock LLM values |
| ~~extracts deal with expiry date~~ | MOCK | **DELETED** | Removed |
| routes old promotional email to delete | REAL | REAL | — |
| routes old regular email to archive | REAL | REAL | — |
| ~~gives high priority to Gmail important-flagged email~~ | MOCK+LIE | **DELETED** | Flag was never read by workflow |
| handles LLM failure gracefully | MIXED | MIXED | — |
| handles malformed email data | MIXED | MIXED | — |

**Remaining gaps:**
- **LLM extraction values still from mock**: routing is real but classification/extraction assertions are tautological
- **No boundary tests**: No test for exactly 30, 180, 730 days thresholds

---

### 3. Gmail Label Sync — ~85% Real -> ~95% Real (Phase 4 Final)

| Test | Real? | Status |
|------|-------|--------|
| Creates TuskerBrain/Topic/Parent/Child hierarchy | **REAL** | — |
| Creates parent label before child label | **REAL** | — |
| Reuses existing Gmail labels | **REAL** | — |
| Creates TuskerBrain/Sender/domain label | **REAL** | — |
| Reuses existing sender labels | **REAL** | — |
| Applies TuskerBrain/Processed label | **REAL** | — |
| Tracks which emails have been labeled | **REAL** | — |
| Ensures parent label exists before children | **REAL** | — |
| Handles Gmail API errors when creating labels | **REAL** | — |
| Applies all label types to a single email | **REAL** | — |
| Labels multiple emails without duplicate labels | **REAL** | — |
| 429 rate-limit retry with backoff | **REAL** | **NEW** |
| 409 conflict recovery | **REAL** | **NEW** |
| `normalizeName` edge cases | **REAL** | **NEW** (special chars, truncation) |
| +5 additional coverage tests | **REAL** | **NEW** |

**Previously flagged gaps — now fixed:**
- ~~Rate-limit (429) retry with backoff never tested~~ Added
- ~~409 conflict recovery path not directly exercised~~ Added
- ~~`normalizeName` edge cases (special chars, truncation) untested~~ Added

---

### 4. Topic Labeling — ~95% Real -> 100% Real (Phase 4)

**Completely rewritten in Phase 4.** Old `TopicLabeler` (5-step rule-based) deleted. New tests cover LLM-based labeling.

| Test | Real? | Notes |
|------|-------|-------|
| LLM labels new topic with parent+child | **REAL** | Real `classifyNode` with LLM mock returning topic |
| LLM reuses existing topic from DB | **REAL** | Real DB lookup + cache reuse |
| `TB/` label format (two labels per email) | **REAL** | Real `TB/{Parent}` + `TB/{Parent}/{Child}` generation |
| `gmailCategory` short-circuits classification | **REAL** | Real mapping: promotions -> Marketing, etc. |
| Retry on labeling failure | **REAL** | Real retry logic on LLM error |
| `buildTopicLabelingPrompt` pure function tests | **REAL** | Tests real prompt builder directly |
| End-to-end topic pipeline with DB | **REAL** | Full pipeline: LLM -> topic -> DB -> labels |

**No remaining gaps.** All tests exercise real code paths.

---

### 5. Settings Resilience — ~90% Real -> ~95% Real (Phase 4)

| Test | Phase 3 | Phase 4 | Change |
|------|---------|---------|--------|
| ~~migrates settings when version changes~~ | REAL (misnamed) | **RENAMED/DELETED** | Comment added: SettingsManager has no migration logic |
| ~~preserves user values during migration~~ | REAL (misnamed) | **RENAMED/DELETED** | Same — clarified naming |
| falls back to defaults when corrupted | REAL | REAL | — |
| recovers from missing required fields | REAL | REAL | — |
| handles empty settings store | REAL | REAL | — |
| rejects invalid setting values with clear error | REAL | REAL | — |
| rejects out-of-range values | REAL | REAL | — |
| preserves valid settings when one invalid rejected | REAL | REAL | — |
| resets all settings to defaults | REAL | REAL | — |
| reset is idempotent | REAL | REAL | — |

**Remaining gaps:**
- No test for `setImmediate` debounce in `saveToDisk()` (concurrent write safety)
- Static state could leak between tests

---

### 6. Summary Quality (Topic + Sender) — ~35% Real -> ~70% Real (Phase 4 Final)

| Test | Phase 4 Early | Phase 4 Final | Change |
|------|---------------|---------------|--------|
| **Topic: first paragraph is overview** | MOCK | **REAL** | Now asserts on prompt args via promptLog |
| ~~Topic: stays within 500 words~~ | **DELETED** | — | 500-word limit not enforced by code |
| **Topic: older info gets less emphasis** | MOCK | **REAL** | Now asserts on prompt args via promptLog |
| **Topic: handles conflicting info** | MOCK | **REAL** | Now asserts on prompt args via promptLog |
| **Topic: persists across restart** | **REAL** | — | — |
| **Sender: accumulates across multiple emails** | MOCK | **REAL** | Now tests buildSenderSummaryPrompt pure function |
| **Sender: reflects email frequency** | PARTIALLY REAL | **REAL** | Tests real `updateCount` + prompt content |
| **Sender: persists across restart** | **REAL** | — | — |
| **Sender: handles conflicting info** | MOCK | **REAL** | Now tests buildSenderSummaryPrompt pure function |

**Previously flagged gaps — now fixed:**
- ~~3 topic tests still assert on mock LLM return values~~ Now assert on prompt args via promptLog
- ~~2 sender tests still assert on mock LLM return values~~ Now test buildSenderSummaryPrompt pure function

---

### 7. Job Queue Advanced — ~50% Real -> 7 Real Tests (Phase 4)

| Test | Phase 3 | Phase 4 | Change |
|------|---------|---------|--------|
| respects concurrent job limits | **REAL** | **REAL** | — |
| starts waiting job when running job completes | **REAL** | **REAL** | — |
| user can view complete processing history | **REAL** | **REAL** | — |
| audit log includes token usage per job | **REAL** | **REAL** | — |
| aggregates token usage across all jobs | **REAL** | **REAL** | — |
| tracks token usage per job type | **REAL** | **REAL** | — |
| kills job that runs too long | MOCK | **`test.todo()`** | Marked as executable spec — timeout doesn't exist |
| records timeout in audit log | MIXED | **`test.todo()`** | Marked as executable spec |
| cancels running job when user requests | MOCK | **`test.todo()`** | Marked as executable spec — cancellation doesn't exist |
| cleans up resources after cancellation | MIXED | **`test.todo()`** | Marked as executable spec |
| cannot cancel already completed job | MOCK | **`test.todo()`** | Marked as executable spec |

**Phase 4 resolution:** 5 fake tests converted to `test.todo()` — they now serve as executable specs for future timeout/cancellation features. 7 real tests remain.

**Remaining gaps:**
- No test uses the real database (only in-memory `JobQueue`/`AuditLogger`)
- `AuditLogger.simulateAging()` is a test helper embedded in production code

---

## Priority Actions

### Completed in Phase 4

- ~~**Topic labeling tests**~~: Completely rewritten to 100% real. TopicLabeler deleted, LLM-based labeling tested.
- ~~**Job queue fake tests (5)**~~: Marked `test.todo()` as executable specs. 7 real tests remain.
- ~~**OAuth duplicate tests (2)**~~: Deleted ("user denying consent", "invalid auth code").
- ~~**Email pipeline dead tests (3)**~~: Deleted (deal expiry, isImportant->todo, invalid code).
- ~~**Settings migration tests**~~: Renamed/deleted with comment explaining no migration logic exists.
- ~~**isImportant flag lie**~~: Test deleted.
- ~~**500-word fiction test**~~: Deleted (no code enforces it).
- ~~**Summary quality mock tautologies (6 tests)**~~: Topic tests now assert on prompt args via promptLog. Sender tests now test buildSenderSummaryPrompt pure function.
- ~~**Gmail label sync gaps**~~: 8 new tests added covering 429 retry, 409 conflict, normalizeName edge cases.
- ~~**Email pipeline DB wiring**~~: Now wired to real DB with real routing (~75% real).
- ~~**Orchestrator error handling**~~: Real try/catch around updateSenderSummary, updateTopicSummary.
- ~~**gmailCategory refactor fallout**~~: 15 tests across archival-rules, gmail-sync, synchronization, orchestrator updated for classifyFromGmailCategory.

### Remaining -- Medium Priority

2. **Email pipeline**: LLM extraction values still from mock. Add boundary tests at 30, 180, 730 days.
3. **OAuth**: Test real `exchangeCodeForTokens`. Wire through to real DB instead of static in-memory storage. Test `refreshTokenWithRetry`, `GmailOAuthService`.

### Remaining -- Low Priority

5. **Job queue**: Move `simulateAging()` out of production code. De-duplicate token usage test.
6. **Settings**: Add test for `setImmediate` debounce in `saveToDisk()`. Address static state leak between tests.

---

## Review Files

| File | Reviewed Tests |
|------|---------------|
| `docs/reviews/oauth-connection-flow-test-review.md` | 9 tests (now 7) |
| `docs/reviews/email-processing-pipeline-test-review.md` | 9 tests (now 6) |
| `docs/reviews/gmail-label-sync-test-review.md` | 11+8 tests (19 total) |
| `docs/reviews/topic-labeling-test-review.md` | 14 tests (rewritten) |
| `docs/reviews/settings-test-review.md` | 10 tests (now 8) |
| `docs/reviews/summary-quality-test-review.md` | 9 tests (now 8) |
| `docs/reviews/job-system-test-review.md` | 12 tests (7 real + 5 todo) |
