# Comprehensive Seed Data Design

**Date:** 2026-04-02
**Status:** Approved

## Goal

Rewrite `database/seed.ts` to cover all 15 database tables with realistic mixed-state data, enabling full application testing without Gmail connectivity.

## Approach

Single `seed.ts` file with all data inline. Delete `database/seed-data.json`.

## Data Coverage

### Tables with data

| Table | Count | Details |
|---|---|---|
| `emails` | 50 | Same senders/categories, add body content for ~10, vary status flags |
| `timeline_updates` | ~45 | One per processed email; unprocessed emails have no timeline update |
| `deals` | ~10 | Same promotional deals |
| `topics` | 27 | Same hierarchy + `gmailLabelId` linking leaf topics to TB labels |
| `email_topics` | ~55 | Same + a few multi-topic emails |
| `topic_summaries` | 27 | One per topic |
| `sender_summaries` | 17 | One per sender domain |
| `gmail_labels` | ~30 | Gmail system labels + user labels + TB labels (linked to topics) |
| `email_labels` | ~60 | Link emails to their Gmail labels |
| `jobs` | 8 | 5 completed, 1 running, 1 failed, 1 pending |
| `audit_log` | 5 | Linked to completed jobs, with token usage |
| `sync_state` | 1 | Singleton row showing active sync state |
| `settings` | 3 | `gmail.syncEnabled`, `processing.autoProcess`, `ui.compactMode` |

### Tables left empty

| Table | Reason |
|---|---|
| `api_keys` | User-configured; seeding would be misleading |
| `oauth_tokens` | Requires real Gmail auth |

## Email State Distribution

- **40 processed + read** — normal completed state
- **3 unprocessed** — test inbox processing pipeline (email-51, email-52, email-53)
- **2 unread** — test unread indicators (email-54, email-55)
- **2 archived** — test archive filter
- **1 soft-deleted** — test delete handling
- **5 with body content** — test body display (mix of plain and HTML)

## Gmail Labels

### System labels (gmail-system)
INBOX, SENT, DRAFT, SPAM, TRASH, UNREAD, STARRED, IMPORTANT, CATEGORY_PERSONAL, CATEGORY_SOCIAL, CATEGORY_PROMOTIONS, CATEGORY_UPDATES, CATEGORY_FORUMS

### User labels (gmail-user)
Finance, Travel, Work, Health, Shopping

### TB labels (tb)
One per leaf topic — e.g., `TB/Chase`, `TB/Amazon`, `TB/GitHub`, etc. These link to topics via `topics.gmailLabelId`.

## Jobs Sample

| Type | Status | Purpose |
|---|---|---|
| `email_process` | `completed` | Normal processing job |
| `email_process` | `completed` | Normal processing job |
| `email_process` | `completed` | Normal processing job |
| `email_process` | `running` | Currently processing |
| `email_process` | `failed` | Failed with error message |
| `email_process` | `pending` | Queued, waiting |
| `topic_summary_update` | `completed` | Summary update |
| `sender_summary_update` | `completed` | Summary update |

## Implementation Notes

- Insert order must respect FK dependencies: topics → gmail_labels → emails → everything else
- `bodyPlain` and `bodyHtml` should have realistic-looking content for ~5 emails
- Timestamps use `daysAgo()`/`hoursAgo()` helpers so data is always relative to run time
- Seed function wipes all data before inserting (existing behavior)
- Delete `database/seed-data.json` after migration

## File Structure

```
database/seed.ts          ← single file with all seed data + logic
database/seed-data.json   ← DELETE
```
