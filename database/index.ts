import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { app } from 'electron';
import path from 'path';

const dbPath = app
  ? path.join(app.getPath('userData'), 'tuskerbrain.db')
  : ':memory:';

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });

export * from './schema';
