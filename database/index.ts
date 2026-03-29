export * from './schema';
export * from './deals';

import { createClient, type Client, type ResultSet, type Row } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { emails } from './schema';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import type { JobQueue } from '@core/jobs/queue';

/**
 * Database wrapper class for SQLite with Drizzle ORM
 */
export class TuskerBrainDatabase {
  private dbPath: string;
  private client: Client;
  private drizzleDb: ReturnType<typeof drizzle>;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || ':memory:';
    const url = this.dbPath === ':memory:' ? ':memory:' : 'file:' + this.dbPath;
    this.client = createClient({ url });
    this.drizzleDb = drizzle(this.client, { schema });
  }

  /**
   * Get the database instance for Drizzle ORM
   */
  getDatabase(): ReturnType<typeof drizzle> {
    return this.drizzleDb;
  }

  /**
   * Execute raw SQL without parameters
   * Handles multi-statement SQL by splitting on semicolons
   */
  async execSql(sql: string): Promise<void> {
    // Split on Drizzle's statement-breakpoint markers first
    const segments = sql.split(/\s*--> statement-breakpoint\s*/);

    const statements: string[] = [];
    for (const segment of segments) {
      // Strip comment-only lines, keep actual SQL
      const lines = segment.split('\n');
      const sqlLines: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        if (trimmed.startsWith('--')) continue;
        sqlLines.push(line);
      }
      const cleaned = sqlLines.join('\n').trim();
      if (!cleaned) continue;

      // Remove trailing semicolon
      const statement = cleaned.replace(/;\s*$/, '');
      if (statement.length > 0) {
        statements.push(statement);
      }
    }

    // Execute each statement
    for (const statement of statements) {
      await this.client.execute(statement);
    }
  }

  /**
   * Execute raw SQL with parameters (INSERT, UPDATE, DELETE)
   * Returns the full ResultSet from libsql including rowsAffected and lastInsertRowid.
   */
  async run(sql: string, args?: any[]): Promise<ResultSet> {
    return this.client.execute({ sql, args });
  }

  /**
   * Execute raw SQL with parameters and return first row (SELECT)
   * Returns undefined if no rows match.
   */
  async get(sql: string, args?: any[]): Promise<Row | undefined> {
    const result = await this.client.execute({ sql, args });
    return result.rows[0];
  }

  /**
   * Initialize the database by running migrations
   */
  async initialize(): Promise<void> {
    const migrationsFolder = path.join(__dirname, 'migrations');
    await migrate(this.drizzleDb, { migrationsFolder });
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    this.client.close();
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
