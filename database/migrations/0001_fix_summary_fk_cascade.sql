-- Migration: Fix FK constraints on sender_summaries and topic_summaries
-- Issue: lastEmailId FK had no ON DELETE clause, defaulting to RESTRICT
-- Fix: Add ON DELETE SET NULL so emails can be deleted without breaking FK constraint
-- Note: SQLite doesn't support ALTER TABLE to add FK, so we recreate tables

PRAGMA foreign_keys=OFF;

-- Recreate sender_summaries with ON DELETE SET NULL on lastEmailId
CREATE TABLE sender_summaries_new (
  id text PRIMARY KEY NOT NULL,
  sender_domain text NOT NULL UNIQUE,
  summary text NOT NULL,
  word_count integer,
  last_updated integer,
  last_email_id text REFERENCES emails(id) ON DELETE SET NULL,
  update_count integer DEFAULT 0
);

INSERT INTO sender_summaries_new SELECT * FROM sender_summaries;
DROP TABLE sender_summaries;
ALTER TABLE sender_summaries_new RENAME TO sender_summaries;
CREATE UNIQUE INDEX sender_summaries_sender_domain_unique ON sender_summaries (sender_domain);

-- Recreate topic_summaries with ON DELETE SET NULL on lastEmailId
CREATE TABLE topic_summaries_new (
  id text PRIMARY KEY NOT NULL,
  topic_id text NOT NULL UNIQUE REFERENCES topics(id) ON DELETE CASCADE,
  summary text NOT NULL,
  word_count integer,
  last_updated integer,
  last_email_id text REFERENCES emails(id) ON DELETE SET NULL,
  update_count integer DEFAULT 0
);

INSERT INTO topic_summaries_new SELECT * FROM topic_summaries;
DROP TABLE topic_summaries;
ALTER TABLE topic_summaries_new RENAME TO topic_summaries;
CREATE UNIQUE INDEX topic_summaries_topic_id_unique ON topic_summaries (topic_id);

PRAGMA foreign_keys=ON;
