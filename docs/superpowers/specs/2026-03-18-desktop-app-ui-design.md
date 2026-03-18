# TuskerBrain Desktop App UI - Design Specification

**Created:** 2026-03-18
**Status:** Draft
**Version:** 1.0

---

## Overview

This specification defines the UI design for TuskerBrain's main application screens, following the TuskerBrain Desktop Design System. The app provides intelligent Gmail inbox management through AI-powered email processing, timeline visualization, and deal extraction.

### Design Principles
- Follow the design system strictly (teal/green tones)
- Modern, slick aesthetic with floating components
- Plan for dark mode but don't implement yet
- Immersive detail views with smooth animations
- Clean, scannable interfaces

---

## App Shell

### Navigation Structure
- **Sidebar**: Fixed left sidebar with navigation items
  - Collapsible (can collapse to icons only)
  - Items: Timeline, Topics, Senders, Deals, Settings
  - Active item highlighted
  - Uses `Component/SidebarItem/Default` and `Component/SidebarItem/Active`

### Top Bar
- **Transparent background** with floating components
- **No borders** - modern, sleek look
- Uses `Component/TopBar`
- Contains:
  - Search bar (`Component/SearchBar`)
  - Processing status indicator (e.g., "Processing 12 emails...")
  - User chip (`Component/UserChip`)
  - Processing status popover/modal for detailed job queue info

### Main Content Area
- Fills remaining space
- Smooth transitions between views
- Consistent padding and spacing

---

## Screen 1: Timeline

### Purpose
Display processed email updates in a chronological, filterable feed.

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [Sidebar - Collapsible]  │  Main Content Area                       │
│                           │  ┌─────────────────────────────────────┐│
│ ○ Timeline                │  │  Timeline Cards (vertical stack)    ││
│ ○ Topics                  │  │  ├─ Card 1                          ││
│ ○ Senders                 │  │  ├─ Card 2                          ││
│ ○ Deals                   │  │  └─ Card 3                          ││
│ ○ Settings                │  │                                     ││
│                           │  │                                     ││
│                           │  └─────────────────────────────────────┘│
│                           │                   ┌─────────────────────┐│
│                           │                   │ Floating Filter Box ││
│                           │                   │ [Type ▼] [Topic ▼] ││
│                           │                   │ [Priority ▼] [Date]││
│                           │                   │ Active: × Topic A  ││
│                           │                   └─────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Timeline Card Component

**Collapsed State (default)**:
- Title (prominent)
- Summary (1-2 lines truncated)
- Priority badge (`Component/StatusBadge/*`)
- Sentiment icon (compact, no label)
- Key actions surfaced inline:
  - Follow-up dates: "Follow up Mar 20"
  - Financial impact: "$2,450 payment due"
  - Action items indicator

**Expanded State (full screen)**:
- Animated expansion to fill screen
- All card content visible:
  - Full description
  - Complete summary
  - All key entities (dates, amounts, names)
  - Action items with checkboxes
  - Follow-up date picker
  - Financial impact details
  - Link to original email in Gmail (opens in new tab)
- Back button to collapse into timeline

### Floating Filter Box
- Position: Right side of content area
- Toggleable (show/hide)
- Contains:
  - Dropdown chips: Email Type, Topic, Priority, Date Range
  - Active filters shown as removable pills
  - Clear all filters button
- AND logic for combining multiple filters

### Empty State
- Friendly illustration
- Primary action: "Start processing emails"
- Brief explanation of what will appear

---

## Screen 1b: Timeline - Per Email View

### Purpose
Focused drill-down view for a single email, augmented with AI-powered insights, summaries, and extracted actions.

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  ┌──────────────────────────────────────────────────┐  │
│            │  │ [← Back to Timeline]                             │  │
│            │  │ **Email Subject Line**             [High Priority] │  │
│            │  │ [A] Amazon Web Services                          │  │
│            │  │ [Mar 19, 2026] [Billing / AWS]                   │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │  ┌─── Email Content ──────────┐ ┌─── AI Insights ───┐  │
│            │  │                            │ │ ✨ AI Gist        │  │
│            │  │ Dear Customer,             │ │ • Summary point 1 │  │
│            │  │ ...                        │ │ • Summary point 2 │  │
│            │  │ ...                        │ │                   │  │
│            │  │                            │ │ 🛠 Extracted Acts │  │
│            │  │ ┌──────────────────────┐   │ │ [ ] Task 1    [+] │  │
│            │  │ │ [Reply] [View In Gm] │   │ │ [ ] Task 2    [+] │  │
│            │  │ └──────────────────────┘   │ │                   │  │
│            │  └────────────────────────────┘ │ 💵 Impact: $247.12 │  │
│            │                                 │ [View Sender Data]│  │
│            │                                 └───────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Sections

#### 1. Header Area
- **Navigation**: "← Back to Timeline" (Ghost style)
- **Subject**: Large bold title (Manrope font)
- **Priority**: High/Medium/Low badge with matching icon (Alert triangle for high)
- **Sender**: Name + Email with rounded avatar (Teal background)
- **Metadata**: 
  - Date & Time (Relative and Precise)
  - Topic/Category Badge (e.g., "Billing / AWS")

#### 2. Main Email Column (Left)
- **Content Area**: Clean, white background card.
- **Copy**: Clean typography with proper spacing.
- **Actions**:
  - **Reply**: Primary teal button.
  - **View in Gmail**: Ghost style with external-link icon.

#### 3. AI Insights Pillar (Right)
- **AI Gist**: 
  - Light teal background card (`#EEF5F6`).
  - 2-3 bullet point "Too long, didn't read" summary.
- **Extracted Actions**:
  - List of to-do items extracted from email text.
  - Checkbox and "Add to Task List" (+) button.
- **Financial Impact**: 
  - Surfaced dollar amounts extracted (Large teal text).
- **Contextual Linking**:
  - "View Sender Stats" (Links to Sender Detailed View).
  - "Open Topic" (Links to Topic screen).

### User Value Proposition
- **Clarity**: Subject and Priority are immediate.
- **Efficiency**: AI Gist provides context without reading the whole body.
- **Actionability**: One-click task extraction saves manual data entry.

---

## Screen 2: Topics

### Purpose
Browse hierarchical topics (Parent → Child) with rolling summaries.

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  Topics Grid                                           │
│            │  ┌────────────────┐ ┌────────────────┐ ┌────────────┐ │
│            │  │ Banking        │ │ Shopping       │ │ Travel     │ │
│            │  │ Chase • 12     │ │ Amazon • 45    │ │ Delta • 8  │ │
│            │  │ "Summary..."   │ │ "Summary..."   │ │ "Summary.."│ │
│            │  │ [Banking]      │ │ [Shopping]     │ │ [Travel]   │ │
│            │  └────────────────┘ └────────────────┘ └────────────┘ │
│            │  ┌────────────────┐ ┌────────────────┐                │
│            │  │ Education      │ │ Projects       │                │
│            │  │ Udemy • 23     │ │ Client-ABC • 7 │                │
│            │  │ "Summary..."   │ │ "Summary..."   │                │
│            │  │ [Education]    │ │ [Projects]     │                │
│            │  └────────────────┘ └────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

### Topic Card Component
- Topic name (prominent)
- Email count badge
- Truncated summary (2-3 lines)
- Colored category label (Banking, Shopping, Travel, Health, etc.)
- Click behavior: Animated expansion to fill screen with full summary

### Expanded State (full screen)
- Full topic name with hierarchy path
- Complete rolling summary (3-4 paragraphs, max 500 words)
- Email count and last updated
- List of recent emails in this topic
- Back button to return to grid

### Empty State
- Illustration
- "No topics yet"
- "Topics will appear as emails are processed"

---

## Screen 2b: Topic Detailed View

### Purpose
Aggregated view for a specific Topic (e.g., "Billing", "Travel"), providing a birds-eye view of all related communications across multiple senders.

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  ┌──────────────────────────────────────────────────┐  │
│            │  │ [← All Topics]                                   │  │
│            │  │ **Topic Name (e.g. Billing)**    [Category Pill] │  │
│            │  │ [Stats: 148 emails from 12 senders]              │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │  ┌─── AI Topic Summary (Gradient Card) ────────────┐  │
│            │  │ ✨ Summary of all activity across senders...      │  │
│            │  │ [3 Pending Payments] [+15% AWS Spend]           │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │  ┌─── Recent Activity ──────┐ ┌─── Topic Insights ──┐  │
│            │  │ [Yesterday]              │ │ 👥 Involved Senders │  │
│            │  │ [A] AWS: Subject...      │ │ [A] AWS (82 emails) │  │
│            │  │ [G] Google: Subject...   │ │ [G] Google (42 ems) │  │
│            │  │                          │ │                     │  │
│            │  │ [Mar 17]                 │ │ ✅ Topic To-dos     │  │
│            │  │ [A] Adobe: Subject...    │ │ [ ] Review metrics  │  │
│            │  │                          │ │                     │  │
│            │  │                          │ │ 💵 Topic Spend (Mar)│  │
│            │  │                          │ │ **$2,450.75**      │  │
│            │  └──────────────────────────┘ └─────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Sections

#### 1. Topic Header
- **Navigation**: "← Back to Topics" (Ghost button).
- **Title**: Large bold brand title (Manrope).
- **Metadata**: Parent Category pill + aggregated stats (Email count, Sender count, Recency).
- **Action**: "Recategorize" (Ghost style).

#### 2. AI Topic Summary
- **Style**: Premium gradient-stroke card (`#EEF5F6`).
- **Content**: Concise aggregation of the topic's current state.
- **Highlights**: Color-coded indicator pills for urgent items (red for pending, orange for trends).

#### 3. Activity Timeline (Left)
- **Grouping**: Date-based separators.
- **Items**: Simplified email cards showing Sender Logo, Subject, Snippet, and Time.

#### 4. Insights Panel (Right)
- **Involved Senders**: List of contributing senders with email volume breakdown.
- **Topic To-dos**: Aggregated checklist of extracted actions from across the topic.
- **Financial Metric**: Large stat surface for spend or frequency.

### User Value Proposition
- **Aggregation**: See the "Big Picture" across fragmented senders.
- **Context**: Understand spend trends or upcoming deadlines for the whole topic.
- **Management**: Quickly audit a specific area of interest (e.g., all Travel bookings) in one go.

---

## Screen 3: Senders

### Purpose
View sender summaries organized by domain.

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  Senders List (Alphabetical)                          │
│            │                                                        │
│            │  ┌──────────────────────────────────────────────────┐ │
│            │  │ amazon.com                           [Shopping]  │ │
│            │  │ 45 emails • "Summary of Amazon emails..."        │ │
│            │  └──────────────────────────────────────────────────┘ │
│            │  ┌──────────────────────────────────────────────────┐ │
│            │  │ chase.com                            [Banking]   │ │
│            │  │ 12 emails • "Summary of Chase emails..."         │ │
│            │  └──────────────────────────────────────────────────┘ │
│            │  ┌──────────────────────────────────────────────────┐ │
│            │  │ linkedin.com                         [Social]    │ │
│            │  │ 89 emails • "Summary of LinkedIn emails..."      │ │
│            │  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Sender Item Component
- Domain name (prominent)
- Email count
- Truncated summary (1-2 lines)
- Colored category label
- Click behavior: Same expansion pattern as Topics

### Category Colors
| Category | Color |
|----------|-------|
| Banking | Teal |
| Shopping | Orange |
| Travel | Blue |
| Health | Red |
| Social | Purple |
| Education | Green |
| Projects | Indigo |
| Technology | Cyan |
| Entertainment | Pink |
| Personal | Yellow |

### Empty State
- Illustration
- "No senders yet"
- "Senders will appear as emails are processed"

---

## Screen 3b: Sender Detailed View

### Purpose
A dedicated per-sender view that surfaces everything the user needs to know about a specific sender in one place — AI summary, actionable tasks, recent emails, and active deals.

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  ┌──────────────────────────────────────────────────┐  │
│            │  │ [Am] amazon.com        142     8      3  [Gmail] │  │
│            │  │ Amazon.com & AWS    Emails Actions Deals [←Back] │  │
│            │  │ [Shopping] [● Subscribed]                        │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │  ┌───────── AI Summary (gradient) ──────────────────┐  │
│            │  │ ✨ AI Summary                    · Updated 2h ago │  │
│            │  │ Rolling summary text about sender activity...    │  │
│            │  │ [🚚 2 delayed] [$247 due Apr 1] [🏷 3 deals]    │  │
│            │  └──────────────────────────────────────────────────┘  │
│            │  ┌─── Recent Emails ──────────┐ ┌─── Right Panel ───┐  │
│            │  │ [All] [Orders] [Billing]   │ │  Action Items     │  │
│            │  │ [Promotions]               │ │  ☑ Pay AWS bill   │  │
│            │  │ ┌──────────────────────┐   │ │  □ Track shipment │  │
│            │  │ │ Order #... shipped   │   │ │  ☑ Use SPRING40   │  │
│            │  │ │ [Shipping][⚡Action] │   │ │  □ Review usage   │  │
│            │  │ └──────────────────────┘   │ │                   │  │
│            │  │ ┌──────────────────────┐   │ │  Active Deals     │  │
│            │  │ │ AWS Invoice $247...  │   │ │  40% Off SPRING40 │  │
│            │  │ │ [Billing][$247 due]  │   │ │  Free Shipping    │  │
│            │  │ └──────────────────────┘   │ └───────────────────┘  │
│            │  └────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Sections

#### 1. Sender Header
- **Avatar**: Initials in a rounded square (teal border)
- **Domain name** (prominent, Manrope font)
- **Display name** / parent org subtitle (e.g., "Amazon.com & Amazon Web Services")
- **Category badge** (colored by category — same palette as Senders list)
- **Subscription status pill** (Subscribed / Unsubscribed)
- **Stats mini-cards** (right-aligned):
  - Total Emails
  - Action Items count
  - Active Deals count
- **Action buttons**: "View in Gmail" (ghost), "← Back to Senders" (primary)

#### 2. AI Summary Card
- **Gradient background** (soft teal-to-green)
- **Sparkles icon** + "AI Summary" title
- "Updated X ago" badge (top-right)
- **Rolling summary text**: 3-5 sentences, covers recent activity, billing, deals, patterns
- **Key Insight Chips** (horizontal row):
  - Delayed shipments (amber)
  - Upcoming bills/payments (red)
  - Expiring deals (green)

#### 3. Recent Emails (Left Column — ~65% width)
- **Filter tabs**: All / Orders / Billing / Promotions (+ any auto-detected categories)
- **Email list** (latest first, scrollable):
  - Subject line (bold)
  - Relative timestamp (right-aligned)
  - Snippet (2 lines, truncated)
  - **Tag pills**: category tag + action/urgency indicator (e.g., "⚡ Action Required", "$247 due", "🏷 SPRING40")
  - Unread indicator dot (teal) for unread emails
  - Click → animates to full email detail / opens in Gmail

#### 4. Action Items Panel (Right Column — ~35% width)
- **Title**: "Action Items" with list-checks icon
- **Pending count badge** (red pill)
- **Progress bar**: "X of Y completed"
- **Checklist items**:
  - Checkbox (teal when checked, outlined when not)
  - Item description (strikethrough + muted when done)
  - Metadata: due date + category source
  - Urgent items shown in red metadata
  - Completed items remain visible but visually de-emphasized

#### 5. Active Deals from Sender (Below Action Items)
- **Title**: "Active Deals" with tag icon (orange)
- **Deal cards**:
  - Deal title
  - Promo code (monospace, click-to-copy, with copy icon)
  - Expiry date (red if < 7 days)
  - Minimum purchase (if applicable)
  - "Auto-applied at checkout" pill for non-code deals

### Value Proposition for Users
| Section | User Value |
|---------|-----------|
| AI Summary | "Catch me up" without reading all emails |
| Key Insight Chips | Instant visibility into urgent items |
| Email List + Filters | Browse history organized by type, no inbox noise |
| Action Items | AI extracts to-dos so nothing slips through |
| Progress Tracking | Completion view motivates follow-through |
| Active Deals | Never miss a coupon from frequent senders |

### Interaction Patterns
- **Email click**: Navigate to email detail or open in Gmail
- **Checkbox click**: Toggle action item completion (persisted locally)
- **Promo code click**: Copy to clipboard with toast confirmation
- **Filter tab click**: Filter email list without page navigation
- **"← Back to Senders"**: Animate back to Senders list view

---

## Screen 4: Deals

### Purpose
View and manage promotional deals extracted from emails.

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  Deals Grid                                            │
│            │  [Filter: All ▼] [Category ▼]                          │
│            │                                                        │
│            │  ┌────────────────┐ ┌────────────────┐ ┌────────────┐ │
│            │  │ 50% Off All    │ │ Free Shipping  │ │ $20 Off    │ │
│            │  │ Electronics    │ │ Orders $50+    │ │ Your Order │ │
│            │  │ Amazon         │ │ Target         │ │ Best Buy   │ │
│            │  │ [SAVE50]       │ │ [FREESHIP]     │ │ [SAVE20]   │ │
│            │  │ Expires Mar 25 │ │ Expires Apr 1  │ │ Expired    │ │
│            │  └────────────────┘ └────────────────┘ └────────────┘ │
│            │                                                        │
│            │  ── Expired Deals ──                                   │
│            │  ┌────────────────┐ ┌────────────────┐                │
│            │  │ 30% Off        │ │ BOGO Special   │                │
│            │  │ (faded)        │ │ (faded)        │                │
│            │  └────────────────┘ └────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

### Deal Card Component
- Deal title (prominent)
- Brand name
- Promo code (click to copy)
- Expiry date with urgency indicator
- Active/Expired status
- Category label

### Status Styling
- **Active deals**: Full opacity, prominent styling, sorted by expiry (urgent first)
- **Expired deals**: Faded opacity (50%), in separate "Expired" section

### Filtering
- Filter by category dropdown
- Toggle to show/hide expired deals

### Empty State
- Illustration
- "No deals available"
- "Deals from promotional emails will appear here"

---

## Screen 5: Settings

### Purpose
Configure Gmail connection, processing preferences, and LLM providers.

### Layout
```
┌─────────────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  Settings                                              │
│            │  ┌──────────────────────────────────────────────────┐ │
│            │  │ Gmail Connection                                 │ │
│            │  │ ┌────────────────────────────────────────────┐   │ │
│            │  │ │ ✓ Connected as user@gmail.com   [Disconnect]│   │ │
│            │  │ └────────────────────────────────────────────┘   │ │
│            │  └──────────────────────────────────────────────────┘ │
│            │                                                        │
│            │  ┌──────────────────────────────────────────────────┐ │
│            │  │ Processing Preferences                           │ │
│            │  │ Initial lookback: [30 days ▼]                    │ │
│            │  │ Sync interval: [30 minutes ▼]                    │ │
│            │  └──────────────────────────────────────────────────┘ │
│            │                                                        │
│            │  ┌──────────────────────────────────────────────────┐ │
│            │  │ LLM Providers                                    │ │
│            │  │ Keys are stored locally and encrypted.           │ │
│            │  │ ┌────────────────────────────────────────────┐   │ │
│            │  │ │ OpenAI     [sk-****]           [Save]      │   │ │
│            │  │ └────────────────────────────────────────────┘   │ │
│            │  │ ┌────────────────────────────────────────────┐   │ │
│            │  │ │ Anthropic  [sk-ant-****]       [Save]      │   │ │
│            │  │ └────────────────────────────────────────────┘   │ │
│            │  │ ┌────────────────────────────────────────────┐   │ │
│            │  │ │ Google AI  [AIza****]          [Save]      │   │ │
│            │  │ └────────────────────────────────────────────┘   │ │
│            │  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Section 1: Gmail Connection
- Connection status (connected/disconnected)
- Connected email address
- Connect/Disconnect button
- Last sync time

### Section 2: Processing Preferences
- Initial lookback period dropdown (7, 14, 30, 60, 90 days)
- Sync interval dropdown (15min, 30min, 1hr, 2hr, daily)
- Toggle for enabling/disabling auto-sync

### Section 3: LLM Providers
- Brief explanation text
- Provider cards for:
  - OpenAI (placeholder: sk-...)
  - Anthropic (placeholder: sk-ant-...)
  - Google AI (placeholder: AIza...)
- Each card has:
  - Provider name
  - Masked API key input (password type)
  - Save button
  - Validation status indicator

---

## Components to Use from Design System

| Component | ID | Usage |
|-----------|-----|-------|
| Button/Primary | `PyaZC` | Primary actions |
| Button/Ghost | `646Tr` | Secondary actions |
| SidebarItem/Default | `BAzmy` | Nav items (inactive) |
| SidebarItem/Active | `OqlDx` | Nav items (active) |
| TopBar | `3VgsT` | App top bar |
| SearchBar | `KswRc` | Search in top bar |
| UserChip | `4XiJp` | User info in top bar |
| SegmentedTabs | `8Ofn9` | View toggles |
| StatusBadge/* | `EpqJp`, `yCGpK`, `7gTni` | Priority, status |
| Badge | `tQdy1` | Category labels |
| Input/Text | `5mmSG` | Text inputs |
| Input/Select | `7n8C8` | Dropdowns |
| Input/Toggle | `BrdZ0` | Toggles |
| Alert | `GBuOg` | Warnings, errors |
| Progress | `iNVoE` | Processing status |
| EmptyState | `VrHuz` | Empty states |
| CommandPalette | `HOBtI` | Keyboard shortcuts (future) |
| ContextMenu | `VDSBD` | Right-click actions (future) |
| NotificationItem | `Rft4N` | Notifications (future) |

---

## Interaction Patterns

### Card Expansion Animation
1. Card clicked
2. Card scales and animates to fill screen
3. Content reflows for full-screen layout
4. Back button appears
5. Click back → reverse animation to original position

### Filter Box Toggle
1. Filter icon/button clicked
2. Box slides in from right
3. Click outside or toggle button → box slides out

### Sidebar Collapse
1. Collapse button clicked
2. Sidebar animates to icon-only width
3. Text labels fade out
4. Click again → expand with text labels

---

## Responsive Considerations

- Minimum window width: 1024px
- Sidebar collapse automatic below 1200px
- Grid columns adjust based on available width
- Full-screen expansions always fill viewport

---

## Dark Mode (Future)

- Variables prepared for dark theme
- Same component structure
- Inverted color palette
- Reduced shadow intensity
- Not implemented in v1

---

## Loading States

All screens use skeleton loading patterns based on the design system while data is being fetched.

### Timeline Loading
- Skeleton cards matching card structure (title line, 2 summary lines, badge placeholder)
- 3-5 skeleton cards shown during initial load
- Shimmer animation for visual feedback

### Topics/Senders/Deals Grid Loading
- Skeleton cards matching grid card structure
- Grid layout maintained with placeholder cards
- Shimmer animation

### Settings Loading
- Form fields shown with skeleton text placeholders
- Sections load progressively if needed

### Component Usage
- Use design system's `Component/Feedback/Progress` (`iNVoE`) for inline loading indicators
- Skeleton frames use the same dimensions as actual content with muted background colors

---

## Implementation Order

1. App Shell (Sidebar + TopBar + Layout)
2. Timeline Screen (cards + filter box)
3. Topics Screen (grid + expansion)
4. Senders Screen (list + expansion)
5. Deals Screen (grid + filtering)
6. Settings Screen (form sections)
7. Empty States (all screens)
8. Loading States (skeleton patterns)
9. Animations and polish

---

## Approval

**Design Created By:** Claude
**Date:** 2026-03-18
**Status:** Awaiting User Approval
