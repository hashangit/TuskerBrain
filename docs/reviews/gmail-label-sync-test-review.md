# Test Review: Gmail Label Sync

## Summary
- File: `__tests__/features-pov/gmail-label-sync.test.ts`
- Total tests: 9
- Date: 2026-03-30

## Mock Analysis
| Category | What's Mocked | What's Real |
|----------|--------------|-------------|
| Database | Nothing -- real SQLite in-memory database with full migration | `TuskerBrainDatabase`, `createRepositories`, full Drizzle ORM stack |
| Repositories | Nothing -- real `LabelsRepository`, `EmailRepository` instances | `repos.labels.create()`, `repos.labels.linkLabelsToEmail()`, `repos.labels.getLabelsForEmail()`, `repos.emails.create()` |
| External APIs | Gmail API HTTP calls (`listLabels`, `createLabel`, `modifyMessage`) | N/A -- `createMockGmailClient()` replaces the entire `GmailClient` |
| Internal Logic (GmailLabelManager) | Nothing -- real instance | `GmailLabelManager.ensureTopicLabels()`, `applyTopicLabels()`, `applySenderLabel()`, `applyProcessedLabel()`, `applyAllLabels()`, label caching, 409 conflict handling, `normalizeName()` |
| Internal Logic (TopicLabeler) | Nothing -- real instance | `TopicLabeler.classifyTopic()` with real domain mapping, keyword matching, child normalization |
| GmailClient interface | `createMockGmailClient()` provides a faithful in-memory simulation of Gmail's label API (including 409 conflict on duplicate label creation) | N/A |

## Test-by-Test Analysis

### Test: creates TuskerBrain/Topic/Parent/Child label hierarchy when new topic is created
| Field | Value |
|-------|-------|
| **User Story** | When a new email arrives, the system classifies it into a topic hierarchy and creates the corresponding Gmail labels |
| **What it verifies** | (1) TopicLabeler classifies a Chase email as Banking/Chase, (2) GmailLabelManager creates parent label before child label, (3) the email is modified with the child label ID |
| **Code path exercised** | `TopicLabeler.classifyTopic()` -> domain mapping lookup -> `GmailLabelManager.applyTopicLabels()` -> `ensureTopicLabels()` -> `loadCache()` -> `getOrCreateLabel()` x2 (parent then child) -> `client.modifyMessage()` |
| **Mocked** | Gmail HTTP API (`listLabels`, `createLabel`, `modifyMessage`) |
| **Real** | `TopicLabeler` (full classification pipeline), `GmailLabelManager` (caching, hierarchy creation, 409 handling, label name construction) |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. The classification logic, label hierarchy construction, and creation ordering are all real. Only the Gmail HTTP transport is mocked, which is appropriate. |

### Test: creates parent label before child label
| Field | Value |
|-------|-------|
| **User Story** | The system always creates the parent label in Gmail before the child to maintain label hierarchy integrity |
| **What it verifies** | When `ensureTopicLabels('Shopping', 'Amazon')` is called, `TuskerBrain/Topic/Shopping` is created before `TuskerBrain/Topic/Shopping/Amazon` |
| **Code path exercised** | `GmailLabelManager.ensureTopicLabels()` -> `loadCache()` -> `getOrCreateLabel()` for parent -> `getOrCreateLabel()` for child |
| **Mocked** | Gmail HTTP API |
| **Real** | `GmailLabelManager.ensureTopicLabels()` with real label path construction and sequential creation |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. The ordering guarantee is a real behavior of the manager. |

### Test: reuses existing Gmail labels instead of creating duplicates
| Field | Value |
|-------|-------|
| **User Story** | If labels already exist in Gmail, the system reuses them rather than attempting to create duplicates |
| **What it verifies** | (1) When labels are pre-seeded (simulating existing Gmail labels), `applyTopicLabels` creates zero new labels, (2) the message is still modified with the existing label ID |
| **Code path exercised** | `GmailLabelManager.applyTopicLabels()` -> `ensureTopicLabels()` -> `loadCache()` (populates cache from seeded labels) -> `getOrCreateLabel()` (cache hit, no API call) -> `client.modifyMessage()` |
| **Mocked** | Gmail HTTP API, with pre-seeded labels simulating an existing Gmail account |
| **Real** | `GmailLabelManager` label cache lookup, the decision to skip creation when cached |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | The mock simulates 409 conflict on `createLabel` for duplicates, but this test doesn't exercise that code path -- it tests the cache-hit path. The 409 code path in `getOrCreateLabel` is exercised indirectly in the duplicate-label test later. |

### Test: creates TuskerBrain/Sender/domain label for new sender domain
| Field | Value |
|-------|-------|
| **User Story** | When processing an email, the system creates a sender-domain label in Gmail |
| **What it verifies** | (1) `applySenderLabel('email-1', 'chase.com')` creates a label named `TuskerBrain/Sender/chase.com`, (2) the message is modified with that label's ID |
| **Code path exercised** | `GmailLabelManager.applySenderLabel()` -> `loadCache()` -> `getOrCreateLabel()` -> `client.modifyMessage()` |
| **Mocked** | Gmail HTTP API |
| **Real** | `GmailLabelManager.applySenderLabel()` with real domain normalization and label path construction |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. |

### Test: reuses existing sender labels
| Field | Value |
|-------|-------|
| **User Story** | The system does not recreate sender labels that already exist in Gmail |
| **What it verifies** | (1) When `TuskerBrain/Sender/example.com` is pre-seeded, `applySenderLabel` returns the existing label ID without creating a new one, (2) the message is still modified |
| **Code path exercised** | `GmailLabelManager.applySenderLabel()` -> `loadCache()` -> cache hit -> `client.modifyMessage()` |
| **Mocked** | Gmail HTTP API with pre-seeded sender label |
| **Real** | `GmailLabelManager` cache lookup and reuse logic |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. |

### Test: applies TuskerBrain/Processed label to processed emails
| Field | Value |
|-------|-------|
| **User Story** | After processing an email, the system applies a "Processed" label so it knows the email was handled |
| **What it verifies** | (1) `applyProcessedLabel` creates a `TuskerBrain/Processed` label, (2) the message is modified with that label ID |
| **Code path exercised** | `GmailLabelManager.applyProcessedLabel()` -> `loadCache()` -> `getOrCreateLabel()` -> `client.modifyMessage()` |
| **Mocked** | Gmail HTTP API |
| **Real** | `GmailLabelManager.applyProcessedLabel()` |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. |

### Test: tracks which emails have been labeled
| Field | Value |
|-------|-------|
| **User Story** | The system correctly applies the Processed label to multiple distinct emails |
| **What it verifies** | (1) After processing two emails, both have the Processed label applied, (2) the same label ID is reused for both, (3) each modifyMessage call targets the correct email ID |
| **Code path exercised** | `GmailLabelManager.applyProcessedLabel()` x2, with cache reuse on second call |
| **Mocked** | Gmail HTTP API |
| **Real** | `GmailLabelManager` with label caching (second call reuses cached label, only calls `modifyMessage`) |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | This test name ("tracks which emails have been labeled") slightly misrepresents what it tests -- it does NOT verify database tracking. It only verifies the Gmail API calls. The database tracking is covered in the integration test below. |

### Test: ensures TuskerBrain parent label exists before creating children
| Field | Value |
|-------|-------|
| **User Story** | When creating a new topic hierarchy, the system ensures the `TuskerBrain` root label chain is created top-down |
| **What it verifies** | `ensureTopicLabels('Health', 'Fitbit')` creates `TuskerBrain/Topic/Health` before `TuskerBrain/Topic/Health/Fitbit` |
| **Code path exercised** | `GmailLabelManager.ensureTopicLabels()` -> `loadCache()` -> `getOrCreateLabel(parent)` -> `getOrCreateLabel(child)` |
| **Mocked** | Gmail HTTP API |
| **Real** | `GmailLabelManager` label hierarchy creation with ordering guarantee |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Note: this test verifies `TuskerBrain/Topic/Health` ordering, but does NOT verify that a bare `TuskerBrain` root label is created. In the real `GmailLabelManager`, only `TuskerBrain/Topic/Health` and `TuskerBrain/Topic/Health/Fitbit` are created -- the root `TuskerBrain` label is NOT explicitly created (Gmail infers hierarchy from the `/` separator). The test is correct for the actual implementation. |

### Test: handles Gmail API errors when creating labels
| Field | Value |
|-------|-------|
| **User Story** | If the Gmail API fails (e.g., permission denied), the system propagates the error rather than silently succeeding |
| **What it verifies** | (1) When `createLabel` throws a non-retryable error, `applyTopicLabels` rejects with that error, (2) no messages are modified |
| **Code path exercised** | `GmailLabelManager.applyTopicLabels()` -> `ensureTopicLabels()` -> `getOrCreateLabel()` -> `withRetry()` -> error thrown, non-rate-limit -> re-throw immediately |
| **Mocked** | Gmail HTTP API with `createLabel` overridden to throw a permanent error |
| **Real** | `GmailLabelManager` error propagation and `withRetry` logic (which re-throws non-rate-limit errors immediately) |
| **Verdict** | TESTING REAL |
| **Confidence** | MEDIUM |
| **Concerns** | The test overrides `mockClient.createLabel` to always throw. This bypasses the `getOrCreateLabel` cache-check path and goes straight to the retry wrapper. The `withRetry` method's exponential-backoff logic for rate-limit errors (429) is NOT tested here. A more thorough test would verify: (1) rate-limit retry behavior, (2) 409 conflict recovery path in `getOrCreateLabel`. |

### Test: applies all label types to a single email and tracks them locally
| Field | Value |
|-------|-------|
| **User Story** | The full pipeline: classify an email, apply all Gmail labels (topic + sender + processed), and persist the label associations in the local database |
| **What it verifies** | (1) TopicLabeler classifies a Chase email as Banking/Chase, (2) `applyAllLabels` creates all three label types in Gmail, (3) labels are stored in the local database via `repos.labels.create()`, (4) labels are linked to the email via `repos.labels.linkLabelsToEmail()`, (5) `repos.labels.getLabelsForEmail()` returns the correct label names |
| **Code path exercised** | `TopicLabeler.classifyTopic()` -> `GmailLabelManager.applyAllLabels()` -> `ensureTopicLabels()` + `getSenderLabelId()` + `getProcessedLabelId()` + `modifyMessage()` -> `LabelsRepository.create()` x N -> `LabelsRepository.linkLabelsToEmail()` -> `LabelsRepository.getLabelsForEmail()` (JOIN query) |
| **Mocked** | Gmail HTTP API |
| **Real** | `TopicLabeler`, `GmailLabelManager.applyAllLabels()`, `LabelsRepository` (full CRUD with real SQLite), `email_labels` JOIN table |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | This is the strongest test in the suite. It exercises the full vertical path from classification through Gmail API interaction through database persistence and retrieval. The only gap: the test manually calls `repos.labels.create()` and `repos.labels.linkLabelsToEmail()` rather than having `GmailLabelManager` do it. In a real production flow, there may be a higher-level orchestrator that bridges the GmailLabelManager and the database. The test correctly simulates what that orchestrator would do. |

### Test: labels multiple emails from same domain without creating duplicate Gmail labels
| Field | Value |
|-------|-------|
| **User Story** | When processing multiple emails from the same sender, Gmail labels are created only once and reused for subsequent emails |
| **What it verifies** | (1) Two emails from chase.com are both labeled, (2) each Gmail label name appears in `createdLabels` only once (no duplicates), (3) both emails receive `modifyMessage` calls |
| **Code path exercised** | `TopicLabeler.classifyTopic()` -> `GmailLabelManager.applyAllLabels()` x2, with second call hitting label cache |
| **Mocked** | Gmail HTTP API |
| **Real** | `TopicLabeler` (with domain caching on second call), `GmailLabelManager` label caching across multiple `applyAllLabels` calls |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | The deduplication assertion (`uniqueLabelNames.size === createdLabels.length`) is a good check. However, it relies on the mock accurately simulating Gmail's behavior (not throwing on the second creation attempt for an already-cached label). In the real `GmailLabelManager`, the second call would hit the in-memory `labelCache` and never call `createLabel` at all -- so the mock's 409 simulation isn't actually needed here. The test is correct regardless. |

## Overall Assessment

- [x] Tests validate real application behavior
- [ ] Tests are mostly testing mocks with some real code
- [ ] Tests are testing mocks only
- **Percentage of real behavior tested: ~85%**

### What's Real
1. **TopicLabeler** (`core/labeling/labeler.ts`): Fully real. Domain mapping, keyword matching, child normalization, confidence scoring -- all exercised without mocks.
2. **GmailLabelManager** (`core/labeling/manager.ts`): Fully real. Label caching, hierarchy ordering, `getOrCreateLabel` with 409 handling, `withRetry` error propagation, `applyAllLabels` aggregation, `normalizeName` -- all real.
3. **LabelsRepository** (`core/repositories/labels.ts`): Real in all integration tests. `create()`, `linkLabelsToEmail()`, `getLabelsForEmail()` all run against real SQLite with the full migration schema.
4. **Database**: Real in-memory SQLite with the full migration (`0000_initial.sql`).

### What's Mocked (and Why It's Appropriate)
1. **GmailClient HTTP calls**: The `createMockGmailClient()` replaces the real `GmailClient` which uses `googleapis`. This is the correct boundary to mock -- Gmail is an external HTTP API. The mock is faithful: it simulates label creation, label listing, message modification, and 409 conflict behavior.

### Critical Gaps
1. **Rate-limit retry logic not tested**: The `withRetry` method has exponential backoff for 429 errors, but no test triggers a 429 followed by a successful retry. The "handles Gmail API errors" test only tests permanent errors.
2. **409 conflict recovery path not directly tested**: `getOrCreateLabel` has a code path where `createLabel` returns 409, then the cache is refreshed and the existing label is found. No test explicitly exercises this path (the "reuses existing labels" tests use pre-seeded cache hits, not 409 recovery).
3. **`normalizeName` not tested with edge cases**: The manager has a `normalizeName` method that strips special chars and truncates to 100 chars. No test provides a label name with special characters or exceeding 100 chars to verify this.
4. **No negative test for `applyAllLabels` with empty options**: What happens if `applyAllLabels` is called with no topic, no sender, no processed flag?
5. **Database label type classification is manual in the test**: The test manually determines `labelType` (topic/sender/processed) from the label name prefix. If this logic exists in production code somewhere, it should be tested there. If it doesn't, the test is filling a gap that may not be covered in production.

### Verdict
This is a well-written feature test suite. The mocking boundary is drawn at the right place -- the external Gmail API. All internal business logic (classification, label hierarchy, caching, error propagation, database persistence) runs for real. The tests would catch regressions in the label creation order, cache reuse, and database persistence logic.
