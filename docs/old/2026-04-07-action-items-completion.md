# Action Items Completion Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully functional action item completion flow - users can tick off action items in any view, changes persist to DB, and aggregated views (sender/topic) correctly reflect completion state.

**Architecture:** Add `actionItemCompleted`/`actionItemCompletedAt` columns to `timeline_updates` table. Add toggle repository method, IPC handler, preload exposure, and optimistic UI updates. Replace mock sender detail with real aggregation. Fix email detail to return all action items.

**Tech Stack:** Drizzle ORM, SQLite, Electron IPC, React state management

---

## Interface Contracts (all agents must follow)

### New DB columns on `timeline_updates`
- `actionItemCompleted` — `integer('action_item_completed', { mode: 'boolean' }).default(false)`
- `actionItemCompletedAt` — `integer('action_item_completed_at', { mode: 'timestamp_ms' })`

### TimelineUpdateRecord additions
```ts
actionItemCompleted: boolean;
actionItemCompletedAt: Date | null;
```

### New TimelineRepository method
```ts
async toggleActionItemCompleted(id: string): Promise<TimelineUpdateRecord | null>
```

### New IPC channels
- `action-items:toggle` — `{ id: string }` → `{ success: boolean; data?: { id: string; completed: boolean; completedAt: string | null }; error?: string }`
- `senders:get-detail` — `string` (domain) → `{ success: boolean; data?: SenderDetailData; error?: string }`

### New preload methods
- `toggleActionItem(id: string): Promise<...>`
- `getSenderDetail(domain: string): Promise<...>`

### Updated action item shape in API responses
```ts
{ id: string; title: string; completed: boolean; completedAt?: string; dueDate?: string; urgent?: boolean; }
```

---

### Task 1: Database Schema + Migration + Repository

**Files:**
- Modify: `database/schema.ts` (lines 25-41)
- Modify: `database/migrations/0000_initial.sql` (lines 150-167)
- Modify: `core/repositories/timeline.ts` (lines 14-55, 244-267, 444-475)
- Modify: `core/repositories/topics.ts` (lines 466-516)

- [ ] **Step 1: Add columns to schema.ts**

In `database/schema.ts`, add after `actionItemTitle` (line 36):
```ts
actionItemCompleted: integer('action_item_completed', { mode: 'boolean' }).default(false),
actionItemCompletedAt: integer('action_item_completed_at', { mode: 'timestamp_ms' }),
```

- [ ] **Step 2: Add columns to migration SQL**

In `database/migrations/0000_initial.sql`, add after `action_item_title` (line 161):
```sql
`action_item_completed` integer DEFAULT false,
`action_item_completed_at` integer,
```

- [ ] **Step 3: Update TimelineUpdateRecord type**

In `core/repositories/timeline.ts`, add to interface (after line 26):
```ts
actionItemCompleted: boolean;
actionItemCompletedAt: Date | null;
```

- [ ] **Step 4: Update toRecord method**

In `core/repositories/timeline.ts` `toRecord()`, add (after actionItemTitle line):
```ts
actionItemCompleted: row.actionItemCompleted ?? false,
actionItemCompletedAt: row.actionItemCompletedAt ?? null,
```

- [ ] **Step 5: Add toggleActionItemCompleted method**

Add to TimelineRepository class:
```ts
async toggleActionItemCompleted(id: string): Promise<TimelineUpdateRecord | null> {
  // Get current state
  const [current] = await this.db.getDatabase()
    .select()
    .from(schema.timelineUpdates)
    .where(eq(schema.timelineUpdates.id, id))
    .limit(1);

  if (!current) return null;

  const newCompleted = !(current.actionItemCompleted ?? false);
  const [updated] = await this.db.getDatabase()
    .update(schema.timelineUpdates)
    .set({
      actionItemCompleted: newCompleted,
      actionItemCompletedAt: newCompleted ? new Date() : null,
    })
    .where(eq(schema.timelineUpdates.id, id))
    .returning();

  return updated ? this.toRecord(updated) : null;
}
```

- [ ] **Step 6: Fix topics.ts to read actual completion state**

In `core/repositories/topics.ts`, update the action items query (lines 466-483) to select `actionItemCompleted` and `actionItemCompletedAt`, and update the mapping (lines 510-516) to:
```ts
const actionItems = actionItemResults
  .filter((a) => a.title)
  .map((a) => ({
    id: a.id,
    title: a.title!,
    completed: a.actionItemCompleted ?? false,
    completedAt: a.actionItemCompletedAt?.toISOString() ?? undefined,
    dueDate: a.followUpDate ?? undefined,
    urgent: a.urgency ?? false,
  }));
```

- [ ] **Step 7: Commit**

```bash
git add database/schema.ts database/migrations/0000_initial.sql core/repositories/timeline.ts core/repositories/topics.ts
git commit -m "feat: add action item completion tracking to DB schema and repositories"
```

---

### Task 2: Backend IPC Handlers + Preload

**Files:**
- Modify: `electron/main.ts` (lines 792-965 for email detail, add toggle handler, add sender detail handler)
- Modify: `electron/preload.ts` (add methods + ElectronAPI type)
- Modify: `electron/preload.cjs` (add methods)

- [ ] **Step 1: Add toggle IPC handler**

In `electron/main.ts`, add a new `ipcMain.handle('action-items:toggle', ...)` handler:
```ts
ipcMain.handle('action-items:toggle', async (_event, id: string) => {
  try {
    const result = await timelineRepo.toggleActionItemCompleted(id);
    if (!result) return { success: false, error: 'Action item not found' };
    return {
      success: true,
      data: {
        id: result.id,
        completed: result.actionItemCompleted,
        completedAt: result.actionItemCompletedAt?.toISOString() ?? null,
      },
    };
  } catch (error) {
    console.error('Error toggling action item:', error);
    return { success: false, error: 'Failed to toggle action item' };
  }
});
```

- [ ] **Step 2: Add sender detail IPC handler**

Add `ipcMain.handle('senders:get-detail', ...)` handler that:
1. Queries emails by senderDomain
2. Queries action items (timeline_updates with actionItem=true) joined with emails by domain
3. Queries deals by email sender domain
4. Gets sender summary from senderSummaries table
5. Computes stats
6. Returns SenderDetailData matching the interface

- [ ] **Step 3: Fix email detail to return ALL action items**

In the `emails:get-detail` handler, change from using `timelineUpdates[0]` to querying ALL timeline updates for that email where `actionItem = true`:
```ts
const allActionItems = timelineUpdates
  .filter(tu => tu.actionItem && tu.actionItemTitle)
  .map(tu => ({
    id: tu.id,
    title: tu.actionItemTitle!,
    completed: tu.actionItemCompleted ?? false,
    completedAt: tu.actionItemCompletedAt?.toISOString() ?? undefined,
    dueDate: tu.followUpDate ?? undefined,
    urgent: tu.urgency ?? false,
  }));
```

- [ ] **Step 4: Update preload.ts**

Add methods and types for `toggleActionItem` and `getSenderDetail`.

- [ ] **Step 5: Update preload.cjs**

Add methods for `toggleActionItem`, `getSenderDetail`, and `getTopicDetail`.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts electron/preload.ts electron/preload.cjs
git commit -m "feat: add action item toggle and sender detail IPC handlers"
```

---

### Task 3: Frontend Wiring

**Files:**
- Modify: `src/App.tsx` (lines 460-678)
- Modify: `src/components/ui/ActionItemsCard.tsx` (null guards)

- [ ] **Step 1: Add ActionItem type and state helper**

Add a shared `toggleActionItemInState` helper that optimistically updates the view state.

- [ ] **Step 2: Wire up handleSenderClick to use real data**

Replace mock data call with IPC call to `getSenderDetail(domain)`.

- [ ] **Step 3: Wire up all three toggle callbacks**

Replace `console.log` with real optimistic state update + IPC call with rollback.

- [ ] **Step 4: Fix ActionItemsCard null guards**

Add null safety for `items` prop and empty state.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/ui/ActionItemsCard.tsx
git commit -m "feat: wire up action item toggle with optimistic updates and real sender data"
```

---

### Task 4: Seed Data

**Files:**
- Modify: `database/seed.ts` (lines 671-682)

- [ ] **Step 1: Add completion data to some timeline updates**

Mark some action items as completed with completedAt dates.

- [ ] **Step 2: Commit**

```bash
git add database/seed.ts
git commit -m "feat: add completed action items to seed data"
```

---

### Task 5: DB Reset + Verification

- [ ] Delete existing DB
- [ ] Run schema application
- [ ] Run seed
- [ ] Verify action items appear with correct completion states
