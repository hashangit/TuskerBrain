# Failing Tests

**Date:** 2026-03-31
**Total:** 4 test suites, 15 tests failing | 60 suites, 1001 tests passing

## By File

### `__tests__/features/archival-rules.test.ts` (9 failures)

All failures are in `ProcessingDecision.decide()` — it returns `action: 'process'` instead of the expected category-specific actions (`archive`, `delete`, `extract_deals`).

| # | Test Suite | Test Name | Line | Expected | Got |
|---|-----------|-----------|------|----------|-----|
| 1 | Updates Emails | should archive updates emails older than 1 month | 129 | `archive` | `process` |
| 2 | Social Emails | should delete social emails older than 1 month | 186 | `delete` | `process` |
| 3 | Social Emails | should delete social emails between 1-6 months old | 205 | `delete` | `process` |
| 4 | Promotional Emails | should extract deals from promotional emails less than 1 month old | 245 | `extract_deals` | `process` |
| 5 | Promotional Emails | should delete promotional emails older than 1 month | 264 | `delete` | `process` |
| 6 | Promotional Emails | should delete promotional emails between 1-6 months old | 283 | `delete` | `process` |
| 7 | Promotional Emails | should delete promotional emails older than 2 years | 302 | `delete` | `archive` |
| 8 | Edge Cases | should handle email exactly 30 days old as under 1 month | 323 | `extract_deals` | `process` |
| 9 | Edge Cases | should handle email exactly 31 days old as over 1 month | 341 | `delete` | `process` |

### `__tests__/features-pov/gmail-sync.test.ts` (4 failures)

Related to cleanup rules and batch operations — likely same root cause as archival-rules (ProcessingDecision returning `process` instead of specific actions).

| # | Test Suite | Test Name | Line | Issue |
|---|-----------|-----------|------|-------|
| 1 | Cleanup Rules | deletes old promotional emails (>30 days) | 431 | Processing decision mismatch |
| 2 | Cleanup Rules | queues recent promotional emails for AI (extract_deals) | 451 | Processing decision mismatch |
| 3 | Cleanup Rules | returns cleanupActions with emailId and action for each email | 535 | Processing decision mismatch |
| 4 | Batch Operations | batch deletes multiple old promotional emails | 587 | `batchModifyMessages` called without `addLabelIds: ['TRASH']` |

### `__tests__/features-pov/synchronization.test.ts` (1 failure)

| # | Test Suite | Test Name | Line | Issue |
|---|-----------|-----------|------|-------|
| 1 | Phase 1 Cleanup | deletes social emails between 1 month and 2 years old | 118 | `result.deleted` expected 1, got 0 |

### `__tests__/core/orchestrator.test.ts` (1 failure)

| # | Test Suite | Test Name | Line | Issue |
|---|-----------|-----------|------|-------|
| 1 | Error Handling | should handle LLM errors gracefully | 354 | LLM error handling mismatch |

## Root Cause Analysis

**Primary issue:** `ProcessingDecision.decide()` in `core/workflows/processing-decision.ts` appears to have been refactored — it now returns `action: 'process'` as a default instead of the category-specific actions (`archive`, `delete`, `extract_deals`) that the tests expect. This accounts for **14 of 15** failures.

**Secondary issue:** Batch delete in gmail-sync no longer includes `addLabelIds: ['TRASH']` in the modify call (1 failure).
