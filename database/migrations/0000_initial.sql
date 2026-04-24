CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`storage_key` text NOT NULL,
	`is_valid` integer DEFAULT false,
	`last_validated` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_provider_unique` ON `api_keys` (`provider`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`details` blob,
	`tokens_used` integer,
	`duration_ms` integer,
	`created_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `deals` (
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
	`created_at` integer,
	`is_active` integer DEFAULT true,
	`used_at` integer,
	`dismissed_at` integer,
	`deal_link` text,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_labels` (
	`email_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`email_id`, `label_id`),
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `gmail_labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_topics` (
	`email_id` text NOT NULL,
	`topic_id` text NOT NULL,
	`confidence_score` real,
	PRIMARY KEY(`email_id`, `topic_id`),
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `emails` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sender_email` text NOT NULL,
	`sender_name` text,
	`sender_domain` text NOT NULL,
	`subject` text,
	`snippet` text,
	`body_plain` text,
	`body_html` text,
	`received_at` integer NOT NULL,
	`email_type` text,
	`gmail_category` text,
	`is_important` integer DEFAULT false,
	`is_read` integer DEFAULT false,
	`is_archived` integer DEFAULT false,
	`is_deleted` integer DEFAULT false,
	`is_processed` integer DEFAULT false,
	`processed_at` integer,
	`message_id_header` text,
	`references_header` text,
	`in_reply_to_header` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `gmail_labels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`label_source` text,
	`label_type` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gmail_labels_name_unique` ON `gmail_labels` (`name`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` blob NOT NULL,
	`email_id` text,
	`result` blob,
	`error` text,
	`error_stack` text,
	`retry_count` integer DEFAULT 0,
	`max_retries` integer DEFAULT 3,
	`scheduled_at` integer,
	`created_at` integer,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`access_token_key` text NOT NULL,
	`refresh_token_key` text NOT NULL,
	`expiry` integer,
	`scope` text,
	`created_at` integer,
	`refreshed_at` integer
);
--> statement-breakpoint
CREATE TABLE `sender_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_domain` text NOT NULL,
	`summary` text NOT NULL,
	`word_count` integer,
	`last_updated` integer,
	`last_email_id` text,
	`update_count` integer DEFAULT 0,
	FOREIGN KEY (`last_email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sender_summaries_sender_domain_unique` ON `sender_summaries` (`sender_domain`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` blob NOT NULL,
	`schema_version` integer DEFAULT 1,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`history_id` text,
	`last_full_sync` integer,
	`last_incremental_sync` integer,
	`total_emails_processed` integer DEFAULT 0,
	`total_tokens_used` integer DEFAULT 0,
	`is_paused` integer DEFAULT false,
	`backfill_jobs` blob
);
--> statement-breakpoint
CREATE TABLE `timeline_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`summary` text,
	`priority` text,
	`sentiment` text,
	`urgency` integer DEFAULT false,
	`importance_reason` text,
	`action_item` integer DEFAULT false,
	`action_item_title` text,
	`action_item_completed` integer DEFAULT false,
	`action_item_completed_at` integer,
	`follow_up_date` text,
	`financial_impact` real,
	`key_entities` blob,
	`created_at` integer,
	FOREIGN KEY (`email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `topic_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`summary` text NOT NULL,
	`word_count` integer,
	`last_updated` integer,
	`last_email_id` text,
	`update_count` integer DEFAULT 0,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`last_email_id`) REFERENCES `emails`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topic_summaries_topic_id_unique` ON `topic_summaries` (`topic_id`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`full_path` text NOT NULL,
	`email_count` integer DEFAULT 0,
	`gmail_label_id` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topics_full_path_unique` ON `topics` (`full_path`);--> statement-breakpoint
CREATE INDEX `idx_topics_parent_id` ON `topics` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_topics_name` ON `topics` (`name`);