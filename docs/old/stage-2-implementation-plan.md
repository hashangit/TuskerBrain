# TuskerBrain v1 - Stage 2 Implementation Plan

> **For Claude:** REQUIRED SUB-skill: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local-first Electron app that intelligently manages Gmail using AI, with timeline, summaries, and deals extraction.
**Architecture:** Electron app with Vite+React frontend, SQLite database, LangGraph workflows, and Vercel AI SDK for multi-provider LLM support. Job-based processing system with audit logging.
**Tech stack:** Electron, Vite, React, React Router, shadcn/ui, Tailwind CSS, Zustand, React Query, LangGraph, Vercel AI SDK, googleapis, better-sqlite3, Drizzle ORM, Vitest, Playwright

**Reference Documents:**
- Design Spec: `docs/plans/2026-03-05-tuskerbrain-design.md`
- Test Strategy: `docs/plans/2026-03-06-test-infrastructure-fixes.md`

---

## Implementation Progress Overview

| Phase | Description | Status | Completion |
|-------|-------------|--------|------------|
| 2A | Critical Infrastructure | 🟡 In Progress | 30% |
| 2B | Gmail Integration | 🟡 In Progress | 50% |
| 2C | Workflow & LLM Integration | 🟡 In Progress | 40% |
| 2D | End-to-End Integration | 🔴 Not Started | 0% |
| 2E | Frontend Integration | 🔴 Not Started | 0% |

**Test Status:** 427 passed / 104 failed (80.8% pass rate)

---

## Phase 2A: Critical Infrastructure (P0)

This phase addresses foundational gaps that prevent the app from functioning.

### Task 2A.1: Complete Database Tables and Indexes

**Priority:** P0 - BLOCKER
**Status:** 🟡 In Progress (54% complete)
**Est. effort:** 1-2 hours remaining
**Design Reference:** Lines 232-430 (Data Model)

**Current State:**
- ✅ 7/13 tables created: `emails`, `jobs`, `audit_log`, `sync_state`, `topics`, `email_topics`, `settings`
- ❌ 6/13 tables missing: `timeline_updates`, `deals`, `topic_summaries`, `sender_summaries`, `gmail_labels`, `email_labels`, `api_keys`, `oauth_tokens`
- ❌ 0/10 indexes created

**Files:**
- Modify: `database/index.ts:createTables()`
- Test: `__tests__/database/tables.test.ts` (to be created)

**Acceptance Criteria:**
- [ ] All 13 tables from design spec created
- [ ] All 10 indexes from design spec created
- [ ] Test file `__tests__/database/tables.test.ts` passes

**Missing Tables to Add:**
```sql
-- timeline_updates (design spec lines 262-278)
CREATE TABLE IF NOT EXISTS timeline_updates (
  id TEXT PRIMARY KEY,
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  summary TEXT,
  priority TEXT CHECK(priority IN ('high', 'medium', 'low')),
  sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral')),
  urgency INTEGER DEFAULT 0,
  importance_reason TEXT,
  action_item INTEGER DEFAULT 0,
  action_item_title TEXT,
  follow_up_date TEXT,
  financial_impact DECIMAL(10,2),
  key_entities TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- deals (design spec lines 281-295)
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  deal_title TEXT NOT NULL,
  deal_description TEXT,
  brand_name TEXT,
  deal_value TEXT,
  deal_code TEXT,
  deal_expiry TEXT,
  deal_link TEXT,
  minimum_purchase TEXT,
  deal_category TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- topic_summaries (design spec lines 316-324)
CREATE TABLE IF NOT EXISTS topic_summaries (
  id TEXT PRIMARY KEY,
  topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE UNIQUE,
  summary TEXT NOT NULL,
  word_count INTEGER,
  last_updated INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  last_email_id TEXT REFERENCES emails(id),
  update_count INTEGER DEFAULT 0
);

-- sender_summaries (design spec lines 327-335)
CREATE TABLE IF NOT EXISTS sender_summaries (
  id TEXT PRIMARY KEY,
  sender_domain TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  word_count INTEGER,
  last_updated INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  last_email_id TEXT REFERENCES emails(id),
  update_count INTEGER DEFAULT 0
);

-- gmail_labels (design spec lines 372-378)
CREATE TABLE IF NOT EXISTS gmail_labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT CHECK(type IN ('system', 'user')),
  label_type TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- email_labels (design spec lines 255-259)
CREATE TABLE IF NOT EXISTS email_labels (
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  label_id TEXT REFERENCES gmail_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (email_id, label_id)
);

-- api_keys (design spec lines 399-406)
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL,
  is_valid INTEGER DEFAULT 0,
  last_validated INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- oauth_tokens (design spec lines 409-417)
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  access_token_key TEXT NOT NULL,
  refresh_token_key TEXT NOT NULL,
  expiry INTEGER,
  scope TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  refreshed_at INTEGER
);
```

**Missing Indexes to Add:**
```sql
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);
CREATE INDEX idx_emails_sender_domain ON emails(sender_domain);
CREATE INDEX idx_emails_email_type ON emails(email_type);
CREATE INDEX idx_emails_is_processed ON emails(is_processed);
CREATE INDEX idx_timeline_updates_priority ON timeline_updates(priority);
CREATE INDEX idx_deals_deal_expiry ON deals(deal_expiry);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled_at ON jobs(scheduled_at);
CREATE INDEX idx_email_topics_topic_id ON email_topics(topic_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
```

---

### Task 2A.2: Implement IPC Bridge and Preload

**Priority:** P0 - Blocker
**Status:** 🔴 Not Started
**Est. effort:** 2-3 hours
**Design Reference:** Lines 468-538 (Component Structure)

**Current State:**
- ✅ IPC channels defined in `electron/ipc/channels.ts`
- ✅ 12/21 IPC handlers implemented in `electron/ipc/handlers.ts`
- ❌ Preload only exposes 6 basic methods (not matching channels)
- ❌ No React hooks for IPC communication
- ❌ No Zustand stores for app state

**Files:**
- Modify: `electron/preload.ts` (expand to match channels.ts)
- Create: `src/hooks/ipc.ts`
- Create: `src/stores/settings.ts`
- Create: `src/stores/timeline.ts`
- Create: `src/stores/jobs.ts`

**Acceptance Criteria:**
- [ ] Preload exposes all IPC methods from channels.ts
- [ ] React hooks for all IPC methods
- [ ] Zustand stores for settings, timeline, jobs state
- [ ] `window.electronAPI` fully typed

---

### Task 2A.3: Add Missing IPC Handlers

**Priority:** P0 - Blocker
**Status:** 🟡 In Progress (57% complete - 12/21 handlers)
**Est. effort:** 1 hour
**Design Reference:** Lines 479-480 (IPC handlers)

**Current State:**
- ✅ 12 handlers implemented: `gmail:oauth:start`, `gmail:oauth:status`, `llm:provider:list`, `jobs:list`, `jobs:create`, `jobs:pause`, `jobs:resume`, `settings:get`, `settings:set`, `sync:start`, `sync:status`, `sync:cancel`
- ❌ 9 handlers missing

**Missing Handlers:**
| Handler | Purpose |
|---------|---------|
| `llm:provider:set` | Set active LLM provider with API key |
| `llm:provider:validate` | Validate API key format |
| `llm:provider:test` | Test LLM connection |
| `jobs:cancel` | Cancel a running job |
| `jobs:status` | Get individual job status |
| `gmail:oauth:callback` | Handle OAuth callback |
| `gmail:oauth:refresh` | Refresh OAuth token |
| `gmail:oauth:revoke` | Revoke OAuth access |
| `settings:reset` | Reset settings to defaults |

**Files:**
- Modify: `electron/ipc/handlers.ts`

**Acceptance Criteria:**
- [ ] All 9 missing handlers implemented
- [ ] Each handler validates input and returns proper types
- [ ] Error handling for all handlers

---

## Phase 2B: Gmail Integration (P0)

### Task 2B.1: Implement Phase 1 "Clean First"

**Priority:** P0 - Blocker
**Status:** 🟡 In Progress (70% complete)
**Est. effort:** 1-2 hours remaining
**Design Reference:** Lines 100-122 (Initial Sync & Backfill Strategy)
**Test Reference:** `__tests__/features/archival-rules.test.ts`

**Current State:**
- ✅ `ProcessingDecision` class with age-based rules IMPLEMENTED
- ✅ `EmailProcessingWorkflow` with nodes and edges
- ✅ Classification logic (rule-based)
- ❌ No `applyCleanupRules()` method in GmailSyncManager
- ❌ All emails still go through AI workflow regardless of age

**Required Implementation:**
Create `GmailSyncManager.applyCleanupRules()` that:
1. Fetches all emails
2. Applies age-based rules WITHOUT LLM (using `ProcessingDecision`)
3. Immediately archives/deletes based on email type and age
4. Only queues recent emails for AI processing

**Files:**
- Modify: `core/gmail/sync.ts` (add `applyCleanupRules()` method)

**Acceptance Criteria:**
- [ ] `applyCleanupRules()` method implemented
- [ ] Archives regular emails older than 6 months (without AI)
- [ ] Archives updates emails older than 1 month (without AI)
- [ ] Deletes social emails older than 1 month (without AI)
- [ ] Deletes promotional emails older than 1 month (without AI)
- [ ] Archives ANY email older than 2 years
- [ ] Only queues emails < 1 month for AI processing
- [ ] All 17 tests in `__tests__/features/archival-rules.test.ts` pass

**Test File Already Exists:**
```typescript
// __tests__/features/archival-rules.test.ts - MUST ALL PASS
// Tests define expected behavior from design spec lines 84-91
```

---

## Phase 2C: Workflow & LLM Integration (P0)

### Task 2C.1: Create LLM Prompt Templates

**Priority:** P0 - Blocker
**Status:** 🟡 In Progress (10% complete - directory exists but empty)
**Est. effort:** 2-3 hours
**Design Reference:** Lines 434-462 (Processing Flow)

**Current State:**
- ✅ `core/workflows/prompts/` directory exists
- ❌ No prompt files created (directory is empty)

**Required Prompt Templates:**
1. Email classification prompts
2. Update extraction prompts with Zod schemas
3. Deal extraction prompts
4. Topic classification prompts
5. Summary generation prompts

**Files:**
- Create: `core/workflows/prompts/classification.ts`
- Create: `core/workflows/prompts/extraction.ts`
- Create: `core/workflows/prompts/summarization.ts`

**Acceptance Criteria:**
- [ ] Classification prompt for email type detection
- [ ] Extraction prompts with Zod schemas for structured output
- [ ] Deal extraction prompt with promo code detection
- [ ] Topic classification prompt with hierarchy support
- [ ] Summary generation prompt with 500-word limit

---

### Task 2C.2: Integrate LLM into Workflow Nodes

**Priority:** P0 - Blocker
**Status:** 🟡 In Progress (50% complete)
**Est. effort:** 3-4 hours
**Design Reference:** Lines 434-462 (Processing Flow)
**Test Reference:** `__tests__/workflows/email-processing.test.ts`

**Current State:**
- ✅ LLMProvider implemented with multi-provider support
- ✅ `classifyEmailType()` function exists (but rule-based)
- ✅ `extractFromEmail()` function exists
- ✅ `ProcessingDecision` class with age-based rules
- ❌ Classification uses hardcoded rules, NOT LLM
- ❌ Extraction uses regex patterns, NOT LLM structured output
- ❌ Summaries use templates, NOT LLM
- ❌ Topic classification uses domain mapping, NOT semantic understanding

**Files:**
- Modify: `core/workflows/nodes/classify.ts`
- Modify: `core/workflows/nodes/extract.ts`
- Modify: `core/summaries/generator.ts`
- Modify: `core/labeling/labeler.ts`

**Acceptance Criteria:**
- [ ] Classification node uses LLM for email type detection
- [ ] Extraction node uses LLM for structured output
- [ ] Summary generator uses LLM for rolling summaries
- [ ] Topic labeler uses LLM for semantic classification
- [ ] All tests in `email-processing.test.ts` pass

---

## Phase 2D: End-to-End Integration (P0)

### Task 2D.1: Build Workflow Orchestrator

**Priority:** P0 - Blocker
**Status:** 🔴 Not Started
**Est. effort:** 4-6 hours
**Design Reference:** Lines 434-462 (Processing Flow)

**Current State:**
- ✅ Individual components exist (`ProcessingDecision`, `EmailProcessingWorkflow`)
- ❌ Components not connected into full pipeline
- ❌ No end-to-end orchestrator

**Required Implementation:**
Create `EmailProcessingOrchestrator` that:
1. Receives job from queue
2. Runs full workflow: classify → extract → topic → labels → store → summarize → mark processed
3. Handles errors and retries
4. Updates job status

**Files:**
- Create: `core/orchestrator.ts`

**Acceptance Criteria:**
- [ ] Orchestrator receives jobs from JobQueue
- [ ] Runs complete workflow pipeline
- [ ] Persists all data to database
- [ ] Updates Gmail (archive/delete/labels)
- [ ] Handles errors with retry logic
- [ ] Updates job status throughout pipeline

---

### Task 2D.2: Implement Database Persistence Layer

**Priority:** P0 - Blocker
**Status:** 🔴 Not Started
**Est. effort:** 2-3 hours
**Design Reference:** Lines 232-430 (Data Model)

**Current State:**
- ✅ Tables defined in schema
- ❌ Components work in memory only
- ❌ No DB writes for extracted data

**Required Repositories:**
1. Email repository (emails, email_labels, email_topics)
2. Topic repository (topics, topic_summaries)
3. Summary repository (topic_summaries, sender_summaries)
4. Deal repository (deals)
5. Timeline repository (timeline_updates)
6. Label repository (gmail_labels, email_labels)

**Files:**
- Create: `core/repositories/emails.ts`
- Create: `core/repositories/topics.ts`
- Create: `core/repositories/summaries.ts`
- Create: `core/repositories/deals.ts`
- Create: `core/repositories/timeline.ts`
- Create: `core/repositories/labels.ts`
- Modify: `database/index.ts` (add helper methods)

**Acceptance Criteria:**
- [ ] Email repository with CRUD operations
- [ ] Topic repository with hierarchy support
- [ ] Summary repository with rolling updates
- [ ] Deal repository with expiry tracking
- [ ] Timeline repository with priority filtering
- [ ] Label repository with Gmail sync
- [ ] All repositories tested

---

## Phase 2E: Frontend Integration (P1)

### Task 2E.1: Connect Components to IPC

**Priority:** P1
**Status:** 🔴 Not Started
**Est. effort:** 3-4 hours
**Design Reference:** Lines 481-548 (Frontend Structure)

**Current State:**
- ✅ All UI components exist
- ❌ All components use mock data
- ❌ No IPC calls in components

**Required Changes:**
1. Replace mock data in App.tsx with IPC calls
2. Implement data fetching hooks using React Query
3. Implement state management with Zustand
4. Add error handling and loading states

**Files:**
- Modify: `src/App.tsx`
- Create: `src/hooks/useEmails.ts`
- Create: `src/hooks/useTopics.ts`
- Create: `src/hooks/useDeals.ts`
- Create: `src/stores/appStore.ts`

**Acceptance Criteria:**
- [ ] Timeline displays real data from database
- [ ] Topics page shows real topic summaries
- [ ] Deals page shows real extracted deals
- [ ] Settings page reads/writes real settings
- [ ] Loading states shown during data fetch
- [ ] Error states shown on failures

---

### Task 2E.2: Implement Real OAuth Flow

**Priority:** P1
**Status:** 🔴 Not Started
**Est. effort:** 2-3 hours
**Design Reference:** Lines 1206-1218 (OAuth Tokens)

**Current State:**
- ✅ Connect button exists
- ❌ Button only sets state, no actual OAuth
- ❌ No token storage or refresh

**Required Implementation:**
1. Implement OAuth callback handling in main process
2. Add OAuth callback route in preload
3. Handle token storage and refresh
4. Update UI on connection status

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/components/Settings.tsx`
- Modify: `src/components/Onboarding.tsx`

**Acceptance Criteria:**
- [ ] Clicking "Connect Gmail" opens OAuth URL
- [ ] OAuth callback exchanges code for tokens
- [ ] Tokens stored encrypted in safeStorage
- [ ] Access token refreshed before expiry
- [ ] UI shows connected/disconnected state
- [ ] All tests in `__tests__/integrations/gmail-oauth.test.ts` pass

---

### Task 2E.3: Implement API Key Management

**Priority:** P1
**Status:** 🔴 Not Started
**Est. effort:** 2-3 hours
**Design Reference:** Lines 1206-1209 (API Key Storage)

**Current State:**
- ✅ Settings UI has API key inputs
- ❌ Save button only console.logs
- ❌ No validation before saving

**Required Implementation:**
1. Validate API keys before saving
2. Store keys in safeStorage (encrypted)
3. Test connection with LLM provider
4. Show validation status in UI

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `core/settings/manager.ts`
- Modify: `src/components/Settings.tsx`
- Modify: `src/components/Onboarding.tsx`

**Acceptance Criteria:**
- [ ] API keys validated before saving
- [ ] Keys stored encrypted in safeStorage
- [ ] Test connection button verifies key works
- [ ] UI shows validation status (valid/invalid)
- [ ] All tests in `__tests__/features/settings-persistence.test.ts` pass

---

## Verification Checkpoint

After completing Phase 2A-2D:

1. Run all unit tests: `npm test`
2. Run E2E tests: `npm run test:e2e`
3. Start app in dev mode: `npm run dev`
4. Verify:
   - [ ] Gmail OAuth flow works
   - [ ] Emails are processed with AI
   - [ ] Timeline shows real data
   - [ ] Topics are created and persisted
   - [ ] Deals are extracted and displayed
   - [ ] Settings are saved and loaded

---

## Execution Instructions

1. **Use superpowers:executing-plans skill** to implement this plan
2. **Follow TDD workflow** - write failing test first, then implement
3. **Commit after each task** with descriptive message
4. **Run full test suite** after each phase
5. **Manual verification** in dev mode before moving to next phase

---

## Test-Driven Development Principles

### Two-Fold Test Approach

| Test Type | Location | Purpose | Approach |
|-----------|----------|---------|----------|
| **TDD Tests** | `__tests__/features/` | Test internal implementation | Direct imports, unit-level |
| **POV Tests** | `__tests__/features-pov/` | Test user-observable outcomes | TuskerBrainApp helper, flow-level |

### Key Principles

1. **Tests define expected behavior** - Tests are written based on design spec, not implementation
2. **Tests act as benchmarks** - Minimum quality gates that implementation must meet
3. **Never customize tests to pass** - If test fails, fix implementation, not test
4. **Tests are the source of truth** - Expected behavior comes from design doc

### Mocking Strategy

| What to Mock | What NOT to Mock |
|--------------|------------------|
| External APIs (Gmail, LLM providers) | Internal services (JobQueue, AuditLogger, Database) |
| Network responses | The entire app |
| Time-dependent logic | Core business logic |

---

## Current Test Failures Analysis

**Total:** 104 failing tests across 10 test files

**Key Failing Areas:**
| Test File | Failing Tests | Root Cause |
|-----------|---------------|------------|
| `topic-summaries.test.ts` | Multiple | No DB persistence for summaries |
| `timeline.test.ts` | Multiple | No real data from IPC |
| `deals.test.ts` | Multiple | No deal extraction/persistence |
| `inbox-manager.test.ts` | Multiple | Phase 1 "Clean First" not complete |
| `email-processing.test.ts` | Some | LLM not integrated |

---

## Estimated Total Effort

| Phase | Tasks | Est. Hours | Remaining |
|-------|-------|------------|-----------|
| 2A | 3 tasks | 4-6 hours | ~3 hours |
| 2B | 1 task | 3-4 hours | ~1 hour |
| 2C | 2 tasks | 6-9 hours | ~6 hours |
| 2D | 2 tasks | 6-9 hours | ~8 hours |
| 2E | 3 tasks | 7-9 hours | ~8 hours |
| **Total** | **11 tasks** | **26-37 hours** | **~26 hours** |

---

**Plan Version:** 2.1
**Last Updated:** 2026-03-16
**Status:** In Progress - Phase 2A/2B/2C partially complete
