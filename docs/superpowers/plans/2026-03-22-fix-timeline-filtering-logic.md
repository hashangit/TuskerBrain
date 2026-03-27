# Fix Timeline Filtering Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the Timeline Week view's aggregation logic so that applying filters still groups emails by their actual Sender Domain and Category, rather than fragmenting them based on subject line prefixes.

**Architecture:** We will restore the "High-Fidelity" data flow to the filtered path by joining the `timeline_updates` table with the `emails` table in the repository, and then ensuring this sender metadata is preserved across the IPC boundary and throughout the frontend state.

**Tech Stack:** TypeScript, React, Zustand, Electron IPC, Drizzle ORM.

---

### Task 1: Repository Layer Enhancement

**Files:**
- Modify: `core/repositories/timeline.ts`
- Test: `__tests__/repositories/timeline.test.ts`

- [ ] **Step 1: Write a failing test for `findAll` with sender info**
      Modify `__tests__/repositories/timeline.test.ts` to assert that `findAll` returns `senderDomain` and `emailType`/`gmailCategory`.

- [ ] **Step 2: Run test to verify it fails**
      Run: `npm test __tests__/repositories/timeline.test.ts`
      Expected: FAIL - properties missing on returned objects.

- [ ] **Step 3: Implement the join in `TimelineRepository.findAll`**
      Update the query in `findAll` to join with the `emails` table:
      ```typescript
      let query = this.db.getDatabase()
        .select({
          update: schema.timelineUpdates,
          senderDomain: schema.emails.senderDomain,
          gmailCategory: schema.emails.gmailCategory,
          senderEmail: schema.emails.senderEmail,
          senderName: schema.emails.senderName,
        })
        .from(schema.timelineUpdates)
        .innerJoin(schema.emails, eq(schema.timelineUpdates.emailId, schema.emails.id));
      ```

- [ ] **Step 4: Update the `toRecord` helper or mapping**
      Ensure the returned objects include the sender metadata.

- [ ] **Step 5: Run test to verify it passes**
      Run: `npm test __tests__/repositories/timeline.test.ts`
      Expected: PASS

- [ ] **Step 6: Commit**
      ```bash
      git add core/repositories/timeline.ts __tests__/repositories/timeline.test.ts
      git commit -m "fix(repo): include sender info in timeline findAll results"
      ```

---

### Task 2: IPC & App State Synchronization

**Files:**
- Modify: `electron/main.ts`
- Modify: `src/App.tsx`
- Modify: `src/stores/timeline.ts`
- Modify: `src/components/screens/TimelineScreen.tsx`

- [ ] **Step 1: Update IPC handler in `electron/main.ts`**
      Ensure the `timeline:list` handler passes the sender info to the renderer.
      ```typescript
      // electron/main.ts
      updates: updates.map(u => ({
        ...u,
        sender: {
          email: u.senderEmail,
          name: u.senderName,
          domain: u.senderDomain,
        }
      }))
      ```

- [ ] **Step 2: Update App.tsx mapping**
      Update `loadScreenData` in `src/App.tsx` to stop stripping the `sender` object.
      ```typescript
      // src/App.tsx
      setTimelineUpdates(result.data.updates.map((u: any) => ({
        ...u,
        sender: u.sender, // Keep the sender!
        createdAt: new Date(u.createdAt),
      })));
      ```

- [ ] **Step 3: Update `TimelineUpdate` interface in `src/stores/timeline.ts`**
      Add the `sender` property to the frontend type definition.

- [ ] **Step 4: Update `TimelineCardData` interface in `src/components/screens/TimelineScreen.tsx`**
      Ensure it also includes the optional `sender` property.

- [ ] **Step 5: Commit**
      ```bash
      git add electron/main.ts src/App.tsx src/stores/timeline.ts src/components/screens/TimelineScreen.tsx
      git commit -m "fix(ipc): synchronize sender metadata across IPC boundary"
      ```

---

### Task 3: UI Aggregation Logic Correction

**Files:**
- Modify: `src/components/screens/TimelineScreen.tsx`
- Test: `__tests__/features/timeline-filtering.test.ts` (if applicable)

- [ ] **Step 1: Fix `getSenderDomain` helper**
      Remove the subject-parsing fallback and use the `sender.domain` property.
      ```typescript
      const getSenderDomain = (u: TimelineCardData): string => {
        return u.sender?.domain || u.sender?.email?.split('@')[1] || 'Unknown';
      };
      ```

- [ ] **Step 2: Update `filteredWeekSenders` aggregator**
      Update the aggregator in `TimelineScreen.tsx` to extract the correct `category` for badges.
      ```typescript
      const existing = senderMap.get(domain) || { count: 0, summaries: [], category: u.emailType || 'General' };
      ```

- [ ] **Step 3: Verify the fix visually (Manual Check)**
      Open the app and apply a filter in the Week view. Verify that cards show "amazon.com" (Shopping) instead of "Amazon" (Email).

- [ ] **Step 4: Commit**
      ```bash
      git add src/components/screens/TimelineScreen.tsx
      git commit -m "fix(ui): use correct sender metadata for filtered week aggregation"
      ```
