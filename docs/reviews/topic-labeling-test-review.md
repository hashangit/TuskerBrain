# Test Review: Topic Labeling (5-Step Algorithm -- New Tests Only)

## Summary
- File: `__tests__/features-pov/topic-labeling.test.ts`
- New tests reviewed: 14 (under "5-Step Topic Assignment Algorithm")
- Existing tests: 24 (not reviewed)
- Date: 2026-03-30

## Mock Analysis
| Category | What's Mocked | What's Real |
|----------|--------------|-------------|
| Database | Nothing -- real in-memory SQLite via `:memory:` | Full Drizzle ORM + libsql client with real schema migrations |
| Repositories | Nothing -- real instances via `createRepositories(db)` | `TopicsRepository`, `LabelsRepository`, `EmailRepository` all use real DB queries |
| External APIs | N/A -- GmailLabelManager is not exercised by these tests | Gmail API is not called; GmailLabelManager is not under test |
| Internal Logic | Nothing | `TopicLabeler.classifyTopic()` runs for real with all its domain maps, keyword maps, normalization maps, and caching logic |
| Email objects | `makeEmail()` helper constructs plain objects matching the `Email` type | These are real `Email`-shaped objects passed to real code; no interception |

## Test-by-Test Analysis

### Test: "assigns email to existing topic when domain was previously classified"
| Field | Value |
|-------|-------|
| **User Story** | When a second email arrives from a domain already seen, the system reuses the same topic instead of recomputing |
| **What it verifies** | Two emails from `amazon.com` produce identical `fullPath`, `parentTopic`, `childTopic`; second result is `Shopping`/`Amazon` |
| **Code path exercised** | `TopicLabeler.classifyTopic()` -> `findExistingTopic()` (cache miss first call, cache hit second call) -> `determineParentTopic()` -> `determineChildTopic()` -> `normalizeChildTopic()` -> `existingTopics.set()` |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real domain mapping, real in-memory cache |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. This directly tests the `existingTopics` Map caching logic. If the cache lookup in `findExistingTopic()` was broken, this test would fail. |

---

### Test: "case-insensitive domain match reuses existing topic"
| Field | Value |
|-------|-------|
| **User Story** | Emails from `netflix.com` and `NETFLIX.COM` should resolve to the same topic |
| **What it verifies** | `fullPath` is identical for both; parent is `Entertainment` |
| **Code path exercised** | `classifyTopic()` -> `findExistingTopic()` which lowercases domain via `email.senderDomain.toLowerCase()` for both cache lookup and cache store |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real case-insensitive cache key logic |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. The `findExistingTopic()` method calls `.toLowerCase()` on the domain before cache lookup (line 194 of labeler.ts). This test validates that code path. |

---

### Test: "maps to predefined parent when keyword matches subject content"
| Field | Value |
|-------|-------|
| **User Story** | An email from an unmapped domain (spacex.com) gets classified via keyword matching in the snippet |
| **What it verifies** | `parentTopic` is `Travel` (because "flight" is in `KEYWORD_TO_PARENT`); `childTopic` lowercased is "spacex" |
| **Code path exercised** | `classifyTopic()` -> `findExistingTopic()` (miss) -> `determineParentTopic()` (misses `DOMAIN_TO_PARENT`, misses sender name, hits `KEYWORD_TO_PARENT` for "flight") -> `determineChildTopic()` (uses sender name "SpaceX") -> `normalizeChildTopic()` |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real `DOMAIN_TO_PARENT`, `KEYWORD_TO_PARENT`, and normalization logic |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. Validates the keyword fallback path in `determineParentTopic()` correctly. |

---

### Test: "picks the most relevant predefined parent for finance email"
| Field | Value |
|-------|-------|
| **User Story** | An email from `wellsfargo.com` is classified under Banking, not some other category |
| **What it verifies** | `parentTopic` is `Banking`; explicitly asserts it is not `Technology` or `Shopping` |
| **Code path exercised** | `classifyTopic()` -> `determineParentTopic()` (hits `DOMAIN_TO_PARENT` for `wellsfargo.com`) |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real `DOMAIN_TO_PARENT` mapping |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | The negative assertions (`not.toBe('Technology')`, `not.toBe('Shopping')`) are redundant given the positive assertion. Not a correctness issue, just noise. |

---

### Test: "maps education domain to Education parent"
| Field | Value |
|-------|-------|
| **User Story** | Coursera emails are classified under Education |
| **What it verifies** | `parentTopic` is `Education` |
| **Code path exercised** | `classifyTopic()` -> `determineParentTopic()` (hits `DOMAIN_TO_PARENT` for `coursera.org`) |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real domain map |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Functionally identical to the existing test "classifies coursera.org domain under Education" in the "Predefined Parent Categories" block. The new test adds sender name and sender email, but the domain map hit path is the same. Minor duplication. |

---

### Test: "falls back to Business for obscure business-like domain"
| Field | Value |
|-------|-------|
| **User Story** | An unknown business domain gets classified under Business |
| **What it verifies** | `parentTopic` is `Business`; `childTopic` is `Obscure Robotics` (derived from sender name) |
| **Code path exercised** | `classifyTopic()` -> `determineParentTopic()` (misses domain map, misses sender name match, misses keywords, hits the 2-part domain -> Business fallback) -> `determineChildTopic()` (uses sender name, strips no suffix since "Robotics" is not a corporate suffix) -> `normalizeChildTopic()` |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real fallback logic and sender name extraction |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | The `childTopic` assertion (`'Obscure Robotics'`) depends on `determineChildTopic()` stripping nothing and `normalizeChildTopic()` title-casing the result. This is correct behavior. However, note that `obscurerobotics.co` has a `.co` TLD, and `domainParts.length` would be 2, which is why it falls into the Business branch. Good edge case. |

---

### Test: "falls back to Personal for gmail.com domain"
| Field | Value |
|-------|-------|
| **User Story** | Personal emails from Gmail are classified under Personal |
| **What it verifies** | `parentTopic` is `Personal` |
| **Code path exercised** | `classifyTopic()` -> `determineParentTopic()` (misses domain map, misses sender name, misses keywords, detects `gmail` as common provider in 2-part domain check, falls through to Personal default) |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real common-provider detection |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | The `senderName` is `null`, which means `determineChildTopic()` will fall back to deriving the child from the domain ("Gmail"). Valid test. |

---

### Test: "creates both parent and child topic in database for unmapped domain"
| Field | Value |
|-------|-------|
| **User Story** | When a new domain is classified, the topic hierarchy is stored in the database |
| **What it verifies** | Parent topic "Business" appears in `findRoots()`; child topic appears under parent via `findChildren()`; child has correct `parentId` |
| **Code path exercised** | `TopicLabeler.classifyTopic()` (real) + `TopicsRepository.create()` (real DB insert) + `TopicsRepository.findRoots()` (real DB query) + `TopicsRepository.findChildren()` (real DB query) |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` classification + full `TopicsRepository` against real in-memory SQLite |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | This test is excellent -- it exercises real SQL through Drizzle ORM. The topic hierarchy is created by the test code (not by a service layer), but the repository methods are fully real. The DB enforces the `fullPath` unique constraint and the `parentId` soft reference. |

---

### Test: "normalizes 'Chase Bank' sender name to 'Chase'"
| Field | Value |
|-------|-------|
| **User Story** | Sender name "Chase Bank" is normalized to just "Chase" to avoid topic fragmentation |
| **What it verifies** | `childTopic` is `'Chase'` and does not contain "bank" (case-insensitive) |
| **Code path exercised** | `classifyTopic()` -> `determineChildTopic()` (extracts "Chase Bank" from sender name) -> `normalizeChildTopic()` (looks up "chase bank" in `CHILD_NORMALIZATIONS`, returns "Chase") |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real `CHILD_NORMALIZATIONS` map |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. Directly validates the `CHILD_NORMALIZATIONS` lookup path. |

---

### Test: "normalizes 'Amazon.com' sender name to 'Amazon'"
| Field | Value |
|-------|-------|
| **User Story** | "Amazon.com" as sender name normalizes to "Amazon" |
| **What it verifies** | `childTopic` is `'Amazon'` and does not contain ".com" |
| **Code path exercised** | `classifyTopic()` -> `determineChildTopic()` -> `normalizeChildTopic()` (looks up "amazon.com" in `CHILD_NORMALIZATIONS`, returns "Amazon") |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real normalization map |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. Validates the specific `CHILD_NORMALIZATIONS['amazon.com'] = 'Amazon'` entry. |

---

### Test: "normalizes 'Amazon Prime' to 'Amazon'"
| Field | Value |
|-------|-------|
| **User Story** | "Amazon Prime" sender name normalizes to "Amazon" so Prime and non-Prime emails land in the same topic |
| **What it verifies** | `childTopic` is `'Amazon'` |
| **Code path exercised** | `classifyTopic()` -> `determineChildTopic()` -> `normalizeChildTopic()` (looks up "amazon prime" in `CHILD_NORMALIZATIONS`, returns "Amazon") |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real normalization map |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | The comment says "Since this runs in its own test, the labeler is fresh from beforeEach" -- this is correct. Each test gets a new `TopicLabeler` instance, so there is no cross-test cache contamination. |

---

### Test: "strips corporate suffixes from sender names"
| Field | Value |
|-------|-------|
| **User Story** | "Acme Corp" is stripped down to "Acme" for the child topic |
| **What it verifies** | `childTopic` does not contain "Corp"; `childTopic` is `'Acme'` |
| **Code path exercised** | `classifyTopic()` -> `determineChildTopic()` (removes "Corp" suffix via regex `/\s+(Inc|LLC|Corp|...)` -> "Acme") -> `normalizeChildTopic()` (title-cases "acme" -> "Acme") |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real corporate suffix stripping in `determineChildTopic()` |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | This test is particularly valuable because it tests the suffix-stripping logic in `determineChildTopic()` (line 263-265 of labeler.ts), which is distinct from the `CHILD_NORMALIZATIONS` map. Two different normalization mechanisms are at play, and this test validates the regex-based one. |

---

### Test: "normalizes 'HSBC Bank' to 'HSBC'"
| Field | Value |
|-------|-------|
| **User Story** | "HSBC Bank" normalizes to "HSBC" |
| **What it verifies** | `childTopic` is `'HSBC'` |
| **Code path exercised** | `classifyTopic()` -> `determineChildTopic()` -> `normalizeChildTopic()` (looks up "hsbc bank" in `CHILD_NORMALIZATIONS`, returns "HSBC") |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` with real normalization map |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. |

---

### Test: "supports linking multiple topics to a single email"
| Field | Value |
|-------|-------|
| **User Story** | An email about electronics deals on Amazon can be tagged with both "Shopping/Amazon" and "Technology/Electronics" |
| **What it verifies** | Two topics are linked to one email; both topic names appear in `findTopicsForEmail()` results |
| **Code path exercised** | `TopicLabeler.classifyTopic()` (real, for the primary topic) + `TopicsRepository.create()` (real, x4 -- two parents, two children) + `TopicsRepository.linkEmail()` (real, x2 -- two topic-email links) + `TopicsRepository.findTopicsForEmail()` (real JOIN query) |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` for primary classification + real `TopicsRepository` with real SQLite JOINs via `email_topics` table |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | The secondary topic ("Technology/Electronics") is manually constructed in the test rather than derived from `TopicLabeler`. This is appropriate -- `TopicLabeler` currently returns a single topic, and the test correctly simulates a multi-topic scenario by creating the second topic manually. This tests the database layer's ability to store and retrieve multiple topic associations, not the labeler's ability to produce multiple topics. |

---

### Test: "stores distinct confidence scores for each topic assignment"
| Field | Value |
|-------|-------|
| **User Story** | When an email has multiple topics, each association has its own confidence score |
| **What it verifies** | Two topics linked with confidence 0.95 and 0.6; both scores are correctly retrieved |
| **Code path exercised** | `TopicsRepository.create()` (real) + `TopicsRepository.linkEmail()` (real, with confidence scores) + `TopicsRepository.findTopicsForEmail()` (real, returns `confidenceScore` from `email_topics` table) |
| **Mocked** | Nothing |
| **Real** | Full `TopicsRepository` pipeline with real SQL `INSERT` and `SELECT` including the `confidence_score` column |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | None. Validates the `email_topics.confidence_score` column end-to-end through real SQL. |

---

### Test: "email topics with higher confidence appear alongside lower confidence ones"
| Field | Value |
|-------|-------|
| **User Story** | An email tagged with both a high-confidence and low-confidence topic can retrieve both with their distinct scores |
| **What it verifies** | Both 0.9 and 0.5 confidence scores are present in the results |
| **Code path exercised** | Same as the previous test -- `TopicsRepository` create, link, and query |
| **Mocked** | Nothing |
| **Real** | Full `TopicsRepository` with real SQL |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | Near-duplicate of the previous test. Both test the same thing: multiple topic associations with different confidence scores. The only difference is the domain/topic names. One of these could be removed without losing coverage. |

---

### Test: "processes email through all 5 steps in order"
| Field | Value |
|-------|-------|
| **User Story** | The full topic assignment pipeline works end-to-end: classify, normalize, cache, store in DB, link with confidence |
| **What it verifies** | Step 2 (domain map) -> Step 4 (normalization of "Chase Bank" to "Chase") -> Step 1 (cache reuse for second email) -> Step 5 (multi-topic linking with confidence scores) -> DB verification of both topics and scores |
| **Code path exercised** | `TopicLabeler.classifyTopic()` x2 (real) + `TopicsRepository.create()` x3 (real) + `TopicsRepository.linkEmail()` x2 (real) + `TopicsRepository.findTopicsForEmail()` (real) |
| **Mocked** | Nothing |
| **Real** | `TopicLabeler` full classification + normalization + caching + `TopicsRepository` full hierarchy storage + multi-topic linking |
| **Verdict** | TESTING REAL |
| **Confidence** | HIGH |
| **Concerns** | This is the strongest integration test in the suite. It exercises the real labeler logic (domain mapping, normalization, caching) alongside real database operations (topic creation, hierarchy, multi-topic linking with confidence). The only thing not tested is the `GmailLabelManager` path (which requires a Gmail API client). |

## Overall Assessment
- [x] Tests validate real application behavior
- [ ] Tests are mostly testing mocks with some real code
- [ ] Tests are testing mocks only
- Percentage of real behavior tested: **~95%**

### Strengths
1. **Zero mocks.** Every test runs real production code: `TopicLabeler` with its actual domain maps, keyword maps, normalization maps, and in-memory caching; `TopicsRepository` and `LabelsRepository` with real Drizzle ORM queries against a real in-memory SQLite database with real schema migrations.
2. **Real database interactions.** The `TopicsRepository.create()`, `findRoots()`, `findChildren()`, `linkEmail()`, and `findTopicsForEmail()` methods all execute real SQL through Drizzle ORM. Foreign key constraints, unique constraints on `fullPath`, and composite primary keys on `email_topics` are all enforced by the real SQLite engine.
3. **The `makeEmail()` helper** creates plain objects that conform to the `Email` type. These are not mocks or stubs -- they are legitimate test data passed to real code.

### Gaps and Concerns
1. **GmailLabelManager is not exercised.** The 5-step tests do not test `GmailLabelManager.ensureTopicLabels()`, `applyTopicLabels()`, or `applyAllLabels()`. These methods handle Gmail API calls, label creation, retry logic, and "already exists" conflict resolution. Since `GmailLabelManager` requires a `GmailClient` (external API), it is understandably omitted, but it means the label-path-to-Gmail-label-creation pipeline is untested in this block.

2. **No negative/error path tests.** None of the 14 new tests verify behavior when:
   - The database is unavailable or returns errors
   - A topic with a duplicate `fullPath` is inserted (the unique constraint would fire, but no test asserts the error)
   - `linkEmail` is called with a non-existent topic ID (FK violation)

   The existing tests (outside the 5-step block) do cover some of these cases (e.g., "linking a non-existent email to a topic does not crash"), but the 5-step block itself is purely happy-path.

3. **Step 3 ("New parent + child") tests do not truly test creating a *new* parent category.** The current `TopicLabeler` implementation always maps to one of the 10 `PREDEFINED_PARENTS` or falls back to `Business`/`Personal`. The tests verify this fallback behavior correctly, but no test exercises a scenario where a genuinely new parent category (outside the predefined 10) is created. This is a limitation of the current `TopicLabeler` design, not a test deficiency per se.

4. **Some duplication with existing tests.** The Step 2 test "maps education domain to Education parent" is functionally identical to the existing "classifies coursera.org domain under Education" in the "Predefined Parent Categories" block. Similarly, the last two Step 5 tests (confidence scores) overlap significantly.

5. **Step 5 multi-topic tests manually construct secondary topics.** The `TopicLabeler` only returns a single topic. The tests simulate multi-topic assignment by manually creating and linking a second topic. This tests the database layer correctly but does not test any multi-topic classification logic (because none exists in the labeler). This is honest -- the test is testing the data model, not fake behavior.

### Critical Gaps
None critical. The tests honestly and thoroughly validate:
- The classification algorithm's domain mapping, keyword matching, and fallback logic
- The normalization pipeline (CHILD_NORMALIZATIONS map + corporate suffix stripping)
- The domain-based caching mechanism
- The database storage layer for topics, hierarchies, and multi-topic associations with confidence scores

The main gap is `GmailLabelManager` integration, which would require mocking the Gmail API client and is a separate concern.
