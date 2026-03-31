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

## Test plan

### Files to drop entirely

| File | Lines | Reason |
|------|-------|--------|
| `__tests__/features-pov/gmail-label-sync.test.ts` | ~676 | Tests deprecated `GmailLabelManager` immediate-apply flow being replaced by immediate + periodic sync |
| `__tests__/features/gmail-labels.test.ts` | ~225 | Direct unit tests of `GmailLabelManager` class methods (`ensureTopicLabels`, `applyTopicLabels`, `applySenderLabel`, `applyProcessedLabel`) |

### Tests to drop within existing files

| File | Section | Reason |
|------|---------|--------|
| `__tests__/features/processing-state.test.ts` | "Processed Label" (lines 84-127) and "Duplicate Prevention" (lines 129-191) | Rely on old `TuskerBrain/Processed` label flow |

### Tests to modify

**`__tests__/features-pov/topic-labeling.test.ts`:**
- Update label name assertions from `TuskerBrain/` to `TB/`
- Change `type` field assertions to `labelSource`
- Update `labelType` assertions to reflect non-null constraint
- Add assertions for `topics.gmailLabelId` being set
- Add assertions for `emailLabels` table entries

**`__tests__/features-pov/inbox-manager.test.ts`:**
- Update "topic label is stored in the database and linked to email" test — add `emailLabels` entry and `gmailLabelId` assertions
- Change `type: 'user'` to `labelSource: 'tb'` in test data

**`__tests__/features-pov/email-processing-pipeline.test.ts`:**
- Add verification for `emailLabels` entries after processing
- Add verification for `topics.gmailLabelId` being set
- Update label name assertions to `TB/` prefix

**`__tests__/features-pov/gmail-sync.test.ts`:**
- Update initial sync and incremental sync tests to include label sync step
- Change `type` field references to `labelSource`

**Test helpers:**
- `__tests__/test-helpers/app.ts` — update `extractTopicFromEmail()`, `addLabelToEmail()`, `processEmail()` label prefix from `TuskerBrain/` to `TB/`
- `__tests__/test-helpers/app-mock.ts` — same updates for mock versions
- Add helper for creating labels with new schema (`labelSource`, `labelType`)

### New test file: `__tests__/features-pov/periodic-label-sync.test.ts`

**Immediate Label Creation (6 tests):**
1. Creates `gmailLabels` entry with `labelSource='tb'`, `labelType='topic'` when topic is created
2. Sets `topics.gmailLabelId` after Gmail label creation
3. Creates `emailLabels` entry for TB-applied labels (topic, sender, processed)
4. Both parent and child topics get `gmailLabelId`
5. Uses `TB/` prefix consistently
6. Handles API failure during immediate creation — topic exists with null `gmailLabelId`, processing continues

**Periodic Sync: TB → Gmail (4 tests):**
1. Re-creates TB labels that were deleted in Gmail
2. Re-applies TB labels to messages that lost them
3. Re-creates missing parent labels before children
4. Batches label operations for efficiency

**Periodic Sync: Gmail → TB (4 tests):**
1. Upserts new `gmail-user` labels from Gmail into `gmailLabels`
2. Removes `gmail-user` labels from DB when deleted in Gmail
3. Preserves `gmail-system` labels (never removed)
4. Handles label name collision — gmail-user label with same name as TB path coexists

**Backfill (3 tests):**
1. Assigns `gmailLabelId` to existing topics without one
2. Creates `emailLabels` entries for existing processed emails missing them
3. Processes backfill in batches

**Integration (3 tests):**
1. Full cycle: immediate creation → user deletes in Gmail → periodic sync restores
2. User sees `TB/` labels in Gmail after email processing
3. Concurrent label changes handled correctly

### Summary

| Category | Count |
|----------|-------|
| Files dropped entirely | 2 (~901 lines) |
| Test sections dropped | 2 sections in processing-state.test.ts |
| Files modified | 6 test files + 2 test helpers |
| New test file | 1 (`periodic-label-sync.test.ts`) |
| New test cases | 20 |
