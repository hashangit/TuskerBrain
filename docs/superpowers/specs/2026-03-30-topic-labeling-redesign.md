# Topic Labeling Redesign

**Date:** 2026-03-30
**Status:** Design

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

### Schema: No Changes Needed
The existing schema already supports the redesign:
- `topics` table: `parent_id` self-reference + `full_path` unique constraint
- `email_topics`: composite PK `(email_id, topic_id)` with `confidence_score`
- `topic_summaries`: one-to-one with topics, merge tracking via `update_count`
- `gmail_labels` + `email_labels`: many-to-many email-label relationships

### Optional Index Additions
```sql
CREATE INDEX IF NOT EXISTS idx_topics_parent_id ON topics(parent_id);
CREATE INDEX IF NOT EXISTS idx_topics_name ON topics(name);
```
Supports queries like "find all children of parent" and "find topic by name" — useful for the new labelNode that loads existing topics.

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
| `database/migrations/0000_initial.sql` | Add optional indexes on `topics(parent_id)` and `topics(name)` |

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

### Phase 1: Remove dead code + add gmailCategory short-circuit
- Delete `core/labeling/labeler.ts`
- Delete `core/workflows/nodes/classify.ts`
- Delete `__tests__/fixtures/topics/predefined-parents.json`
- Update `classifyNode` in `langgraph-workflow.ts`: gmailCategory short-circuit
- Remove `inferParentTopic()`, `inferTypeFromDomain()` functions

### Phase 2: LLM topic labeling with existing topics
- Create `core/workflows/prompts/topic-labeling.ts`
- Update `labelNode` in `langgraph-workflow.ts`: load existing topics from DB, pass to LLM
- Add retry logic (2 retries, exponential backoff)
- Generate two Gmail labels per email
- Simplify `TopicLabelingSchema` to `{ parent, child, confidence }`

### Phase 3: Orchestrator updates
- Update `core/orchestrator.ts`: find-or-create parent topic, find-or-create child topic with parent link
- Apply two Gmail labels: `TB/{Parent}` + `TB/{Parent}/{Child}`

### Phase 4: Test cleanup
- Delete old test files
- Rewrite `__tests__/features-pov/topic-labeling.test.ts`
- Update remaining test files for new label format and gmailCategory behavior
