import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { TuskerBrainDatabase } from '@foundations/database';
import { createRepositories, type Repositories } from '@foundations/persistence';

const MIGRATION_PATH = path.resolve(process.cwd(), 'foundations/database/migrations/0000_initial.sql');

describe('SyncStateRepository isPaused persistence', () => {
  let db: TuskerBrainDatabase;
  let repos: Repositories;

  beforeEach(async () => {
    db = new TuskerBrainDatabase(':memory:');
    await db.execSql(fs.readFileSync(MIGRATION_PATH, 'utf-8'));

    // Verify the is_paused column exists
    const schemaResult = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='sync_state'");
    console.log('sync_state schema:', schemaResult);

    repos = createRepositories(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('should persist and load isPaused', async () => {
    // First, try inserting directly with SQL to see if it works
    await db.run('INSERT INTO sync_state (id, history_id, total_emails_processed, total_tokens_used, is_paused) VALUES (1, ?, ?, ?, ?)', ['test-history-sql', 10, 100, 1]);

    const rawAfterSql = await db.get('SELECT * FROM sync_state WHERE id = 1');
    console.log('Raw database after SQL insert:', JSON.stringify(rawAfterSql, null, 2));
    expect(rawAfterSql.is_paused).toBe(1);

    // Clear the row
    await db.run('DELETE FROM sync_state WHERE id = 1');

    // Now try with Drizzle
    await repos.syncState.save({
      historyId: 'test-history',
      totalEmailsProcessed: 10,
      totalTokensUsed: 100,
      isPaused: true,
    });

    // Load and verify
    const loaded = await repos.syncState.load();
    console.log('Loaded state:', JSON.stringify(loaded, null, 2));
    expect(loaded.isPaused).toBe(true);

    // Check raw database
    const raw = await db.get('SELECT * FROM sync_state WHERE id = 1');
    console.log('Raw database after Drizzle:', JSON.stringify(raw, null, 2));
    expect(raw.is_paused).toBe(1);
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
    console.log('Loaded state:', JSON.stringify(loaded, null, 2));
    expect(loaded.isPaused).toBe(false);

    // Check raw database
    const raw = await db.get('SELECT * FROM sync_state WHERE id = 1');
    console.log('Raw database:', JSON.stringify(raw, null, 2));
    expect(raw.is_paused).toBe(0);
  });
});
