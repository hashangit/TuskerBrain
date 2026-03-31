# Gmail Label Sync Design

**Date:** 2026-03-31
**Status:** Approved

## Problem

Topics created in TuskerBrain are applied to Gmail via `GmailLabelManager` but are never recorded in the `gmailLabels` database table. The `gmailLabels` and `emailLabels` tables only cache labels synced FROM Gmail, creating a disconnect: the app has no DB record of which TB labels exist in Gmail or which emails have which TB labels applied.

Additionally, the `type` and `labelType` columns on `gmailLabels` are redundant — `type` only holds Gmail's `system`/`user` distinction and `labelType` is always null.

## Design Decisions

1. **TB is authoritative for TB labels.** If a TB-created label is renamed or deleted in Gmail, the periodic sync re-creates/re-applies it.
2. **Gmail is authoritative for Gmail labels.** System and user-created labels from Gmail are reflected in the DB; deletions in Gmail remove them from the DB.
3. **Bidirectional sync is coupled with email sync.** Label reconciliation runs as part of the existing email sync cycle, not as a separate job.
4. **Independent tables remain.** `topics` and `gmailLabels` stay separate for future-proofing — future features may add non-topic TB labels.

## Schema Changes

### `gmailLabels` table

Rename `type` → `labelSource`, repurpose `labelType`:

| Column | Before | After |
|--------|--------|-------|
| `type` | `'system'` \| `'user'` | **Renamed to `labelSource`** |
| `labelSource` | (doesn't exist) | `'gmail-system'` \| `'gmail-user'` \| `'tb'` |
| `labelType` | always null | Gmail native name for system labels, user label name for gmail-user, TB category for TB labels |

`labelType` semantics:

| labelSource | labelType | Examples |
|---|---|---|
| `gmail-system` | Gmail's label name lowercased | `'inbox'`, `'starred'`, `'important'`, `'trash'` |
| `gmail-user` | The actual label name | `'Project Alpha'`, `'Family'` |
| `tb` | TB category enum | `'topic'`, `'sender'`, `'processed'` |

`labelType` is non-null for all rows.

### `topics` table

Add one column:

| Column | Type | Purpose |
|--------|------|---------|
| `gmailLabelId` | `text` (nullable, FK → `gmailLabels.id`) | Links the topic to its Gmail label row |

Both parent and child topics get `gmailLabelId` — every hierarchy node that maps to a Gmail label gets linked. Null means the Gmail label hasn't been created yet (will be picked up by sync).

### `emailLabels` table

No schema changes. But now also gets populated for TB-applied labels (topic, sender, processed), not just Gmail-native labels.

## Data Flow

### Immediate label creation (on topic assignment)

Current flow with additions:

1. LLM assigns topic → `topics` and `emailTopics` rows created
2. `GmailLabelManager.ensureTopicLabels()` creates parent and child labels in Gmail
3. **NEW:** For each created Gmail label, insert a row in `gmailLabels` with `labelSource='tb'`, `labelType='topic'`
4. **NEW:** Set `topics.gmailLabelId` on the topic row to link to the `gmailLabels` entry
5. `GmailLabelManager.applyTopicLabels()` applies the label to the message in Gmail
6. **NEW:** Insert a row in `emailLabels` linking the email to the `gmailLabels` entry

### Periodic sync (coupled with email sync)

Runs at the end of each email sync cycle:

**TB → Gmail (reconcile TB labels):**
1. Query all `gmailLabels` rows with `labelSource='tb'`
2. List all labels from Gmail API
3. For each TB label not found in Gmail: re-create via API
4. For each `emailLabels` entry where label's `labelSource='tb'`: verify label is applied on the Gmail message. If not, apply it.
5. For topics with null `gmailLabelId`: create the Gmail label, insert `gmailLabels` row, link back

**Gmail → TB (reflect Gmail changes):**
1. List all labels from Gmail API
2. For each Gmail label: upsert into `gmailLabels` with appropriate `labelSource` and `labelType`
3. If a `gmail-user` label was deleted in Gmail: remove from `gmailLabels`
4. If a `gmail-system` label was deleted: remove from `gmailLabels` (rare, but handles cleanup)

## Label naming convention

TB labels use the `TB/` prefix with `/`-separated hierarchy matching topic structure:

- Parent topic "AI Agents" → Gmail label `TB/AI Agents`
- Child topic "Gemini Meeting Notes" under "AI Agents" → Gmail label `TB/AI Agents/Gemini Meeting Notes`

**Note:** Current code has an inconsistency — `core/orchestrator.ts` uses `TB/` prefix while `core/labeling/manager.ts` uses `TuskerBrain/` prefix. Implementation should standardize to `TB/`. This is a one-time migration: rename existing `TuskerBrain/*` labels in Gmail to `TB/*` during first sync.

## Error Handling

- **Rate limiting:** Reuse existing `GmailLabelManager.withRetry()` exponential backoff. Batch operations and respect Gmail per-second limits.
- **Immediate creation failure:** Topic still exists in `topics` with null `gmailLabelId`. Periodic sync picks it up and retries.
- **Orphaned topics (backfill):** Existing topics without `gmailLabelId` are handled by sync creating the Gmail label and linking it.
- **Label name collisions:** If a `gmail-user` label has the same name as a TB label path, sync links to the existing Gmail label rather than failing.
- **Gmail 409 conflict on create:** Already handled in `GmailLabelManager.getOrCreateLabel()` — refreshes cache and returns existing.

## Future-proofing

The `labelSource`/`labelType` split supports future TB label categories beyond topics:
- `labelType='sender'` for sender-based labels (`TB/Sender/example.com`)
- `labelType='processed'` for the processed marker (`TB/Processed`)
- Any future feature that needs Gmail label integration

## Files to modify

- `database/schema.ts` — schema changes to `gmailLabels` and `topics`
- `core/labeling/manager.ts` — write to `gmailLabels` and `emailLabels` on label creation; standardize prefix to `TB/`
- `core/repositories/labels.ts` — updated CRUD for new columns, sync functions
- `core/gmail/sync.ts` — add label sync step to email sync cycle
- `core/orchestrator.ts` — update topic→label flow to write back to DB
- Migration file for schema changes

## Migration considerations

- Rename `type` column to `labelSource` on `gmailLabels`
- Add `gmailLabelId` column to `topics` (nullable)
- Existing `gmailLabels` rows: set `labelSource` from old `type` values, set `labelType` appropriately
- Existing topics: `gmailLabelId` starts as null — periodic sync will backfill
- Gmail labels with `TuskerBrain/` prefix should be renamed to `TB/` during first sync run
