# Topic Labeling Redesign

**Date:** 2026-03-30
**Status:** Design

## Problem

The current topic labeling system has several issues:

1. **Dead code**: `core/labeling/labeler.ts` (`TopicLabeler`) and `core/workflows/nodes/classify.ts` are rule-based classifiers that are not used in the production pipeline
2. **Redundant classification**: The LangGraph workflow class LLM to classify emails even Gmail already provides `gmailCategory` on emails
3. **LLM labeling is no domain-based fallback**: If the LLM fails during a label step falls back to `inferParentTopic()` he domain guessing — losing to no email aggregation
4. **Single combined Gmail label**: Each email gets one label `TuskerBrain/Topic/{Parent}/{Child}` — no parent label exists to group emails by parent category
5. **No existing topics awareness**: The LLM prompt doesn't tell the LLM about existing topics, so labels proliferate ("Chase", "Chase Bank", alongside "Chase")
6. **Label sprawl risk**: No mechanism to keep labels count manageable

## Design

### 1. Classification: Gmail-first, LLM when absent

- When `email.gmailCategory` is present, skip LLM entirely:
  - `promotions` → `promotional` (0.95)
 `social` → `social` (0.95)
 `updates` → `updates` (0.95) `forums` → `updates` (0.85) `primary` → `regular` (0.85)
- When `gmailCategory` is absent, use LLM to classify
- No rule-based heuristics. All domain/keyword/pnormalization code gets deleted

### 2. Topic Labeling: LLM-driven, DB-backed
- App sends email content + full list of existing parent and child topics to the LLM
- LLM outputs `{ parent: string, child: string, confidence: number }`
- App looks up `parent` and `child` in DB
- If both exist → tag email with existing labels
- If not → create new entries, then tag
- No booleans flags (`isNew*`), no domain maps, no normalizations maps Just "Chase" → "Chase". LLM's reasoning naturally follows the hierarchy:
 it sees the existing topics:
- Match existing child → inherits parent (most common)
- New child under existing parent (common)
- New parent + new child (rare

### 3. Gmail Labels: Two Per Email
- Parent label: `TB/{Parent}` ( e.g., `TB/Shopping`)
- Child label: `TB/{Parent}/{Child}` ( e.g., `TB/Shopping/Amazon`
- Both applied to every processed email

### 4. LLM Retry Strategy
- Up to 2 retries with exponential backoff on labeling failures
- No domain-based fallback

### 5. Orchestrator: Topic Persistence
- Find or create parent topic by `fullPath` (parent name)
- Find or create child topic by `fullPath` `{parent}/{child}`, with `parentId` set to parent
- Link email to child topic with confidence score
- Increment email count on both parent and child
- Create two Gmail labels entries (`TB/{Parent}` and `TB/{Parent}/{Child}`)

### 6. Deleted Code
| File | Reason |
|---|---|---|---|
| `core/labeling/labeler.ts` | Rule-based `TopicLabeler` with domain/keyword maps, `CHILD_NORMALIZATIONS` | Not used in production |
| `core/workflows/nodes/classify.ts` | Rule-based classifier ( domain/keyword heuristics, Duplicate of these functions `inferParentTopic()`, `inferTypeFromDomain()` |
| `langgraph-workflow.ts` fallback `inferParentTopic()` in `labelNode` |

## Files to Create
| File | New? | Notes |
|---|---|---|---|
| `core/workflows/prompts/classification.ts` | Update `buildClassificationPrompt` to include existing topics | Create |
| `core/workflows/prompts/topic-labeling.ts` | New prompt file for LLM topic labeling with existing topics context |

## Files to Modify
| File | Changes |
|---|---|---|---|
| `core/workflows/langgraph-workflow.ts` | `classifyNode` | Use `gmailCategory` short-circuit; `labelNode` loads existing topics, send to LLM; retry on failure; remove `inferParentTopic` fallback; generate two Gmail labels |
| `core/orchestrator.ts` | Create two labels (`TB/{Parent}` + `TB/{Parent}/{Child}`); create parent topic if needed; create child topic with parent link |

## Tests to Delete
| File | Reason |
|---|---|---|---|
| `__tests__/features/topic-labeling.test.ts` | Tests the dead `TopicLabeler` |
| `__tests__/workflows/email-classification.test.ts` | Tests the old classify module |

## Tests to Modify
| File | Changes |
|---|---|---|---|
| `__tests__/features-pov/topic-labeling.test.ts` | Rewrite to test new LLM-based labeling |
| `__tests__/workflows/langgraph-workflow.test.ts` | Update classify and label node tests |
| `__tests__/features-pov/email-processing-pipeline.test.ts` | Update end-to-end pipeline tests |
| `__tests__/features/gmail-labels.test.ts` | Update for two-label format |

## Test Plan

**Phase 1: Remove dead code**
- Delete `core/labeling/labeler.ts`
- Delete `core/workflows/nodes/classify.ts`
- Update `langgraph-workflow.ts` to remove `inferParentTopic` fallback, add `gmailCategory` short-circuit
- Add retry logic (2 retries)
 exponential backoff) to `labelNode`
- Update `core/orchestrator.ts` to apply two Gmail labels

- Update `core/workflows/prompts/classification.ts` or remove unused exports from buildClassificationPrompt`

**Phase 2: Add LLM topic labeling prompt**
- Create `core/workflows/prompts/topic-labeling.ts`
- Update `langgraph-workflow.ts` `labelNode` to load existing topics and pass to prompt

- Simplify `TopicLabelingSchema`: just `{ parent, string, child: string, confidence: number }`

**Phase 3: Update orchestrator**
- Update `core/orchestrator.ts` to create parent + child topics, create two Gmail labels

- Update `core/workflows/langgraph-workflow.ts` to generate two labels instead of one

**Phase 4: Test cleanup**
- Delete old test files
- Rewrite `__tests__/features-pov/topic-labeling.test.ts`
- Update remaining test files
