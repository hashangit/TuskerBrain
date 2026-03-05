# TuskerBrain v1 - Design Document

**Created:** 2026-03-05
**Status:** Approved
**Version:** 1.0

---

## Overview

TuskerBrain is a local-first desktop application that intelligently manages Gmail inboxes using AI. It automatically archives, deletes, categorizes, and extracts meaningful information from emails, presenting them in an organized timeline with contextual summaries.

### Core Principles

- **Local-first**: All data stored locally, no cloud dependency
- **Privacy-focused**: Emails processed on user's machine
- **BYOK (Bring Your Own Key)**: User provides their own LLM API keys
- **Simple first**: No over-engineering, minimal complexity

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TuskerBrain (Electron)                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Main      │  │  Renderer   │  │   Utility Process   │  │
│  │  Process    │  │  (Vite+React│  │   (Background       │  │
│  │             │  │   +shadcn)  │  │    Worker)          │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │              │
│         └────────────────┼────────────────────┘              │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │                    Core Services                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │  Gmail   │ │LangGraph │ │   LLM    │ │ Database │  │  │
│  │  │  Client  │ │ Workflow │ │ Provider │ │  SQLite  │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │                    Job System                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │Job Queue │ │Job Runner│ │ Audit    │ │ Retry    │  │  │
│  │  │(SQLite)  │ │(Worker)  │ │ Log      │ │ Logic    │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
            │                    │
            ▼                    ▼
    ┌──────────────┐    ┌───────────────────────┐
    │  Gmail API   │    │  LLM APIs (User's     │
    │  (OAuth)     │    │  OpenAI/Anthropic/    │
    │              │    │  Google keys)         │
    └──────────────┘    └───────────────────────┘
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Desktop Framework | Electron | Cross-platform (Win/Mac/Linux), mature ecosystem |
| Frontend | Vite + React | Fast dev experience, SPA model fits Electron |
| Background Processing | UtilityProcess | True isolation, doesn't block UI |
| Database | SQLite (better-sqlite3) | Local, zero-config, easy backup |
| ORM | Drizzle | Type-safe, lightweight, good DX |
| Workflow Orchestration | LangGraph | Stateful multi-step workflows, multi-provider |
| LLM Abstraction | Vercel AI SDK | Unified interface for OpenAI/Anthropic/Google |
| Distribution | GitHub Releases | Free hosting, auto-update support |

---

## Core Features

### 1. Inbox Manager

Automated email management based on type and age:

| Email Type | Age < 1 month | Age 1-6 months | Age > 6 months | Age > 2 years |
|------------|---------------|----------------|----------------|---------------|
| **Regular** | Process with AI | Process with AI | Archive | Archive |
| **Updates** | Process with AI | Archive | Archive | Archive |
| **Social** | Process with AI | Delete | Delete | Archive |
| **Promotional** | Extract Deals | Delete | Delete | Archive |

**Processing includes:**
- Classification by type
- Topic classification (hierarchical)
- Update/deal extraction
- Label application
- Summary generation

#### Initial Sync & Backfill Strategy

**Phase 1: Clean First (No AI)**
- Apply archival/deletion rules to ALL emails immediately
- Fast operation, no API costs
- Inbox cleaned up quickly for user satisfaction

**Phase 2: AI Processing (Gradual Backfill)**
- User-configurable lookback period (7, 14, 30, 60, or 90 days)
- Process one day at a time to avoid overwhelming app and API
- User sees progress: "Processing day 15 of 30..."
- Can be paused/resumed

**Phase 3: Incremental Sync**
- Track Gmail `historyId` for incremental updates
- Only fetch new/changed emails since last sync
- Runs on user-configured interval (15min, 30min, 1hr, 2hr, daily)

### 2. Timeline

A chronological feed of processed emails with:
- Visual grouping by topic
- Granular filtering (type, priority, topic, sender, date)
- Multiple filter combination (AND logic)
- Quick access to original email

### 3. Topic Summaries

Rolling summaries for each topic:
- 3-4 paragraphs, max 500 words
- First paragraph always high-level overview
- Older info gets less focus over time
- Updated with each new email in topic

### 4. Sender Summaries

Same rolling summary concept per sender domain.

### 5. Deals

Extracted promotional deals with:
- Deal title, description, brand
- Promo code, expiry date, link
- Active/expired status

### 6. Topic Labeling System

**Hierarchical Structure:**
```
Parent Topic
├── Child Topic 1
├── Child Topic 2
└── Child Topic 3
```

**Predefined Parent Categories:**
| Category | Examples |
|----------|----------|
| Banking | Chase, HSBC, Wells Fargo, Credit Cards |
| Education | Udemy, Coursera, University, Certifications |
| Projects | Client-ABC, Personal-Website, Side-Project |
| Shopping | Amazon, eBay, Online Orders |
| Travel | Airlines, Hotels, Bookings |
| Health | Medical, Insurance, Fitness |
| Personal | Family, Friends, Personal Matters |
| Business | Work, Clients, Professional |
| Technology | Development, Tools, Subscriptions |
| Entertainment | Streaming, Gaming, Events |

**AI Topic Assignment Logic:**
1. Check existing topics for match (with normalization)
2. If match found → assign to existing topic
3. If no match, check if fits predefined parent → create new child under parent
4. If no parent fits → create new parent AND child topic
5. Normalize names to prevent duplicates (e.g., "Chase Bank" → "Chase")

### 7. Gmail Label Hierarchy

TuskerBrain creates and manages Gmail labels:

```
TuskerBrain/
├── Processed                    # Marks email as processed
├── Topic/
│   ├── Banking/
│   │   ├── Chase
│   │   └── HSBC
│   ├── Projects/
│   │   └── Client-ABC
│   └── Education/
│       └── Udemy-React
└── Sender/
    └── chase.com
```

**Label Purposes:**
- `TuskerBrain/Processed` - Prevents duplicate processing
- `TuskerBrain/Topic/*` - User can filter in Gmail directly
- `TuskerBrain/Sender/*` - Group by sender domain

---

## Data Model

### Entity Relationship

```
emails ─────────────────────────────────────────────────────────┐
   │                                                             │
   ├──< email_topics >── topics ───< topic_summaries             │
   │                                                             │
   ├──< timeline_updates                                        │
   │                                                             │
   ├──< deals                                                   │
   │                                                             │
   ├──< email_labels >── gmail_labels                           │
   │                                                             │
   └──< sender_summaries (via sender_domain)                    │
                                                                 │
jobs ───< audit_log                                             │
                                                                 │
settings, sync_state, oauth_tokens, api_keys (singletons)       │
```

### Schema (SQLite)

```sql
-- Core email data
CREATE TABLE emails (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  sender_domain TEXT NOT NULL,
  subject TEXT,
  snippet TEXT,
  received_at DATETIME NOT NULL,
  email_type TEXT CHECK(email_type IN ('regular', 'updates', 'social', 'promotional')),
  gmail_category TEXT,
  is_important BOOLEAN DEFAULT FALSE,
  is_read BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_processed BOOLEAN DEFAULT FALSE,
  processed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Gmail label assignments
CREATE TABLE email_labels (
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  label_id TEXT REFERENCES gmail_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (email_id, label_id)
);

-- Extracted updates
CREATE TABLE timeline_updates (
  id TEXT PRIMARY KEY,
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  summary TEXT,
  priority TEXT CHECK(priority IN ('high', 'medium', 'low')),
  sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral')),
  urgency BOOLEAN DEFAULT FALSE,
  importance_reason TEXT,
  action_item BOOLEAN DEFAULT FALSE,
  action_item_title TEXT,
  follow_up_date DATE,
  financial_impact DECIMAL(10,2),
  key_entities JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Extracted deals
CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  deal_title TEXT NOT NULL,
  deal_description TEXT,
  brand_name TEXT,
  deal_value TEXT,
  deal_code TEXT,
  deal_expiry DATE,
  deal_link TEXT,
  minimum_purchase TEXT,
  deal_category TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Topics (hierarchical)
CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  full_path TEXT NOT NULL UNIQUE,
  email_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email-topic relationships
CREATE TABLE email_topics (
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
  confidence_score REAL,
  PRIMARY KEY (email_id, topic_id)
);

-- Topic summaries
CREATE TABLE topic_summaries (
  id TEXT PRIMARY KEY,
  topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE UNIQUE,
  summary TEXT NOT NULL,
  word_count INTEGER,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_email_id TEXT REFERENCES emails(id),
  update_count INTEGER DEFAULT 0
);

-- Sender summaries
CREATE TABLE sender_summaries (
  id TEXT PRIMARY KEY,
  sender_domain TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  word_count INTEGER,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_email_id TEXT REFERENCES emails(id),
  update_count INTEGER DEFAULT 0
);

-- Job queue
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN (
    'email_process', 'email_archive', 'email_delete',
    'topic_summary_update', 'sender_summary_update', 'backfill_day'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'retrying', 'dead')),
  payload JSON NOT NULL,
  email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
  result JSON,
  error TEXT,
  error_stack TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  scheduled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME
);

-- Audit log
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSON,
  tokens_used INTEGER,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Gmail labels cache
CREATE TABLE gmail_labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT CHECK(type IN ('system', 'user')),
  label_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sync state
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  history_id TEXT,
  last_full_sync DATETIME,
  last_incremental_sync DATETIME,
  total_emails_processed INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0
);

-- User settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSON NOT NULL,
  schema_version INTEGER DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- API keys (encrypted paths only)
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT FALSE,
  last_validated DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OAuth tokens
CREATE TABLE oauth_tokens (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  access_token_key TEXT NOT NULL,
  refresh_token_key TEXT NOT NULL,
  expiry DATETIME,
  scope TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  refreshed_at DATETIME
);

-- Indexes for performance
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

## Processing Flow (LangGraph)

```
START → Check Processed → [Skip if done] → Classify Type
                                              ↓
                              ┌───────────────┼───────────────┐
                              ↓               ↓               ↓
                         PROMOTIONAL    UPDATES/SOCIAL    REGULAR
                              ↓               ↓               ↓
                         Age Check       Age Check       Age Check
                              ↓               ↓               ↓
                         ┌────┴────┐    ┌────┴────┐    ┌────┴────┐
                         ↓         ↓    ↓         ↓    ↓         ↓
                      DELETE   Extract  ARCHIVE Process ARCHIVE Process
                                  ↓         ↓         ↓         ↓
                              Classify Topic ←──────────┘         │
                                  ↓                              │
                              Apply Labels                       │
                                  ↓                              │
                              Store in DB                        │
                                  ↓                              │
                              Update Topic Summary               │
                                  ↓                              │
                              Update Sender Summary              │
                                  ↓ ←────────────────────────────┘
                              Mark as Read + Add Processed Label
                                  ↓
                                END
```

---

## Component Structure

```
TuskerBrain/
├── electron/
│   ├── main.ts                 # Electron main process
│   ├── preload.ts              # IPC bridge (typed)
│   ├── utility/                # UtilityProcess (background worker)
│   │   ├── index.ts            # Worker entry point
│   │   ├── scheduler.ts        # Job scheduling
│   │   ├── job-runner.ts       # Consumes job queue
│   │   └── sync-manager.ts     # Incremental sync
│   └── ipc/
│       ├── channels.ts         # Typed IPC channel definitions
│       └── handlers.ts         # Main process IPC handlers
│
├── src/                        # Renderer (Vite + React)
│   ├── components/             # UI components (shadcn)
│   ├── pages/
│   │   ├── timeline/           # Main feed view
│   │   ├── topics/             # Topic summaries view
│   │   ├── senders/            # Sender summaries view
│   │   ├── deals/              # Deals view
│   │   ├── onboarding/         # First-time setup flow
│   │   └── settings/           # User preferences
│   ├── stores/                 # Zustand stores (UI state)
│   │   ├── jobs.ts             # Job progress state
│   │   ├── timeline.ts         # Timeline filters state
│   │   └── settings.ts         # User settings state
│   ├── hooks/
│   │   ├── ipc.ts              # IPC communication hooks
│   │   └── queries.ts          # React Query for DB queries
│   └── lib/
│       └── utils.ts            # Shared utilities
│
├── core/                       # Shared business logic (isomorphic)
│   ├── gmail/
│   │   ├── client.ts
│   │   ├── oauth.ts
│   │   └── sync.ts
│   │
│   ├── workflows/
│   │   ├── graph.ts            # Unified LangGraph definition
│   │   ├── nodes/              # Graph nodes (steps)
│   │   │   ├── classify.ts
│   │   │   ├── extract.ts
│   │   │   ├── label.ts
│   │   │   └── summarize.ts
│   │   └── prompts/            # Prompt templates
│   │
│   ├── llm/
│   │   ├── provider.ts         # Vercel AI SDK wrapper
│   │   └── models.ts           # Model configs per provider
│   │
│   ├── labeling/
│   │   ├── manager.ts
│   │   ├── matcher.ts          # Match email to existing labels
│   │   └── creator.ts          # Create new labels (parent/child)
│   │
│   ├── jobs/
│   │   ├── queue.ts
│   │   ├── types.ts
│   │   └── retry.ts
│   │
│   └── security/
│       ├── encryption.ts       # safeStorage wrapper
│       └── secrets.ts          # API key/token management
│
├── database/
│   ├── schema.ts               # Drizzle schema definitions
│   ├── migrations/
│   └── index.ts                # Drizzle client setup
│
├── __tests__/
│   ├── features/               # End-to-end feature tests
│   ├── workflows/              # LangGraph workflow tests
│   ├── integrations/           # Integration tests
│   ├── components/             # React component tests
│   └── fixtures/               # Test data
│
└── docs/
    ├── plans/                  # Design docs
    └── roadmap.md              # v2/v3 features
```

### Job System Details

**Job Types:**
| Type | Description | LLM Required |
|------|-------------|--------------|
| `email_process` | Full AI processing of single email | Yes |
| `email_archive` | Simple archive (no AI) | No |
| `email_delete` | Simple delete (no AI) | No |
| `topic_summary_update` | Update rolling summary for topic | Yes |
| `sender_summary_update` | Update rolling summary for sender | Yes |
| `backfill_day` | Process all emails for a specific day | Yes |

**Job States:**
```
pending → running → completed
                 ↘ failed → retrying → (back to running or dead)
```

| State | Description |
|-------|-------------|
| `pending` | Waiting to be processed |
| `running` | Currently being executed |
| `completed` | Successfully finished |
| `failed` | Error occurred |
| `retrying` | Scheduled for retry |
| `dead` | Exceeded max retries |

**Retry Logic:**
- Exponential backoff: 1min → 2min → 4min → 8min → 16min
- Max retries: 3 (configurable)
- Dead jobs logged for manual review

---

## Tech Stack

### Desktop
- **Electron** - Cross-platform desktop framework
- **electron-builder** - Build and distribution
- **electron-updater** - Auto-update from GitHub releases

### Frontend
- **Vite** - Build tool
- **React 18** - UI framework
- **React Router** - Client-side routing
- **shadcn/ui** - Component library
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **React Query** - Server-state management

### Backend (Electron)
- **Node.js** - Runtime
- **LangGraph** - Workflow orchestration
- **Vercel AI SDK** - LLM abstraction
  - @ai-sdk/openai
  - @ai-sdk/anthropic
  - @ai-sdk/google
- **googleapis** - Gmail API client
- **better-sqlite3** - SQLite database
- **Drizzle ORM** - Type-safe queries

### Security
- **Electron safeStorage** - API key & token encryption
- **OAuth 2.0** - Gmail authentication

### Testing
- **Vitest** - Unit/integration tests
- **Playwright** - E2E tests (Electron)
- **No mocks** - Real dependencies only
- **Test Gmail account** - Real API testing

### Development
- **TypeScript** - Type safety
- **ESLint + Prettier** - Code quality
- **Husky** - Git hooks
- **TDD** - Test-first development

### Future (v2/v3)
- **LanceDB** - Vector embeddings (v2)
- **KuzuDB (Ladybug fork)** - Graph relationships (v2/v3)
- **Next.js** - Cloud migration (optional)

---

## Test Strategy (TDD)

### Principles
1. **No mocking or faking** - Test against real dependencies
2. **Write tests first** - Define expected behavior before implementation
3. **Feature-driven** - Tests organized by feature, not code structure
4. **Near 100% coverage** - All critical paths tested

### Test Environment
| Dependency | Strategy |
|------------|----------|
| Gmail API | Dedicated test Gmail account with fixture emails |
| LLM APIs | Real API calls (cheaper models: haiku, gpt-4o-mini) |
| SQLite | Temp file per test, cleanup after |
| File System | Temp directories, cleanup after |
| safeStorage | Test in Electron context (Playwright) |

### Test Categories

```
__tests__/
├── features/           # OAuth, Gmail sync, Email processing, Topic labeling, Timeline, Summaries, Job queue, Settings
├── workflows/          # Email classification, Update extraction, Deal extraction, Topic classification, Summary update
├── integrations/       # Gmail client, LLM provider, Database operations, Label sync
├── components/         # Timeline, Topic summary, Deals list, Settings form
└── fixtures/           # Sample emails, Expected extractions, Test Gmail config
```

### Detailed Test Specifications

#### OAuth Flow Tests

```typescript
// __tests__/features/oauth-flow.test.ts

describe('OAuth Flow', () => {
  test('user can initiate Gmail OAuth connection', async () => {
    // Click connect button, OAuth URL generated correctly
  });

  test('OAuth callback exchanges code for tokens', async () => {
    // Real OAuth flow with test account
  });

  test('access token is refreshed automatically before expiry', async () => {
    // Set token near expiry, verify refresh
  });

  test('handles OAuth revocation gracefully', async () => {
    // Revoke token in Gmail, verify app handles error
  });

  test('tokens are stored encrypted in safeStorage', async () => {
    // Verify tokens not in plain text anywhere
  });
});
```

#### Gmail Sync Tests

```typescript
// __tests__/features/gmail-sync.test.ts

describe('Gmail Sync', () => {
  test('initial sync fetches emails within configured lookback period', async () => {
    // User sets 30-day lookback, verify only those emails fetched
  });

  test('incremental sync uses historyId to fetch only new emails', async () => {
    // Full sync, add email to Gmail, incremental sync finds it
  });

  test('sync tracks historyId for next incremental sync', async () => {
    // Verify historyId stored after sync
  });

  test('handles Gmail API rate limits with backoff', async () => {
    // Trigger rate limit, verify backoff behavior
  });

  test('sync recovers from network interruption', async () => {
    // Interrupt sync, verify resumes correctly
  });
});
```

#### Email Processing Tests

```typescript
// __tests__/features/email-processing.test.ts

describe('Email Processing', () => {
  describe('Archival Rules', () => {
    test('archives regular emails older than 6 months', async () => {
      // Email 7 months old → archived, not processed with AI
    });

    test('archives updates emails older than 1 month', async () => {
      // Updates email 35 days old → archived
    });

    test('deletes promotional emails older than 1 month', async () => {
      // Promo email 40 days old → deleted
    });

    test('deletes social emails older than 1 month', async () => {
      // Social email 35 days old → deleted
    });

    test('archives any email older than 2 years', async () => {
      // Email 25 months old → archived regardless of type
    });
  });

  describe('Email Classification', () => {
    test('classifies promotional emails correctly', async () => {
      // Real LLM call, verify classification
    });

    test('classifies updates emails correctly', async () => {
      // Real LLM call, verify classification
    });

    test('classifies social emails correctly', async () => {
      // Real LLM call, verify classification
    });

    test('classifies regular emails correctly', async () => {
      // Real LLM call, verify classification
    });
  });

  describe('Update Extraction', () => {
    test('extracts title, description, summary from email', async () => {
      // Real LLM call, verify extracted fields
    });

    test('identifies action items in email', async () => {
      // Email with clear action → action_item: true
    });

    test('extracts key entities (dates, amounts, names)', async () => {
      // Email with dates/amounts → key_entities populated
    });

    test('assigns correct priority based on content', async () => {
      // Urgent email → priority: high
    });

    test('identifies sentiment correctly', async () => {
      // Negative email → sentiment: negative
    });

    test('extracts follow-up dates when mentioned', async () => {
      // Email with deadline → follow_up_date populated
    });

    test('extracts financial impact when applicable', async () => {
      // Email with payment info → financial_impact populated
    });

    test('marks user-important emails as high priority', async () => {
      // Gmail important flag → priority: high always
    });
  });

  describe('Deal Extraction', () => {
    test('extracts deal details from promotional email', async () => {
      // Promo email → deal record created
    });

    test('extracts promo code when present', async () => {
      // Email with SAVE20 → deal_code: "SAVE20"
    });

    test('extracts expiry date when present', async () => {
      // Email with "expires Friday" → deal_expiry populated
    });

    test('extracts brand name from sender or content', async () => {
      // Email from noreply@amazon.com → brand_name: "Amazon"
    });
  });

  describe('Processing State', () => {
    test('marks email as read after processing', async () => {
      // Processed email → is_read: true in Gmail
    });

    test('adds TuskerBrain/Processed label after processing', async () => {
      // Processed email → has label
    });

    test('does not process already-processed emails', async () => {
      // Email with label → skipped in next sync
    });
  });
});
```

#### Topic Labeling Tests

```typescript
// __tests__/features/topic-labeling.test.ts

describe('Topic Labeling', () => {
  test('creates new parent topic when no existing topic fits', async () => {
    // Novel email category → new parent created
  });

  test('creates child topic under correct parent', async () => {
    // Banking email → Banking/[Specific-Bank] created
  });

  test('matches email to existing topic when appropriate', async () => {
    // Similar email → same topic, no duplicate
  });

  test('normalizes topic names to avoid duplicates', async () => {
    // "Chase Bank" and "Chase" → same topic
  });

  test('handles multiple topics for single email', async () => {
    // Email about multiple subjects → multiple topics
  });

  test('creates Gmail labels matching topic hierarchy', async () => {
    // Topic created → Gmail label created
  });

  test('applies topic labels to processed emails', async () => {
    // Processed email → has topic labels
  });

  describe('Predefined Parent Categories', () => {
    test('recognizes banking-related emails', async () => {});
    test('recognizes education-related emails', async () => {});
    test('recognizes project-related emails', async () => {});
    test('recognizes shopping-related emails', async () => {});
    test('recognizes travel-related emails', async () => {});
    test('recognizes health-related emails', async () => {});
    test('recognizes personal emails', async () => {});
  });
});
```

#### Timeline Tests

```typescript
// __tests__/features/timeline-filtering.test.ts

describe('Timeline', () => {
  test('displays updates chronologically by default', async () => {
    // Most recent first
  });

  test('filters by email type (regular, updates, social, deals)', async () => {
    // Select "deals" → only deals shown
  });

  test('filters by topic', async () => {
    // Select "Banking/Chase" → only that topic
  });

  test('filters by sender domain', async () => {
    // Select "chase.com" → only that sender
  });

  test('filters by priority', async () => {
    // Select "high" → only high priority
  });

  test('filters by date range', async () => {
    // Select date range → only emails in range
  });

  test('combines multiple filters with AND logic', async () => {
    // Topic: Banking + Priority: high → both must match
  });

  test('shows email link that opens in Gmail', async () => {
    // Click link → opens correct Gmail thread
  });

  test('consolidates updates under same topic', async () => {
    // Multiple emails same topic → grouped visually
  });
});
```

#### Summary Tests

```typescript
// __tests__/features/summary-generation.test.ts

describe('Topic Summaries', () => {
  test('creates initial summary when first email processed for topic', async () => {
    // First email → summary created
  });

  test('updates summary when new email added to topic', async () => {
    // New email → summary updated with new info
  });

  test('maintained high-level context in first paragraph', async () => {
    // First paragraph always high-level overview
  });

  test('gradually reduces focus on older information', async () => {
    // Older info mentioned less prominently
  });

  test('summary stays within 500 word limit', async () => {
    // After many updates → still ≤500 words
  });

  test('summary has 3-4 paragraphs', async () => {
    // Always 3-4 paragraphs
  });

  test('increments update_count when summary updated', async () => {
    // New update → count increases
  });
});

describe('Sender Summaries', () => {
  test('creates summary per unique sender domain', async () => {
    // New sender → summary created
  });

  test('updates sender summary with new emails', async () => {
    // New email from sender → summary updated
  });

  test('same word limit and structure as topic summaries', async () => {
    // ≤500 words, 3-4 paragraphs
  });
});
```

#### Job Queue Tests

```typescript
// __tests__/features/job-queue.test.ts

describe('Job Queue', () => {
  test('creates jobs for new emails', async () => {
    // New email → job created
  });

  test('processes jobs in FIFO order', async () => {
    // Earlier jobs processed first
  });

  test('marks job as running when started', async () => {
    // Job picked up → status: running
  });

  test('marks job as completed on success', async () => {
    // Job succeeds → status: completed
  });

  test('marks job as failed on error', async () => {
    // Job fails → status: failed
  });

  test('retries failed jobs with exponential backoff', async () => {
    // Fail → wait → retry → wait longer → retry
  });

  test('marks job as dead after max retries', async () => {
    // Too many failures → status: dead
  });

  test('logs audit entry for each job execution', async () => {
    // Job runs → audit_log entry created
  });

  test('tracks tokens used per job', async () => {
    // LLM call → tokens_used logged
  });

  test('tracks job duration in audit log', async () => {
    // Job completes → duration_ms logged
  });

  test('user can pause job processing', async () => {
    // Pause → no new jobs started
  });

  test('user can resume job processing', async () => {
    // Resume → jobs continue
  });

  test('shows pending job count in UI', async () => {
    // X jobs pending → displayed
  });
});
```

#### Settings Tests

```typescript
// __tests__/features/settings-persistence.test.ts

describe('Settings', () => {
  test('saves processing interval preference', async () => {
    // Set to 30 min → persisted
  });

  test('saves initial lookback days preference', async () => {
    // Set to 14 days → persisted
  });

  test('saves and encrypts API keys', async () => {
    // Add Anthropic key → encrypted, retrievable
  });

  test('supports multiple LLM providers', async () => {
    // Add OpenAI + Anthropic keys → both work
  });

  test('switches between LLM providers', async () => {
    // Select provider → that provider used
  });

  test('validates API keys before saving', async () => {
    // Invalid key → error shown
  });
});
```

### Test Data Fixtures

```typescript
// __tests__/fixtures/emails/promotional-email.json
{
  "id": "msg_test_promo_001",
  "threadId": "thread_test_promo_001",
  "from": "deals@amazon.com",
  "senderName": "Amazon",
  "subject": "🔥 50% off Electronics - Today Only!",
  "body": "Save big on electronics today. Use code SAVE50 at checkout. Offer expires midnight.",
  "receivedAt": "2024-01-15T10:00:00Z",
  "category": "promotional"
}

// __tests__/fixtures/emails/updates-email.json
{
  "id": "msg_test_update_001",
  "threadId": "thread_test_update_001",
  "from": "noreply@chase.com",
  "senderName": "Chase Bank",
  "subject": "Your January Statement is Ready",
  "body": "Your January 2024 statement is now available. Log in to view your account activity. Balance: $2,450.00. Payment due: February 15, 2024.",
  "receivedAt": "2024-01-20T08:00:00Z",
  "category": "updates"
}

// __tests__/fixtures/emails/regular-email.json
{
  "id": "msg_test_regular_001",
  "threadId": "thread_test_regular_001",
  "from": "john.smith@company.com",
  "senderName": "John Smith",
  "subject": "Re: Project Alpha - Sprint Review",
  "body": "Hi team, Just wanted to follow up on yesterday's discussion. Let's schedule a call for Friday at 2 PM to review the authentication module progress. Please come prepared with your updates. Thanks, John",
  "receivedAt": "2024-01-18T14:30:00Z",
  "isImportant": true,
  "category": "regular"
}

// __tests__/fixtures/emails/social-email.json
{
  "id": "msg_test_social_001",
  "threadId": "thread_test_social_001",
  "from": "notifications@linkedin.com",
  "senderName": "LinkedIn",
  "subject": "John Doe endorsed you for TypeScript",
  "body": "John Doe just endorsed you for the TypeScript skill on LinkedIn. View your profile to see more.",
  "receivedAt": "2024-01-22T09:15:00Z",
  "category": "social"
}

// __tests__/fixtures/expected-extractions/update-example.json
{
  "title": "January Statement Ready",
  "description": "Chase Bank statement for January 2024 is available. Balance is $2,450.00 with payment due February 15.",
  "summary": "Chase Bank statement available with $2,450 balance, payment due Feb 15.",
  "priority": "medium",
  "sentiment": "neutral",
  "urgency": false,
  "action_item": true,
  "action_item_title": "Pay credit card bill by February 15",
  "follow_up_date": "2024-02-15",
  "financial_impact": 2450.00,
  "key_entities": {
    "dates": ["2024-01-20", "2024-02-15"],
    "amounts": [2450.00],
    "names": ["Chase Bank"]
  },
  "topic": "Banking/Chase"
}

// __tests__/fixtures/expected-extractions/deal-example.json
{
  "deal_title": "50% Off Electronics",
  "deal_description": "Save big on electronics today. Limited time offer.",
  "brand_name": "Amazon",
  "deal_value": "50%",
  "deal_code": "SAVE50",
  "deal_expiry": "2024-01-15T23:59:59Z",
  "deal_link": "https://amazon.com/deals",
  "deal_category": "Electronics"
}
```

---

## UI/UX Design

### Design Principles
- macOS 26 inspired (frosted glass, subtle shadows, rounded corners)
- Clean, minimal interface
- Quick scanning and filtering
- Real-time feedback on processing status

### Main Views
1. **Timeline** - Chronological feed with filters
2. **Topics** - Hierarchical topic list with summaries
3. **Senders** - Sender summaries by domain
4. **Deals** - Active/expired deals grid
5. **Settings** - Gmail connection, processing config, LLM providers

### Onboarding Flow
1. Welcome screen → Connect Gmail
2. Set preferences (lookback period, sync interval)
3. Configure LLM provider (choose + add API key)
4. Verify API key → Start processing

---

## Security

### API Key Storage
- Keys stored using Electron's `safeStorage` API
- Database stores only the storage key reference
- Keys never logged or exposed in errors

### OAuth Tokens
- Access and refresh tokens encrypted
- Automatic token refresh before expiry
- Handles OAuth revocation gracefully

### Data Privacy
- All email processing happens locally
- No data sent to TuskerBrain servers
- User controls their LLM API usage

---

## Distribution

### GitHub Releases
- Built with electron-builder
- Auto-update via electron-updater
- Platforms: Windows (NSIS), macOS (DMG), Linux (AppImage, deb)

### Release Channels
- `latest` - Stable releases
- `beta` - Pre-release testing (optional)

---

## Roadmap

### v2 Features
- Task Interface
- Calendar Integration
- Search Feed (hybrid RAG-based search)
- Chat with the Feed
- View Full Email/Thread
- Reply to Thread/Email (chat-like interactions)
- LanceDB for vector search
- KuzuDB for graph relationships

### v3 Features
- Task Sync to Google Tasks
- Dedicated mobile app (full-featured)

---

## Open Questions / Decisions Made

| Question | Decision | Date |
|----------|----------|------|
| Cloud vs Local-first | Local-first, cloud optional later | 2026-03-05 |
| Processing trigger | Background scheduler (configurable interval) | 2026-03-05 |
| Initial sync strategy | User-configurable lookback, gradual backfill | 2026-03-05 |
| LLM provider model | BYOK (Bring Your Own Key) | 2026-03-05 |
| Agent framework | LangGraph | 2026-03-05 |
| Database | SQLite (v1), LanceDB + KuzuDB (v2) | 2026-03-05 |
| Frontend | Vite + React + React Router + shadcn/ui | 2026-03-05 |
| Duplicate prevention | Local DB + Gmail labels | 2026-03-05 |
| Topic labeling | Hierarchical, AI-created parents/children | 2026-03-05 |
| Error handling | Graceful degradation with retry queue | 2026-03-05 |
| Test strategy | TDD, no mocks, real dependencies | 2026-03-05 |

---

## Approval

**Design Approved By:** User
**Date:** 2026-03-05

---

*This document serves as the source of truth for TuskerBrain v1 implementation.*
