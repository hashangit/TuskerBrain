import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

export const emails = sqliteTable('emails', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  senderEmail: text('sender_email').notNull(),
  senderName: text('sender_name'),
  senderDomain: text('sender_domain').notNull(),
  subject: text('subject'),
  snippet: text('snippet'),
  receivedAt: integer('received_at', { mode: 'timestamp' }).notNull(),
  emailType: text('email_type', { enum: ['regular', 'updates', 'social', 'promotional'] }),
  gmailCategory: text('gmail_category'),
  isImportant: integer('is_important', { mode: 'boolean' }).default(false),
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
  isProcessed: integer('is_processed', { mode: 'boolean' }).default(false),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const timelineUpdates = sqliteTable('timeline_updates', {
  id: text('id').primaryKey(),
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  summary: text('summary'),
  priority: text('priority', { enum: ['high', 'medium', 'low'] }),
  sentiment: text('sentiment', { enum: ['positive', 'negative', 'neutral'] }),
  urgency: integer('urgency', { mode: 'boolean' }).default(false),
  importanceReason: text('importance_reason'),
  actionItem: integer('action_item', { mode: 'boolean' }).default(false),
  actionItemTitle: text('action_item_title'),
  followUpDate: text('follow_up_date'),
  financialImpact: real('financial_impact'),
  keyEntities: blob('key_entities', { mode: 'json' }).$type<{ dates: string[]; amounts: number[]; names: string[] }>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const deals = sqliteTable('deals', {
  id: text('id').primaryKey(),
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }).notNull(),

  // Core deal info
  dealTitle: text('deal_title').notNull(),
  dealDescription: text('deal_description'),
  brandName: text('brand_name').notNull(),
  dealCategory: text('deal_category'),

  // Deal value
  dealValue: text('deal_value'),
  dealValueType: text('deal_value_type', { enum: ['percentage', 'fixed_amount', 'other'] }),
  dealCode: text('deal_code'),
  minimumPurchase: text('minimum_purchase'),

  // Dates
  dealExpiry: integer('deal_expiry', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),

  // Status
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  dismissedAt: integer('dismissed_at', { mode: 'timestamp' }),

  // Links
  dealLink: text('deal_link'),
});

export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  name: text('name').notNull(),
  fullPath: text('full_path').notNull().unique(),
  emailCount: integer('email_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const emailTopics = sqliteTable('email_topics', {
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }).notNull(),
  topicId: text('topic_id').references(() => topics.id, { onDelete: 'cascade' }).notNull(),
  confidenceScore: real('confidence_score'),
});

export const topicSummaries = sqliteTable('topic_summaries', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').references(() => topics.id, { onDelete: 'cascade' }).unique().notNull(),
  summary: text('summary').notNull(),
  wordCount: integer('word_count'),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  lastEmailId: text('last_email_id').references(() => emails.id),
  updateCount: integer('update_count').default(0),
});

export const senderSummaries = sqliteTable('sender_summaries', {
  id: text('id').primaryKey(),
  senderDomain: text('sender_domain').notNull().unique(),
  summary: text('summary').notNull(),
  wordCount: integer('word_count'),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  lastEmailId: text('last_email_id').references(() => emails.id),
  updateCount: integer('update_count').default(0),
});

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['email_process', 'email_archive', 'email_delete', 'topic_summary_update', 'sender_summary_update', 'backfill_day'] }).notNull(),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'retrying', 'dead'] }).notNull().default('pending'),
  payload: blob('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }),
  result: blob('result', { mode: 'json' }).$type<Record<string, unknown>>(),
  error: text('error'),
  errorStack: text('error_stack'),
  retryCount: integer('retry_count').default(0),
  maxRetries: integer('max_retries').default(3),
  scheduledAt: integer('scheduled_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  jobId: text('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  details: blob('details', { mode: 'json' }).$type<Record<string, unknown>>(),
  tokensUsed: integer('tokens_used'),
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const gmailLabels = sqliteTable('gmail_labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  type: text('type', { enum: ['system', 'user'] }),
  labelType: text('label_type'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const emailLabels = sqliteTable('email_labels', {
  emailId: text('email_id').references(() => emails.id, { onDelete: 'cascade' }).notNull(),
  labelId: text('label_id').references(() => gmailLabels.id, { onDelete: 'cascade' }).notNull(),
});

export const syncState = sqliteTable('sync_state', {
  id: integer('id').primaryKey().default(1),
  historyId: text('history_id'),
  lastFullSync: integer('last_full_sync', { mode: 'timestamp' }),
  lastIncrementalSync: integer('last_incremental_sync', { mode: 'timestamp' }),
  totalEmailsProcessed: integer('total_emails_processed').default(0),
  totalTokensUsed: integer('total_tokens_used').default(0),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: blob('value', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  schemaVersion: integer('schema_version').default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull().unique(),
  storageKey: text('storage_key').notNull(),
  isValid: integer('is_valid', { mode: 'boolean' }).default(false),
  lastValidated: integer('last_validated', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const oauthTokens = sqliteTable('oauth_tokens', {
  id: integer('id').primaryKey().default(1),
  accessTokenKey: text('access_token_key').notNull(),
  refreshTokenKey: text('refresh_token_key').notNull(),
  expiry: integer('expiry', { mode: 'timestamp' }),
  scope: text('scope'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  refreshedAt: integer('refreshed_at', { mode: 'timestamp' }),
});
