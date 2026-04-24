# Comprehensive Seed Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `database/seed.ts` to cover all 15 database tables with realistic mixed-state data, enabling full application testing without Gmail connectivity.

**Architecture:** Single seed file with all data inline, following FK dependencies, using type-safe interfaces for each entity.

**Tech Stack:** TypeScript, Drizzle ORM, SQLite, TypeScript interfaces for type safety

---
### File Structure

```
database/seed.ts              ← single file with all seed data + logic (from 270 lines to ~800 lines)
database/seed-data.json       ← DELETE this file after migration
```

### Task 1: Update git and prepare environment

**Files:**
- Create: (no files)

- [ ] **Step 1: Create new git branch**

```bash
git checkout -b seed-data-comprehensive
```

- [ ] **Step 2: Add seed-data.json to .gitignore if not already there**

```bash
# Check if seed-data.json is in .gitignore
grep "seed-data.json" .gitignore || echo "database/seed-data.json" >> .gitignore
```

- [ ] **Step 3: Commit initial setup**

```bash
git add .gitignore
git commit -m "feat: add seed-data.json to gitignore"
```

### Task 2: Create new seed.ts structure with type-safe interfaces

**Files:**
- Create: `database/seed.ts`
- Modify: `database/seed.ts`

- [ ] **Step 1: Write the new seed.ts file with interfaces and empty data arrays**

```typescript
/**
 * Comprehensive seed data for TuskerBrain
 * Creates all database tables with realistic mixed-state data for testing
 *
 * Usage:
 *   npx tsx database/seed.ts
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema';
import path from 'path';
import os from 'os';

// Database path
const dbPath = path.join(os.homedir(), 'Library', 'Application Support', 'TuskerBrain', 'tuskerbrain.db');
const url = 'file:' + dbPath;

// Helper functions
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

// Interfaces for type safety
interface EmailTemplate {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  bodyPlain?: string;
  bodyHtml?: string;
  emailType: 'regular' | 'updates' | 'social' | 'promotional';
  priority: 'high' | 'medium' | 'low';
  isImportant: boolean;
  isRead: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  isProcessed: boolean;
  topic: string;
  hasActionItem?: boolean;
  actionItemTitle?: string;
  financialImpact?: number;
  followUpDate?: string;
  urgency?: boolean;
  hasDeal?: boolean;
  deal?: {
    title: string;
    code: string;
    brand: string;
    category: string;
    expiryDays: number;
    value: string;
    minPurchase?: string;
  };
  daysAgo?: number;
  hoursAgo?: number;
}

interface TopicData {
  id: string;
  parentId?: string;
  name: string;
  fullPath: string;
  emailCount: number;
  gmailLabelId?: string;
}

interface SenderData {
  domain: string;
  name: string;
  category: string;
  emailCount: number;
}

interface GmailLabelData {
  id: string;
  name: string;
  labelSource: 'gmail-system' | 'gmail-user' | 'tb';
  labelType?: string;
}

interface JobData {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'dead';
  payload: Record<string, unknown>;
  emailId?: string;
  result?: Record<string, unknown>;
  error?: string;
  retryCount: number;
  maxRetries: number;
  scheduledAt?: Date;
}

interface AuditLogData {
  id: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  tokensUsed?: number;
  durationMs?: number;
  jobId?: string;
}

interface SettingData {
  key: string;
  value: Record<string, unknown>;
  schemaVersion: number;
}

// Data arrays
const TOPICS: TopicData[] = [
  // Banking
  { id: 'topic-banking', name: 'Banking', fullPath: 'Banking', emailCount: 12 },
  { id: 'topic-chase', parentId: 'topic-banking', name: 'Chase', fullPath: 'Banking/Chase', emailCount: 5, gmailLabelId: 'TB/Chase' },
  { id: 'topic-hsbc', parentId: 'topic-banking', name: 'HSBC', fullPath: 'Banking/HSBC', emailCount: 4, gmailLabelId: 'TB/HSBC' },
  { id: 'topic-aws', parentId: 'topic-banking', name: 'AWS', fullPath: 'Banking/AWS', emailCount: 3, gmailLabelId: 'TB/AWS' },
  // ... all other topics ...
];

const SENDERS: SenderData[] = [
  { domain: 'amazon.com', name: 'Amazon', category: 'Shopping', emailCount: 8 },
  { domain: 'chase.com', name: 'Chase Bank', category: 'Banking', emailCount: 5 },
  // ... all other senders ...
];

const EMAILS: EmailTemplate[] = [
  // Email templates will be added next
];

const GMAIL_LABELS: GmailLabelData[] = [
  // Gmail system labels
  { id: 'label-inbox', name: 'INBOX', labelSource: 'gmail-system', labelType: 'user' },
  { id: 'label-sent', name: 'SENT', labelSource: 'gmail-system', labelType: 'user' },
  // ... other system labels ...
];

const JOBS: JobData[] = [
  // Jobs will be added
];

const AUDIT_LOGS: AuditLogData[] = [
  // Audit logs will be added
];

const SETTINGS: SettingData[] = [
  { key: 'gmail.syncEnabled', value: { enabled: true }, schemaVersion: 1 },
  { key: 'processing.autoProcess', value: { enabled: true }, schemaVersion: 1 },
  { key: 'ui.compactMode', value: { enabled: false }, schemaVersion: 1 },
];

async function seed() {
  // Implementation will go here
}

seed()
  .then(() => { console.log('\nDone!'); process.exit(0); })
  .catch((error) => { console.error('Fatal error:', error); process.exit(1); });

export { seed };
```

- [ ] **Step 2: Test import works**

```bash
cd database && npx tsx seed.ts --help
```

Expected: Should run without errors but do nothing yet

- [ ] **Step 3: Commit initial structure**

```bash
git add database/seed.ts
git commit -m "feat: create new seed.ts structure with interfaces"
```

### Task 3: Add all topics and senders data

**Files:**
- Modify: `database/seed.ts:TOPICS and SENDERS arrays`

- [ ] **Step 1: Add all TOPICS data**

Replace the TOPICS array with all 27 topics from the original seed-data.json, including gmailLabelId for leaf topics.

```typescript
const TOPICS: TopicData[] = [
  // Banking
  { id: 'topic-banking', name: 'Banking', fullPath: 'Banking', emailCount: 12 },
  { id: 'topic-chase', parentId: 'topic-banking', name: 'Chase', fullPath: 'Banking/Chase', emailCount: 5, gmailLabelId: 'TB/Chase' },
  { id: 'topic-hsbc', parentId: 'topic-banking', name: 'HSBC', fullPath: 'Banking/HSBC', emailCount: 4, gmailLabelId: 'TB/HSBC' },
  { id: 'topic-aws', parentId: 'topic-banking', name: 'AWS', fullPath: 'Banking/AWS', emailCount: 3, gmailLabelId: 'TB/AWS' },

  // Shopping
  { id: 'topic-shopping', name: 'Shopping', fullPath: 'Shopping', emailCount: 15 },
  { id: 'topic-amazon', parentId: 'topic-shopping', name: 'Amazon', fullPath: 'Shopping/Amazon', emailCount: 8, gmailLabelId: 'TB/Amazon' },
  { id: 'topic-target', parentId: 'topic-shopping', name: 'Target', fullPath: 'Shopping/Target', emailCount: 4, gmailLabelId: 'TB/Target' },
  { id: 'topic-bestbuy', parentId: 'topic-shopping', name: 'Best Buy', fullPath: 'Shopping/BestBuy', emailCount: 3, gmailLabelId: 'TB/BestBuy' },

  // Travel
  { id: 'topic-travel', name: 'Travel', fullPath: 'Travel', emailCount: 6 },
  { id: 'topic-delta', parentId: 'topic-travel', name: 'Delta', fullPath: 'Travel/Delta', emailCount: 3, gmailLabelId: 'TB/Delta' },
  { id: 'topic-airbnb', parentId: 'topic-travel', name: 'Airbnb', fullPath: 'Travel/Airbnb', emailCount: 3, gmailLabelId: 'TB/Airbnb' },

  // Health
  { id: 'topic-health', name: 'Health', fullPath: 'Health', emailCount: 4 },
  { id: 'topic-kaiser', parentId: 'topic-health', name: 'Kaiser', fullPath: 'Health/Kaiser', emailCount: 4, gmailLabelId: 'TB/Kaiser' },

  // Education
  { id: 'topic-education', name: 'Education', fullPath: 'Education', emailCount: 5 },
  { id: 'topic-udemy', parentId: 'topic-education', name: 'Udemy', fullPath: 'Education/Udemy', emailCount: 3, gmailLabelId: 'TB/Udemy' },
  { id: 'topic-coursera', parentId: 'topic-education', name: 'Coursera', fullPath: 'Education/Coursera', emailCount: 2, gmailLabelId: 'TB/Coursera' },

  // Technology
  { id: 'topic-technology', name: 'Technology', fullPath: 'Technology', emailCount: 8 },
  { id: 'topic-github', parentId: 'topic-technology', name: 'GitHub', fullPath: 'Technology/GitHub', emailCount: 5, gmailLabelId: 'TB/GitHub' },
  { id: 'topic-vercel', parentId: 'topic-technology', name: 'Vercel', fullPath: 'Technology/Vercel', emailCount: 3, gmailLabelId: 'TB/Vercel' },

  // Entertainment
  { id: 'topic-entertainment', name: 'Entertainment', fullPath: 'Entertainment', emailCount: 3 },
  { id: 'topic-netflix', parentId: 'topic-entertainment', name: 'Netflix', fullPath: 'Entertainment/Netflix', emailCount: 2, gmailLabelId: 'TB/Netflix' },
  { id: 'topic-spotify', parentId: 'topic-entertainment', name: 'Spotify', fullPath: 'Entertainment/Spotify', emailCount: 1, gmailLabelId: 'TB/Spotify' },

  // Social
  { id: 'topic-social', name: 'Social', fullPath: 'Social', emailCount: 4 },
  { id: 'topic-linkedin', parentId: 'topic-social', name: 'LinkedIn', fullPath: 'Social/LinkedIn', emailCount: 4, gmailLabelId: 'TB/LinkedIn' },

  // Projects
  { id: 'topic-projects', name: 'Projects', fullPath: 'Projects', emailCount: 5 },
  { id: 'topic-clientabc', parentId: 'topic-projects', name: 'Client-ABC', fullPath: 'Projects/Client-ABC', emailCount: 5, gmailLabelId: 'TB/Client-ABC' },
];
```

- [ ] **Step 2: Add all SENDERS data**

Replace the SENDERS array with all 17 senders from the original seed-data.json.

```typescript
const SENDERS: SenderData[] = [
  { domain: 'amazon.com', name: 'Amazon', category: 'Shopping', emailCount: 8 },
  { domain: 'chase.com', name: 'Chase Bank', category: 'Banking', emailCount: 5 },
  { domain: 'aws.amazon.com', name: 'Amazon Web Services', category: 'Banking', emailCount: 3 },
  { domain: 'target.com', name: 'Target', category: 'Shopping', emailCount: 4 },
  { domain: 'bestbuy.com', name: 'Best Buy', category: 'Shopping', emailCount: 3 },
  { domain: 'delta.com', name: 'Delta Airlines', category: 'Travel', emailCount: 3 },
  { domain: 'airbnb.com', name: 'Airbnb', category: 'Travel', emailCount: 3 },
  { domain: 'kaiserpermanente.org', name: 'Kaiser Permanente', category: 'Health', emailCount: 4 },
  { domain: 'udemy.com', name: 'Udemy', category: 'Education', emailCount: 3 },
  { domain: 'coursera.org', name: 'Coursera', category: 'Education', emailCount: 2 },
  { domain: 'github.com', name: 'GitHub', category: 'Technology', emailCount: 5 },
  { domain: 'vercel.com', name: 'Vercel', category: 'Technology', emailCount: 3 },
  { domain: 'netflix.com', name: 'Netflix', category: 'Entertainment', emailCount: 2 },
  { domain: 'spotify.com', name: 'Spotify', category: 'Entertainment', emailCount: 1 },
  { domain: 'linkedin.com', name: 'LinkedIn', category: 'Social', emailCount: 4 },
  { domain: 'company.com', name: 'Client ABC', category: 'Projects', emailCount: 5 },
  { domain: 'hsbc.com', name: 'HSBC Bank', category: 'Banking', emailCount: 4 },
];
```

- [ ] **Step 3: Test that TypeScript compiles**

```bash
cd database && npx tsc --noEmit seed.ts
```

Expected: No compilation errors

- [ ] **Step 4: Commit topic and sender data**

```bash
git add database/seed.ts
git commit -m "feat: add all topics and senders data"
```

### Task 4: Add Gmail labels data

**Files:**
- Modify: `database/seed.ts:GMAIL_LABELS array`

- [ ] **Step 1: Add Gmail system and user labels**

```typescript
const GMAIL_LABELS: GmailLabelData[] = [
  // Gmail system labels
  { id: 'label-inbox', name: 'INBOX', labelSource: 'gmail-system', labelType: 'user' },
  { id: 'label-sent', name: 'SENT', labelSource: 'gmail-system', labelType: 'user' },
  { id: 'label-drafts', name: 'DRAFT', labelSource: 'gmail-system', labelType: 'user' },
  { id: 'label-spam', name: 'SPAM', labelSource: 'gmail-system', labelType: 'user' },
  { id: 'label-trash', name: 'TRASH', labelSource: 'gmail-system', labelType: 'user' },
  { id: 'label-unread', name: 'UNREAD', labelSource: 'gmail-system', labelType: 'user' },
  { id: 'label-starred', name: 'STARRED', labelSource: 'gmail-system', labelType: 'user' },
  { id: 'label-important', name: 'IMPORTANT', labelSource: 'gmail-system', labelType: 'user' },
  { id: 'label-personal', name: 'CATEGORY_PERSONAL', labelSource: 'gmail-system', labelType: 'system' },
  { id: 'label-social', name: 'CATEGORY_SOCIAL', labelSource: 'gmail-system', labelType: 'system' },
  { id: 'label-promotions', name: 'CATEGORY_PROMOTIONS', labelSource: 'gmail-system', labelType: 'system' },
  { id: 'label-updates', name: 'CATEGORY_UPDATES', labelSource: 'gmail-system', labelType: 'system' },
  { id: 'label-forums', name: 'CATEGORY_FORUMS', labelSource: 'gmail-system', labelType: 'system' },

  // User labels (gmail-user)
  { id: 'label-finance', name: 'Finance', labelSource: 'gmail-user', labelType: 'user' },
  { id: 'label-travel', name: 'Travel', labelSource: 'gmail-user', labelType: 'user' },
  { id: 'label-work', name: 'Work', labelSource: 'gmail-user', labelType: 'user' },
  { id: 'label-health', name: 'Health', labelSource: 'gmail-user', labelType: 'user' },
  { id: 'label-shopping', name: 'Shopping', labelSource: 'gmail-user', labelType: 'user' },

  // TB labels (tb) - one per leaf topic
  { id: 'TB/Chase', name: 'TB/Chase', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/HSBC', name: 'TB/HSBC', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/AWS', name: 'TB/AWS', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Amazon', name: 'TB/Amazon', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Target', name: 'TB/Target', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/BestBuy', name: 'TB/BestBuy', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Delta', name: 'TB/Delta', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Airbnb', name: 'TB/Airbnb', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Kaiser', name: 'TB/Kaiser', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Udemy', name: 'TB/Udemy', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Coursera', name: 'TB/Coursera', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/GitHub', name: 'TB/GitHub', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Vercel', name: 'TB/Vercel', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Netflix', name: 'TB/Netflix', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Spotify', name: 'TB/Spotify', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/LinkedIn', name: 'TB/LinkedIn', labelSource: 'tb', labelType: 'user' },
  { id: 'TB/Client-ABC', name: 'TB/Client-ABC', labelSource: 'tb', labelType: 'user' },
];
```

- [ ] **Step 2: Add system, user, and TB label accessors**

```typescript
// Helper to get different types of labels
function getSystemLabels(): GmailLabelData[] {
  return GMAIL_LABELS.filter(label => label.labelSource === 'gmail-system');
}

function getUserLabels(): GmailLabelData[] {
  return GMAIL_LABELS.filter(label => label.labelSource === 'gmail-user');
}

function getTBLabels(): GmailLabelData[] {
  return GMAIL_LABELS.filter(label => label.labelSource === 'tb');
}
```

- [ ] **Step 3: Test Gmail label accessors**

```typescript
// Quick test to ensure labels exist
console.log(`System labels: ${getSystemLabels().length}`);
console.log(`User labels: ${getUserLabels().length}`);
console.log(`TB labels: ${getTBLabels().length}`);
```

- [ ] **Step 4: Commit Gmail labels data**

```bash
git add database/seed.ts
git commit -m "feat: add Gmail labels data (system, user, and TB)"
```

### Task 5: Add email templates with mixed states

**Files:**
- Modify: `database/seed.ts:EMAILS array`

- [ ] **Step 1: Add email templates with mixed processing states**

```typescript
const EMAILS: EmailTemplate[] = [
  // Banking - Chase (5 emails)
  { id: 'email-1', sender: 'chase.com', subject: 'Your March Statement is Ready', snippet: 'Your March credit card statement is now available. Balance: $1,245.00', emailType: 'updates', priority: 'high', topic: 'topic-chase', isImportant: true, isRead: true, isProcessed: true, hasActionItem: true, actionItemTitle: 'Pay credit card bill by April 15', financialImpact: 1245, followUpDate: 'Apr 15', daysAgo: 2 },
  { id: 'email-2', sender: 'chase.com', subject: 'Payment Confirmation - $500 Received', snippet: 'Your payment of $500.00 has been successfully processed.', emailType: 'updates', priority: 'medium', topic: 'topic-chase', isImportant: false, isRead: true, isProcessed: true, daysAgo: 5 },
  { id: 'email-3', sender: 'chase.com', subject: 'Fraud Alert: Unusual Activity Detected', snippet: 'We detected unusual activity on your card ending in 4532. Please verify recent transactions.', emailType: 'regular', priority: 'high', topic: 'topic-chase', isImportant: true, isRead: false, isProcessed: true, hasActionItem: true, actionItemTitle: 'Review and verify recent transactions', urgency: true, daysAgo: 1 },
  { id: 'email-4', sender: 'chase.com', subject: 'New Rewards Points Available', snippet: 'You have earned 2,500 new reward points this month. Total: 45,000 points.', emailType: 'updates', priority: 'low', topic: 'topic-chase', isImportant: false, isRead: true, isProcessed: true, daysAgo: 7 },
  { id: 'email-5', sender: 'chase.com', subject: 'Account Security Update Required', snippet: 'Please update your security settings to enable two-factor authentication.', emailType: 'regular', priority: 'medium', topic: 'topic-chase', isImportant: false, isRead: true, isProcessed: true, hasActionItem: true, actionItemTitle: 'Enable two-factor authentication', daysAgo: 10 },

  // ... (Add email-6 through email-50 following the same pattern)

  // Add 5 new unprocessed emails
  { id: 'email-51', sender: 'paypal.com', subject: 'Payment Received', snippet: 'You received $250 from john@example.com', emailType: 'updates', priority: 'medium', topic: 'topic-banking', isImportant: false, isRead: false, isProcessed: false, daysAgo: 0, hoursAgo: 2 },
  { id: 'email-52', sender: 'etsy.com', subject: 'Your Order Shipped', snippet: 'Your item has shipped and is on its way', emailType: 'updates', priority: 'low', topic: 'topic-shopping', isImportant: false, isRead: false, isProcessed: false, daysAgo: 1 },
  { id: 'email-53', sender: 'discord.com', subject: 'Server Invitation', snippet: 'You have been invited to join New Server', emailType: 'social', priority: 'medium', topic: 'topic-social', isImportant: false, isRead: false, isProcessed: false, daysAgo: 1 },

  // Add 2 archived emails
  { id: 'email-54', sender: 'old-news.com', subject: 'Monthly Digest - March 2026', snippet: 'Your monthly digest is ready', emailType: 'updates', priority: 'low', topic: 'topic-news', isImportant: false, isRead: true, isProcessed: true, isArchived: true, daysAgo: 30 },
  { id: 'email-55', sender: 'newsletter.com', subject: 'Weekly Tech Digest', snippet: 'Top stories this week in tech', emailType: 'updates', priority: 'low', topic: 'topic-technology', isImportant: false, isRead: true, isProcessed: true, isArchived: true, daysAgo: 15 },
];
```

Note: In the actual implementation, you'll need to add all 55 emails (50 from original + 5 new). The above shows the pattern.

- [ ] **Step 2: Add body content for 5 emails**

```typescript
// Add this for 5 emails in the array:
bodyPlain: `Full email body content here. This would include the complete message that was received from the sender. It could be multiple paragraphs of text about the subject matter.`,
bodyHtml: `<html><body><p>HTML email content here with formatting, links, images, etc.</p></body></html>`
```

- [ ] **Step 3: Test email template structure**

```typescript
// Quick test to verify all emails have required fields
const missingFields = EMAILS.filter(email => !email.id || !email.sender || !email.subject);
console.log(`Emails with missing fields: ${missingFields.length}`);
```

- [ ] **Step 4: Commit email templates**

```bash
git add database/seed.ts
git commit -m "feat: add email templates with mixed states"
```

### Task 6: Add jobs and audit logs data

**Files:**
- Modify: `database/seed.ts:JOBS and AUDIT_LOGS arrays`

- [ ] **Step 1: Add jobs with different statuses**

```typescript
const JOBS: JobData[] = [
  // Completed jobs
  {
    id: 'job-1',
    type: 'email_process',
    status: 'completed',
    payload: { emailId: 'email-1', action: 'process' },
    result: { success: true, processedAt: daysAgo(2).getTime() },
    retryCount: 0,
    maxRetries: 3,
    scheduledAt: hoursAgo(3),
  },
  {
    id: 'job-2',
    type: 'email_process',
    status: 'completed',
    payload: { emailId: 'email-2', action: 'process' },
    result: { success: true, processedAt: daysAgo(5).getTime() },
    retryCount: 0,
    maxRetries: 3,
    scheduledAt: hoursAgo(6),
  },
  {
    id: 'job-3',
    type: 'email_process',
    status: 'completed',
    payload: { emailId: 'email-3', action: 'process' },
    result: { success: true, processedAt: daysAgo(1).getTime() },
    retryCount: 0,
    maxRetries: 3,
    scheduledAt: hoursAgo(2),
  },
  {
    id: 'job-4',
    type: 'topic_summary_update',
    status: 'completed',
    payload: { topicId: 'topic-chase', action: 'update_summary' },
    result: { success: true, summaryUpdated: true },
    retryCount: 0,
    maxRetries: 3,
    scheduledAt: hoursAgo(4),
  },
  {
    id: 'job-5',
    type: 'sender_summary_update',
    status: 'completed',
    payload: { domain: 'chase.com', action: 'update_summary' },
    result: { success: true, summaryUpdated: true },
    retryCount: 0,
    maxRetries: 3,
    scheduledAt: hoursAgo(5),
  },

  // Running job
  {
    id: 'job-6',
    type: 'email_process',
    status: 'running',
    payload: { emailId: 'email-51', action: 'process' },
    retryCount: 0,
    maxRetries: 3,
    scheduledAt: hoursAgo(1),
  },

  // Failed job
  {
    id: 'job-7',
    type: 'email_process',
    status: 'failed',
    payload: { emailId: 'email-56', action: 'process' },
    error: 'Database connection timeout',
    errorStack: 'Error: ...',
    retryCount: 3,
    maxRetries: 3,
    scheduledAt: hoursAgo(7),
  },

  // Pending job
  {
    id: 'job-8',
    type: 'email_process',
    status: 'pending',
    payload: { emailId: 'email-52', action: 'process' },
    retryCount: 0,
    maxRetries: 3,
    scheduledAt: hoursAgo(1),
  },
];
```

- [ ] **Step 2: Add audit logs**

```typescript
const AUDIT_LOGS: AuditLogData[] = [
  // Audit logs for completed jobs
  {
    id: 'audit-1',
    jobId: 'job-1',
    action: 'email_processed',
    entityType: 'email',
    entityId: 'email-1',
    tokensUsed: 150,
    durationMs: 3200,
  },
  {
    id: 'audit-2',
    jobId: 'job-2',
    action: 'email_processed',
    entityType: 'email',
    entityId: 'email-2',
    tokensUsed: 120,
    durationMs: 2800,
  },
  {
    id: 'audit-3',
    jobId: 'job-4',
    action: 'topic_summary_updated',
    entityType: 'topic',
    entityId: 'topic-chase',
    tokensUsed: 80,
    durationMs: 1500,
  },
  {
    id: 'audit-4',
    jobId: 'job-5',
    action: 'sender_summary_updated',
    entityType: 'sender',
    entityId: 'chase.com',
    tokensUsed: 60,
    durationMs: 1200,
  },
  {
    id: 'audit-5',
    jobId: 'job-7',
    action: 'email_process_failed',
    entityType: 'email',
    entityId: 'email-56',
    tokensUsed: 0,
    durationMs: 500,
    details: { error: 'Database connection timeout' },
  },
];
```

- [ ] **Step 3: Test job and audit data**

```typescript
// Verify all jobs have required fields
console.log(`Jobs: ${JOBS.length}`);
console.log(`Completed: ${JOBS.filter(j => j.status === 'completed').length}`);
console.log(`Failed: ${JOBS.filter(j => j.status === 'failed').length}`);
```

- [ ] **Step 4: Commit jobs and audit logs**

```bash
git add database/seed.ts
git commit -m "feat: add jobs and audit logs data"
```

### Task 7: Implement the seed function with proper FK order

**Files:**
- Modify: `database/seed.ts:seed function`

- [ ] **Step 1: Replace seed function implementation**

```typescript
async function seed() {
  console.log('🌱 Starting comprehensive database seed...');
  console.log(`  Database path: ${dbPath}`);

  const client = createClient({ url });
  const db = drizzle(client, { schema });

  // Run migrations first
  const migrationsFolder = path.join(__dirname, 'migrations');
  console.log('  Running migrations...');
  await migrate(db, { migrationsFolder });

  try {
    console.log('  Clearing existing data...');
    // Clear in FK reverse order
    await client.execute('DELETE FROM email_labels');
    await client.execute('DELETE FROM email_topics');
    await client.execute('DELETE FROM timeline_updates');
    await client.execute('DELETE FROM deals');
    await client.execute('DELETE FROM emails');
    await client.execute('DELETE FROM topic_summaries');
    await client.execute('DELETE FROM sender_summaries');
    await client.execute('DELETE FROM jobs');
    await client.execute('DELETE FROM audit_log');
    await client.execute('DELETE FROM topics');
    await client.execute('DELETE FROM gmail_labels');
    await client.execute('DELETE FROM sync_state');
    await client.execute('DELETE FROM settings');

    console.log('  Inserting topics...');
    for (const topic of TOPICS) {
      await client.execute({
        sql: 'INSERT INTO topics (id, parent_id, name, full_path, email_count, gmail_label_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [topic.id, topic.parentId || null, topic.name, topic.fullPath, topic.emailCount, topic.gmailLabelId || null, Date.now()]
      });
    }

    console.log('  Inserting Gmail labels...');
    for (const label of GMAIL_LABELS) {
      await client.execute({
        sql: 'INSERT INTO gmail_labels (id, name, label_source, label_type, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [label.id, label.name, label.labelSource, label.labelType || null, Date.now()]
      });
    }

    console.log('  Inserting emails and related data...');
    let dealCount = 0;

    for (const email of EMAILS) {
      const sender = SENDERS.find(s => s.domain === email.sender);
      if (!sender) continue;

      const threadId = `thread-${email.id}`;
      const receivedAt = email.hoursAgo
        ? hoursAgo(email.hoursAgo).getTime()
        : daysAgo(email.daysAgo || 0).getTime();

      // Insert email
      await client.execute({
        sql: `INSERT INTO emails (id, thread_id, sender_email, sender_name, sender_domain, subject, snippet,
          body_plain, body_html, received_at, email_type, gmail_category, is_important, is_read, is_archived, is_deleted,
          is_processed, processed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          email.id, threadId, `noreply@${sender.domain}`, sender.name, sender.domain,
          email.subject, email.snippet, email.bodyPlain || null, email.bodyHtml || null,
          receivedAt, email.emailType, sender.category,
          email.isImportant ? 1 : 0, email.isRead ? 1 : 0, email.isArchived ? 1 : 0, email.isDeleted ? 1 : 0,
          email.isProcessed ? 1 : 0, email.isProcessed ? receivedAt : null, receivedAt
        ]
      });

      // Insert timeline update for processed emails
      if (email.isProcessed) {
        const title = email.subject.replace(/^(Re: |Fwd: |🔥 )/, '');
        const keyEntities = email.followUpDate
          ? JSON.stringify({ dates: [email.followUpDate], amounts: email.financialImpact ? [email.financialImpact] : [], names: [sender.name] })
          : null;

        await client.execute({
          sql: `INSERT INTO timeline_updates (id, email_id, title, description, summary, priority, sentiment,
            urgency, importance_reason, action_item, action_item_title, follow_up_date, financial_impact,
            key_entities, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `update-${email.id}`, email.id, title, email.snippet, email.snippet,
            email.priority, email.financialImpact && email.financialImpact > 0 ? 'neutral' : 'positive',
            email.urgency ? 1 : 0, email.priority === 'high' ? 'Requires immediate attention' : null,
            email.hasActionItem ? 1 : 0, email.actionItemTitle || null, email.followUpDate || null,
            email.financialImpact || null, keyEntities, receivedAt
          ]
        });
      }

      // Insert deal if present
      if (email.hasDeal && email.deal) {
        dealCount++;
        await client.execute({
          sql: `INSERT INTO deals (id, email_id, deal_title, deal_description, brand_name, deal_category,
            deal_value, deal_value_type, deal_code, minimum_purchase, deal_expiry, created_at,
            is_active, used_at, dismissed_at, deal_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            `deal-${dealCount}`, email.id, email.deal.title, email.snippet,
            email.deal.brand, email.deal.category, email.deal.value,
            email.deal.value.includes('%') ? 'percentage' : 'fixed_amount',
            email.deal.code, email.deal.minPurchase || null,
            daysFromNow(email.deal.expiryDays).getTime(), receivedAt, 1, null, null, null
          ]
        });
      }

      // Insert email-topic mapping
      await client.execute({
        sql: 'INSERT INTO email_topics (email_id, topic_id, confidence_score) VALUES (?, ?, ?)',
        args: [email.id, email.topic, 0.85 + Math.random() * 0.14]
      });

      // Insert email-label mappings (for INBOX and topic TB labels)
      await client.execute({
        sql: 'INSERT INTO email_labels (email_id, label_id) VALUES (?, ?)',
        args: [email.id, 'label-inbox']
      });

      if (email.isProcessed) {
        const tbLabelId = `TB/${email.sender.split('.')[0].charAt(0).toUpperCase() + email.sender.split('.').slice(1).join('')}`;
        await client.execute({
          sql: 'INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)',
          args: [email.id, tbLabelId]
        });
      }
    }

    console.log('  Inserting topic summaries...');
    for (const topic of TOPICS) {
      await client.execute({
        sql: 'INSERT INTO topic_summaries (id, topic_id, summary, word_count, last_updated, update_count) VALUES (?, ?, ?, ?, ?, ?)',
        args: [`ts-${topic.id}`, topic.id, `Summary for ${topic.name}`, 25, Date.now(), Math.floor(Math.random() * 5) + 1]
      });
    }

    console.log('  Inserting sender summaries...');
    for (const sender of SENDERS) {
      await client.execute({
        sql: 'INSERT INTO sender_summaries (id, sender_domain, summary, word_count, last_updated, update_count) VALUES (?, ?, ?, ?, ?, ?)',
        args: [`ss-${sender.domain.replace(/\./g, '-')}`, sender.domain, `Summary for ${sender.name}`, 30, Date.now(), 1]
      });
    }

    console.log('  Inserting jobs...');
    for (const job of JOBS) {
      await client.execute({
        sql: `INSERT INTO jobs (id, type, status, payload, email_id, result, error, error_stack,
          retry_count, max_retries, scheduled_at, created_at, started_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          job.id,
          job.type,
          job.status,
          JSON.stringify(job.payload),
          job.emailId || null,
          job.result ? JSON.stringify(job.result) : null,
          job.error || null,
          job.errorStack || null,
          job.retryCount,
          job.maxRetries,
          job.scheduledAt?.getTime() || null,
          Date.now(),
          job.status === 'running' || job.status === 'completed' ? hoursAgo(1).getTime() : null,
          job.status === 'completed' ? hoursAgo(1).getTime() : null
        ]
      });
    }

    console.log('  Inserting audit logs...');
    for (const audit of AUDIT_LOGS) {
      await client.execute({
        sql: `INSERT INTO audit_log (id, job_id, action, entity_type, entity_id, details,
          tokens_used, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          audit.id,
          audit.jobId || null,
          audit.action,
          audit.entityType || null,
          audit.entityId || null,
          audit.details ? JSON.stringify(audit.details) : null,
          audit.tokensUsed || null,
          audit.durationMs || null,
          Date.now()
        ]
      });
    }

    console.log('  Inserting settings...');
    for (const setting of SETTINGS) {
      await client.execute({
        sql: 'INSERT INTO settings (key, value, schema_version, updated_at) VALUES (?, ?, ?, ?)',
        args: [setting.key, JSON.stringify(setting.value), setting.schemaVersion, Date.now()]
      });
    }

    console.log('  Inserting sync state...');
    await client.execute({
      sql: `INSERT OR REPLACE INTO sync_state (id, history_id, last_full_sync, last_incremental_sync,
        total_emails_processed, total_tokens_used, is_paused, backfill_jobs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        1,
        'sync-history-12345',
        daysAgo(7).getTime(),
        hoursAgo(2).getTime(),
        EMAILS.filter(e => e.isProcessed).length,
        5000,
        false,
        JSON.stringify([])
      ]
    });

    console.log('✅ Database seed completed successfully!');
    console.log(`   - ${EMAILS.length} emails (${EMAILS.filter(e => e.isProcessed).length} processed)`);
    console.log(`   - ${EMAILS.filter(e => e.hasActionItem).length} emails with action items`);
    console.log(`   - ${JOBS.length} jobs (${JOBS.filter(j => j.status === 'completed').length} completed)`);
    console.log(`   - ${TOPICS.length} topics`);
    console.log(`   - ${GMAIL_LABELS.length} Gmail labels`);

    client.close();
    return true;
  } catch (error) {
    console.error('❌ Seed failed:', error);
    client.close();
    throw error;
  }
}
```

- [ ] **Step 2: Test the full seed function**

```bash
cd database && npx tsx seed.ts
```

Expected: Should run without errors and create all tables with data

- [ ] **Step 3: Commit seed function implementation**

```bash
git add database/seed.ts
git commit -m "feat: implement comprehensive seed function with FK order"
```

### Task 8: Final cleanup and test

**Files:**
- Delete: `database/seed-data.json`

- [ ] **Step 1: Delete seed-data.json**

```bash
rm database/seed-data.json
```

- [ ] **Step 2: Verify seed works end-to-end**

```bash
cd database && rm -f tuskerbrain.db  # Clear old DB
npx tsx seed.ts                      # Run seed
# Verify data exists
sqlite3 tuskerbrain.db "SELECT COUNT(*) FROM emails;"        # Should show ~55
sqlite3 tuskerbrain.db "SELECT COUNT(*) FROM jobs;"          # Should show 8
sqlite3 tuskerbrain.db "SELECT COUNT(*) FROM gmail_labels;"  # Should show ~30
sqlite3 tuskerbrain.db "SELECT COUNT(*) FROM sync_state;"    # Should show 1
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete comprehensive seed data implementation"
```

## Testing the Implementation

After running the seed, verify:

1. **Email states**:
   ```sql
   SELECT COUNT(*) FROM emails WHERE is_processed = 0;  -- Should show ~3 unprocessed
   SELECT COUNT(*) FROM emails WHERE is_read = 0;      -- Should show ~2 unread
   SELECT COUNT(*) FROM emails WHERE is_archived = 1;  -- Should show ~2 archived
   ```

2. **Jobs variety**:
   ```sql
   SELECT status, COUNT(*) FROM jobs GROUP BY status;
   ```

3. **Gmail labels**:
   ```sql
   SELECT label_source, COUNT(*) FROM gmail_labels GROUP BY label_source;
   ```

4. **Topic-label linkage**:
   ```sql
   SELECT t.name, g.name FROM topics t JOIN gmail_labels g ON t.gmail_label_id = g.id WHERE g.label_source = 'tb';
   ```

## Special Considerations

- The seed uses `INSERT OR IGNORE` for email-label junctions to avoid duplicates
- Timestamps are relative to run time (not fixed) using helper functions
- TB labels are created automatically from topic names when emails are processed
- The seed respects foreign key constraints by inserting in dependency order
- All emails get the INBOX label; processed emails also get their TB topic label