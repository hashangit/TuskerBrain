export * from './schema';

import { createClient, type Client } from '@libsql/client';
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
