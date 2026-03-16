export * from './schema';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { emails } from './schema';
import { app } from 'electron';
import path from 'path';

import type { JobQueue } from '@core/jobs/queue';

/**
 * Database wrapper class for SQLite with Drizzle ORM
 */
export class TuskerBrainDatabase {
  private dbPath: string;
  private sqlite: Database.Database;
  private drizzleDb: ReturnType<typeof drizzle>;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || ':memory:';
    this.sqlite = new Database(this.dbPath);
    this.sqlite.pragma('journal_mode = WAL');
    this.drizzleDb = drizzle(this.sqlite, { schema });
  }

  /**
   * Get the database instance for Drizzle ORM
   */
  getDatabase(): ReturnType<typeof drizzle> {
    return this.drizzleDb;
  }

  /**
   * Get the raw SQLite instance for direct queries
   */
  getSqlite(): Database.Database {
    return this.sqlite;
  }

  /**
   * Initialize the database and create tables if needed
   */
  async initialize(): Promise<void> {
    // Create tables from schema for in-memory or new databases
    this.createTables();
  }

  /**
   * Create tables from schema definitions
   */
  private createTables(): void {
    // Create emails table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        sender_name TEXT,
        sender_domain TEXT NOT NULL,
        subject TEXT,
        snippet TEXT,
        received_at INTEGER NOT NULL,
        email_type TEXT,
        gmail_category TEXT,
        is_important INTEGER DEFAULT 0,
        is_read INTEGER DEFAULT 0,
        is_archived INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        is_processed INTEGER DEFAULT 0,
        processed_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Create jobs table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload BLOB NOT NULL,
        email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
        result BLOB,
        error TEXT,
        error_stack TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        scheduled_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        started_at INTEGER,
        completed_at INTEGER
      )
    `);

    // Create audit_log table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details BLOB,
        tokens_used INTEGER,
        duration_ms INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Create sync_state table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        history_id TEXT,
        last_full_sync INTEGER,
        last_incremental_sync INTEGER,
        total_emails_processed INTEGER DEFAULT 0,
        total_tokens_used INTEGER DEFAULT 0
      )
    `);

    // Create topics table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS topics (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        name TEXT NOT NULL,
        full_path TEXT NOT NULL UNIQUE,
        email_count INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Create email_topics junction table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS email_topics (
        email_id TEXT NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
        topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
        confidence_score REAL,
        PRIMARY KEY (email_id, topic_id)
      )
    `);

    // Create settings table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value BLOB NOT NULL,
        schema_version INTEGER DEFAULT 1,
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Create timeline_updates table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS timeline_updates (
        id TEXT PRIMARY KEY,
        email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        summary TEXT,
        priority TEXT CHECK(priority IN ('high', 'medium', 'low')),
        sentiment TEXT CHECK(sentiment IN ('positive', 'negative', 'neutral')),
        urgency INTEGER DEFAULT 0,
        importance_reason TEXT,
        action_item INTEGER DEFAULT 0,
        action_item_title TEXT,
        follow_up_date TEXT,
        financial_impact DECIMAL(10,2),
        key_entities TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Create deals table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS deals (
        id TEXT PRIMARY KEY,
        email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
        deal_title TEXT NOT NULL,
        deal_description TEXT,
        brand_name TEXT,
        deal_value TEXT,
        deal_code TEXT,
        deal_expiry TEXT,
        deal_link TEXT,
        minimum_purchase TEXT,
        deal_category TEXT,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Create topic_summaries table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS topic_summaries (
        id TEXT PRIMARY KEY,
        topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE UNIQUE,
        summary TEXT NOT NULL,
        word_count INTEGER,
        last_updated INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        last_email_id TEXT REFERENCES emails(id),
        update_count INTEGER DEFAULT 0
      )
    `);

    // Create sender_summaries table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sender_summaries (
        id TEXT PRIMARY KEY,
        sender_domain TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL,
        word_count INTEGER,
        last_updated INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        last_email_id TEXT REFERENCES emails(id),
        update_count INTEGER DEFAULT 0
      )
    `);

    // Create gmail_labels table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS gmail_labels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT CHECK(type IN ('system', 'user')),
        label_type TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Create email_labels junction table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS email_labels (
        email_id TEXT REFERENCES emails(id) ON DELETE CASCADE,
        label_id TEXT REFERENCES gmail_labels(id) ON DELETE CASCADE,
        PRIMARY KEY (email_id, label_id)
      )
    `);

    // Create api_keys table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL UNIQUE,
        storage_key TEXT NOT NULL,
        is_valid INTEGER DEFAULT 0,
        last_validated INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Create oauth_tokens table
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        access_token_key TEXT NOT NULL,
        refresh_token_key TEXT NOT NULL,
        expiry INTEGER,
        scope TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        refreshed_at INTEGER
      )
    `);

    // Create indexes for performance
    this.createIndexes();
  }

  /**
   * Create indexes for better query performance
   */
  private createIndexes(): void {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_emails_sender_domain ON emails(sender_domain)',
      'CREATE INDEX IF NOT EXISTS idx_emails_email_type ON emails(email_type)',
      'CREATE INDEX IF NOT EXISTS idx_emails_is_processed ON emails(is_processed)',
      'CREATE INDEX IF NOT EXISTS idx_timeline_updates_priority ON timeline_updates(priority)',
      'CREATE INDEX IF NOT EXISTS idx_deals_deal_expiry ON deals(deal_expiry)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON jobs(scheduled_at)',
      'CREATE INDEX IF NOT EXISTS idx_email_topics_topic_id ON email_topics(topic_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC)',
    ];

    for (const indexSql of indexes) {
      this.sqlite.exec(indexSql);
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    this.sqlite.close();
  }
}

export type Database = TuskerBrainDatabase;

/**
 * Recover unprocessed jobs from source data.
 * Recovers jobs that were created for unprocessed emails.
 */
export async function recoverUnprocessedJobs(
  db: TuskerBrainDatabase,
  jobQueue: JobQueue
): Promise<number> {
  // Find all unprocessed emails
  const unprocessed = await db.getDatabase()
    .select()
    .from(emails)
    .where(eq(emails.isProcessed, false));

  if (unprocessed.length === 0) {
    return 0;
  }

  // Create jobs for unprocessed emails
  for (const email of unprocessed) {
    await jobQueue.createJob({
      type: 'email_process',
      payload: { emailId: email.id },
      emailId: email.id,
    });
  }

  return unprocessed.length;
}
