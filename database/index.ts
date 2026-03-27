export * from './schema';
export * from './deals';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { emails } from './schema';
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
   * Initialize the database by running migrations
   */
  async initialize(): Promise<void> {
    const migrationsFolder = path.join(__dirname, 'migrations');
    migrate(this.drizzleDb, { migrationsFolder });
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
