# Fix Timeline Topics and Week Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Timeline's topic filtering failure and synchronize the Week view's date aggregation logic between the backend (unfiltered) and frontend (filtered) paths.

**Architecture:** We will extend the database repository to include topic metadata in timeline updates, align the "Week" definition to a standard calendar week (Sunday-Saturday) across the system, and ensure semantic categories (e.g., Shopping, Banking) are derived from topics consistently.

**Tech Stack:** TypeScript, React, Zustand, Electron IPC, Drizzle ORM.

---

### Task 1: Repository Layer - Topic Joins and Calendar Week Logic

**Files:**
- Modify: `core/repositories/timeline.ts`
- Modify: `core/types/timeline.ts`
- Test: `__tests__/repositories/timeline.test.ts`

- [ ] **Step 1: Update `TimelineUpdateRecord` and `TimelineUpdate` types**
      Add `topic?: string` (to store the fullPath) to both interfaces.

- [ ] **Step 2: Update `TimelineRepository.findAll` to join with topics**
      Update the query in `findAll` to join with `emailTopics` and `topics`:
      ```typescript
      let query = this.db.getDatabase()
        .select({
          // ... existing fields
          topic: schema.topics.fullPath,
          // ... sender fields
        })
        .from(schema.timelineUpdates)
        .innerJoin(schema.emails, eq(schema.timelineUpdates.emailId, schema.emails.id))
        .leftJoin(schema.emailTopics, eq(schema.timelineUpdates.emailId, schema.emailTopics.emailId))
        .leftJoin(schema.topics, eq(schema.emailTopics.topicId, schema.topics.id));
      ```

- [ ] **Step 3: Update `TimelineRepository.getWeekSenders` to use Calendar Week**
      Instead of "past 7 days", calculate the bounds of the week containing `startDate` (Sunday 00:00:00 to Saturday 23:59:59).
      ```typescript
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() - startDate.getDay()); // Sunday
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      ```

- [ ] **Step 4: Update the `toRecord` helper in the repository**
      Ensure `row.topic` is mapped to the record.

- [ ] **Step 5: Run tests to verify the repository logic**
      Run: `npx vitest run __tests__/repositories/timeline.test.ts`
      *(Note: If native module errors occur, manually verify the code structure)*

- [ ] **Step 6: Commit**
      ```bash
      git add core/repositories/timeline.ts core/types/timeline.ts __tests__/repositories/timeline.test.ts
      git commit -m "fix(repo): include topics in timeline list and align week logic"
      ```

---

### Task 2: IPC and App State Integration

**Files:**
- Modify: `electron/main.ts`
- Modify: `src/App.tsx`
- Modify: `src/stores/timeline.ts`

- [ ] **Step 1: Update `timeline:list` IPC handler in `electron/main.ts`**
      Pass the `topic` field from the repository record to the renderer.

- [ ] **Step 2: Update `TimelineUpdate` interface in `src/stores/timeline.ts`**
      Ensure the frontend state includes the `topic` string.

- [ ] **Step 3: Update `src/App.tsx` data mapping**
      Modify `loadScreenData` to preserve the `topic` in the `timelineUpdates` state.
      ```typescript
      // src/App.tsx
      setTimelineUpdates(result.data.updates.map((u: any) => ({
        // ...
        topic: u.topic, // Crucial for filtering!
      })));
      ```

- [ ] **Step 4: Commit**
      ```bash
      git add electron/main.ts src/App.tsx src/stores/timeline.ts
      git commit -m "fix(ipc): propagate topic metadata to frontend state"
      ```

---

### Task 3: UI Aggregation and Category Logic

**Files:**
- Modify: `src/components/screens/TimelineScreen.tsx`

- [ ] **Step 1: Update `TimelineCardData` interface**
      Add `topic?: string`.

- [ ] **Step 2: Fix `filteredWeekSenders` aggregator to use Topics for Badges**
      In the filtered week view, the "Category" badge should be the root topic (e.g., `Shopping` from `Shopping/Amazon`).
      ```typescript
      // src/components/screens/TimelineScreen.tsx
      const rootTopic = u.topic?.split('/')[0] || u.emailType || 'General';
      const existing = senderMap.get(domain) || { 
        count: 0, 
        summaries: [], 
        category: rootTopic // Use the topic as the category badge!
      };
      ```

- [ ] **Step 3: Align `isWithinRange` and `getViewDateRange` with the repository**
      Ensure the `Week` zoom level and the week aggregator use the exact same boundaries as the updated backend (Sunday to Saturday).

- [ ] **Step 4: Verify the fix visually (Manual Check)**
      1. Open the app.
      2. Apply the "Shopping" filter.
      3. Verify the timeline is NO LONGER empty.
      4. Verify that cards show the correct Topic-based badges ("Shopping", "Banking").

- [ ] **Step 5: Commit**
      ```bash
      git add src/components/screens/TimelineScreen.tsx
      git commit -m "fix(ui): use topics for filtering and badge categorization"
      ```
