-- Current timestamp used for all default values (milliseconds)
-- This migration creates all tables. Uses IF NOT EXISTS for compatibility with existing databases.

CREATE TABLE IF NOT EXISTS `emails` (
  `id` text PRIMARY KEY NOT NULL,
  `thread_id` text NOT NULL,
  `sender_email` text NOT NULL,
  `sender_name` text,
  `sender_domain` text NOT NULL,
  `subject` text,
  `snippet` text,
  `received_at` integer NOT NULL,
  `email_type` text,
  `gmail_category` text,
  `is_important` integer DEFAULT 0,
  `is_read` integer DEFAULT 0,
  `is_archived` integer DEFAULT 0,
  `is_deleted` integer DEFAULT 0,
  `is_processed` integer DEFAULT 0,
  `processed_at` integer,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `timeline_updates` (
  `id` text PRIMARY KEY NOT NULL,
  `email_id` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `summary` text,
  `priority` text,
  `sentiment` text,
  `urgency` integer DEFAULT 0,
  `importance_reason` text,
  `action_item` integer DEFAULT 0,
  `action_item_title` text,
  `follow_up_date` text,
  `financial_impact` real,
  `key_entities` blob,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `deals` (
  `id` text PRIMARY KEY NOT NULL,
  `email_id` text NOT NULL,
  `deal_title` text NOT NULL,
  `deal_description` text,
  `brand_name` text NOT NULL,
  `deal_category` text,
  `deal_value` text,
  `deal_value_type` text,
  `deal_code` text,
  `minimum_purchase` text,
  `deal_expiry` integer,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  `is_active` integer DEFAULT 1,
  `used_at` integer,
  `dismissed_at` integer,
  `deal_link` text,
  FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `topics` (
  `id` text PRIMARY KEY NOT NULL,
  `parent_id` text,
  `name` text NOT NULL,
  `full_path` text NOT NULL UNIQUE,
  `email_count` integer DEFAULT 0,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (`parent_id`) REFERENCES `topics`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `email_topics` (
  `email_id` text NOT NULL,
  `topic_id` text NOT NULL,
  `confidence_score` real,
  PRIMARY KEY (`email_id`, `topic_id`),
  FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON DELETE cascade,
  FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `topic_summaries` (
  `id` text PRIMARY KEY NOT NULL,
  `topic_id` text NOT NULL UNIQUE,
  `summary` text NOT NULL,
  `word_count` integer,
  `last_updated` integer DEFAULT (strftime('%s', 'now') * 1000),
  `last_email_id` text,
  `update_count` integer DEFAULT 0,
  FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE cascade,
  FOREIGN KEY (`last_email_id`) REFERENCES `emails`(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `sender_summaries` (
  `id` text PRIMARY KEY NOT NULL,
  `sender_domain` text NOT NULL UNIQUE,
  `summary` text NOT NULL,
  `word_count` integer,
  `last_updated` integer DEFAULT (strftime('%s', 'now') * 1000),
  `last_email_id` text,
  `update_count` integer DEFAULT 0,
  FOREIGN KEY (`last_email_id`) REFERENCES `emails`(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `payload` blob NOT NULL,
  `email_id` text,
  `result` blob,
  `error` text,
  `error_stack` text,
  `retry_count` integer DEFAULT 0,
  `max_retries` integer DEFAULT 3,
  `scheduled_at` integer,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  `started_at` integer,
  `completed_at` integer,
  FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `job_id` text,
  `action` text NOT NULL,
  `entity_type` text,
  `entity_id` text,
  `details` blob,
  `tokens_used` integer,
  `duration_ms` integer,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `gmail_labels` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL UNIQUE,
  `type` text,
  `label_type` text,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `email_labels` (
  `email_id` text NOT NULL,
  `label_id` text NOT NULL,
  PRIMARY KEY (`email_id`, `label_id`),
  FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON DELETE cascade,
  FOREIGN KEY (`label_id`) REFERENCES `gmail_labels`(`id`) ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `sync_state` (
  `id` integer PRIMARY KEY DEFAULT 1,
  `history_id` text,
  `last_full_sync` integer,
  `last_incremental_sync` integer,
  `total_emails_processed` integer DEFAULT 0,
  `total_tokens_used` integer DEFAULT 0,
  `is_paused` integer DEFAULT 0,
  `backfill_jobs` blob
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` blob NOT NULL,
  `schema_version` integer DEFAULT 1,
  `updated_at` integer DEFAULT (strftime('%s', 'now') * 1000)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `api_keys` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL UNIQUE,
  `storage_key` text NOT NULL,
  `is_valid` integer DEFAULT 0,
  `last_validated` integer,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `oauth_tokens` (
  `id` integer PRIMARY KEY DEFAULT 1,
  `access_token_key` text NOT NULL,
  `refresh_token_key` text NOT NULL,
  `expiry` integer,
  `scope` text,
  `created_at` integer DEFAULT (strftime('%s', 'now') * 1000),
  `refreshed_at` integer
);
--> statement-breakpoint

-- Indexes
CREATE INDEX IF NOT EXISTS `idx_emails_received_at` ON `emails` (`received_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_emails_sender_domain` ON `emails` (`sender_domain`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_emails_email_type` ON `emails` (`email_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_emails_is_processed` ON `emails` (`is_processed`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_timeline_updates_email_id` ON `timeline_updates` (`email_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_timeline_updates_priority` ON `timeline_updates` (`priority`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_deals_deal_expiry` ON `deals` (`deal_expiry`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_deals_active_expiry` ON `deals` (`is_active`, `deal_expiry`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_deals_category` ON `deals` (`deal_category`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_deals_brand` ON `deals` (`brand_name`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jobs_status` ON `jobs` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_jobs_scheduled_at` ON `jobs` (`scheduled_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_email_topics_topic_id` ON `email_topics` (`topic_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_log_created_at` ON `audit_log` (`created_at` DESC);