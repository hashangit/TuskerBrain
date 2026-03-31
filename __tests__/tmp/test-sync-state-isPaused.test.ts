import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TuskerBrainDatabase } from '@db/index';
import { eq } from 'drizzle-orm';
import * as schema from '@db/schema';
import { createRepositories, type Repositories } from '@core/repositories';

describe('SyncStateRepository isPaused persistence', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.initialize();
    repos = createRepositories(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('should persist and load isPaused', async () => {
    // Insert directly with Drizzle ORM
    await db.getDatabase().insert(schema.syncState).values({
      id: 1,
      historyId: 'test-history-sql',
      totalEmailsProcessed: 10,
      totalTokensUsed: 100,
      isPaused: true,
    });

    const rawAfterSql = await db.getDatabase().select().from(schema.syncState).where(eq(schema.syncState.id, 1));
    expect(rawAfterSql[0].isPaused).toBe(true);

    // Clear the row
    await db.getDatabase().delete(schema.syncState).where(eq(schema.syncState.id, 1));

    // Now try with repository
    await repos.syncState.save({
      historyId: 'test-history',
      totalEmailsProcessed: 10,
      totalTokensUsed: 100,
      isPaused: true,
    });

    // Load and verify
    const loaded = await repos.syncState.load();
    expect(loaded.isPaused).toBe(true);

    // Check via Drizzle
    const raw = await db.getDatabase().select().from(schema.syncState).where(eq(schema.syncState.id, 1));
    expect(raw[0].isPaused).toBe(true);
  });

  it('should persist false and load isPaused', async () => {
    // Save with isPaused = false
    await repos.syncState.save({
      historyId: 'test-history-2',
      totalEmailsProcessed: 20,
      totalTokensUsed: 200,
      isPaused: false,
    });

    // Load and verify
    const loaded = await repos.syncState.load();
    expect(loaded.isPaused).toBe(false);

    // Check via Drizzle
    const raw = await db.getDatabase().select().from(schema.syncState).where(eq(schema.syncState.id, 1));
    expect(raw[0].isPaused).toBe(false);
  });
});
