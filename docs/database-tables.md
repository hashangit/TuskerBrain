# Database Tables

Source: `database/schema.ts` — SQLite via Drizzle ORM.

| # | Table | Purpose | Key Columns | Relations |
|---|-------|---------|-------------|-----------|
| 1 | **emails** | Stores all synced Gmail messages with metadata (sender, subject, snippet, timestamps) and status flags (read, archived, deleted, processed). | `id`, `threadId`, `senderEmail`, `senderDomain`, `subject`, `snippet`, `receivedAt`, `emailType`, `isImportant`, `isRead`, `isProcessed` | Referenced by `timelineUpdates`, `deals`, `emailTopics`, `topicSummaries`, `senderSummaries`, `jobs`, `emailLabels` |
| 2 | **timeline_updates** | AI-generated timeline entries extracted from emails — summaries with priority, sentiment, urgency, action items, financial impact, and key entities. | `id`, `emailId` → emails, `title`, `summary`, `priority`, `sentiment`, `urgency`, `actionItem`, `financialImpact`, `keyEntities` | Belongs to `emails` |
| 3 | **deals** | Promotional deals and offers extracted from emails (discount codes, expiry dates, brand info). Tracks usage and dismissal. | `id`, `emailId` → emails, `dealTitle`, `brandName`, `dealValue`, `dealCode`, `dealExpiry`, `isActive`, `usedAt` | Belongs to `emails` |
| 4 | **topics** | Hierarchical topic taxonomy used to categorize emails. Parent-child structure via `parentId` (no self-referencing FK due to Drizzle limitation). | `id`, `parentId`, `name`, `fullPath` (unique), `emailCount` | Self-referencing hierarchy; referenced by `emailTopics`, `topicSummaries` |
| 5 | **email_topics** | Many-to-many junction linking emails to topics with a confidence score from the AI classifier. | `emailId` → emails, `topicId` → topics, `confidenceScore` | Composite PK `(emailId, topicId)` |
| 6 | **topic_summaries** | AI-generated summaries for each topic, updated incrementally as new emails arrive. | `id`, `topicId` → topics (unique), `summary`, `wordCount`, `lastUpdated`, `lastEmailId`, `updateCount` | One per topic |
| 7 | **sender_summaries** | AI-generated summaries per sender domain, updated incrementally. | `id`, `senderDomain` (unique), `summary`, `wordCount`, `lastUpdated`, `lastEmailId`, `updateCount` | One per unique sender domain |
| 8 | **jobs** | Persistent background job queue for async tasks like email processing, archiving, deletion, summary updates, and backfill. | `id`, `type`, `status`, `payload`, `emailId`, `result`, `error`, `retryCount`, `maxRetries`, `scheduledAt` | References `emails`; referenced by `auditLog` |
| 9 | **audit_log** | Audit trail for all significant actions (job executions, API calls). Tracks token usage and duration for cost monitoring. | `id`, `jobId` → jobs, `action`, `entityType`, `entityId`, `details`, `tokensUsed`, `durationMs` | Optional link to `jobs` |
| 10 | **gmail_labels** | Cached Gmail labels (system and user-created) synced from the Gmail API. | `id`, `name` (unique), `type`, `labelType` | Referenced by `emailLabels` |
| 11 | **email_labels** | Many-to-many junction linking emails to their Gmail labels. | `emailId` → emails, `labelId` → gmailLabels | Composite PK `(emailId, labelId)` |
| 12 | **sync_state** | Singleton row (id=1) tracking Gmail sync state — history ID, last sync timestamps, processing stats, and backfill job progress. | `id` (always 1), `historyId`, `lastFullSync`, `lastIncrementalSync`, `totalEmailsProcessed`, `totalTokensUsed`, `isPaused`, `backfillJobs` | Standalone |
| 13 | **settings** | General-purpose key-value store for application settings, with a schema version for migrations. | `key` (PK), `value` (JSON), `schemaVersion`, `updatedAt` | Standalone |
| 14 | **api_keys** | Tracks user-configured API keys per provider (e.g., OpenAI, Google). Stores the keychain/storage reference and validation state. | `id`, `provider` (unique), `storageKey`, `isValid`, `lastValidated` | Standalone |
| 15 | **oauth_tokens** | Singleton row storing the Gmail OAuth access/refresh token references and expiry info. | `id` (always 1), `accessTokenKey`, `refreshTokenKey`, `expiry`, `scope`, `refreshedAt` | Standalone |
