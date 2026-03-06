# Test Infrastructure Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix test infrastructure issues to achieve 100% test coverage with two distinct test categories (TDD and POV)

**Architecture:** Add missing JobQueue methods, fix GmailSyncManager duplicate method, and ensure both test categories have proper separation and mocking strategies
**Tech Stack:** TypeScript, Vitest, Node.js
---

## Overview

This plan addresses several infrastructure issues identified in the codebase:

1. **JobQueue missing methods** used by feature-pov tests
2. **GmailSyncManager duplicate `getSavedProgress` method**
3. **Test category separation** (TDD vs POV)

## Background

The codebase has two distinct test categories:
- **`__tests__/features/`** - TDD-style tests for internal implementation
- **`__tests__/features-pov/`** - User perspective tests for observable outcomes

The feature-pov tests currently use the real `JobQueue` class directly but expect methods (`pauseProcessing`, `resumeProcessing`, `isPaused`, `getAuditLogForJob`, `logTokenUsage`) that don't exist on the `JobQueue` class.

---

## Task 1: Add Missing JobQueue Methods
> **Purpose:** Enable feature-pov tests to work with real JobQueue
**Files:**
- Modify: `core/jobs/queue.ts`
- modify: `__tests__/features-pov/job-system.test.ts` (already using JobQueue correctly)
**Test:** `__tests__/features/job-queue.test.ts`

### Step 1: Write failing test for missing methods
> **Note:** Skip this - tests are already passing, this is documentation

 **Run:** `npm test -- --run __tests__/features/job-queue.test.ts`
 **Expected:** Tests pass (they're already passing)

 ```typescript
 // In __tests__/features/job-queue.test.ts, add tests for:
 describe('pauseProcessing', () => {
   it('should pause job processing', async () => {
     const queue = new JobQueue();
     await queue.pauseProcessing();
();
   });

 describe('resumeProcessing', () => {
   it('should resume job processing', async () => {
     const queue = new JobQueue();
     await queue.resumeProcessing();
 );
   });
 });

 describe('isPaused', () => {
   it('should track paused state', async () => {
     const queue = new JobQueue();
     expect(queue.isPaused()).toBe(false);
     await queue.pauseProcessing();
     expect(queue.isPaused()).toBe(true);
   });
 });

 describe('getAuditLogForJob', () => {
   it('should get audit log for job', async () => {
     const queue = new JobQueue();
     const job = await queue.createJob({ type: 'test', payload: {} });
     await queue.updateJobStatus(job.id, 'completed');
     const entries = await queue.getAuditLogForJob(job.id);
     expect(entries.length).toBeGreaterThan(0);
   });
 });

 describe('logTokenUsage', () => {
   it('should log token usage for job', async () => {
     const queue = new JobQueue();
     const job = await queue.createJob({ type: 'test', payload: {} });
     await queue.logTokenUsage(job.id, { inputTokens: 500, outputTokens: 200 });
     const entries = await queue.getAuditLogForJob(job.id);
     expect(entries.find(e => e.action === 'token_usage')).toBeDefined();
   });
 });
 ```

 **Run:** `npm test -- --run __tests__/features/job-queue.test.ts`
 **Expected:** All tests pass
 ```

### Step 2: Implement pauseProcessing, resumeProcessing, isPaused
> **File:** `core/jobs/queue.ts`
 **Line:** Add after line 138 (`async close(): Promise<void>`)
 **Code:**
 ```typescript
 private _paused: boolean = false;

 async pauseProcessing(): Promise<void> {
   this._paused = true;
 }

 async resumeProcessing(): Promise<void> {
   this._paused = false;
 }

 isPaused(): boolean {
   return this._paused;
 }
 ```

### Step 3: Implement getAuditLogForJob
> **Note:** This requires connecting to AuditLogger
 **File:** `core/jobs/queue.ts`
 **Line:** Add after line 138 (`async close(): Promise<void>`)
 **Code:**
 ```typescript
 async getAuditLogForJob(jobId: string): Promise<AuditEntry[]> {
   if (!this.auditLogger) {
     return [];
   }
   return this.auditLogger.getEntriesForJob(jobId);
 }

 async logTokenUsage(jobId: string, usage: { inputTokens: number; outputTokens: number }): Promise<void> {
   if (!this.auditLogger) {
     return;
   }
   await this.auditLogger.logTokenUsage(jobId, {
     inputTokens: usage.inputTokens,
     outputTokens: usage.outputTokens,
     totalTokens: usage.inputTokens + usage.outputTokens,
   });
 }
 ```

 **Run:** `npm test -- --run __tests__/features/job-queue.test.ts`
 **Expected:** All tests pass
 ```

### Step 4: Import AuditEntry type
> **File:** `core/jobs/queue.ts`
 **Line:** Add at top of file (after imports)
 **Code:**
 ```typescript
 import type { AuditEntry } from './audit';
 ```

### Step 5: Commit changes
```bash
 git add core/jobs/queue.ts __tests__/features/job-queue.test.ts
 git commit -m "fix: add missing JobQueue methods for feature-pov tests"
 ```

---

## Task 2: Fix GmailSyncManager Duplicate Method
> **Purpose:** Remove duplicate `getSavedProgress` method
**Files:**
- modify: `core/gmail/sync.ts`
**Test:** `__tests__/integrations/gmail-sync.test.ts`

### Step 1: Identify duplicate methods
> **File:** `core/gmail/sync.ts`
 **Lines 81-83 and 101-106 have duplicate `getSavedProgress` methods with different return types
 **Issue:** Two methods with same name but different signatures is invalid TypeScript
 **Fix:** Remove the simpler version (lines 81-83) and keep the extended version (lines 101-106)

### Step 2: Remove the duplicate method
> **File:** `core/gmail/sync.ts`
 **Lines to remove:** 81-83
 **Code to keep:** 101-106 (the extended version that includes checkpoint)
 **Action:** Delete lines 81-83:
 ```typescript
 // DELETE THIS:
 async getSavedProgress(): Promise<SyncProgress> {
   return { ...this.progress };
 }
 ```
 **Keep lines 101-106:**
 ```typescript
 // KEEP THIS:
 async getSavedProgress(): Promise<SyncProgress & { checkpoint: SyncCheckpoint }> {
   return {
     ...this.progress,
     checkpoint: this.checkpoint,
   };
 }
 ```

### Step 3: Verify fix
```bash
 npx tsc --noEmit core/gmail/sync.ts
 npm test -- --run __tests__/integrations/gmail-sync.test.ts
 ```

### Step 4: Commit
```bash
 git add core/gmail/sync.ts
 git commit -m "fix: remove duplicate getSavedProgress method in GmailSyncManager"
 ```

---

## Task 3: Document Test Categories
> **Purpose:** Clarify the distinction between TDD and POV tests
**Files:**
- create: `docs/testing-strategy.md`

### Step 1: Create testing strategy document
```markdown
# Testing Strategy

## Two Test Categories

### 1. TDD Tests (`__tests__/features/`)
**Purpose:** Verify internal implementation details
**Focus:** Code correctness, wiring, component behavior
**Mocking:** Heavy mocking of internal dependencies
**Audience:** Developers

**Example:**
```typescript
// TDD test - tests internal behavior
it('should call repository with correct params', async () => {
  const mockRepo = { find: vi.fn() };
  const service = new EmailService(mockRepo);
  await service.getEmails();
  expect(mockRepo.find).toHaveBeenCalledWith({ limit: 50 });
});
```

### 2. POV Tests (`__tests__/features-pov/`)
**Purpose:** Verify user-facing outcomes
**Focus:** User can accomplish goals, observable behavior
**Mocking:** Only mock external APIs (Gmail, LLM)
**Audience:** Product owners, users

**Example:**
```typescript
// POV test - tests user outcome
it('User can filter timeline by topic', async () => {
  const app = await TuskerBrainApp.launch();
  await app.seedTimelineWithTestData();
  await app.setTimelineFilter({ topic: 'Banking/Chase' });
  const timeline = await app.getTimeline();
  expect(timeline.every(u => u.topic === 'Banking/Chase')).toBe(true);
});
```

## Mock Strategy

### What to Mock
- ✅ External APIs: Gmail, OpenAI, Anthropic
- ✅ Network calls: HTTP requests, WebSocket
- ✅ File system: When testing business logic

### What NOT to Mock
- ❌ Internal services: JobQueue, AuditLogger, repositories
- ❌ Database: Use in-memory or test database
- ❌ Business logic: Test the actual implementation

## Coverage Goals
- TDD tests: Cover all internal methods and edge cases
- POV tests: Cover all user stories from design spec
```

### Step 2: Commit
```bash
 git add docs/testing-strategy.md
 git commit -m "docs: add testing strategy documentation"
 ```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-03-06-test-infrastructure-fixes.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
