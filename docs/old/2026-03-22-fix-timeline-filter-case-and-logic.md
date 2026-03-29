# Fix Timeline Filter Case Sensitivity and Logic Conflict Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the topic filtering failure caused by case sensitivity and fix the logical conflict where date filters override timeline navigation.

**Architecture:** We will make topic filtering case-insensitive, pass dynamic topic options from the database to the filter UI, and refine the date range logic so that "Date Range" filters act as global constraints while still respecting the timeline's relative navigation where appropriate.

**Tech Stack:** TypeScript, React, Zustand.

---

### Task 1: UI Type & Data Flow Alignment

**Files:**
- Modify: `src/components/screens/TimelineScreen.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `TimelineScreenProps`**
      Add `availableTopics?: TopicData[]` to the props interface in `src/components/screens/TimelineScreen.tsx`.

- [ ] **Step 2: Update `App.tsx` to pass topics**
      Pass the `topics` state to `TimelineScreen` in `src/App.tsx`.
      ```typescript
      // src/App.tsx
      <TimelineScreen
        // ... existing props
        availableTopics={topics} // Pass the real topics!
      />
      ```

- [ ] **Step 3: Derive dynamic topic options**
      In `TimelineScreen.tsx`, use `useMemo` to convert `availableTopics` into `FilterOption[]` for the filter box. Use the `fullPath` as the value and the `name` as the label.
      ```typescript
      const topicOptions = useMemo(() => {
        return availableTopics
          .filter(t => t.parentId === null) // Start with root topics
          .map(t => ({ value: t.fullPath, label: t.name }));
      }, [availableTopics]);
      ```

- [ ] **Step 4: Pass options to `TimelineFilterBox`**
      ```typescript
      <TimelineFilterBox
        // ...
        topicOptions={topicOptions}
      />
      ```

- [ ] **Step 5: Commit**
      ```bash
      git add src/components/screens/TimelineScreen.tsx src/App.tsx
      git commit -m "feat(ui): pass dynamic topic options to timeline filter"
      ```

---

### Task 2: Case-Insensitive Filtering and Root Topic Fix

**Files:**
- Modify: `src/components/screens/TimelineScreen.tsx`

- [ ] **Step 1: Fix `applyNonDateFilters` for Topic Case Sensitivity**
      Update the topic filter logic to be case-insensitive.
      ```typescript
      // src/components/screens/TimelineScreen.tsx
      if (activeFilters.topics?.length) {
        result = result.filter((u) => {
          if (!u.topic) return false;
          const uTopicLower = u.topic.toLowerCase();
          return activeFilters.topics!.some((t) => {
            const tLower = t.toLowerCase();
            return uTopicLower === tLower || uTopicLower.startsWith(tLower + '/');
          });
        });
      }
      ```

- [ ] **Step 2: Robust Category Badge Extraction**
      In `filteredWeekSenders`, ensure the `category` is derived safely from the topic.
      ```typescript
      const rootTopic = u.topic ? u.topic.split('/')[0] : (u.emailType || 'General');
      ```

- [ ] **Step 3: Commit**
      ```bash
      git add src/components/screens/TimelineScreen.tsx
      git commit -m "fix(ui): implement case-insensitive topic filtering"
      ```

---

### Task 3: Date Range Logic Synchronization

**Files:**
- Modify: `src/components/screens/TimelineScreen.tsx`

- [ ] **Step 1: Fix Date Filter vs. Navigation Conflict**
      Modify `filteredWeekSenders` so that if `zoomLevel === 'week'`, the date range filter **doesn't** override the `selectedDate` unless specifically requested.
      Better yet: If a date filter like "Today" is applied, it should probably force the `selectedDate` to today.
      For now, let's ensure they are combined or the filter is applied *within* the selected view.

      **Logic Fix:**
      If `activeFilters.dateRange` is active, it should act as an **Intersection** with the current view's date range.
      ```typescript
      // src/components/screens/TimelineScreen.tsx
      const viewBounds = getViewDateRange();
      let dateStart = viewBounds.start;
      let dateEnd = viewBounds.end;

      if (activeFilters.dateRange) {
        const filterBounds = getFilterDateRangeBounds(activeFilters.dateRange);
        // Intersect them
        dateStart = new Date(Math.max(dateStart.getTime(), filterBounds.start.getTime()));
        dateEnd = new Date(Math.min(dateEnd.getTime(), filterBounds.end.getTime()));
      }
      ```

- [ ] **Step 2: Update `navigatePrev/Next` behavior**
      If a date filter is active, navigating should probably clear the filter or the filter should be "Global" while the timeline remains "Relative".
      Decision: Date filters in the box are "Global Time Bounds". They should restrict the entire dataset before the timeline navigates through it.

- [ ] **Step 3: Commit**
      ```bash
      git add src/components/screens/TimelineScreen.tsx
      git commit -m "fix(ui): intersect date filters with timeline navigation bounds"
      ```
