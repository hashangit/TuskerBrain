# POV Test Suite Enhancement Design

**Created:** 2026-03-16
**Status:** Draft
**Version:** 1.0

---

## Overview

This design specifies the enhancement of the TuskerBrain POV (Point of View) test suite to achieve comprehensive coverage of all user-facing features, configurations, and user journeys as defined in the design document (`docs/plans/2026-03-05-tuskerbrain-design.md`).

### Purpose

The enhanced POV test suite will serve as the **benchmark for production readiness** — validating that all user-facing features, configurations, and user journeys work as designed.

### Goals

1. **Feature completeness**: Every test case from design doc lines 689-1059 has a corresponding POV test
2. **Configuration matrix**: All sync intervals × all lookback periods × all LLM providers tested
3. **User journeys**: Complete fresh-install-to-steady-state flows documented and tested
4. **Edge cases**: All identified edge case categories have representative tests
5. **Test independence**: Each test can run in isolation without dependencies on other tests

### Scope

| In Scope | Out of Scope (Deferred) |
|----------|------------------------|
| All user-facing features from design doc | Encryption verification (safeStorage) - *Security risk documented below* |
| All configuration permutations | Token refresh **timing** validation - *Functionality tested, timing not* |
| Extended LLM provider support | Exponential backoff **timing** verification - *Functionality tested, timing not* |
| Complete sync phase user journeys | Network-level rate limit testing |
| All edge case categories | Performance/load testing |
| Comprehensive fixture library | |

#### Deferred Items - Risk Documentation

**1. SafeStorage Encryption Verification (Security Risk)**
The design doc (lines 713-715) requires testing that "tokens are stored encrypted in safeStorage." This is deferred because:
- POV tests focus on user-facing behavior, not implementation details
- Encryption verification requires Electron-specific testing tools (Playwright E2E)
- **Mitigation**: TDD tests will verify encryption; POV tests will verify tokens are retrievable after app restart

**2. Token Refresh Timing**
The design doc (lines 705-707) requires testing that "access token is refreshed automatically before expiry." Timing validation is deferred because:
- Precise timing tests are flaky and environment-dependent
- **Mitigation**: POV tests will verify token refresh **functionality** (token is refreshed when needed, app continues working)

**3. Exponential Backoff Timing**
The design doc (lines 1027-1029) requires testing "exponential backoff." Timing validation is deferred because:
- Precise timing tests are flaky
- **Mitigation**: POV tests will verify retry **functionality** (retries happen, max retries respected)

### Scope Clarifications

**Token Refresh (Design Doc Lines 705-707):**
The design doc requires testing that "access token is refreshed automatically before expiry." While precise timing validation is deferred, a **basic token refresh functionality test** is included in `onboarding.test.ts` to verify the refresh mechanism works (not precise timing).

**SafeStorage Encryption (Design Doc Lines 713-715):**
The design doc requires testing that "tokens are stored encrypted in safeStorage." This is a security-critical feature. A **basic encryption verification test** is included in `onboarding.test.ts` to verify tokens are not stored in plaintext (not comprehensive encryption testing).

**OAuth Revocation (Design Doc Lines 709-711):**
The design doc requires handling "OAuth revocation gracefully." A test for **OAuth revocation and re-authentication flow** is included in `edge-cases/api-failures.test.ts`.

---

## Test Count Summary

| Category | Files | Tests |
|----------|-------|-------|
| **Feature Tests (enhanced)** | 10 | ~184 |
| **Scenario Tests** | 6 | ~47 |
| **Configuration Tests** | 2 | ~35 |
| **Edge Case Tests** | 6 | ~21 |
| **Total** | **24** | **~287** |

> **Note:** Test counts are estimates based on the design analysis. Exact counts will be finalized during implementation. The "~" prefix indicates approximate values that may vary by ±5 tests as edge cases are explored.

---

## Directory Structure

```
__tests__/
├── features-pov/
│   ├── # Existing feature files (enhanced)
│   ├── timeline.test.ts                    (~20 tests)
│   ├── topic-labeling.test.ts              (~17 tests)
│   ├── inbox-manager.test.ts               (~35 tests)
│   ├── gmail-sync.test.ts                  (~15 tests)
│   ├── deals.test.ts                       (~14 tests)
│   ├── job-system.test.ts                  (~18 tests)
│   ├── onboarding.test.ts                  (~16 tests)
│   ├── topic-summaries.test.ts             (~16 tests)
│   ├── sender-summaries.test.ts            (~13 tests)
│   ├── synchronization.test.ts             (~18 tests)
│   │
│   ├── scenarios/                          # NEW
│   │   ├── fresh-install-journey.scenarios.test.ts     (9 tests)
│   │   ├── full-sync-journey.scenarios.test.ts         (9 tests)
│   │   ├── pause-resume-journey.scenarios.test.ts      (5 tests)
│   │   ├── restart-recovery-journey.scenarios.test.ts  (6 tests)
│   │   ├── llm-provider-switching.scenarios.test.ts    (8 tests)
│   │   └── edge-case-orchestrator.scenarios.test.ts    (9 tests)
│   │
│   ├── configurations/                     # NEW
│   │   ├── sync-configuration-matrix.test.ts           (~20 tests)
│   │   └── llm-provider-matrix.test.ts                 (~15 tests)
│   │
│   └── edge-cases/                         # NEW
│       ├── low-content.test.ts                     (~4 tests)
│       ├── conflicting-info.test.ts                (~3 tests)
│       ├── token-limits.test.ts                    (~3 tests)
│       ├── rapid-updates.test.ts                   (~3 tests)
│       ├── api-failures.test.ts                    (~4 tests)
│       └── network-interruptions.test.ts           (~3 tests)
│
├── fixtures/                               # NEW
│   ├── emails/
│   │   ├── regular/                        (4 fixtures)
│   │   ├── updates/                        (4 fixtures)
│   │   ├── social/                         (3 fixtures)
│   │   ├── promotional/                    (5 fixtures)
│   │   └── edge-cases/                     (6 fixtures)
│   ├── expected-extractions/
│   ├── topics/
│   ├── configurations/
│   └── fixture-helpers.ts
│
└── test-helpers/
    ├── app.ts
    ├── gmail-test-account.ts
    ├── llm-mock.ts
    └── assertions.ts
```

---

## Section 1: Feature File Enhancements

### 1.1 Timeline (`timeline.test.ts`)

**Current coverage:** 95% ✅

**Enhancements:**
| Test | Description | Priority |
|------|-------------|----------|
| Terminology fix | Update "promotional" → "deals" to match design doc | Low |
| Design doc reference | Fix line references to 124-131, 907-948 | Low |
| Search feature verification | Confirm search is intentional or document as future feature | Low |

**New tests:** 0 (documentation fixes only)

---

### 1.2 Topic Labeling (`topic-labeling.test.ts`)

**Current coverage:** 85%

**Enhancements:**
| Test | Description | Priority |
|------|-------------|----------|
| Ambiguous category handling | Email could fit multiple parents → AI picks best match | High |
| Topic merging | Two similar topics should reconcile (e.g., "Chase" + "Chase Bank") | High |
| Low-content email | One-liner or auto-reply gets appropriate topic | Medium |
| Gmail API failure | Label creation fails → graceful degradation | Medium |
| Novel parent assertion | Strengthen test to verify specific parent created | High |

**New tests:** ~5

---

### 1.3 Inbox Manager (`inbox-manager.test.ts`)

**Current coverage:** 55% ⚠️

**Enhancements - Complete Type/Age Matrix:**
| Email Type | Age < 1 month | Age 1-6 months | Age > 6 months | Age > 2 years |
|------------|---------------|----------------|----------------|---------------|
| **Regular** | Process with AI | Process with AI | Archive | Archive |
| **Updates** | Process with AI | Archive | Archive | Archive |
| **Social** | Process with AI | Delete | Delete | Archive |
| **Promotional** | Extract Deals | Delete | Delete | Archive |

**Additional tests:**
| Test | Description | Priority |
|------|-------------|----------|
| Topic classification | Verify emails get classified to topics | High |
| Summary generation | Verify summaries created for processed emails | High |
| Job queue integration | Verify processing creates appropriate jobs | High |

**New tests:** ~20 (16 matrix + 4 additional)

---

### 1.4 Gmail Sync (`gmail-sync.test.ts`)

**Current coverage:** 75%

**Enhancements:**
| Test | Description | Priority |
|------|-------------|----------|
| historyId tracking | Verify historyId stored after each sync | Critical |
| historyId used for incremental | New emails fetched using stored historyId | Critical |
| Rate limit handling | 429 response → graceful handling (log warning, continue) | High |
| Mid-sync interruption | Network fails mid-sync → resumes from last checkpoint | High |
| Sync state persistence | Verify all sync_state fields populated | Medium |

**New tests:** ~5

---

### 1.5 Deals (`deals.test.ts`)

**Current coverage:** 70%

**Enhancements:**
| Test | Description | Priority |
|------|-------------|----------|
| deal_value extraction | "$20 off", "50% discount", "Save $100" | Critical |
| deal_category extraction | "Electronics", "Fashion", "Travel" from content | Critical |
| deal_description extraction | Full deal description captured | High |
| Strengthen assertions | Replace partial regex with exact field validation | Medium |
| Multiple deals per email | Email with 2+ deals → all captured | Medium |
| No deal present | Promotional email without deal → no deal record | Medium |

**New tests:** ~6

---

### 1.6 Job System (`job-system.test.ts`)

**Current coverage:** 35% ❌

**Job Types from Design Doc (line 340-343):**
| Job Type | Description | Current Coverage | New Tests |
|----------|-------------|------------------|-----------|
| `email_process` | Full AI processing of single email | ✅ Covered | - |
| `email_archive` | Simple archive (no AI) | ✅ Covered | - |
| `email_delete` | Simple delete (no AI) | ❌ Missing | 1 |
| `topic_summary_update` | Update rolling summary for topic | ✅ Covered | - |
| `sender_summary_update` | Update rolling summary for sender | ❌ Missing | 1 |
| `backfill_day` | Process all emails for a specific day | ❌ Missing | 1 |

**Enhancements:**
| Test | Description | Priority |
|------|-------------|----------|
| Startup recovery | App restart → unprocessed emails get jobs created | Critical |
| `email_delete` job type | Create and process delete job | High |
| `sender_summary_update` job type | Create and process sender summary job | High |
| `backfill_day` job type | Create and process day backfill job | High |
| Job deduplication | Same email+type → no duplicate pending jobs | High |
| Job cleanup | Completed/dead jobs cleaned after 7 days | Medium |
| Dead job audit logging | Job exceeds retries → logged for review | High |
| Hybrid architecture validation | Queue → audit log → source of truth consistency | High |

**New tests:** ~8 (3 job type tests + 5 system behavior tests)

---

### 1.7 Onboarding (`onboarding.test.ts`)

**Current coverage:** 60%

**Enhancements:**
| Test | Description | Priority |
|------|-------------|----------|
| Multiple LLM providers | Add OpenAI + Anthropic → both stored and switchable | High |
| Provider switching | Select Anthropic → subsequent calls use Anthropic | High |
| API key validation | Invalid key → error shown, not saved | High |
| **Token refresh functionality** | Access token refreshed when needed (not timing) | High |
| **OAuth revocation handling** | Token revoked → user prompted to re-authenticate | High |
| Skip onboarding | User skips → can complete later in settings | Medium |
| Resume onboarding | Interrupted flow → resumes at correct step | Medium |
| Extended providers | ZAI, OpenRouter, Groq (secondary tier) | Medium |

**New tests:** ~8

---

### 1.8 Topic Summaries (`topic-summaries.test.ts`)

**Current coverage:** 80%

**Enhancements:**
| Test | Description | Priority |
|------|-------------|----------|
| DB schema validation | Verify word_count, last_email_id populated | High |
| Rolling summary behavior | Newer info more prominent, older info less focus | High |
| High-level overview | First paragraph is actually high-level summary | High |
| Cascade delete | Delete topic → summary deleted | Medium |
| Sparse topic | Topic with 1 email → summary still meaningful | Medium |
| Conflicting info | Same topic, contradictory emails → handled gracefully | Medium |

**New tests:** ~6

---

### 1.9 Sender Summaries (`sender-summaries.test.ts`)

**Current coverage:** 75%

**Enhancements:**
| Test | Description | Priority |
|------|-------------|----------|
| Word count validation | Verify summary stays ≤500 words | High |
| First paragraph overview | First paragraph is high-level sender summary | High |
| Rolling summary behavior | Newer emails weighted more heavily | High |
| Design doc reference | Fix line reference to 140-143 | Low |
| Cascade delete | Delete all emails from sender → summary behavior | Medium |

**New tests:** ~5

---

### 1.10 Synchronization (`synchronization.test.ts`)

**Current coverage:** 40% ❌

**Enhancements:**
| Test | Description | Priority |
|------|-------------|----------|
| Phase 1 execution | Clean First runs and archives/deletes correctly | Critical |
| Phase 1 → Phase 2 transition | Phase 1 done → Phase 2 starts automatically | Critical |
| Phase 2 progress indicator | "Processing day 15 of 30..." displayed | High |
| Phase 2 pause/resume | User pauses → processing stops, resume continues | Critical |
| Phase 2 → Phase 3 transition | Backfill done → incremental sync begins | Critical |
| Configurable sync interval | 15min/30min/1hr/2hr/daily settings work | High |
| Lookback period options | 7/14/30/60/90 day options work correctly | High |
| App restart mid-sync | Restart during Phase 2 → resumes correctly | Critical |
| Sync state table validation | All fields populated (history_id, last_full_sync, etc.) | High |

**New tests:** ~10

---

## Section 2: Scenario Files

### 2.1 Fresh Install Journey

**File:** `scenarios/fresh-install-journey.scenarios.test.ts`

| Test | Description |
|------|-------------|
| Welcome to Gmail connection | App shows welcome → user clicks connect |
| Gmail OAuth flow | User authorizes → tokens stored |
| Preferences setup | User selects 30-day lookback, 30min sync |
| LLM provider setup | User selects ZAI, enters API key |
| API key validation | Invalid key → error, valid key → accepted |
| Initial sync Phase 1 | Clean First runs, inbox cleared |
| Initial sync Phase 2 | AI backfill begins, progress shown |
| Initial sync Phase 3 | Incremental sync activates |
| Timeline populated | User sees processed emails in timeline |
| **Token refresh flow** | Long-running session → token refreshed automatically |

**Tests:** 10

---

### 2.2 Full Sync Journey

**File:** `scenarios/full-sync-journey.scenarios.test.ts`

| Test | Description |
|------|-------------|
| Phase 1: Clean First | All emails get archive/delete rules applied immediately |
| Phase 1 completion | All rules applied, ready for Phase 2 |
| Phase 2: Day-by-day backfill | Each day processed sequentially |
| Phase 2 progress updates | User sees "Processing day X of Y" |
| Phase 2 token tracking | Tokens logged per email processed |
| Phase 2 completion | All backfill done, ready for Phase 3 |
| Phase 3: First incremental sync | Uses historyId, only new emails fetched |
| Phase 3: Subsequent incremental | New email arrives → picked up in next sync |
| Phase 3: No new emails | Incremental sync with no changes → no processing |

**Tests:** 9

---

### 2.3 Pause/Resume Journey

**File:** `scenarios/pause-resume-journey.scenarios.test.ts`

| Test | Description |
|------|-------------|
| Pause during Phase 2 | User pauses mid-backfill → processing stops |
| Resume from pause | User resumes → continues from current day |
| Pause during active email processing | Mid-job pause → current job completes, no new jobs |
| Pause persists across restart | Paused state saved, respected after restart |
| Resume after restart | Restarted app → user can resume paused sync |

**Tests:** 5

---

### 2.4 Restart Recovery Journey

**File:** `scenarios/restart-recovery-journey.scenarios.test.ts`

| Test | Description |
|------|-------------|
| Restart during Phase 1 | Phase 1 restarts from beginning (idempotent) |
| Restart during Phase 2 | Phase 2 resumes from last completed day |
| Restart during Phase 3 | Incremental sync continues with stored historyId |
| Restart with pending jobs | Unprocessed emails get new jobs on startup |
| Restart with running jobs | Jobs reset to pending, re-processed |
| Crash recovery | Simulate crash → app recovers gracefully |

**Tests:** 6

---

### 2.5 LLM Provider Switching

**File:** `scenarios/llm-provider-switching.scenarios.test.ts`

| Test | Description |
|------|-------------|
| Add multiple providers | ZAI + OpenRouter keys stored |
| Switch active provider | Select OpenRouter → subsequent calls use it |
| Provider-specific features | Each provider handles same email correctly |
| Invalid key replacement | Replace invalid key with valid one |
| ZAI full flow | Complete email processing with ZAI |
| OpenRouter validation | 1-2 emails processed end-to-end |
| Gemini validation | 1-2 emails processed end-to-end |
| Groq validation | 1-2 emails processed end-to-end |

**Tests:** 8

---

### 2.6 Edge Case Orchestrator

**File:** `scenarios/edge-case-orchestrator.scenarios.test.ts`

| Test | Description |
|------|-------------|
| Low-content email batch | 10 one-liner emails → all handled gracefully |
| Rapid-fire same topic | 5 emails same topic within 1 hour → summary updated correctly |
| Conflicting information | Same topic, contradictory amounts → latest wins or flagged |
| Very long email | Email near token limit → truncated or chunked appropriately |
| Gmail API quota exceeded | 429 during sync → graceful handling, user notified |
| Gmail service unavailable | 503 error → retry logic, user notified |
| Network interruption mid-sync | Connection lost → reconnects, resumes |
| Empty inbox | No emails to process → appropriate UI state |
| All promotional batch | 100 promotional emails → deals extracted efficiently |

**Tests:** 9

---

## Section 3: Configuration Matrix Testing

### 3.1 Sync Configuration Matrix

**File:** `configurations/sync-configuration-matrix.test.ts`

**Sync Interval × Lookback Period Matrix:**

|  | 7 days | 14 days | 30 days | 60 days | 90 days |
|--|--------|---------|---------|---------|---------|
| **15 min** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **30 min** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **1 hour** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **2 hours** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Daily** | ✅ | ✅ | ✅ | ✅ | ✅ |

**Additional tests:**
| Test | Description |
|------|-------------|
| Each interval triggers correctly | Verify 15min sync runs at 15min intervals |
| Each lookback fetches correct range | 30-day lookback fetches exactly 30 days |
| Settings persist across restart | Configuration saved, loaded on app start |
| Configuration change mid-sync | User changes interval → applies after current sync |
| Lookback change mid-backfill | User extends lookback → additional days queued |

**Tests:** ~20

---

### 3.2 LLM Provider Matrix

**File:** `configurations/llm-provider-matrix.test.ts`

### Primary Provider (Full Matrix Testing)

**ZAI** (Anthropic-compatible API)
- Tests all features: classification, extraction, summarization
- Validates Anthropic API implementation simultaneously
- Full configuration matrix testing

### Secondary Providers (Smoke Tests)

| Provider | API Format | What It Validates | Tests |
|----------|------------|-------------------|-------|
| **OpenRouter** | OpenAI-compatible | OpenAI implementation | 2 |
| **Gemini** | Google native | Google implementation | 2 |
| **Groq** | OpenAI-compatible | OpenAI edge case | 1 |
| **Generic OpenAI-compatible** | Custom endpoint | Custom provider support | 1 |

**Test Structure:**
```
Primary (ZAI)
├── Email classification (all 4 types)
├── Update extraction
├── Deal extraction
├── Topic summary generation
├── Sender summary generation
└── Error handling

Secondary (Smoke Tests)
├── OpenRouter: 1 email processed end-to-end
├── Gemini: 1 email processed end-to-end
├── Groq: 1 email processed end-to-end
└── Generic: API key validation only
```

**Tests:** ~15

---

## Section 4: Edge Case Testing

### 4.1 Low-Content Emails

**File:** `edge-cases/low-content.test.ts`

| Test | Fixture | Expected Behavior |
|------|---------|-------------------|
| One-liner email | `one-liner.json` | Processed, minimal extraction, topic assigned |
| Auto-reply | `auto-reply.json` | Processed, marked as low priority |
| Empty body | `empty-body.json` | Handled gracefully, no crash |
| Subject only | `subject-only.json` | Extracted from subject line |

**Tests:** ~4

---

### 4.2 Conflicting Information

**File:** `edge-cases/conflicting-info.test.ts`

| Test | Description | Expected Behavior |
|------|-------------|-------------------|
| Amount conflict | Email A says "$100", Email B says "$150" | Latest wins, or flagged for review |
| Date conflict | Email A says "due Jan 15", Email B says "due Jan 20" | Latest date used |
| Topic drift | Email chain shifts from "Project A" to "Project B" | New topic created or transition noted |

**Tests:** ~3

---

### 4.3 Token Limit Edge Cases

**File:** `edge-cases/token-limits.test.ts`

| Test | Description | Expected Behavior |
|------|-------------|-------------------|
| Near-limit email | Email at 95% of token limit | Truncated appropriately, processed |
| Over-limit email | Email exceeds token limit | Chunked or summarized, no failure |
| Very long thread | Thread with 50+ replies | Sampled or summarized |

**Tests:** ~3

---

### 4.4 Rapid-Fire Updates

**File:** `edge-cases/rapid-updates.test.ts`

| Test | Description | Expected Behavior |
|------|-------------|-------------------|
| Same topic burst | 10 emails same topic in 1 hour | Summary updated efficiently, not 10 times |
| Multiple senders burst | 5 different senders in 10 minutes | All queued, processed in order |
| Deal spam | 20 promotional emails in 5 minutes | All deals extracted, no overwhelm |

**Tests:** ~3

---

### 4.5 Gmail API Failures

**File:** `edge-cases/api-failures.test.ts`

| Test | Description | Expected Behavior |
|------|-------------|-------------------|
| 429 Quota exceeded | Rate limit hit during sync | Graceful handling, user notified, retry scheduled |
| 503 Service unavailable | Gmail API down | User notified, automatic retry with backoff |
| 401 Unauthorized | Token expired/revoked | User prompted to re-authenticate |
| **OAuth revocation** | User revokes access in Gmail settings | App detects revocation, prompts user to re-connect, gracefully handles partial sync state |
| Partial response | API returns incomplete data | Graceful degradation, retry for missing data |

**Tests:** ~5

---

### 4.6 Network Interruptions

**File:** `edge-cases/network-interruptions.test.ts`

| Test | Description | Expected Behavior |
|------|-------------|-------------------|
| Mid-sync disconnect | Network fails during active sync | Reconnects, resumes from checkpoint |
| Intermittent connection | Connection drops repeatedly | Retries with backoff, eventually completes |
| Timeout during fetch | API call times out | Retry logic, eventual success or user notification |

**Tests:** ~3

---

## Section 5: Fixture Library

### 5.1 Structure

```
__tests__/fixtures/
├── emails/
│   ├── regular/
│   │   ├── project-email.json
│   │   ├── personal-email.json
│   │   ├── long-email.json
│   │   └── low-content-email.json
│   ├── updates/
│   │   ├── bank-statement.json
│   │   ├── shipping-notification.json
│   │   ├── subscription-renewal.json
│   │   └── account-alert.json
│   ├── social/
│   │   ├── linkedin-endorsement.json
│   │   ├── facebook-notification.json
│   │   └── twitter-mention.json
│   ├── promotional/
│   │   ├── deal-with-code.json
│   │   ├── deal-with-expiry.json
│   │   ├── deal-multiple.json
│   │   ├── deal-no-code.json
│   │   └── newsletter-no-deal.json
│   └── edge-cases/
│       ├── one-liner.json
│       ├── auto-reply.json
│       ├── conflicting-info-a.json
│       ├── conflicting-info-b.json
│       └── near-token-limit.json
│
├── expected-extractions/
│   ├── updates/
│   │   ├── bank-statement-expected.json
│   │   └── shipping-notification-expected.json
│   └── deals/
│       ├── deal-with-code-expected.json
│       └── deal-multiple-expected.json
│
├── topics/
│   ├── predefined-parents.json
│   └── sample-hierarchy.json
│
├── configurations/
│   ├── sync-intervals.json
│   ├── lookback-periods.json
│   └── llm-providers.json
│
└── fixture-helpers.ts
```

### 5.2 Email Fixture Schema

```typescript
interface EmailFixture {
  // Gmail API response fields
  id: string;
  threadId: string;
  from: { email: string; name?: string };
  to: string;
  subject: string;
  body: string;
  receivedAt: string; // ISO date

  // Gmail category (if applicable)
  category?: 'primary' | 'promotional' | 'social' | 'updates';

  // Test metadata
  _meta: {
    expectedType: 'regular' | 'updates' | 'social' | 'promotional';
    expectedTopic?: string;
    expectedPriority?: 'high' | 'medium' | 'low';
    expectedDeal?: DealExpectation;
    expectedUpdate?: UpdateExpectation;
    notes?: string;
  };
}
```

### 5.3 Sample Fixtures

**Regular Email (Project):**
```json
{
  "id": "fixture-regular-project-001",
  "threadId": "thread-project-001",
  "from": { "email": "john.smith@company.com", "name": "John Smith" },
  "to": "user@example.com",
  "subject": "Re: Project Alpha - Sprint Review",
  "body": "Hi team, Just wanted to follow up on yesterday's discussion. Let's schedule a call for Friday at 2 PM to review the authentication module progress. Please come prepared with your updates. Thanks, John",
  "receivedAt": "2024-01-18T14:30:00Z",
  "_meta": {
    "expectedType": "regular",
    "expectedTopic": "Projects/Client-ABC",
    "expectedPriority": "high",
    "expectedUpdate": {
      "actionItem": true,
      "followUpDate": "2024-01-19"
    }
  }
}
```

**Promotional Email (Deal with Code):**
```json
{
  "id": "fixture-promo-deal-001",
  "threadId": "thread-promo-001",
  "from": { "email": "deals@amazon.com", "name": "Amazon" },
  "to": "user@example.com",
  "subject": "50% off Electronics - Today Only!",
  "body": "Save big on electronics today. Use code SAVE50 at checkout. Minimum purchase $100. Offer expires midnight tonight.",
  "receivedAt": "2024-01-15T10:00:00Z",
  "category": "promotional",
  "_meta": {
    "expectedType": "promotional",
    "expectedDeal": {
      "title": "50% off Electronics",
      "code": "SAVE50",
      "value": "50%",
      "category": "Electronics",
      "minimumPurchase": "$100"
    }
  }
}
```

### 5.4 Fixture Helpers

```typescript
// fixture-helpers.ts
export class FixtureHelpers {
  // Load single fixture
  static loadEmail(fixtureId: string): EmailFixture;

  // Load multiple fixtures by pattern
  static loadEmails(pattern: string): EmailFixture[];

  // Load all fixtures of a type
  static loadEmailsByType(type: EmailType): EmailFixture[];

  // Load edge case fixtures
  static loadEdgeCases(): EmailFixture[];

  // Generate fixture variations (for matrix testing)
  static withDateOffset(fixture: EmailFixture, days: number): EmailFixture;
  static withCategory(fixture: EmailFixture, category: string): EmailFixture;

  // Load expected extraction for comparison
  static loadExpectedExtraction(fixtureId: string): ExpectedExtraction;

  // Load configuration fixtures
  static loadSyncIntervals(): SyncInterval[];
  static loadLookbackPeriods(): LookbackPeriod[];
  static loadLLMProviders(): LLMProvider[];
}
```

### 5.5 Configuration Fixtures

**LLM Providers (`llm-providers.json`):**
```json
{
  "primary": [
    {
      "id": "zai",
      "name": "ZAI",
      "apiFormat": "anthropic-compatible",
      "endpoint": "https://api.zai.ai"
    }
  ],
  "secondary": [
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "apiFormat": "openai-compatible",
      "endpoint": "https://openrouter.ai/api/v1",
      "validates": "openai"
    },
    {
      "id": "gemini",
      "name": "Google Gemini",
      "apiFormat": "google-native",
      "validates": "google"
    },
    {
      "id": "groq",
      "name": "Groq",
      "apiFormat": "openai-compatible",
      "endpoint": "https://api.groq.com/openai/v1",
      "validates": "openai"
    },
    {
      "id": "generic",
      "name": "Custom OpenAI-Compatible",
      "apiFormat": "openai-compatible",
      "endpoint": "custom",
      "validates": "openai"
    }
  ]
}
```

**Sync Configuration:**
```json
{
  "intervals": [
    { "value": 15, "unit": "minutes", "label": "Every 15 minutes" },
    { "value": 30, "unit": "minutes", "label": "Every 30 minutes" },
    { "value": 60, "unit": "minutes", "label": "Every hour" },
    { "value": 120, "unit": "minutes", "label": "Every 2 hours" },
    { "value": 1440, "unit": "minutes", "label": "Daily" }
  ],
  "lookbackPeriods": [7, 14, 30, 60, 90]
}
```

---

## Section 6: Design Doc Coverage Verification

| Design Doc Section | Lines | Test File(s) | Coverage |
|-------------------|-------|--------------|----------|
| Inbox Manager | 82-122 | inbox-manager, scenarios | ✅ |
| Timeline | 124-131 | timeline | ✅ |
| Topic Summaries | 132-139 | topic-summaries | ✅ |
| Sender Summaries | 140-143 | sender-summaries | ✅ |
| Deals | 144-150 | deals | ✅ |
| Topic Labeling (AI assignment) | 151-181 | topic-labeling | ✅ |
| **Gmail Label Hierarchy** | **182-205** | **topic-labeling** (label creation tests) | ✅ |
| Data Model | 208-430 | All (via DB validation) | ✅ |
| Processing Flow | 434-462 | inbox-manager, scenarios | ✅ |
| Job System | 551-599 | job-system, scenarios | ✅ |
| OAuth Flow Tests | 691-717 | onboarding, scenarios, api-failures | ✅ |
| Gmail Sync Tests | 719-745 | gmail-sync, synchronization | ✅ |
| Email Processing Tests | 747-858 | inbox-manager | ✅ |
| Topic Labeling Tests | 861-904 | topic-labeling | ✅ |
| Timeline Tests | 907-948 | timeline | ✅ |
| Summary Tests | 951-999 | topic-summaries, sender-summaries | ✅ |
| Job Queue Tests | 1001-1059 | job-system, scenarios | ✅ |
| Settings Tests | 1061-1091 | onboarding, configurations | ✅ |
| UI/UX Design | 1180-1200 | All (via UI validation) | ✅ |
| Extended LLM Providers | (new) | llm-provider-matrix, scenarios | ✅ |
| All Edge Cases | (new) | edge-cases/* | ✅ |

> **Note:** Gmail Label Hierarchy (lines 182-205) is tested within `topic-labeling.test.ts` via tests for:
> - Gmail label creation matching topic hierarchy
> - TuskerBrain/Processed label application
> - Label-based email filtering in Gmail

---

## Section 7: Implementation Phases

### Phase 1: Feature File Enhancements
1. inbox-manager.test.ts (largest gap - ~20 new tests)
2. synchronization.test.ts (~10 new tests)
3. job-system.test.ts (~8 new tests)
4. gmail-sync.test.ts (~5 new tests)
5. deals.test.ts (~6 new tests)
6. onboarding.test.ts (~6 new tests)
7. topic-summaries.test.ts (~6 new tests)
8. sender-summaries.test.ts (~5 new tests)
9. topic-labeling.test.ts (~5 new tests)
10. timeline.test.ts (documentation fixes only)

### Phase 2: Scenario Files
1. fresh-install-journey.scenarios.test.ts
2. full-sync-journey.scenarios.test.ts
3. pause-resume-journey.scenarios.test.ts
4. restart-recovery-journey.scenarios.test.ts
5. llm-provider-switching.scenarios.test.ts
6. edge-case-orchestrator.scenarios.test.ts

### Phase 3: Configuration & Edge Case Files
1. sync-configuration-matrix.test.ts
2. llm-provider-matrix.test.ts
3. low-content.test.ts
4. conflicting-info.test.ts
5. token-limits.test.ts
6. rapid-updates.test.ts
7. api-failures.test.ts
8. network-interruptions.test.ts

### Phase 4: Fixture Library
1. Email fixtures (all categories)
2. Expected extractions
3. Configuration fixtures
4. Fixture helpers

---

## Approval

**Design Created By:** Claude
**Date:** 2026-03-16

---

*This document serves as the specification for the POV test suite enhancement.*
