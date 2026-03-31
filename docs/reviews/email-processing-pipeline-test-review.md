# Test Review: Email Processing Pipeline

## Summary
- File: `__tests__/features-pov/email-processing-pipeline.test.ts`
- Total tests: 7 (1 todo)
- Date: 2026-03-30
- **Updated**: 2026-03-30 (rework pass)

## Mock Analysis
| Category | What's Mocked | What's Real |
|----------|--------------|-------------|
| Database | Removed (was dead scaffolding) | N/A |
| Repositories | Removed (was dead scaffolding) | N/A |
| External APIs | LLM provider (OpenAI/Anthropic/Google) fully mocked | N/A -- no real LLM calls |
| Internal Logic | LLM response values are hardcoded in `createMockLLM` | `processEmailWithWorkflow` (LangGraph workflow), `classifyNode`, `decideNode`, `extractNode`, `labelNode`, `summarizeNode`, `archiveNode`, `deleteNode`, all routing functions, `getEmailAgeInDays`, `inferTypeFromDomain`, `inferParentTopic`, prompt builders (`buildClassificationPrompt`, `buildUpdateExtractionPrompt`, `buildDealExtractionPrompt`, `buildSummaryPrompt`) |
| LangGraph | NOT mocked. Real `StateGraph` compiles and runs | Full graph topology, state annotations, conditional edges |

## Important Context

The test file calls REAL production code (`processEmailWithWorkflow` in `langgraph-workflow.ts`). Only the LLM provider is mocked. The previous database scaffolding (in-memory SQLite + repositories) was removed because `processEmailWithWorkflow` never uses the database.

## Test-by-Test Analysis

### Test: classifies regular email and traverses full pipeline (classify -> decide -> extract -> label -> summarize)
| Field | Value |
|-------|-------|
| **Status** | Reworked (was A6) |
| **User Story** | When a regular work email arrives, the workflow routes it through classify -> decide -> extract -> label -> summarize |
| **What it verifies** | `decideNode` routes regular+recent to action=process with needsExtraction=true and needsTopicLabeling=true; `routeAfterDecide` sends to extract; `routeAfterExtract` sends to label (because needsTopicLabeling=true); label node applies TuskerBrain/Processed; pipeline ends at summarize |
| **Code path exercised** | `classifyNode` -> `decideNode` (type=regular, recent, action=process) -> `routeAfterDecide` returns 'extract' -> `extractNode` (non-promotional branch) -> `routeAfterExtract` returns 'label' -> `labelNode` -> `summarizeNode` |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |

### Test: processes email with action items through same pipeline
| Field | Value |
|-------|-------|
| **Status** | Reworked (was A7) |
| **User Story** | When an email containing action items is processed, the same full pipeline runs |
| **What it verifies** | Same decision routing as A6 (action=process, needsExtraction=true, needsTopicLabeling=true); extraction type=update; topic is not null; pipeline ends at summarize |
| **Code path exercised** | Same as A6: full pipeline (classify -> decide -> extract -> label -> summarize) |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Notes** | Consolidated with A6. Both now assert on real routing/decision behavior rather than mock passthrough values. |

### Test: decideNode routes recent promotional to extract_deals and skips label node
| Field | Value |
|-------|-------|
| **Status** | Reworked (was A8) |
| **User Story** | When a recent promotional email arrives, the system routes to extract_deals and skips topic labeling |
| **What it verifies** | `decideNode` action=extract_deals, needsExtraction=true, needsTopicLabeling=false; `routeAfterExtract` skips label node (result.topic is null); extraction type=deal; currentStep=summarize |
| **Code path exercised** | `classifyNode` -> `decideNode` (promotional, recent, action=extract_deals, needsTopicLabeling=false) -> `routeAfterDecide` -> `extractNode` (promotional branch) -> `routeAfterExtract` returns 'summarize' (skips label) -> `summarizeNode` |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |

### Test: extracts deal with expiry date (was A9)
| Field | Value |
|-------|-------|
| **Status** | DELETED |
| **Reason** | Near-duplicate of A8. Asserted only on mock passthrough values (dealExpiry, minimumPurchase). No real logic was exercised beyond what A8 already covers. |

### Test: gives high priority to Gmail important-flagged email (was A10)
| Field | Value |
|-------|-------|
| **Status** | DELETED -> converted to `test.todo()` |
| **Reason** | The `isImportant` flag is never read by `decideNode` or any other node in `langgraph-workflow.ts`. The workflow does not implement priority handling for important emails. Previous assertions on priority/urgency were mock passthrough. Marked as `test.todo` as a placeholder for future feature implementation. |

### Test: routes old promotional email to delete without AI extraction
| Field | Value |
|-------|-------|
| **Status** | Unchanged (was already good) |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. Best test in the file. Age calculation, decision logic, graph routing, and token-saving behavior are all genuinely tested. |

### Test: routes old regular email to archive
| Field | Value |
|-------|-------|
| **Status** | Unchanged (was already good) |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. Good test of age-based routing for regular email type. |

### Test: handles LLM failure gracefully
| Field | Value |
|-------|-------|
| **Status** | Unchanged (was already good) |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. Fallback classification via `inferTypeFromDomain` is genuinely tested. |

### Test: handles malformed email data (C4)
| Field | Value |
|-------|-------|
| **Status** | Verified + enhanced |
| **User Story** | When an email has missing or null fields, the system processes it without crashing |
| **What it verifies** | Workflow does not throw on null subject/snippet/senderDomain/senderName; decideNode routes correctly (type=regular + recent -> action=process); pipeline reaches a terminal step |
| **Code path exercised** | `classifyNode` uses `email.subject ?? undefined` and `email.snippet ?? undefined` (real null coalescing); `buildClassificationPrompt` uses `email.subject || 'No subject'` (real fallback); `decideNode` uses `state.classification?.type ?? 'regular'` (real null default); `senderDomain` is empty string (passes validation) |
| **Mocked** | LLM returns hardcoded regular classification |
| **Real** | All null-safety code paths in classifyNode, prompt builder fallbacks, decideNode null-default for type |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Verification** | Traced full execution path: (1) `classifyNode` passes `email.subject ?? undefined` to `buildClassificationPrompt` -- null becomes undefined; (2) prompt builder uses `email.subject || 'No subject'` -- undefined becomes 'No subject'; (3) `senderDomain` is empty string, passed directly to prompt; (4) `decideNode` reads `state.classification?.type ?? 'regular'` -- works because classification is set by mock. Added assertion on `decision.action` to verify decideNode's real routing logic executes on the malformed email. |

## Overall Assessment

- [x] Tests validate real application behavior
- [ ] Tests are mostly testing mocks with some real code
- [ ] Tests are testing mocks only
- **Percentage of real behavior tested: ~80%**

### What was changed
1. **A6-A8 reworked**: Replaced mock-passthrough assertions with assertions on real `decideNode` routing behavior (action, needsExtraction, needsTopicLabeling), real `routeAfterExtract` branching (topic null for promotional, non-null for regular), and real pipeline completion verification (currentStep).
2. **A9 deleted**: Near-duplicate of A8 with zero additional real behavior tested.
3. **A10 converted to `test.todo`**: `isImportant` is not read by any workflow node. Marked as placeholder for future feature.
4. **C4 verified + enhanced**: Confirmed real null-safety code paths in `classifyNode` (null coalescing), `buildClassificationPrompt` (fallback strings), and `decideNode` (null default). Added assertion on `decision.action` to verify decideNode routing executes on malformed email.
5. **Dead database scaffolding removed**: `beforeEach`/`afterEach` with in-memory SQLite and `createRepositories` removed. `processEmailWithWorkflow` never uses the database.

### Remaining gaps
1. **The orchestrator is never tested**: `EmailProcessingOrchestrator` wires the workflow to database, repositories, and Gmail client. This integration point is untested.
2. **No boundary tests for age thresholds**: No test verifying exact boundary values (30 days, 180 days, 730 days). Off-by-one errors would not be caught.
3. **`isImportant` feature not implemented**: Workflow does not read this field. When implemented, the `test.todo` should be expanded into real tests.
4. **No test for duplicate decision logic**: `processing-decision.ts` duplicates `decideNode` logic. Both should be tested for consistency.
