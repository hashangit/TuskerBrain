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
