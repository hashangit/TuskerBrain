# Email Thread Presentation Design

**Date**: 2026-04-08
**Status**: Approved

## Problem

Emails are displayed individually across all views despite thread data (threadId, RFC 2822 headers) being fully stored. A 5-email conversation appears as 5 separate items, fragmenting context and cluttering the UI.

## Design Principles

- **Thread as primary unit**: Collapsed cards that expand on demand
- **Progressive disclosure**: Show enough to decide relevance (subject, count, latest activity), expand for detail
- **Focus + context**: The email the user clicked is always prominent, thread emails are supporting context
- **Consistent pattern**: Same collapse/expand behavior across all views

---

## 1. Timeline View — Thread-Aware Cards

**Collapse threads into single cards** placed at the most recent email's timestamp.

**Collapsed state** shows: subject, reply count badge, latest sender + snippet, priority badge, action count.

**Expanded state** shows inline mini-previews of each email (sender, time, snippet). Long threads (10+): show first 2 + last 2, middle collapsed.

Single-email threads: no visual difference from regular cards.

---

## 2. SenderDetailView — Conversation-First Layout

**Group emails by threadId** as the primary unit. Thread card shows: subject, reply count, date range, status badge (waiting for reply / resolved / active).

Only threads with 3+ emails get grouped; 1-2 email threads stay flat.

Click thread card opens EmailDetailView with full thread context.

---

## 3. TopicDetailView — Collapsible Thread Groups

**Group emails by threadId** with collapsed/expandable containers. Thread header shows: participants, email count, date range.

Cross-topic threads: show full thread in both topics, highlight which emails belong to each topic with visual badges.

---

## 4. EmailDetailView — Focused Email + Thread Context

**Focused email is the star**: full AI summary, action items, body, reply compose.

**Thread emails as compact cards above and below** the focused email:
- "N earlier messages" section above
- "M later messages" section below

Thread emails collapsed by default (sender, date, snippet only), expandable on click. Clicking a thread email refocuses the view to that email.

Time gap indicators between messages ("2 days later").

Optional thread-level AI summary at top.

Reply compose stays below the focused email.

---

## Shared Components

All views need:
- `ThreadGroup` type: threadId, subject, email count, date range, latest email, status, emails[]
- `ThreadCard` component: collapsed/expandable thread container
- `ThreadEmailCard` component: compact email preview within a thread
- Thread status computation: active (last 48h), waiting for reply (user sent last), resolved, stale (7+ days)

## Data Flow

1. Repository queries already support `findByThreadId()`
2. IPC handlers need to return thread-grouped data
3. Frontend groups emails by threadId before rendering
4. EmailDetailView receives full thread + focused email ID

## Files to Modify

- `core/types/email.ts` — add ThreadGroup type
- `core/repositories/emails.ts` — add thread grouping query methods
- `electron/main.ts` — update IPC handlers to return thread data
- `electron/preload.ts` — expose new IPC methods if needed
- `src/components/ui/EmailListCard.tsx` — add thread collapse/expand support
- `src/components/views/EmailDetailView.tsx` — focused email + thread context layout
- `src/components/views/SenderDetailView.tsx` — conversation-first grouping
- `src/components/views/TopicDetailView.tsx` — collapsible thread groups
- `src/components/screens/TimelineScreen.tsx` — thread-aware timeline cards
