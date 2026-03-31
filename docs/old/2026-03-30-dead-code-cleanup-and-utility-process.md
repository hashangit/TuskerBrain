# Dead Code Cleanup & Utility Process Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code (SummaryGenerator, EmailProcessingWorkflow, extract.ts functions, UtilityWorker), rewrite tests to use production LangGraph path with mocked LLM, and wire up the Electron utility process.

**Architecture:** Production email processing flows through `EmailProcessingOrchestrator` → `processEmailWithWorkflow()` (LangGraph). Dead code exists because tests imported rule-based alternatives. The Electron utility process will move job execution to a separate OS process for UI responsiveness, using Electron's `utilityProcess.fork()` API (not `node:worker_threads`).

**Tech Stack:** TypeScript, Vitest, Electron 40.7 (ESM), vite-plugin-electron, LangGraph, Vercel AI SDK

---

## File Structure

### Files to CREATE
| File | Responsibility |
|------|---------------|
| `core/workflows/processing-decision.ts` | ProcessingDecision class extracted from email-processing.ts |
| `__tests__/workflows/processing-decision.test.ts` | Tests for ProcessingDecision (moved from deleted email-processing.test.ts) |
| `__tests__/electron/utility/index.test.ts` | Tests for utility process entry point |

### Files to DELETE
| File | Reason |
|------|--------|
| `core/workflows/email-processing.ts` | Dead: EmailProcessingWorkflow, WorkflowState |
| `core/workflows/nodes/extract.ts` | Dead: extractFromEmail, extractUpdate, extractDeal |
| `core/summaries/generator.ts` | Dead: SummaryGenerator |
| `electron/utility/worker.ts` | Dead: UtilityWorker, NotImplementedError |
| `__tests__/workflows/email-processing.test.ts` | Tests dead EmailProcessingWorkflow |
| `__tests__/workflows/email-extraction.test.ts` | Tests dead extract.ts functions |
| `__tests__/features/summary-generation.test.ts` | Tests dead SummaryGenerator |
| `__tests__/electron/utility/worker.test.ts` | Tests dead UtilityWorker |

### Files to MODIFY
| File | Change |
|------|--------|
| `core/gmail/sync.ts` | Update ProcessingDecision import path |
| `electron/utility/index.ts` | Fix: replace `node:worker_threads` with `process.parentPort` |
| `electron/main.ts` | Replace in-process JobRunner with utilityProcess.fork() |
| `vite.config.ts` | Add second electron entry for utility process |
| `__tests__/features/archival-rules.test.ts` | Update ProcessingDecision import path |
| `__tests__/features-pov/inbox-manager.test.ts` | Remove dead imports, rewrite extraction tests with mock LLM |
| `__tests__/features-pov/deals.test.ts` | Remove extractDeal import, rewrite with mock LLM |
| `__tests__/features-pov/topic-summaries.test.ts` | Rewrite: replace SummaryGenerator with orchestrator + mock LLM |
| `__tests__/features-pov/sender-summaries.test.ts` | Rewrite: replace SummaryGenerator with orchestrator + mock LLM |
| `__tests__/features-pov/edge-cases/low-content.test.ts` | Remove dead imports, rewrite with mock LLM |
| `__tests__/features-pov/edge-cases/conflicting-info.test.ts` | Rewrite: replace SummaryGenerator with mock LLM |
| `__tests__/features-pov/edge-cases/rapid-updates.test.ts` | Remove SummaryGenerator imports, rewrite with mock LLM |
| `docs/plans/2026-03-29-gap-analysis-and-implementation-findings.md` | Mark gaps as RESOLVED |

---

## Track A: Dead Code Cleanup + Test Rewrites

### Task 1: Extract ProcessingDecision to its own file

**Files:**
- Create: `core/workflows/processing-decision.ts`
- Delete: `core/workflows/email-processing.ts` (after extraction)

- [ ] **Step 1: Write the test (verify current tests still pass with new import)**

Create `__tests__/workflows/processing-decision.test.ts` with the ProcessingDecision tests extracted from the existing `email-processing.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ProcessingDecision } from '@core/workflows/processing-decision';
import type { Email } from '@core/types/email';

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

describe('ProcessingDecision', () => {
  it('should decide to delete old promotional emails', async () => {
    const email: Partial<Email> = {
      id: 'email-1',
      threadId: 'thread-1',
      senderEmail: 'deals@amazon.com',
      senderName: 'Amazon Deals',
      senderDomain: 'amazon.com',
      subject: '50% off Electronics - Today Only!',
      snippet: 'Save big on electronics today!',
      receivedAt: daysAgo(270),
      gmailCategory: 'promotions',
    };

    const decision = await ProcessingDecision.decide(email as Email);

    expect(decision.action).toBe('delete');
    expect(decision.reason.toLowerCase()).toContain('promotional');
  });

  it('should decide to delete very old promotional emails (2+ years)', async () => {
    const email: Partial<Email> = {
      id: 'email-1b',
      threadId: 'thread-1b',
      senderEmail: 'deals@amazon.com',
      senderName: 'Amazon Deals',
      senderDomain: 'amazon.com',
      subject: '50% off Electronics - Today Only!',
      snippet: 'Save big on electronics today!',
      receivedAt: daysAgo(800),
      gmailCategory: 'promotions',
    };

    const decision = await ProcessingDecision.decide(email as Email);

    expect(decision.action).toBe('delete');
    expect(decision.reason.toLowerCase()).toContain('promotional');
  });

  it('should decide to archive old update emails', async () => {
    const email: Partial<Email> = {
      id: 'email-2',
      threadId: 'thread-2',
      senderEmail: 'noreply@chase.com',
      senderName: 'Chase Bank',
      senderDomain: 'chase.com',
      subject: 'Your January Statement is Ready',
      snippet: 'Your statement is now available.',
      receivedAt: daysAgo(45),
      gmailCategory: 'updates',
    };

    const decision = await ProcessingDecision.decide(email as Email);

    expect(decision.action).toBe('archive');
  });

  it('should decide to process recent regular emails', async () => {
    const email: Partial<Email> = {
      id: 'email-3',
      threadId: 'thread-3',
      senderEmail: 'john.smith@company.com',
      senderName: 'John Smith',
      senderDomain: 'company.com',
      subject: 'Re: Project Alpha - Sprint Review',
      snippet: 'Hi team, Just wanted to follow up...',
      receivedAt: new Date(),
      gmailCategory: 'primary',
    };

    const decision = await ProcessingDecision.decide(email as Email);

    expect(decision.action).toBe('process');
    expect(decision.needsExtraction).toBe(true);
  });

  it('should decide to extract deals from recent promotional emails', async () => {
    const email: Partial<Email> = {
      id: 'email-4',
      threadId: 'thread-4',
      senderEmail: 'offers@bestbuy.com',
      senderName: 'Best Buy',
      senderDomain: 'bestbuy.com',
      subject: 'Flash Sale - 20% Off All TVs!',
      snippet: 'Shop now and save big on all television models.',
      receivedAt: new Date(),
      gmailCategory: 'promotions',
    };

    const decision = await ProcessingDecision.decide(email as Email);

    expect(decision.action).toBe('extract_deals');
  });
});
```

- [ ] **Step 2: Run test to verify it fails (import path doesn't exist yet)**

Run: `pnpm vitest --run __tests__/workflows/processing-decision.test.ts`
Expected: FAIL — `Cannot find module '@core/workflows/processing-decision'`

- [ ] **Step 3: Create `core/workflows/processing-decision.ts`**

```typescript
import type { Email, EmailType } from '@core/types/email';
import { classifyEmailType } from './nodes/classify';

/**
 * Decision about how to handle an email based on type and age.
 */
export interface ProcessingDecisionResult {
  action: 'process' | 'archive' | 'delete' | 'extract_deals';
  reason: string;
  needsExtraction: boolean;
  needsTopicLabeling: boolean;
}

/**
 * Age-based rules for email handling.
 */
const AGE_THRESHOLDS = {
  ONE_MONTH: 30,
  SIX_MONTHS: 180,
  TWO_YEARS: 730,
};

/**
 * Determines the processing action based on email type and age.
 *
 * Used in production by:
 * - `core/gmail/sync.ts` — GmailSyncManager.applyCleanupRules() for batch cleanup
 * - `core/workflows/langgraph-workflow.ts` — inline decideNode (duplicated logic)
 */
export class ProcessingDecision {
  static async decide(email: Email): Promise<ProcessingDecisionResult> {
    const classification = await classifyEmailType(email);
    const ageInDays = this.getEmailAgeInDays(email);

    switch (classification.type) {
      case 'promotional':
        return this.decideForPromotional(email, ageInDays);
      case 'social':
        return this.decideForSocial(email, ageInDays);
      case 'updates':
        return this.decideForUpdates(email, ageInDays);
      case 'regular':
      default:
        return this.decideForRegular(email, ageInDays);
    }
  }

  private static getEmailAgeInDays(email: Email): number {
    const now = new Date();
    const received = new Date(email.receivedAt);
    const diffMs = now.getTime() - received.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private static decideForPromotional(
    _email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    if (ageInDays <= AGE_THRESHOLDS.ONE_MONTH) {
      return {
        action: 'extract_deals',
        reason: 'Recent promotional email - extract deals',
        needsExtraction: true,
        needsTopicLabeling: false,
      };
    }
    return {
      action: 'delete',
      reason: `Promotional email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }

  private static decideForSocial(
    _email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    if (ageInDays >= AGE_THRESHOLDS.TWO_YEARS) {
      return {
        action: 'archive',
        reason: 'Social email older than 2 years',
        needsExtraction: false,
        needsTopicLabeling: false,
      };
    }
    if (ageInDays < AGE_THRESHOLDS.ONE_MONTH) {
      return {
        action: 'process',
        reason: 'Recent social email',
        needsExtraction: true,
        needsTopicLabeling: true,
      };
    }
    return {
      action: 'delete',
      reason: `Social email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }

  private static decideForUpdates(
    _email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    if (ageInDays < AGE_THRESHOLDS.ONE_MONTH) {
      return {
        action: 'process',
        reason: 'Recent update email',
        needsExtraction: true,
        needsTopicLabeling: true,
      };
    }
    return {
      action: 'archive',
      reason: `Update email older than ${AGE_THRESHOLDS.ONE_MONTH} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }

  private static decideForRegular(
    _email: Email,
    ageInDays: number
  ): ProcessingDecisionResult {
    if (ageInDays < AGE_THRESHOLDS.SIX_MONTHS) {
      return {
        action: 'process',
        reason: 'Recent regular email',
        needsExtraction: true,
        needsTopicLabeling: true,
      };
    }
    return {
      action: 'archive',
      reason: `Regular email older than ${AGE_THRESHOLDS.SIX_MONTHS} days`,
      needsExtraction: false,
      needsTopicLabeling: false,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run __tests__/workflows/processing-decision.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Update import in `core/gmail/sync.ts`**

Change line 3 from:
```typescript
import { ProcessingDecision } from '@core/workflows/email-processing';
```
to:
```typescript
import { ProcessingDecision } from '@core/workflows/processing-decision';
```

- [ ] **Step 6: Update import in `__tests__/features/archival-rules.test.ts`**

Change line 2 from:
```typescript
import { ProcessingDecision } from '@core/workflows/email-processing';
```
to:
```typescript
import { ProcessingDecision } from '@core/workflows/processing-decision';
```

- [ ] **Step 7: Update import in `__tests__/features-pov/inbox-manager.test.ts`**

Change line 6 from:
```typescript
import { ProcessingDecision } from '@core/workflows/email-processing';
```
to:
```typescript
import { ProcessingDecision } from '@core/workflows/processing-decision';
```

- [ ] **Step 8: Run full test suite to verify no regressions**

Run: `pnpm test --run`
Expected: All tests pass (1,052)

- [ ] **Step 9: Commit**

```
git add core/workflows/processing-decision.ts __tests__/workflows/processing-decision.test.ts core/gmail/sync.ts __tests__/features/archival-rules.test.ts __tests__/features-pov/inbox-manager.test.ts
git commit -m "refactor: extract ProcessingDecision to its own module"
```

---

### Task 2: Delete dead source files

**Files:**
- Delete: `core/workflows/email-processing.ts`
- Delete: `core/workflows/nodes/extract.ts`
- Delete: `core/summaries/generator.ts`
- Delete: `electron/utility/worker.ts`

- [ ] **Step 1: Delete the four dead source files**

```bash
rm core/workflows/email-processing.ts core/workflows/nodes/extract.ts core/summaries/generator.ts electron/utility/worker.ts
```

- [ ] **Step 2: Verify TypeScript compilation (expect errors in test files we'll fix next)**

Run: `npx tsc --noEmit 2>&1 | grep -v '__tests__' | head -20`
Expected: No errors in production source files (only test files referencing deleted modules)

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "refactor: delete dead code (EmailProcessingWorkflow, extract.ts, SummaryGenerator, UtilityWorker)"
```

---

### Task 3: Delete dead test files

**Files:**
- Delete: `__tests__/workflows/email-processing.test.ts`
- Delete: `__tests__/workflows/email-extraction.test.ts`
- Delete: `__tests__/features/summary-generation.test.ts`
- Delete: `__tests__/electron/utility/worker.test.ts`

- [ ] **Step 1: Delete the four dead test files**

```bash
rm __tests__/workflows/email-processing.test.ts __tests__/workflows/email-extraction.test.ts __tests__/features/summary-generation.test.ts __tests__/electron/utility/worker.test.ts
```

- [ ] **Step 2: Run test suite to count remaining passing tests**

Run: `pnpm test --run 2>&1 | tail -5`
Expected: ~1,001 tests passing (1,052 - 51 deleted). Some tests in feature-pov files may fail due to removed imports — those are fixed in Tasks 4-7.

- [ ] **Step 3: Commit**

```
git add -A
git commit -m "test: delete tests for removed dead code"
```

---

### Task 4: Rewrite `topic-summaries.test.ts`

**Files:**
- Rewrite: `__tests__/features-pov/topic-summaries.test.ts`

The old test imported `SummaryGenerator` (deleted). Rewrite to test the production path: the orchestrator's `updateTopicSummary()` method, which calls `llmProvider.generateText()` with `buildSummaryPrompt()`.

**Pattern:** Instantiate `EmailProcessingOrchestrator` with mock repositories and mock `LLMProvider`. Call `processEmail()` and verify the LLM was called for topic summarization.

- [ ] **Step 1: Rewrite the file to use orchestrator + mock LLM**

Replace the entire file. Key pattern:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailProcessingOrchestrator } from '@core/orchestrator';
import type { LLMProvider } from '@core/llm/provider';
import type { Email } from '@core/types/email';
// ... mock repositories, test email fixtures, etc.

function createMockLLMProvider(responses: {
  classification?: { type: string; confidence: number };
  topic?: { parentTopic: string; childTopic: string; fullPath: string; confidence: number };
  summary?: string;
}): LLMProvider {
  return {
    name: 'openai',
    model: 'gpt-4o-mini',
    generateText: vi.fn().mockResolvedValue({
      text: responses.summary ?? 'A concise summary of the topic covering recent activity.',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    }),
    generateObject: vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Classify')) {
        return responses.classification ?? { type: 'updates', confidence: 0.9 };
      }
      if (prompt.includes('topic label')) {
        return responses.topic ?? {
          parentTopic: 'Finance',
          childTopic: 'Banking',
          fullPath: 'Finance/Banking',
          confidence: 0.85,
        };
      }
      return {};
    }),
  };
}
```

Each test should:
1. Create an `EmailProcessingOrchestrator` with mock repos + mock LLM
2. Call `processEmail()` with a test email
3. Assert `generateText` was called (for summary merging)
4. Assert `topicsRepo.updateSummary()` was called with the summary text

- [ ] **Step 2: Run tests**

Run: `pnpm vitest --run __tests__/features-pov/topic-summaries.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```
git add __tests__/features-pov/topic-summaries.test.ts
git commit -m "test: rewrite topic-summaries to use orchestrator with mock LLM"
```

---

### Task 5: Rewrite `sender-summaries.test.ts`

**Files:**
- Rewrite: `__tests__/features-pov/sender-summaries.test.ts`

Same pattern as Task 4 but testing `updateSenderSummary()` via `processEmail()`. Verify:
- `llmProvider.generateText()` called with a sender summary prompt
- `summariesRepo.upsertSenderSummary()` called with correct domain and summary

- [ ] **Step 1: Rewrite the file**

Use same `createMockLLMProvider` pattern. Test scenarios:
- New sender → LLM generates initial summary
- Existing sender → LLM merges new content into existing summary
- Multiple emails from same domain → summary accumulates
- Summary persisted across orchestrator instances

- [ ] **Step 2: Run tests**

Run: `pnpm vitest --run __tests__/features-pov/sender-summaries.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```
git add __tests__/features-pov/sender-summaries.test.ts
git commit -m "test: rewrite sender-summaries to use orchestrator with mock LLM"
```

---

### Task 6: Rewrite `inbox-manager.test.ts`

**Files:**
- Rewrite: `__tests__/features-pov/inbox-manager.test.ts`

This file has 34 tests. Some use `ProcessingDecision` (already updated import) and `GmailSyncManager` (production code). Remove all imports and test blocks for `extractUpdate`, `extractDeal`, `extractFromEmail` (deleted). Replace extraction tests with LangGraph workflow tests using mocked LLM.

- [ ] **Step 1: Remove dead imports**

Remove from line 9:
```typescript
import { extractUpdate, extractDeal, extractFromEmail } from '@core/workflows/nodes/extract';
```

Add:
```typescript
import { processEmailWithWorkflow } from '@core/workflows/langgraph-workflow';
import type { LLMProvider } from '@core/llm/provider';
```

- [ ] **Step 2: Remove or rewrite test blocks that use dead imports**

Remove any `describe` blocks that test `extractUpdate`, `extractDeal`, or `extractFromEmail` directly. Replace with tests that call `processEmailWithWorkflow(email, mockLLMProvider)` and verify:
- Classification is returned
- Extraction (update or deal) is returned when LLM returns structured data
- Summarization happens

- [ ] **Step 3: Run tests**

Run: `pnpm vitest --run __tests__/features-pov/inbox-manager.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add __tests__/features-pov/inbox-manager.test.ts
git commit -m "test: rewrite inbox-manager extraction tests with mock LLM"
```

---

### Task 7: Rewrite `deals.test.ts`

**Files:**
- Rewrite: `__tests__/features-pov/deals.test.ts`

Remove `extractDeal` import (line 6). Keep `DealsRepository` tests (production code). Replace direct `extractDeal` calls with `processEmailWithWorkflow()` with mock LLM returning deal structures.

- [ ] **Step 1: Remove dead import, add mock LLM**

Remove:
```typescript
import { extractDeal } from '@core/workflows/nodes/extract';
```

Add:
```typescript
import { processEmailWithWorkflow } from '@core/workflows/langgraph-workflow';
import type { LLMProvider } from '@core/llm/provider';
```

- [ ] **Step 2: Rewrite tests that called extractDeal**

Replace direct `extractDeal()` calls with `processEmailWithWorkflow()` using mock LLM that returns deal structures. Keep DealsRepository tests unchanged.

- [ ] **Step 3: Run tests**

Run: `pnpm vitest --run __tests__/features-pov/deals.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```
git add __tests__/features-pov/deals.test.ts
git commit -m "test: rewrite deals extraction tests with mock LLM"
```

---

### Task 8: Rewrite edge-case test files

**Files:**
- Rewrite: `__tests__/features-pov/edge-cases/low-content.test.ts`
- Rewrite: `__tests__/features-pov/edge-cases/conflicting-info.test.ts`
- Rewrite: `__tests__/features-pov/edge-cases/rapid-updates.test.ts`

All three import `SummaryGenerator` and/or `extractUpdate`/`extractDeal`. Same pattern: remove dead imports, keep production code tests (TopicLabeler, JobQueue, GmailSyncManager), rewrite dead-code tests with mock LLM.

- [ ] **Step 1: Rewrite `low-content.test.ts`**

Remove `SummaryGenerator` and `extractUpdate`/`extractDeal` imports. Keep `TopicLabeler` tests. Rewrite extraction/summary tests with `processEmailWithWorkflow()` + mock LLM.

- [ ] **Step 2: Rewrite `conflicting-info.test.ts`**

Remove `SummaryGenerator` import. Rewrite all tests to use orchestrator with mock LLM, verifying that LLM prompts include conflicting information from multiple emails.

- [ ] **Step 3: Rewrite `rapid-updates.test.ts`**

Remove `SummaryGenerator` import. Keep `JobQueue`/`GmailSyncManager` tests. Rewrite summary tests with orchestrator + mock LLM.

- [ ] **Step 4: Run all edge-case tests**

Run: `pnpm vitest --run __tests__/features-pov/edge-cases/`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add __tests__/features-pov/edge-cases/
git commit -m "test: rewrite edge-case tests with mock LLM"
```

---

## Track B: Utility Process Wiring

### Task 9: Fix `electron/utility/index.ts` — replace worker_threads with process.parentPort

**Files:**
- Modify: `electron/utility/index.ts`

- [ ] **Step 1: Write the test**

Create `__tests__/electron/utility/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MessageType } from '@electron/utility/index';

describe('Utility Process Entry Point', () => {
  let mockParentPort: { on: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockParentPort = {
      on: vi.fn(),
      postMessage: vi.fn(),
    };
    // Inject mock process.parentPort
    (process as any).parentPort = mockParentPort;
  });

  it('should register message listener on process.parentPort', async () => {
    // Re-import to trigger registration
    vi.resetModules();
    await import('@electron/utility/index');

    expect(mockParentPort.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should send ready message on startup', async () => {
    vi.resetModules();
    await import('@electron/utility/index');

    expect(mockParentPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ready' })
    );
  });

  it('should handle init message and send initialized response', async () => {
    vi.resetModules();
    const { handleMessage } = await import('@electron/utility/index');

    // The handleMessage function should accept init
    await handleMessage({ type: 'init', dbPath: ':memory:' });

    expect(mockParentPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'initialized' })
    );
  });

  it('should handle unknown message type', async () => {
    vi.resetModules();
    const { handleMessage } = await import('@electron/utility/index');

    await handleMessage({ type: 'unknown-command' } as any);

    expect(mockParentPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest --run __tests__/electron/utility/index.test.ts`
Expected: FAIL — module uses wrong API

- [ ] **Step 3: Fix `electron/utility/index.ts`**

Replace line 8:
```typescript
import { parentPort } from 'node:worker_threads';
```
with nothing (remove the import entirely).

Replace the `sendMessage` function (around line 250):
```typescript
function sendMessage(message: Record<string, unknown>): void {
  if (process.parentPort) {
    process.parentPort.postMessage(message);
  }
}
```

Replace the message listener (around line 288):
```typescript
if (process.parentPort) {
  process.parentPort.on('message', (e: { data: MessageType }) => {
    handleMessage(e.data).catch((error) => {
      sendMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

// Signal that utility process is ready
sendMessage({ type: 'ready' });
```

Export `handleMessage` and `MessageType` for testability:
```typescript
export type { MessageType };
export { handleMessage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest --run __tests__/electron/utility/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
git add electron/utility/index.ts __tests__/electron/utility/index.test.ts
git commit -m "fix: replace node:worker_threads with Electron process.parentPort in utility process"
```

---

### Task 10: Add utility process entry to `vite.config.ts`

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add second electron entry**

The current config has one entry in the `electron([...])` array. Add a second entry for the utility process. The full `electron([...])` array becomes:

```typescript
electron([
  {
    entry: 'electron/main.ts',
    onstart(options) {
      const preloadSrc = path.join(__dirname, 'electron/preload.cjs');
      const preloadDest = path.join(__dirname, 'dist-electron/preload.cjs');
      fs.copyFileSync(preloadSrc, preloadDest);
      console.log('Copied preload.cjs to dist-electron');

      const migrationsSrc = path.join(__dirname, 'database/migrations');
      const migrationsDest = path.join(__dirname, 'dist-electron/migrations');
      fs.cpSync(migrationsSrc, migrationsDest, { recursive: true });
      console.log('Copied migrations to dist-electron/migrations');

      options.startup();
    },
    vite: {
      resolve: {
        alias: resolveAliases,
      },
      build: {
        outDir: 'dist-electron',
        sourcemap: true,
        rollupOptions: {
          external: [
            'electron-log',
            '@libsql/client',
            'googleapis',
            '@langchain/core',
            '@langchain/langgraph',
            '@ai-sdk/anthropic',
            '@ai-sdk/google',
            '@ai-sdk/openai',
            'drizzle-orm',
            'uuid',
          ],
        },
      },
    },
  },
  {
    entry: 'electron/utility/index.ts',
    onstart({ startup }) {
      startup();
    },
    vite: {
      resolve: {
        alias: resolveAliases,
      },
      build: {
        outDir: 'dist-electron',
        sourcemap: true,
        rollupOptions: {
          external: [
            'electron-log',
            '@libsql/client',
            'googleapis',
            '@langchain/core',
            '@langchain/langgraph',
            '@ai-sdk/anthropic',
            '@ai-sdk/google',
            '@ai-sdk/openai',
            'drizzle-orm',
            'uuid',
          ],
        },
      },
    },
  },
]),
```

- [ ] **Step 2: Verify Vite builds successfully**

Run: `pnpm dev --host 0 2>&1 | head -20`
Expected: Vite starts without build errors. Kill it after confirming.

- [ ] **Step 3: Commit**

```
git add vite.config.ts
git commit -m "build: add utility process entry to vite config"
```

---

### Task 11: Wire up `utilityProcess.fork()` in `electron/main.ts`

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add utilityProcess import and replace JobRunner**

At line 1, add `utilityProcess` to the electron import:
```typescript
import { app, BrowserWindow, ipcMain, utilityProcess } from 'electron';
```

Remove line 6:
```typescript
import { JobRunner } from '@core/jobs/runner';
```

Remove line 16 (orchestrator import — moves to utility process):
```typescript
import { EmailProcessingOrchestrator } from '@core/orchestrator';
```

Remove lines 17-18 (LLM provider imports — move to utility process):
```typescript
import { LLMProviderFactory } from '@core/llm/provider';
import type { ProviderName } from '@core/llm/provider';
```

- [ ] **Step 2: Replace JobRunner state with utility process state**

Replace lines 31-32:
```typescript
let jobQueue: JobQueue | null = null;
let jobRunner: JobRunner | null = null;
```
with:
```typescript
let jobQueue: JobQueue | null = null;
let utilityChild: Electron.UtilityProcess | null = null;
```

Remove lines 38 and 58-59:
```typescript
let orchestrator: EmailProcessingOrchestrator | null = null;
```
```typescript
export function getJobRunner(): JobRunner | null {
  return jobRunner;
}
```

- [ ] **Step 3: Replace JobRunner creation with utility process fork**

Replace lines 157-158:
```typescript
jobQueue = new JobQueue();
jobRunner = new JobRunner(jobQueue);
```
with:
```typescript
jobQueue = new JobQueue();
```

- [ ] **Step 4: Replace `await jobRunner.start()` with utility process init**

Replace lines 347-349:
```typescript
// Start job processing in main process for now
// TODO: Move to utility process once ES module issues are resolved
await jobRunner.start();
```
with:
```typescript
// Start utility process for background job processing
const utilityPath = path.join(__dirname, 'utility-index.js');
utilityChild = utilityProcess.fork(utilityPath, [], {
  stdio: 'pipe',
  serviceName: 'TuskerBrain Worker',
});

// Wait for utility process to be ready
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Utility process timeout')), 10000);
  utilityChild!.on('message', (msg: any) => {
    if (msg.type === 'ready') {
      clearTimeout(timeout);
      resolve();
    }
  });
});

// Initialize utility process with database path
const dbPath = path.join(app.getPath('userData'), 'tuskerbrain.db');
utilityChild.postMessage({ type: 'init', dbPath });

// Wait for initialization to complete
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Utility process init timeout')), 10000);
  utilityChild!.on('message', (msg: any) => {
    if (msg.type === 'initialized' && msg.success) {
      clearTimeout(timeout);
      resolve();
    } else if (msg.type === 'initialized' && !msg.success) {
      clearTimeout(timeout);
      reject(new Error(`Utility process init failed: ${msg.error}`));
    }
  });
});

// Start job processing in utility process
utilityChild.postMessage({ type: 'start' });
```

- [ ] **Step 5: Update shutdown handler**

Replace lines 768-769:
```typescript
if (jobRunner) {
  await jobRunner.stop();
}
```
with:
```typescript
if (utilityChild) {
  utilityChild.postMessage({ type: 'stop' });
  utilityChild.kill();
}
```

- [ ] **Step 6: Verify TypeScript compilation**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors in electron/main.ts

- [ ] **Step 7: Commit**

```
git add electron/main.ts
git commit -m "feat: wire up utility process for background job processing"
```

---

## Final Verification

### Task 12: Full verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test --run`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify Vite build**

Run: `pnpm build`
Expected: Build completes with both entry points

- [ ] **Step 4: Update gap analysis document**

Update `docs/plans/2026-03-29-gap-analysis-and-implementation-findings.md`:
- Change GAP-IMPL-4 status to `RESOLVED — extract.ts deleted, LangGraph is sole extraction path`
- Change GAP-IMPL-5 status to `RESOLVED — SummaryGenerator deleted, orchestrator uses LLM for all summaries`
- Change GAP-IMPL-6 status to `RESOLVED — UtilityWorker deleted, utility process wired via utilityProcess.fork()`
- Change GAP-IMPL-7 status to `RESOLVED — EmailProcessingWorkflow deleted, ProcessingDecision extracted to own module`
- Update test count in Part 1
- Update Phase 2 status to DONE

- [ ] **Step 5: Commit**

```
git add docs/plans/2026-03-29-gap-analysis-and-implementation-findings.md
git commit -m "docs: update gap analysis with Phase 2 completion status"
```

---

## Parallel Execution Notes

- **Tasks 1-3** (extract + delete) must run sequentially
- **Tasks 4-8** (test rewrites) can run in parallel after Task 3
- **Tasks 9-11** (utility process) are independent of Tasks 1-8 — can run in parallel
- **Task 12** (verification) depends on all others completing
