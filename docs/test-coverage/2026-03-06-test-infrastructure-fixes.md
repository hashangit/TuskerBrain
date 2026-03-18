# Job System Architecture Review & Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix validated job system issues with pragmatic, minimal solutions appropriate for a single-user desktop app

**Architecture:** Hybrid approach - keep jobs in-memory, use database for audit trail, recover from source data on startup
**Tech Stack:** TypeScript, Vitest, Electron, SQLite/Drizzle

---

## Executive Summary

This plan incorporates findings from a **multi-expert validation review** that examined:
- Whether reported issues actually exist (validation)
- Whether proposed fixes are necessary or over-engineering (minimalism)
- How components should be wired together (holistic review)
- Database vs in-memory strategy (architecture debate)

**Key Insight:** You're building a desktop email app, not a distributed job scheduler. Focus on pragmatic solutions.

---

## Part 1: Issue Validation Results

All 6 originally reported issues were validated by code inspection:

| Issue | Status | Evidence |
|-------|--------|----------|
| **In-memory only** | ✅ CONFIRMED | `core/jobs/queue.ts:10` - `Map<string, Job>`, comment says "In production, this will be replaced" |
| **No crash recovery** | ✅ CONFIRMED | No startup recovery logic in `electron/main.ts`, `core/jobs/runner.ts`, or anywhere else |
| **Memory leak / No cleanup** | ⚠️ PARTIAL | AuditLogger has 90-day retention + `purgeOldEntries()`, but JobQueue has no cleanup |
| **O(n) job selection** | ✅ CONFIRMED | `queue.ts:96-101` - scans all jobs, filters, sorts every poll |
| **No deduplication** | ✅ CONFIRMED | No unique constraint on `(type, emailId)`, `createJob()` doesn't check for duplicates |
| **Race conditions** | ✅ CONFIRMED | No locking, atomic ops, or mutex in `getNextJob()` |

### 🚨 NEW CRITICAL FINDING: Missing Application Initialization

The holistic review discovered that **the main process never initializes the job system**:

```
electron/main.ts → createWindow() → Load React App → ❌ NOTHING ELSE
```

**Missing from main.ts:**
- ❌ JobQueue creation
- ❌ JobRunner creation and start
- ❌ IPC handler registration (`registerIPCHandlers` never called)
- ❌ Utility worker process spawn

**Impact:** The job system exists as code but is **never actually running** in production. Tests pass because they use mocks in `__tests__/test-helpers/app.ts`.

### 🚨 NEW CRITICAL FINDING: GmailSyncManager Not Connected to JobQueue

The integration review found **two separate job tracking systems**:

1. **`core/gmail/sync.ts:61`** - `private backfillJobs: BackfillJob[] = [];`
2. **`electron/utility/sync-manager.ts:38`** - `private backfillJobs: BackfillJob[] = [];`
3. **`core/jobs/queue.ts`** - Separate `JobQueue` class

**None of these are connected.** GmailSyncManager never calls `jobQueue.createJob()`. Emails are processed directly, not via the job queue.

---

## Part 2: What NOT To Do (Over-Engineering)

The following proposed fixes were deemed **OVERKILL** for a single-user desktop app:

### ❌ Interface-Based Design (IJobQueue)

**Proposed:**
```typescript
interface IJobQueue { ... }
class InMemoryJobQueue implements IJobQueue { }
class DatabaseJobQueue implements IJobQueue { }
```

**Why NOT to do:**
- You're a single developer, not a team maintaining multiple implementations
- The comment in `queue.ts:7` says "this will be replaced" - you'll **replace**, not **swap at runtime**
- Interfaces make sense for runtime polymorphism, which you don't need
- TypeScript's structural typing already gives you interface benefits
- Tests use the concrete type anyway - no testability benefit

**Verdict:** 🚫 **OVERKILL** - Just replace the class when ready

---

### ❌ Jitter in Retry Backoff

**Proposed:**
```typescript
const backoffMinutes = Math.pow(2, retryCount - 1) + Math.random();
```

**Why NOT to do:**
- Thundering herd is a **distributed systems** problem (multiple clients retrying simultaneously)
- This is a **single-user desktop app** - only one instance running
- Jobs are already staggered by creation time
- Current exponential backoff (1min → 2min → 4min → 8min → 16min) is sufficient
- Adding jitter adds complexity without solving any real problem

**Verdict:** 🚫 **OVERKILL** - Save for multi-tenant SaaS, not desktop app

---

### ❌ Job Dependencies / DAG-Based Scheduling

**Proposed:**
```typescript
interface JobDependency {
  jobId: string;
  dependsOn: string[];
}
```

**Why NOT to do:**
- Your job types are **independent operations**: `email_process`, `email_archive`, `email_delete`, etc.
- DAG scheduling adds massive complexity: topological sorting, deadlock detection, cycle detection
- This is copying distributed systems patterns inappropriately
- Your sync manager already handles sequencing via phases

**If you need sequencing:** Use event-driven architecture instead - when `email_process` completes, emit an event that triggers `topic_summary_update`. Simpler and more maintainable.

**Verdict:** 🚫 **OVERKILL** - Feature creep

---

## Part 3: What to Defer (Optional)

### ⏸️ Job Prioritization (URGENT, HIGH, NORMAL, LOW)

**When to implement:** When you add user-triggered "Process this email now" actions that should jump ahead of background backfill jobs.

**Simpler alternative if needed:** Add a `priority` field and sort by it in `getNextJob()`. No need for a heap-based priority queue.

**Verdict:** ⏸️ **DEFER** - FIFO is correct for email processing

---

### ⏸️ Bulk Operations (createJobs)

**When to implement:** When profiling shows single `createJob()` calls are slow (after switching to database).

**Simple implementation if needed:**
```typescript
async createJobs(inputs: CreateJobInput[]): Promise<Job[]> {
  return Promise.all(inputs.map(input => this.createJob(input)));
}
```

**Verdict:** ⏸️ **DEFER** - Jobs are created incrementally as emails arrive, not in bulk

---

## Part 4: What MUST Be Done (Real Issues)

### ✅ Task 1: Wire Main Process to Job System

**Priority:** CRITICAL
**Why:** The job system never starts in production

**File:** `electron/main.ts`

**Current state:**
```typescript
app.whenReady().then(async () => {
  createWindow();
  // ❌ Nothing else happens
});
```

**Required changes:**
```typescript
import { JobQueue } from '@core/jobs/queue';
import { JobRunner } from '@core/jobs/runner';
import { registerIPCHandlers } from './ipc/handlers';
import { Database } from '../database/index';

app.whenReady().then(async () => {
  // Initialize database
  const db = new Database();
  await db.initialize();

  // Create and wire job system
  const jobQueue = new JobQueue();
  const jobRunner = new JobRunner(jobQueue);

  // Register IPC handlers
  registerIPCHandlers({ jobQueue, db });

  // Start job processing
  jobRunner.start();

  // Recover unprocessed jobs from source data
  await recoverUnprocessedJobs(db, jobQueue);

  createWindow();
});
```

---

### ✅ Task 2: Connect GmailSyncManager to JobQueue

**Priority:** CRITICAL
**Why:** Two separate job systems exist and aren't connected

**Files:**
- Modify: `core/gmail/sync.ts`
- Modify: `electron/utility/sync-manager.ts`

**Current flow (broken):**
```
Gmail API → GmailSyncManager → processEmail() directly → No job created
```

**Required flow:**
```
Gmail API → GmailSyncManager → jobQueue.createJob('email_process') → JobRunner → processEmail()
```

**Implementation:**
```typescript
// In GmailSyncManager
constructor(
  private client: GmailClient,
  private jobQueue: JobQueue  // Add this dependency
) {}

async processEmailBatch(emails: Email[]): Promise<void> {
  for (const email of emails) {
    // Create job instead of processing directly
    await this.jobQueue.createJob({
      type: 'email_process',
      payload: { emailId: email.id },
      emailId: email.id,
    });
  }
}
```

---

### ✅ Task 3: Add Startup Recovery

**Priority:** HIGH
**Why:** Jobs are lost on app crash

**Architecture Decision:** Use **hybrid approach** - keep jobs in-memory, recover from source data on startup.

**Key Insight:** Jobs are **derived state**, not source state. The source of truth is `emails.isProcessed`.

```
Source of Truth: emails.isProcessed = true/false
                 ↓
Jobs: Derived state (transient work items, in-memory)
                 ↓
Audit Log: Persistent history (database)
```

**Implementation:**
```typescript
// In main.ts or a recovery module
async function recoverUnprocessedJobs(db: Database, jobQueue: JobQueue): Promise<void> {
  const unprocessed = await db.select().from(emails)
    .where(eq(emails.isProcessed, false))
    .limit(100);  // Batch size

  for (const email of unprocessed) {
    await jobQueue.createJob({
      type: 'email_process',
      payload: { emailId: email.id },
      emailId: email.id,
    });
  }

  console.log(`Recovered ${unprocessed.length} unprocessed emails as jobs`);
}
```

---

### ✅ Task 4: Add Rate Limiting (In Gmail Client, NOT Job Queue)

**Priority:** HIGH
**Why:** Gmail API has quota limits (250 quota units/second)

**Important:** Rate limiting belongs at the **Gmail client level**, not the job queue level.

**File:** `core/gmail/client.ts` (or create new wrapper)

**Implementation:**
```typescript
class RateLimitedGmailClient implements GmailClient {
  private rateLimiter = new TokenBucket({ rate: 250, interval: 1000 });

  constructor(private wrappedClient: GmailClient) {}

  async listMessages(options: ListMessagesOptions): Promise<ListMessagesResponse> {
    await this.rateLimiter.throttle();
    return this.wrappedClient.listMessages(options);
  }

  async getMessage(id: string): Promise<Message> {
    await this.rateLimiter.throttle();
    return this.wrappedClient.getMessage(id);
  }

  // ... other methods
}
```

**Simple token bucket:**
```typescript
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private config: { rate: number; interval: number }) {
    this.tokens = config.rate;
    this.lastRefill = Date.now();
  }

  async throttle(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitTime = this.config.interval - (Date.now() - this.lastRefill);
      await sleep(waitTime);
      this.refill();
    }
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.config.interval) {
      this.tokens = this.config.rate;
      this.lastRefill = now;
    }
  }
}
```

---

### ✅ Task 5: Add Job Cleanup

**Priority:** MEDIUM
**Why:** Jobs accumulate in memory forever

**Note:** AuditLogger already has this pattern. Apply it to JobQueue.

**Implementation:**
```typescript
// In JobQueue
private retentionDays: number = 7;  // Keep completed jobs for 7 days

async cleanupOldJobs(): Promise<number> {
  const cutoffDate = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
  const toDelete: string[] = [];

  for (const [id, job] of this.jobs) {
    if (
      (job.status === 'completed' || job.status === 'dead') &&
      job.completedAt &&
      job.completedAt < cutoffDate
    ) {
      toDelete.push(id);
    }
  }

  toDelete.forEach(id => this.jobs.delete(id));
  return toDelete.length;
}
```

**Call on startup:**
```typescript
// In main.ts after recovery
await jobQueue.cleanupOldJobs();
```

---

### ✅ Task 6: Add Job Deduplication

**Priority:** MEDIUM
**Why:** Multiple syncs could create duplicate jobs for same email

**Implementation:**
```typescript
// In JobQueue.createJob()
async createJob(input: CreateJobInput): Promise<Job> {
  // Check for existing pending/running job for same email
  if (input.emailId) {
    const existing = Array.from(this.jobs.values()).find(
      job =>
        job.emailId === input.emailId &&
        job.type === input.type &&
        (job.status === 'pending' || job.status === 'running')
    );
    if (existing) {
      return existing;  // Return existing job instead of creating duplicate
    }
  }

  // Create new job
  const job: Job = {
    id: uuidv4(),
    // ... rest of job creation
  };
  this.jobs.set(job.id, job);
  return job;
}
```

---

## Part 5: Architecture Recommendation - Hybrid Approach

### Decision: Keep jobs in-memory, use database for audit trail only

**Rationale:**

1. **Your jobs table should be an AUDIT LOG, not a queue**
   - Queue = fast, in-memory, transient
   - Audit log = persistent, queriable, historical
   - These are DIFFERENT concerns with different requirements

2. **Source of truth is `emails.isProcessed`**
   - If `isProcessed: false` → job needs to run
   - If `isProcessed: true` → job already done
   - Jobs table is for HISTORY, not state management

3. **Crash recovery is simple**
   ```typescript
   // On startup: recreate jobs from unprocessed emails
   const unprocessed = await db.select().from(emails)
     .where(eq(emails.isProcessed, false));

   for (const email of unprocessed) {
     await queue.createJob({ type: 'email_process', emailId: email.id });
   }
   ```

### What You Get:

| Benefit | How |
|---------|-----|
| ✅ Crash recovery | From `isProcessed` flag |
| ✅ Audit trail | In database |
| ✅ Job history | Queryable |
| ✅ Performance | In-memory queue |
| ✅ Simplicity | Minimal code changes |

---

## Part 6: Original Tasks (Already Completed)

These tasks from the original plan have been completed:

### ~~Task 1: Add Missing JobQueue Methods~~ ✅ DONE
- Commit: `51477fc` - feat: add missing JobQueue methods for pause/resume and audit logging
- Commit: `76a46c0` - fix: make getNextJob respect processingPaused flag

### ~~Task 2: Fix GmailSyncManager Duplicate Method~~ ✅ DONE
- Commit: `a0dafc2` - fix: remove duplicate getSavedProgress method in GmailSyncManager

### ~~Task 3: Document Test Categories~~ ✅ DONE
- Commit: `e7bb341` - docs: add testing strategy documentation

---

## Part 7: Implementation Priority Order

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1 | Wire main.ts → JobQueue/JobRunner | 2-3 hrs | Critical - system doesn't work without this |
| 2 | Connect GmailSyncManager → JobQueue | 2-3 hrs | Critical - emails not being queued |
| 3 | Add startup recovery | 1-2 hrs | High - crash recovery |
| 4 | Add rate limiting in Gmail client | 2-3 hrs | High - API quota protection |
| 5 | Add job cleanup | 1 hr | Medium - memory management |
| 6 | Add job deduplication | 1 hr | Medium - prevent duplicate work |

**Total estimated effort:** 9-13 hours

---

## Part 8: Testing Strategy (Two-Fold Architecture)

The codebase uses **Test-Driven Development (TDD)** with two distinct test categories:

### 🧪 Type 1: Feature Tests (`__tests__/features/`)

**Purpose:** Verify internal implementation details and code functionality

**Focus:**
- Code correctness
- Component wiring
- Edge cases and error handling
- State transitions

**Mocking Strategy:**
- ✅ DO mock: External APIs (Gmail, OpenAI, Anthropic)
- ✅ DO mock: Network calls, file system (when testing business logic)
- ❌ DON'T mock: Internal services (JobQueue, AuditLogger, repositories)
- ❌ DON'T mock: Database (use in-memory or test database)
- ❌ DON'T mock: Business logic (test the actual implementation)

**Example:**
```typescript
// TDD test - tests internal behavior
describe('JobQueue', () => {
  it('should create job with pending status', async () => {
    const queue = new JobQueue();
    const job = await queue.createJob({
      type: 'email_process',
      payload: { emailId: 'test-123' },
    });

    expect(job.status).toBe('pending');
    expect(job.id).toBeDefined();
  });
});
```

---

### 👤 Type 2: POV Tests (`__tests__/features-pov/`)

**Purpose:** Verify user-facing outcomes based on design spec

**Focus:**
- User can accomplish goals
- Observable behavior
- UX flows and interactions
- Feature completeness

**Mocking Strategy:**
- ✅ DO mock: External APIs only (Gmail, LLM providers)
- ❌ DON'T mock: Any internal code
- ❌ DON'T mock: The entire app (use real components)

**Example:**
```typescript
// POV test - tests user outcome
describe('Job System', () => {
  it('User can see job progress during email processing', async () => {
    const app = await TuskerBrainApp.launch();
    await app.seedEmails({ count: 10 });

    await app.startProcessing();

    const progress = await app.getProcessingProgress();
    expect(progress.status).toBe('running');
    expect(progress.processedCount).toBeGreaterThan(0);
  });
});
```

---

### ⚠️ Mock Gap Analysis (TODO Items)

The following mocks exist in `__tests__/test-helpers/app.ts` but the **real implementations don't exist yet**. This is intentional for testing, but these need real implementations:

| Mock | Real Implementation Status | Blocks Production? |
|------|---------------------------|-------------------|
| `MockJobQueue` | ⚠️ `JobQueue` exists but never started in main.ts | ✅ YES |
| `MockGmailClient` | ⚠️ `GmailClient` exists but not wired to JobQueue | ✅ YES |
| `MockSyncManager` | ⚠️ `SyncManager` exists but standalone, not integrated | ✅ YES |
| `MockDatabase` | ✅ `Database` exists and works | ❌ NO |
| `MockAuditLogger` | ✅ `AuditLogger` exists and works | ❌ NO |

**TODO:** When implementing Tasks 1-2, remove mocks and use real implementations in POV tests.

---

### TDD Workflow for This Plan

For each task, follow this workflow:

```
1. Write failing test in __tests__/features/
2. Run: npm test -- --run <test-file>
3. Confirm: Test FAILS (red)
4. Implement minimum code to pass
5. Run: npm test -- --run <test-file>
6. Confirm: Test PASSES (green)
7. Run POV test (if applicable)
8. Commit with descriptive message
```

**Important:** The test helper in `__tests__/test-helpers/app.ts` is a MOCK. The real production wiring doesn't exist yet - that's what Tasks 1-2 address. When those tasks are complete, update POV tests to use real implementations.

---

## Part 9: Implementation Steps with TDD

### Task 1: Wire Main Process to Job System

**Test file:** `__tests__/electron/main-initialization.test.ts` (CREATE)

#### Step 1.1: Write failing test
```typescript
// __tests__/electron/main-initialization.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Main Process Initialization', () => {
  it('should initialize JobQueue on app ready', async () => {
    // This test will fail because main.ts doesn't initialize JobQueue
    const { getJobQueue } = await import('@electron/main');
    const queue = getJobQueue();

    expect(queue).toBeDefined();
    expect(typeof queue.createJob).toBe('function');
  });

  it('should start JobRunner on app ready', async () => {
    const { getJobRunner } = await import('@electron/main');
    const runner = getJobRunner();

    expect(runner).toBeDefined();
    expect(runner.isRunning()).toBe(true);
  });

  it('should register IPC handlers on app ready', async () => {
    const { ipcMain } = await import('electron');

    // Check that our handlers are registered
    expect(ipcMain.listenerCount('job:create')).toBeGreaterThan(0);
    expect(ipcMain.listenerCount('job:getStats')).toBeGreaterThan(0);
  });
});
```

#### Step 1.2: Run failing test
```bash
npm test -- --run __tests__/electron/main-initialization.test.ts
# Expected: FAIL - getJobQueue is not exported
```

#### Step 1.3: Implement in `electron/main.ts`
```typescript
// Add exports for testing
let jobQueue: JobQueue | null = null;
let jobRunner: JobRunner | null = null;

export function getJobQueue(): JobQueue | null {
  return jobQueue;
}

export function getJobRunner(): JobRunner | null {
  return jobRunner;
}

// In app.whenReady()
app.whenReady().then(async () => {
  const db = new Database();
  await db.initialize();

  jobQueue = new JobQueue();
  jobRunner = new JobRunner(jobQueue);

  registerIPCHandlers({ jobQueue, db });
  jobRunner.start();

  await recoverUnprocessedJobs(db, jobQueue);
  await jobQueue.cleanupOldJobs();

  createWindow();
});
```

#### Step 1.4: Run test again
```bash
npm test -- --run __tests__/electron/main-initialization.test.ts
# Expected: PASS
```

#### Step 1.5: Commit
```bash
git add electron/main.ts __tests__/electron/main-initialization.test.ts
git commit -m "feat: wire main process to job system with startup recovery"
```

---

### Task 2: Connect GmailSyncManager to JobQueue

**Test file:** `__tests__/integrations/gmail-sync-queue.test.ts` (CREATE)

#### Step 2.1: Write failing test
```typescript
// __tests__/integrations/gmail-sync-queue.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GmailSyncManager } from '@core/gmail/sync';
import { JobQueue } from '@core/jobs/queue';
import { MockGmailClient } from '../mocks/gmail-client';

describe('GmailSyncManager → JobQueue Integration', () => {
  let syncManager: GmailSyncManager;
  let jobQueue: JobQueue;
  let mockClient: MockGmailClient;

  beforeEach(() => {
    mockClient = new MockGmailClient();
    jobQueue = new JobQueue();
    syncManager = new GmailSyncManager(mockClient, jobQueue);
  });

  it('should create jobs for fetched emails', async () => {
    mockClient.seedEmails([
      { id: 'email-1', subject: 'Test 1' },
      { id: 'email-2', subject: 'Test 2' },
    ]);

    await syncManager.fetchAndQueueEmails();

    const stats = await jobQueue.getStats();
    expect(stats.pending).toBe(2);
  });

  it('should not create duplicate jobs for same email', async () => {
    mockClient.seedEmails([{ id: 'email-1', subject: 'Test' }]);

    await syncManager.fetchAndQueueEmails();
    await syncManager.fetchAndQueueEmails(); // Call twice

    const stats = await jobQueue.getStats();
    expect(stats.pending).toBe(1); // Still only 1 job
  });
});
```

#### Step 2.2: Run failing test
```bash
npm test -- --run __tests__/integrations/gmail-sync-queue.test.ts
# Expected: FAIL - GmailSyncManager doesn't accept jobQueue in constructor
```

#### Step 2.3: Implement
```typescript
// In core/gmail/sync.ts
export class GmailSyncManager {
  constructor(
    private client: GmailClient,
    private jobQueue: JobQueue  // Add dependency
  ) {}

  async fetchAndQueueEmails(): Promise<void> {
    const result = await this.client.listMessages({ maxResults: 100 });

    for (const message of result.messages || []) {
      await this.jobQueue.createJob({
        type: 'email_process',
        payload: { emailId: message.id },
        emailId: message.id,
      });
    }
  }
}
```

#### Step 2.4: Run test again
```bash
npm test -- --run __tests__/integrations/gmail-sync-queue.test.ts
# Expected: PASS
```

#### Step 2.5: Commit
```bash
git add core/gmail/sync.ts __tests__/integrations/gmail-sync-queue.test.ts
git commit -m "feat: connect GmailSyncManager to JobQueue for email processing"
```

---

### Tasks 3-6: Follow Same TDD Pattern

For each remaining task:
1. Create test file in `__tests__/features/`
2. Write failing test
3. Implement minimum code
4. Verify test passes
5. Commit

---

## Part 10: Original Task Details (Preserved for Reference)

### ~~Task 1: Add Missing JobQueue Methods~~ ✅ DONE

**Files modified:**
- `core/jobs/queue.ts` - Added `pauseProcessing()`, `resumeProcessing()`, `isPaused()`, `getAuditLogForJob()`, `logTokenUsage()`

**Commits:**
- `51477fc` - feat: add missing JobQueue methods for pause/resume and audit logging
- `76a46c0` - fix: make getNextJob respect processingPaused flag

**Test coverage:** `__tests__/features/job-queue.test.ts`

---

### ~~Task 2: Fix GmailSyncManager Duplicate Method~~ ✅ DONE

**Issue:** Lines 81-83 and 101-106 in `core/gmail/sync.ts` had duplicate `getSavedProgress` methods with different return types.

**Fix:** Removed simpler version (lines 81-83), kept extended version that includes checkpoint.

**Commit:** `a0dafc2` - fix: remove duplicate getSavedProgress method in GmailSyncManager

---

### ~~Task 3: Document Test Categories~~ ✅ DONE

**File created:** `docs/testing-strategy.md`

**Commit:** `e7bb341` - docs: add testing strategy documentation

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-03-06-test-infrastructure-fixes.md`.

### Execution Checklist

- [x] Task 1: Wire main.ts → JobQueue/JobRunner (2-3 hrs)
  - [x] Write failing test in `__tests__/electron/main-initialization.test.ts`
  - [x] Implement in `electron/main.ts`
  - [x] Verify tests pass
  - [x] Commit

- [x] Task 2: Connect GmailSyncManager → JobQueue (2-3 hrs)
  - [x] Write failing test in `__tests__/integrations/gmail-sync-queue.test.ts`
  - [x] Modify `core/gmail/sync.ts`
  - [x] Verify tests pass
  - [x] Commit

- [x] Task 3: Add startup recovery (1-2 hrs)
  - [x] Write failing test
  - [x] Implement `recoverUnprocessedJobs()`
  - [x] Verify tests pass
  - [x] Commit

- [x] Task 4: Add rate limiting in Gmail client (2-3 hrs)
  - [x] Write failing test
  - [x] Implement `RateLimitedGmailClient`
  - [x] Verify tests pass
  - [x] Commit

- [x] Task 5: Add job cleanup (1 hr)
  - [x] Write failing test
  - [x] Implement `cleanupOldJobs()`
  - [x] Verify tests pass
  - [x] Commit

- [x] Task 6: Add job deduplication (1 hr)
  - [x] Write failing test
  - [x] Modify `createJob()` to check for duplicates
  - [x] Verify tests pass
  - [x] Commit

- [x] Test Coverage Gap Fix
  - [x] Add explicit unit tests for `cleanupOldJobs()` (6 tests)
  - [x] Add explicit unit tests for job deduplication (7 tests)
  - [x] Commit: `587a77b`

**Key reminder:** Focus on pragmatic minimalism. You're building a desktop email app, not a distributed job scheduler.

---

## ✅ Plan Completed (2026-03-16)

All tasks have been implemented and verified:

| Task | Status | Key Files |
|------|--------|-----------|
| 1. Wire main.ts → JobQueue/JobRunner | ✅ DONE | `electron/main.ts`, `__tests__/electron/main-initialization.test.ts` |
| 2. Connect GmailSyncManager → JobQueue | ✅ DONE | `core/gmail/sync.ts`, `__tests__/integrations/gmail-sync-queue.test.ts` |
| 3. Add startup recovery | ✅ DONE | `database/index.ts` (`recoverUnprocessedJobs`) |
| 4. Add rate limiting | ✅ DONE | `core/gmail/rate-limited-client.ts`, `__tests__/features/gmail-rate-limiter.test.ts` |
| 5. Add job cleanup | ✅ DONE | `core/jobs/queue.ts` (`cleanupOldJobs`) |
| 6. Add job deduplication | ✅ DONE | `core/jobs/queue.ts` (in `createJob`) |
| Test coverage fix | ✅ DONE | `__tests__/features/job-queue.test.ts` (+13 tests) |

**Final test count:** 34 tests in `job-queue.test.ts` (all passing)
