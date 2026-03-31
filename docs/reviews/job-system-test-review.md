# Test Review: Job Queue Advanced Scenarios (New Tests Only)

## Summary
- File: `__tests__/features-pov/job-system.test.ts`
- New tests reviewed: 10 (under "Job Queue Advanced Scenarios", lines 554-1034)
- Existing tests: 18 (not reviewed)
- Date: 2026-03-30

## Mock Analysis
| Category | What's Mocked | What's Real |
|----------|--------------|-------------|
| Database | Real `:memory:` SQLite used in `beforeEach`, but NOT used by new tests (only by existing "Startup Recovery" tests) | N/A for new tests -- database is created but unused |
| Repositories | N/A | N/A |
| External APIs | N/A (no external calls) | N/A |
| Internal Logic | **Timeout behavior** is manually simulated (test calls `updateJobStatus('failed')` directly rather than the system enforcing timeout). **Cancellation** is manually simulated (test sets status to `'failed'` with a reason string, no real cancellation mechanism). **Timers** are faked with `vi.useFakeTimers()` in timeout tests. | `JobQueue` (real in-memory instance), `AuditLogger` (real in-memory instance), `JobRunner` (real instance with real polling and concurrency enforcement), `job handlers` (test-provided but exercise real JobRunner dispatch) |

## Test-by-Test Analysis

### Test: "kills job that runs too long"
| Field | Value |
|-------|-------|
| **Status** | **SKIPPED (test.todo)** |
| **User Story** | A job that runs too long should be killed and marked as failed with a timeout error |
| **What it verifies** | That a job can be transitioned from `running` to `failed` with a timeout error string, and that `error` field contains "timed out" |
| **Code path exercised** | `JobQueue.updateJobStatus()` -- sets status to `failed`, sets `completedAt` timestamp |
| **Mocked** | Timers (`vi.useFakeTimers` / `vi.advanceTimersByTime`). The timeout itself: the test manually calls `updateJobStatus('failed', { error: 'Job timed out...' })` -- no system-enforced timeout exists. |
| **Real** | `JobQueue` state management (status transitions, timestamp recording) |
| **Verdict** | **SKIPPED -- feature not implemented** |
| **Confidence** | HIGH |
| **Concerns** | `JobRunner` has **zero timeout support** -- there is no timeout mechanism anywhere in the codebase. Marked as `test.todo()` to serve as a spec for when timeout is built. |

### Test: "records timeout in audit log"
| Field | Value |
|-------|-------|
| **Status** | **SKIPPED (test.todo)** |
| **User Story** | When a job times out, the audit log should record the timeout reason and duration |
| **What it verifies** | That a `failed` status update with a timeout error message produces an audit entry with `action === 'failed'`, `details.error` containing "timed out", and `durationMs` defined |
| **Code path exercised** | `JobQueue.updateJobStatus()` -> `AuditLogger.recordJobStatusUpdate()` -> `AuditLogger.logEntry()`. The duration calculation runs for real (`Date.now() - job.startedAt.getTime()`), but `startedAt` was set with fake timers so the duration is 0ms or near-0ms. |
| **Mocked** | Timers (`vi.useFakeTimers`). Timeout itself is manually simulated. |
| **Real** | `AuditLogger.recordJobStatusUpdate()` real code path -- audit entry creation, duration calculation, error detail recording |
| **Verdict** | **SKIPPED -- feature not implemented** |
| **Confidence** | MEDIUM |
| **Concerns** | Marked as `test.todo()` alongside the timeout feature tests. |

### Test: "cancels running job when user requests"
| Field | Value |
|-------|-------|
| **Status** | **SKIPPED (test.todo)** |
| **User Story** | A user can cancel a running job, and it stops cleanly with a cancellation reason |
| **What it verifies** | That a job can be transitioned from `running` to `failed` with `error: 'Cancelled by user'`, and that `completedAt` is set |
| **Code path exercised** | `JobQueue.updateJobStatus()` |
| **Mocked** | The cancellation itself -- there is no `cancelJob()` method, no AbortController, no mechanism to interrupt a running handler. The test just sets status to `failed`. |
| **Real** | `JobQueue.updateJobStatus()` state transitions |
| **Verdict** | **SKIPPED -- feature not implemented** |
| **Confidence** | HIGH |
| **Concerns** | Marked as `test.todo()` to serve as a spec for when cancellation is built. |

### Test: "cleans up resources after cancellation"
| Field | Value |
|-------|-------|
| **Status** | **SKIPPED (test.todo)** |
| **User Story** | After cancellation, partial token usage is preserved in the audit log and the cancellation is recorded |
| **What it verifies** | That token usage logged before cancellation persists in the audit log, and that the `failed` action entry has the cancellation error in its details |
| **Code path exercised** | `JobQueue.logTokenUsage()` -> `AuditLogger.logTokenUsage()` -> `AuditLogger.logEntry()`. Also `JobQueue.updateJobStatus()` -> `AuditLogger.recordJobStatusUpdate()`. |
| **Mocked** | Cancellation mechanism (same manual `updateJobStatus('failed')` as above) |
| **Real** | Token usage logging and retrieval, audit entry storage and querying by job ID |
| **Verdict** | **SKIPPED -- feature not implemented** |
| **Confidence** | MEDIUM |
| **Concerns** | Marked as `test.todo()` alongside the cancellation feature tests. |

### Test: "cannot cancel already completed job"
| Field | Value |
|-------|-------|
| **Status** | **SKIPPED (test.todo)** |
| **User Story** | Attempting to cancel a completed job should be a no-op |
| **What it verifies** | That calling `updateJobStatus('failed')` on a completed job **does** change its status (the test asserts `afterJob?.error === 'Cancelled by user'`), and documents this as a design concern |
| **Code path exercised** | `JobQueue.updateJobStatus()` -- specifically the fact that it does NOT guard against status transitions from terminal states |
| **Mocked** | Cancellation mechanism |
| **Real** | The actual behavior of `updateJobStatus` which allows arbitrary state transitions |
| **Verdict** | **SKIPPED -- feature not implemented** |
| **Confidence** | HIGH |
| **Concerns** | Marked as `test.todo()`. When cancellation is built, this test should assert `expect(afterJob?.status).toBe('completed')` instead of confirming the current broken behavior. |

### Test: "respects concurrent job limits"
| Field | Value |
|-------|-------|
| **User Story** | The job runner should never run more than `maxConcurrentJobs` at the same time |
| **What it verifies** | That `JobRunner` with `maxConcurrentJobs: 2` never has more than 2 handlers executing simultaneously, even when 4 jobs are queued |
| **Code path exercised** | `JobRunner.start()` -> `poll()` loop -> `processNextJob()` -> `JobQueue.getNextJob()` -> `JobQueue.updateJobStatus('running')` -> handler execution -> `JobQueue.updateJobStatus('completed')`. The `activeJobs` counter, the `maxConcurrentJobs` gate in `poll()`, and the full handler dispatch pipeline all run for real. |
| **Mocked** | The handler itself is a test-provided function (not a mock framework, but a manually crafted handler that tracks concurrency) |
| **Real** | `JobRunner` polling, concurrency gating via `activeJobs < maxConcurrentJobs`, `JobQueue.getNextJob()`, `JobQueue.updateJobStatus()`, real `setTimeout`-based polling |
| **Verdict** | **TESTING REAL BEHAVIOR** |
| **Confidence** | HIGH |
| **Concerns** | This is the strongest test in the suite. It exercises the real `JobRunner` concurrency mechanism with real async handlers and real timers. The concurrency tracking (`maxObservedConcurrent`) is measured from inside the handler, proving the runner actually gates concurrent execution. Minor concern: uses real `setTimeout` delays (200ms) which makes the test timing-sensitive and potentially flaky on slow CI. The `stats.running + stats.pending === 4` assertion after the first wait is a good state invariant check. |

### Test: "starts waiting job when running job completes"
| Field | Value |
|-------|-------|
| **User Story** | When a running job completes and the queue has capacity, a waiting job should start automatically |
| **What it verifies** | That with `maxConcurrentJobs: 1`, only job1 starts initially, and job2 starts only after job1 completes |
| **Code path exercised** | Same as the concurrency test: full `JobRunner` poll -> `processNextJob` -> handler execution pipeline. Additionally tests the "slot freed up -> next job picked up" path. |
| **Mocked** | Handler is test-provided (manually tracks start order) |
| **Real** | `JobRunner` polling loop, `activeJobs` decrement in `finally` block, subsequent `getNextJob()` call picking up the next job |
| **Verdict** | **TESTING REAL BEHAVIOR** |
| **Confidence** | HIGH |
| **Concerns** | Excellent test of the real runner behavior. The `startOrder` array captures the actual execution sequence. The assertion `startOrder.not.toContain(job2.id)` before job1 completes proves the runner is not eagerly starting job2. The 200ms wait after resolving job1 gives the poll loop time to pick up job2. Same timing-sensitivity concern as the previous test. |

### Test: "user can view complete processing history"
| Field | Value |
|-------|-------|
| **User Story** | After multiple jobs run, the user can see all of them with complete lifecycle events in the audit log |
| **What it verifies** | That two jobs processed sequentially each produce audit entries for `created`, `started`, and `completed` actions, and that `getAllEntries()` returns entries for both |
| **Code path exercised** | `JobQueue.createJob()` -> `AuditLogger.logEntry('created')`, `JobQueue.updateJobStatus('running')` -> `AuditLogger.recordJobStatusUpdate()`, `JobQueue.updateJobStatus('completed')` -> `AuditLogger.recordJobStatusUpdate()`. `AuditLogger.getAllEntries()` query. |
| **Mocked** | Nothing |
| **Real** | Full `JobQueue` + `AuditLogger` integration: job creation triggers audit log entry, each status update triggers audit recording, and `getAllEntries()` returns the complete set |
| **Verdict** | **TESTING REAL BEHAVIOR** |
| **Confidence** | HIGH |
| **Concerns** | Solid integration test. The `created` entry is logged via `AuditLogger.logEntry()` called from `createJob()`, and `started`/`completed` entries come from `recordJobStatusUpdate()` called from `updateJobStatus()`. This verifies the end-to-end audit trail for the job lifecycle. However, `getAllEntries()` just returns the in-memory array -- there is no database persistence being tested. |

### Test: "audit log includes token usage per job"
| Field | Value |
|-------|-------|
| **User Story** | When a job uses LLM tokens, the audit log records the input/output token breakdown |
| **What it verifies** | That `logTokenUsage()` creates an audit entry with `action === 'token_usage'`, `tokensUsed === 1550`, `details.inputTokens === 1200`, and `details.outputTokens === 350` |
| **Code path exercised** | `JobQueue.logTokenUsage()` -> `AuditLogger.logTokenUsage()` -> `AuditLogger.logEntry()` (with `tokensUsed` and `details`). Then `JobQueue.getAuditLogForJob()` -> `AuditLogger.getEntriesForJob()` query. |
| **Mocked** | Nothing |
| **Real** | Full token usage logging pipeline and retrieval |
| **Verdict** | **TESTING REAL BEHAVIOR** |
| **Confidence** | HIGH |
| **Concerns** | This test is nearly identical to the existing "should track tokens used per job" test in the "Audit Logging" describe block (lines 268-281). The difference is this test also checks `details.inputTokens` and `details.outputTokens`, which the earlier test does not. This is redundant but valid. |

### Test: "audit log is queryable by date range"
| Field | Value |
|-------|-------|
| **User Story** | The user can filter audit log entries by date range to find recent activity |
| **What it verifies** | That `AuditLogger.getEntriesByDateRange()` returns only entries within the specified date window, excluding aged entries |
| **Code path exercised** | `AuditLogger.simulateAging()` (shifts `createdAt` timestamps), `AuditLogger.getEntriesByDateRange()` (filters by date comparison) |
| **Mocked** | Time passage is simulated via `simulateAging()` rather than real waiting |
| **Real** | `AuditLogger.getEntriesByDateRange()` filtering logic, `AuditLogger.simulateAging()` timestamp manipulation |
| **Verdict** | **TESTING REAL BEHAVIOR** (verified) |
| **Confidence** | HIGH |
| **Verification** | `getEntriesByDateRange()` in `core/jobs/audit.ts` performs real date filtering: `e.createdAt >= start && e.createdAt <= end`. The filter logic is genuine. `simulateAging()` is a test helper in production code -- flagged but not moved. |
| **Concerns** | `simulateAging()` lives in production code (`audit.ts`) but exists solely for tests. Should be moved to a test utility in a future cleanup. |

### Test: "aggregates token usage across all jobs"
| Field | Value |
|-------|-------|
| **User Story** | The user can see total token usage across all jobs |
| **What it verifies** | That `AuditLogger.getTotalTokensUsed()` returns the sum of `tokensUsed` across all jobs (700 + 400 = 1100) |
| **Code path exercised** | `JobQueue.logTokenUsage()` -> `AuditLogger.logTokenUsage()`, then `AuditLogger.getTotalTokensUsed()` iteration over all entries |
| **Mocked** | Nothing |
| **Real** | Token usage logging and aggregation |
| **Verdict** | **TESTING REAL BEHAVIOR** |
| **Confidence** | HIGH |
| **Concerns** | Straightforward test of the real aggregation logic. `getTotalTokensUsed()` iterates over all entries and sums `tokensUsed` -- this is verified with real data. |

### Test: "tracks token usage per job type"
| Field | Value |
|-------|-------|
| **User Story** | The user can see token usage broken down by job type (e.g., `email_process` vs `topic_summary_update`) |
| **What it verifies** | That by cross-referencing audit log entries with job records, token usage can be attributed to the correct job type (email_process=900, topic_summary_update=500, archive=0, total=1400) |
| **Code path exercised** | `AuditLogger.getAllEntries()` query, `JobQueue.getJob()` lookup, token entry filtering and aggregation |
| **Mocked** | Nothing |
| **Real** | Full token tracking and retrieval pipeline, plus job type lookup |
| **Verdict** | **TESTING REAL BEHAVIOR** (verified) |
| **Confidence** | HIGH |
| **Verification** | Confirmed: test exercises real `AuditLogger` and `JobQueue` instances with no mocks. All data flows through real `logTokenUsage()`, `getAllEntries()`, and `getJob()` code paths. Aggregation logic is in the test itself (cross-referencing audit entries with job types) which is valid -- it verifies raw data integrity. |
| **Concerns** | The aggregation logic lives in the test itself (the `for` loop), not in production code -- there is no `getTokensByJobType()` method. This means the test is verifying that the raw data is correct and can be aggregated, not that the application provides a built-in aggregation by job type. Still, the underlying data integrity is genuinely tested. |

## Overall Assessment
- [x] Tests validate real application behavior (all 5 active tests exercise real code)
- [ ] Tests are mostly testing mocks with some real code
- [ ] Tests are testing mocks only
- **Percentage of real behavior tested: 100% (5 of 5 active tests; 5 skipped as todo)**

### Score Breakdown

| Test | Verdict | Tests Real Code? |
|------|---------|-----------------|
| kills job that runs too long | SKIPPED (test.todo) | N/A -- timeout not implemented |
| records timeout in audit log | SKIPPED (test.todo) | N/A -- timeout not implemented |
| cancels running job when user requests | SKIPPED (test.todo) | N/A -- cancellation not implemented |
| cleans up resources after cancellation | SKIPPED (test.todo) | N/A -- cancellation not implemented |
| cannot cancel already completed job | SKIPPED (test.todo) | N/A -- cancellation not implemented |
| respects concurrent job limits | TESTING REAL | Yes -- full JobRunner concurrency |
| starts waiting job when running job completes | TESTING REAL | Yes -- full JobRunner sequential execution |
| user can view complete processing history | TESTING REAL | Yes -- full audit lifecycle |
| audit log includes token usage per job | TESTING REAL | Yes -- redundant with existing test |
| audit log is queryable by date range | TESTING REAL (verified) | Yes -- real date-range filtering in getEntriesByDateRange() |
| aggregates token usage across all jobs | TESTING REAL | Yes -- token aggregation |
| tracks token usage per job type | TESTING REAL (verified) | Yes -- real AuditLogger + JobQueue data, no mocks |

### Critical Gaps

1. **Timeout is not implemented.** Two tests for job timeout are now marked as `test.todo()`, preserving the spec for when timeout is built. `JobRunner` has no timeout mechanism -- no `AbortController`, no `Promise.race` with a timeout, no timer-based kill logic.

2. **Cancellation is not implemented.** Three tests for job cancellation are now marked as `test.todo()`, preserving the spec for when cancellation is built. There is no `cancelJob()` method, no abort signal propagation, no `cancelled` status.

3. **No database persistence in new tests.** While the `beforeEach` creates a real `:memory:` SQLite database, none of the 10 new tests use it. All new tests use only the in-memory `JobQueue` and `AuditLogger`. This means zero testing of the `jobs` and `audit_log` database tables defined in `schema.ts`. The existing "Startup Recovery" tests (lines 423-551) DO use the real database.

4. **`simulateAging` is a production-code test helper.** The `AuditLogger.simulateAging()` method lives in `core/jobs/audit.ts` (production code) but exists solely for tests. This pollutes the production API surface. Should be moved to a test utility in a future cleanup.

5. **Redundancy with existing tests.** The "audit log includes token usage per job" test (lines 892-911) is nearly identical to the existing "should track tokens used per job" (lines 268-281), differing only in checking `details.inputTokens`/`outputTokens`. The "user can view complete processing history" test overlaps with the existing "should maintain audit log as source of truth" test (lines 403-420).

### Summary

All 5 tests for unimplemented features (timeout: B1-B2, cancellation: B3-B5) have been marked as `test.todo()`, preserving their test code as a spec while preventing them from running. The remaining 5 active tests all exercise genuine application behavior (concurrency, audit lifecycle, token aggregation, date-range filtering). Both C8 (audit log date-range query) and C9 (token usage per job type) have been verified as testing real production code with no mocks.
