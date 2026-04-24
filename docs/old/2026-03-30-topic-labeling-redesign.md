# Topic Labeling Redesign

**Date:** 2026-03-30
**Status:** Implemented

## Problem

1. **Dead code**: `core/labeling/labeler.ts` (`TopicLabeler`) and `core/workflows/nodes/classify.ts` are rule-based classifiers not used in the production pipeline
2. **Redundant classification**: LangGraph workflow calls LLM to classify emails even when Gmail already provides `gmailCategory`
3. **Dumb fallback**: If LLM labeling fails, falls back to `inferParentTopic()` — domain guessing that produces bad labels
4. **Single Gmail label**: Each email gets one label `TuskerBrain/Topic/{Parent}/{Child}` — no parent-level grouping
5. **No existing topics awareness**: LLM prompt doesn't include existing topics, causing label proliferation ("Chase" + "Chase Bank" + "Chase Card")
6. **Rule-based code everywhere**: Domain maps, keyword maps, normalization maps — all bypass LLM reasoning

## Design Decisions

### 1. Classification: Gmail-first, LLM when absent
- When `email.gmailCategory` is present, skip LLM entirely:
  - `promotions` → `promotional` (0.95)
  - `social` → `social` (0.95)
  - `updates` → `updates` (0.95)
  - `forums` → `updates` (0.85)
  - `primary` → `regular` (0.85)
- When `gmailCategory` is absent, use LLM to classify
- **No rule-based heuristics** — all domain/keyword/normalization code deleted

### 2. Topic Labeling: LLM decides, app persists
- App sends email content + full list of existing parent and child topics to the LLM
- LLM outputs `{ parent: string, child: string, confidence: number }`
- App looks up `parent` and `child` in DB
  - If both exist → tag email with existing labels
  - If not → create new entries in DB, then tag
- No boolean flags (`isNew*`). LLM just outputs what it thinks the labels should be
- LLM's reasoning naturally follows the hierarchy when it sees existing topics:
  - Match existing child → inherits parent (most common)
  - New child under existing parent (common)
  - New parent + new child (rare)

### 3. Gmail Labels: Two Per Email
- Parent label: `TB/{Parent}` (e.g., `TB/Shopping`)
- Child label: `TB/{Parent}/{Child}` (e.g., `TB/Shopping/Amazon`)
- Both applied to every processed email

### 4. LLM Retry Strategy
- Up to 2 retries with exponential backoff on labeling failures
- No domain-based fallback — if LLM fails after retries, the email is marked as processing-failed

### 5. Orchestrator: Topic Persistence
- Find or create parent topic by `fullPath` (parent name)
- Find or create child topic by `fullPath` (`{parent}/{child}`), with `parentId` set to parent
- Link email to child topic with confidence score
- Increment email count on both parent and child
- Create two Gmail label entries: `TB/{Parent}` and `TB/{Parent}/{Child}`

## Database Analysis

### Constraint: All DB Operations Use Drizzle ORM
All database reads, writes, and migrations must use **Drizzle ORM** (`drizzle-orm/sqlite-core`). No raw SQL except in migration files. This applies to:
- Topic lookups and creation: use `db.select().from(topics)` / `db.insert(topics)` via the existing repository pattern
- Label creation: use `db.insert(gmailLabels)`
- Email-topic linking: use `db.insert(emailTopics)`
- Index additions: defined in Drizzle schema (`database/schema.ts`) using `sqliteTable` builder

The app uses SQLite with Drizzle ORM (`sqliteTable` builder). All tables are defined in `database/schema.ts` with Drizzle's type-safe API.

### Schema: No Changes Needed
The existing schema already supports the redesign:
- `topics` table: `parent_id` self-reference + `full_path` unique constraint
- `email_topics`: composite PK `(email_id, topic_id)` with `confidence_score`
- `topic_summaries`: one-to-one with topics, merge tracking via `update_count`
- `gmail_labels` + `email_labels`: many-to-many email-label relationships

### Optional Index Additions (Drizzle Schema)
Add to `database/schema.ts` on the `topics` table definition:
```typescript
// In the topics sqliteTable definition, add indexes:
import { index } from 'drizzle-orm/sqlite-core';

export const topics = sqliteTable('topics', {
  // ... existing columns
}, (table) => [
  index('idx_topics_parent_id').on(table.parentId),
  index('idx_topics_name').on(table.name),
]);
```
These support queries like "find all children of parent" and "find topic by name" — useful for the new labelNode that loads existing topics.

### Data Migration
No schema migration required. Old `TuskerBrain/Topic/*` labels are historical artifacts — new emails use the `TB/*` format.

## Deleted Code

| File | Reason |
|---|---|
| `core/labeling/labeler.ts` | Rule-based `TopicLabeler` with domain/keyword maps, `CHILD_NORMALIZATIONS`, `PREDEFINED_PARENTS` |
| `core/workflows/nodes/classify.ts` | Rule-based classifier with domain/keyword heuristics |
| `langgraph-workflow.ts` fallback functions | `inferParentTopic()`, `inferTypeFromDomain()` in labelNode |
| `__tests__/fixtures/topics/predefined-parents.json` | Hardcoded parent definitions, replaced by LLM |

## Files to Create

| File | Purpose |
|---|---|
| `core/workflows/prompts/topic-labeling.ts` | LLM prompt for topic labeling with existing topics context |

## Files to Modify

| File | Changes |
|---|---|
| `core/workflows/langgraph-workflow.ts` | `classifyNode`: gmailCategory short-circuit; `labelNode`: load existing topics, send to LLM, retry on failure, remove `inferParentTopic` fallback, generate two Gmail labels |
| `core/orchestrator.ts` | Create two labels (`TB/{Parent}` + `TB/{Parent}/{Child}`); create parent topic if needed; create child topic with parent link |
| `database/schema.ts` | Add optional Drizzle indexes on `topics(parent_id)` and `topics(name)` |

## Tests to Delete

| File | Reason |
|---|---|
| `__tests__/features/topic-labeling.test.ts` | Tests the dead `TopicLabeler` |
| `__tests__/workflows/email-classification.test.ts` | Tests the old classify module |

## Tests to Modify

| File | Changes |
|---|---|
| `__tests__/features-pov/topic-labeling.test.ts` | Rewrite: remove `TopicLabeler` import, test LLM-based labeling with existing topics, test two Gmail labels |
| `__tests__/workflows/langgraph-workflow.test.ts` | Update classify tests (gmailCategory short-circuit), label tests (two labels, retry) |
| `__tests__/features-pov/email-processing-pipeline.test.ts` | Update end-to-end assertions for two Gmail labels |
| `__tests__/features-pov/gmail-label-sync.test.ts` | Remove `TopicLabeler` import, update label format assertions |
| `__tests__/features/gmail-labels.test.ts` | Update for two-label format |

## Implementation Phases

### Phase 1: Remove dead code + add gmailCategory short-circuit ✅ DONE
- Delete `core/labeling/labeler.ts` ✅
- Delete `core/workflows/nodes/classify.ts` ✅
- Delete `__tests__/fixtures/topics/predefined-parents.json` ✅
- Delete empty `core/workflows/nodes/` directory ✅
- Update `classifyNode` in `langgraph-workflow.ts`: gmailCategory short-circuit ✅
  - Maps `promotions→promotional(0.95)`, `social→social(0.95)`, `updates→updates(0.95)`, `forums→updates(0.85)`, `primary→regular(0.85)`
  - Falls through to LLM when gmailCategory is absent or unrecognized
- Remove `inferParentTopic()` function ✅
- Remove `inferTypeFromDomain()` function ✅
- Update `core/workflows/processing-decision.ts`: removed import of deleted `classifyEmailType`, added inline `classifyFromGmailCategory()` ✅
- `labelNode` catch block: returns `topic: null` instead of domain-guessed fallback ✅
- TypeScript compilation verified (`npx tsc --noEmit` passes) ✅
- **Note:** Test files still reference deleted modules — Phase 4 will clean these up

### Phase 2: LLM topic labeling with existing topics ✅ DONE
- Create `core/workflows/prompts/topic-labeling.ts` ✅
  - Follows established pattern: Zod schemas, typed inputs, exported builder function
  - Accepts email content + existing parent/child topics list
  - Instructs LLM to prefer matching existing topics
  - Outputs `{ parent, child, confidence }` — no `fullPath` or `isNew*` booleans
- Re-export from `core/workflows/prompts/classification.ts` ✅
- Update `labelNode` in `langgraph-workflow.ts` ✅
  - Added `TopicLoader` type: `() => Promise<Array<{ parent: string; children: string[] }>>` for loading existing topics
  - `createEmailProcessingWorkflow` and `processEmailWithWorkflow` accept optional `topicLoader` parameter
  - Loads existing topics via `topicLoader`, passes to LLM prompt
  - Retry logic: up to 2 retries with exponential backoff (500ms, 1000ms)
  - Generates two Gmail labels: `TB/{Parent}` + `TB/{Parent}/{Child}` + `TuskerBrain/Processed`
  - Returns `topic: null` on final failure (no domain fallback)
- Simplified `TopicLabelingSchema` from `{ parentTopic, childTopic, fullPath, confidence }` to `{ parent, child, confidence }` ✅
- Updated `topic` state annotation: `{ parent, child, confidence }` (removed `fullPath`) ✅
- Updated `summarizeNode` to construct topic path from `parent/child` instead of `fullPath` ✅
- TypeScript compilation verified (`npx tsc --noEmit` passes) ✅

### Phase 3: Orchestrator updates ✅ DONE
- Update `core/orchestrator.ts`: find-or-create parent topic by `fullPath`, find-or-create child topic by `fullPath` with `parentId` ✅
- Link email to child topic with confidence score ✅
- Increment email count on both parent and child ✅
- Create two Gmail labels: `TB/{Parent}` + `TB/{Parent}/{Child}` ✅
- Filter old-format `TuskerBrain/Topic/...` labels from workflow output — orchestrator now handles topic labels directly ✅
- Non-topic labels (`TuskerBrain/Processed`, `TuskerBrain/Archived`, `TuskerBrain/Deleted`) continue to be applied ✅
- Add Drizzle indexes on `topics(parent_id)` and `topics(name)` in `database/schema.ts` ✅
- All DB operations use existing repository interfaces (`TopicsRepository`, `LabelsRepository`) — no new methods needed ✅
- TypeScript compilation verified (`npx tsc --noEmit` passes) ✅

### Phase 4: Test cleanup ✅ DONE
- Delete `__tests__/features/topic-labeling.test.ts` (tested deleted TopicLabeler) ✅
- Delete `__tests__/workflows/email-classification.test.ts` (tested deleted classifyEmailType) ✅
- Rewrite `__tests__/features-pov/topic-labeling.test.ts` ✅
  - Removed TopicLabeler import, tests LLM-based labeling with existing topics
  - Tests two Gmail labels (`TB/` format), retry behavior, gmailCategory short-circuit, end-to-end pipeline
- Update `__tests__/workflows/langgraph-workflow.test.ts` ✅
  - Updated topic schema to `{ parent, child, confidence }`, added gmailCategory short-circuit tests, two-label format, retry logic
- Update `__tests__/features-pov/email-processing-pipeline.test.ts` ✅
  - Updated mock topic format, added `TB/` label assertions
- Update `__tests__/features-pov/gmail-label-sync.test.ts` ✅
  - Removed TopicLabeler import
- Update `__tests__/features-pov/edge-cases/low-content.test.ts` ✅
  - Removed TopicLabeler import and dependent tests, updated mock topic format
- Update `__tests__/features-pov/inbox-manager.test.ts` ✅
  - Removed TopicLabeler import and dependent tests, updated mock topic format
- Update `__tests__/features-pov/scenarios/edge-case-orchestrator.scenarios.test.ts` ✅
  - Removed TopicLabeler import and dependent tests, updated mock topic format
- `__tests__/features/gmail-labels.test.ts` — no changes needed (tests GmailLabelManager, unchanged) ✅
- TypeScript compilation verified (`npx tsc --noEmit` passes) ✅

## Review Findings

### CRITICAL
- ~~**C1: Orchestrator never passes `topicLoader` to `processEmailWithWorkflow`**~~ ✅ FIXED — Added TopicLoader import, constructed topicLoader closure using `this.repos.topics.findAll()` that groups parent/child topics, passed as third argument to `processEmailWithWorkflow`.

### HIGH
- ~~**H1: 2 test files still import deleted `TopicLabeler` module**~~ ✅ FIXED — Removed imports and deleted TopicLabeler-dependent tests from `inbox-manager.test.ts` and `edge-case-orchestrator.scenarios.test.ts`.
- ~~**H2: 7+ test files use old topic schema**~~ ✅ FIXED — Updated mock topic schema from `{ parentTopic, childTopic, fullPath, confidence }` to `{ parent, child, confidence }` in 8 files: `orchestrator.test.ts`, `inbox-manager.test.ts`, `sender-summaries.test.ts`, `topic-summaries.test.ts`, `deals.test.ts`, `rapid-updates.test.ts`, `conflicting-info.test.ts`, `inbox-manager.test.ts`. Updated prompt matching to `prompt.includes('Assign a topic label')`.

### Positive Observations
- Clean schema simplification, Zod/state/prompt all aligned
- Gmail-first classification correctly implemented in both workflow and processing-decision.ts
- Retry logic with exponential backoff correct
- Orchestrator parent/child hierarchy and two-label creation matches spec
- Old label filtering (`TuskerBrain/Topic/`) correctly strips legacy labels
- Rewritten `topic-labeling.test.ts` is high quality

### Remaining Fixes Needed
1. ~~Wire up `topicLoader` in orchestrator (Critical)~~ ✅ FIXED
2. ~~Remove `TopicLabeler` imports from 2 test files (High)~~ ✅ FIXED
3. ~~Update mock topic schema in 7+ test files (High)~~ ✅ FIXED

All review issues resolved. TypeScript compilation verified.
