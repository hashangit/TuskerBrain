# Test Review: Summary Quality (New Tests Only)

## Summary
- Files reviewed:
  - `__tests__/features-pov/topic-summaries.test.ts` (5 new tests under "Summary Quality")
  - `__tests__/features-pov/sender-summaries.test.ts` (4 new tests under "Summary Quality")
- Date: 2026-03-30

## Mock Analysis
| Category | What's Mocked | What's Real |
|----------|--------------|-------------|
| Database | Nothing -- real SQLite in-memory (and file-based for persistence tests) | Full schema via migrations, real Drizzle ORM queries |
| Repositories | `topics.updateSummary` is monkey-patched in topic tests (not mocked -- replaced with a real implementation calling `upsertSummary`). In sender tests, `topics.updateSummary` is replaced with `vi.fn().mockResolvedValue(undefined)`. | `EmailRepository`, `TopicsRepository` (all CRUD, linkEmail, findEmailsForTopic, upsertSummary, getSummary), `SummariesRepository` (upsertSenderSummary, getSenderSummary, deleteSenderSummary, getAllSenderSummaries), `DealsRepository`, `TimelineRepository`, `LabelsRepository` |
| External APIs | LLM provider (`generateText` and `generateObject`), Gmail client, Job Queue | None -- all external services are mocked |
| Internal Logic | None of the orchestrator logic is mocked | `EmailProcessingOrchestrator.processEmail()`, `updateTopicSummary()`, `updateSenderSummary()`, LangGraph workflow (`processEmailWithWorkflow`, all nodes: classify, decide, extract, label, summarize), `buildSummaryPrompt()`, `buildSenderSummaryPrompt()` |

## Topic Summary Tests

### Test: "prompt instructs LLM to begin with a high-level overview paragraph" (REWORKED)
| Field | Value |
|-------|-------|
| **User Story** | When a topic summary is generated, the system instructs the LLM to begin with a high-level overview paragraph |
| **What it verifies** | (1) Two emails processed for same topic, triggering the merge path in `updateTopicSummary`. (2) The prompt passed to `generateText` on the merge call contains the instruction "First paragraph: Always high-level overview". (3) The prompt includes the topic name "Banking/Chase" and a "New Content:" section. |
| **Code path exercised** | `processEmail` -> LangGraph workflow -> `updateTopicSummary` (merge path, `existing` is non-null) -> `buildSummaryPrompt` -> `generateText`. The first email uses `createMockLLMProvider` to establish an existing summary. The second email uses a `vi.fn()` spy on `generateText` to capture prompt arguments. |
| **Mocked** | LLM `generateText` is a `vi.fn()` spy for the second orchestrator. `generateObject` returns hardcoded classification/topic/update objects. Gmail and Job Queue are no-ops. |
| **Real** | `buildSummaryPrompt` output (real production code), `updateTopicSummary` merge logic (real code path that retrieves existing summary and constructs merge prompt). |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Reworked from mock-content assertions to prompt-argument verification. Now asserts on what we ASK the LLM to do, not on what the mock returns. The test proves `buildSummaryPrompt` produces a prompt containing the overview instruction. The merge call is identified by filtering for prompts that contain "Current Summary:" but NOT "No previous summary exists". |

### Test: "prompt enforces 500-word limit and includes existing summary context" (REWORKED)
| Field | Value |
|-------|-------|
| **User Story** | When merging new email content into an existing topic summary, the prompt enforces the word limit and carries forward prior context |
| **What it verifies** | (1) Two emails processed, merge path triggered. (2) The merge prompt contains "500" and "under 500 words". (3) The prompt includes "Current Summary:" with the first email's stored summary. (4) The prompt includes "New Content:". (5) DB `updateCount >= 2`. |
| **Code path exercised** | Full pipeline for both emails. `updateTopicSummary` merge path on second email calls `buildSummaryPrompt` with `maxWords: 500`, `currentSummary`, and `newContent`. |
| **Mocked** | LLM `generateText` is a `vi.fn()` spy for the second orchestrator. `generateObject` handles all prompt types. |
| **Real** | `buildSummaryPrompt` output (including `maxWords` interpolation), `updateTopicSummary` merge logic (retrieves existing summary, passes it to prompt builder), DB `updateCount` SQL increment. |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Reworked from mock-content assertions to prompt-argument verification. The 500-word limit is now verified as a PROMPT instruction, which is the only place it exists in the codebase. The test proves `buildSummaryPrompt` correctly interpolates `maxWords: 500` into the prompt text. The DB assertion on `updateCount` tests real SQL increment. |

### Test: "prompt merges existing summary with new email content for recency weighting" (REWORKED)
| Field | Value |
|-------|-------|
| **User Story** | When updating a topic summary, the system provides the LLM with both old and new context so it can de-emphasize older information |
| **What it verifies** | (1) Two emails processed (old then new). (2) The merge prompt contains "Current Summary:" with the old summary text ("Old policy terms from January"). (3) The prompt contains "New Content:" with the new email's workflow summary. (4) The prompt includes the instruction "Gradually reduce focus on older information". (5) DB `updateCount > 1`. |
| **Code path exercised** | Full pipeline twice. `updateTopicSummary` merge path on second email. `buildSummaryPrompt` called with `currentSummary` (old) and `newContent` (new workflow summary). |
| **Mocked** | LLM `generateText` is a `vi.fn()` spy for the second orchestrator. `generateObject` handles all prompt types. |
| **Real** | `buildSummaryPrompt` output (includes recency instruction and both content sections), `updateTopicSummary` merge logic (retrieves existing summary from DB), DB `updateCount` SQL increment. |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Reworked from mock-content assertions to prompt-argument verification. The test proves `buildSummaryPrompt` correctly includes both `currentSummary` and `newContent` sections, AND that the orchestrator correctly retrieves the prior summary from the DB. The recency instruction "Gradually reduce focus on older information" is verified as part of the prompt template. The `updateCount` assertion tests real SQL increment. |

### Test: "prompt provides both old and new values so LLM can resolve conflicts" (REWORKED)
| Field | Value |
|-------|-------|
| **User Story** | When a topic receives contradictory information, the system gives the LLM both old and new values so it can resolve the conflict |
| **What it verifies** | (1) Two emails with conflicting prices processed. (2) The merge prompt contains "Current Summary:" with the old price ($29.99 from the first email's summary). (3) The prompt contains "New Content:". (4) The prompt includes the instruction "Preserve important dates, amounts, and action items". (5) DB `updateCount >= 2`. |
| **Code path exercised** | Full pipeline twice. `updateTopicSummary` merge path on second email. `buildSummaryPrompt` called with `currentSummary` containing $29.99. |
| **Mocked** | LLM `generateText` is a `vi.fn()` spy for the second orchestrator. `generateObject` handles all prompt types. |
| **Real** | `buildSummaryPrompt` output (includes amount-preservation instruction), `updateTopicSummary` merge logic (retrieves existing summary with old price from DB), DB `updateCount` SQL increment. |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Reworked from mock-content assertions to prompt-argument verification. The test verifies that the prompt RECEIVES both the old summary (with $29.99) and the new content section. It does NOT assert $19.99 is in the `newContent` because the workflow summarizes the raw email before passing it to `updateTopicSummary` -- the `newContent` is the workflow's summary text, not the raw email snippet. The real code under test is the prompt construction and context passing, not the LLM's conflict resolution. The `updateCount` assertion tests real SQL increment. |

### Test: "topic summary persists across app restart"
| Field | Value |
|-------|-------|
| **User Story** | Summaries survive an application restart -- the user sees the same summary after closing and reopening the app |
| **What it verifies** | (1) Summary is created and stored in a file-based SQLite DB. (2) DB is closed and reopened with fresh repository instances. (3) Summary content, wordCount, and updateCount are identical before and after. |
| **Code path exercised** | Full pipeline for email processing, then raw DB close/reopen, then `TopicsRepository.getSummary` on the reopened DB. |
| **Mocked** | LLM, Gmail, Job Queue. |
| **Real** | `TuskerBrainDatabase` with file-based SQLite, full migration execution, `createRepositories`, all DB read/write operations. |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | This is the strongest test in the suite. It genuinely verifies that data written to the database survives a close/reopen cycle. The assertions compare field-by-field (`summary`, `wordCount`, `updateCount`) between the original and reopened reads. The only weakness is that it does not test the full orchestrator on the reopened DB -- it only reads the summary. But for persistence verification, this is solid. |

## Sender Summary Tests

### Test: "sender summary accumulates across multiple emails from same domain" (VERIFIED)
| Field | Value |
|-------|-------|
| **User Story** | When a user views a sender summary for a domain that has sent 6+ emails on different themes, the summary reflects all those themes |
| **What it verifies** | (1) 6 emails processed for `chase.com`. (2) `updateCount === 6`. (3) Summary matches `/security\|alert\|statement\|payment\|reward\|upgrade\|fraud/`. (4) Word count <= 500. |
| **Code path exercised** | Full pipeline 6 times: LangGraph workflow -> `updateSenderSummary` -> `SummariesRepository.upsertSenderSummary`. First call creates, subsequent calls update (increment `updateCount`). Real `buildSenderSummaryPrompt` called each time. |
| **Mocked** | LLM returns a hardcoded summary mentioning "security alerts, account statements, payments, rewards, account upgrades, and fraud monitoring". Gmail and Job Queue are no-ops. `topics.updateSummary` is stubbed to `vi.fn().mockResolvedValue(undefined)`. |
| **Real** | Full orchestrator, workflow, `SummariesRepository` (real DB upserts with `updateCount` increment via SQL), prompt construction. |
| **Verdict** | MIXED |
| **Confidence** | MEDIUM |
| **Concerns** | The `updateCount === 6` assertion tests REAL behavior -- it proves the repository's SQL `updateCount + 1` increment works correctly across 6 iterations (verified by tracing `SummariesRepository.upsertSenderSummary` which uses `sql\`${schema.senderSummaries.updateCount} + 1\`` in the SQL UPDATE). The content-matching regex is the fake part (checks mock output). The word count assertion also checks mock output. Note: this test was not reworked because the real part (SQL increment) is already meaningfully tested, and the mock parts would need prompt-argument capture to improve. The test is acceptable in its current form as a plumbing/integration test. |

### Test: "sender summary reflects email frequency"
| Field | Value |
|-------|-------|
| **User Story** | A user can see that a high-volume sender's summary notes the frequency of communication |
| **What it verifies** | (1) 10 emails processed for `daily-sender.com`. (2) `updateCount === 10`. (3) Captures the prompt arguments passed to `generateText` and verifies: 10 sender summary prompts generated, first prompt contains "No previous summary exists", last prompt contains `Current Summary:` with rolling context, `Sender Domain: daily-sender.com`, `New Content:`, and the prompt instruction "Highlight patterns in communication". |
| **Code path exercised** | Full pipeline 10 times, real `upsertSenderSummary` with SQL increment, real `buildSenderSummaryPrompt` construction per email. Prompt arguments captured via `vi.fn()` spy on `generateText`. |
| **Mocked** | LLM `generateText` is a `vi.fn()` spy returning generic mock text. `generateObject` returns hardcoded classification/topic/update objects. Gmail/JobQueue are no-ops. |
| **Real** | Full orchestrator, workflow, DB operations, `updateCount` increment, real `buildSenderSummaryPrompt` output. |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Reworked from mock-content assertions to prompt-argument verification. Now asserts on what we ASK the LLM to do (the prompt), not on what our mock returns. The `updateCount === 10` tests real SQL increment. The prompt assertions verify `buildSenderSummaryPrompt` correctly includes sender domain, rolling current summary, new content, and frequency-related instructions. This is a genuine test of production prompt construction logic. |

### Test: "sender summary persists across app restart"
| Field | Value |
|-------|-------|
| **User Story** | Sender summaries survive an application restart |
| **What it verifies** | (1) Sender summary created via orchestrator with file-based SQLite. (2) DB closed and reopened. (3) Summary content, senderDomain, and updateCount are identical. |
| **Code path exercised** | Full pipeline for email processing, DB close, DB reopen, `SummariesRepository.getSenderSummary` on fresh connection. |
| **Mocked** | LLM, Gmail, Job Queue. |
| **Real** | File-based `TuskerBrainDatabase`, migration execution, `SummariesRepository` upsert and read. |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Like the topic persistence test, this is a strong test. It verifies real SQLite persistence with file-based DB. The assertions compare field-by-field after a genuine close/reopen. Solid. |

### Test: "handles conflicting information from same sender"
| Field | Value |
|-------|-------|
| **User Story** | When a sender first says one thing and later corrects it, the summary reflects the latest information |
| **What it verifies** | (1) Two emails processed for `news-source.com` with conflicting info. (2) `updateCount === 2`. (3) Captures the prompt arguments passed to the second orchestrator's `generateText` and verifies: the prompt contains `Current Summary:` with the first email's stored result ("mock first summary"), contains `New Content:` with the second email's data, contains `Sender Domain: news-source.com`, and includes the instruction "Gradually reduce focus on older emails". |
| **Code path exercised** | Two separate orchestrator instances process two emails. Each runs full pipeline including `updateSenderSummary`. Real `upsertSenderSummary` with SQL increment. Prompt arguments captured via `vi.fn()` spy on the second orchestrator's `generateText`. |
| **Mocked** | First LLM's `generateText` is a spy returning "mock first summary" for sender prompts. Second LLM's `generateText` is a spy returning "mock second summary". `generateObject` returns hardcoded classification/topic/update objects for both. |
| **Real** | Full orchestrator (two instances), workflow, DB operations, real `buildSenderSummaryPrompt` construction. |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Reworked from mock-content assertions to prompt-argument verification. Now verifies that the second prompt includes the prior summary as context (`Current Summary:` section) alongside the new content. This proves `buildSenderSummaryPrompt` correctly passes both old and new information to the LLM, giving it the context needed to resolve conflicts. The `updateCount === 2` assertion tests real SQL increment. |

## Overall Assessment

- [x] Tests validate real application behavior
- [ ] Tests are mostly testing mocks with some real code
- [ ] Tests are testing mocks only
- Percentage of real behavior tested: ~85% (up from ~35%)

### What the tests actually prove (real value):
1. **DB persistence works**: Both restart tests genuinely verify SQLite round-trip persistence.
2. **`updateCount` SQL increment works**: Tests processing multiple emails prove the SQL `updateCount + 1` logic works correctly.
3. **Full pipeline plumbing**: The orchestrator, LangGraph workflow, and repositories are wired together correctly. Emails flow through classify -> decide -> extract -> label -> summarize -> persist without errors.
4. **Repository CRUD operations**: Upsert, read, delete operations work correctly against real SQLite.
5. **Topic prompt construction** (A12-A15 reworked): Four topic summary tests now verify `buildSummaryPrompt` output via prompt-argument capture. They prove the prompt includes: overview instruction, 500-word limit, existing summary context, new content section, recency weighting instruction, and amount-preservation instruction.
6. **Sender prompt construction** (A16-A17 reworked): Two sender summary tests verify `buildSenderSummaryPrompt` output via prompt-argument capture. They prove the prompt includes sender domain, rolling current summary, new content, and relevant instructions.
7. **Merge path exercised**: Tests verify that `updateTopicSummary` correctly retrieves existing summaries from the DB and passes them to `buildSummaryPrompt` as `currentSummary`.

### What the tests DO NOT prove (remaining gaps):
1. **Sender accumulation content**: The sender accumulation test (6 emails, C7) still uses mock-content regex matching. The real part (`updateCount === 6`) tests SQL increment correctly.
2. **No word-limit enforcement code**: The 500-word limit is a prompt instruction only. If the LLM ignores it, the app stores oversized summaries. The reworked tests verify the PROMPT contains the limit instruction, which is the correct scope.

### Remaining recommendations:
1. Rework the sender accumulation test (C7, 6 emails) to use prompt-argument capture instead of mock-content regex.
2. Add a test that provides a mock returning a 600-word summary and verifies whether the application truncates or rejects it (it currently does not -- this would be a finding).
3. For persistence tests, verify the full round-trip through the orchestrator on the reopened DB, not just repository reads.
4. Standardize how `topics.updateSummary` is handled across test files (either always real or always explicitly stubbed).
