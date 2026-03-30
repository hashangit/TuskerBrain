# Replace better-sqlite3 with @libsql/client

**Date:** 2026-03-29
**Status:** Approved
**Problem:** better-sqlite3 is a C++ native module that must be compiled for a specific Node.js ABI. Electron bundles its own Node.js runtime (NODE_MODULE_VERSION 143) while the system Node.js uses a different ABI (141). A single native binary cannot satisfy both, causing `pnpm dev` (Electron) and `pnpm test` (vitest) to be mutually exclusive after every rebuild.

---

## Decision

Replace `better-sqlite3` with `@libsql/client` (pure JS/WASM SQLite driver). No native modules means no ABI version conflicts. Works identically in Electron and plain Node.js.

## Architecture

**Before:**
```
better-sqlite3 (C++ native, sync)
  -> drizzle-orm/better-sqlite3
    -> Drizzle ORM queries
```

**After:**
```
@libsql/client (pure JS/WASM, async)
  -> drizzle-orm/libsql
    -> Drizzle ORM queries (unchanged)
```

All Drizzle queries (`db.select()`, `db.insert()`, `db.update()`, `db.delete()`) remain identical. Only the driver initialization and raw SQL access methods change.

## Design Principles

1. **Drizzle everywhere** - single query pattern, no raw SQL unless absolutely necessary (migrations)
2. **Async everywhere** - libsql is async-native, no sync API surface
3. **No native modules** - eliminate C++ compilation and ABI issues permanently

## Changes by File

### 1. `database/index.ts` - Driver Swap

Replace:
```typescript
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
```

With:
```typescript
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
```

**TuskerBrainDatabase API changes:**

| Method | Before | After |
|--------|--------|-------|
| Constructor | `new Database(path)` (sync) | `createClient({ url: 'file:' + path })` (sync creation) |
| `getSqlite()` | Returns raw `Database.Database` | **Removed** |
| `getDatabase()` | Returns Drizzle instance | Unchanged |
| `execSql(sql)` | N/A | **New**: `await client.execute(sql)` for raw SQL |
| `run(sql, args)` | N/A | **New**: `await client.execute({ sql, args })` for parameterized SQL |
| `get(sql, args)` | N/A | **New**: `await client.execute({ sql, args })` returning first row |
| `initialize()` | Drizzle migrate | Unchanged (uses Drizzle migrator internally) |
| `close()` | `this.sqlite.close()` | `this.client.close()` |

For `:memory:` databases: libsql uses `file::memory:?cache=shared` or creates a temp file. Tests that need in-memory should use `file::memory:` URL format.

### 2. `core/repositories/sync-state.ts` - Convert to Drizzle Queries

All raw SQL (`getSqlite().prepare()`) converts to Drizzle queries using the existing `syncState` schema definition:

- `load()`: `drizzle.select().from(syncState).where(eq(syncState.id, 1))`
- `save()`: `drizzle.insert(syncState).values(...).onConflictDoUpdate(...)` (upsert pattern)

The comments about "Drizzle not returning values correctly" were caused by better-sqlite3's synchronous driver conflicting with Drizzle's async API. With libsql (async-native), Drizzle returns values correctly.

### 3. Seed Files - Convert to libsql Client

Files: `database/seed.ts`, `database/seed-march-23-24.ts`, `database/seeder.ts`

Replace `new Database(path)` with `createClient({ url: 'file:' + path })`. Convert `sqlite.prepare().run()` patterns to `await client.execute({ sql, args })`.

### 4. Test Files - Async Migration Pattern

~20 test files that call `db.getSqlite().exec()` or `db.getSqlite().prepare()`.

**Migration pattern:**
```typescript
// Before
db.getSqlite().exec(fs.readFileSync(MIGRATION_PATH, 'utf-8'));

// After
await db.execSql(fs.readFileSync(MIGRATION_PATH, 'utf-8'));
```

**Setup data pattern:**
```typescript
// Before
db.getSqlite().prepare('INSERT INTO ... VALUES (?, ?)').run(a, b);

// After
await db.run('INSERT INTO ... VALUES (?, ?)', [a, b]);
```

**Query pattern:**
```typescript
// Before
const row = db.getSqlite().prepare('SELECT * FROM ... WHERE id = ?').get(id);

// After
const row = await db.get('SELECT * FROM ... WHERE id = ?', [id]);
```

### 5. `package.json` - Dependency Cleanup

**Remove:**
- `better-sqlite3` (dependency)
- `@types/better-sqlite3` (devDependency)
- `@electron/rebuild` (devDependency)
- `postinstall` script (`electron-rebuild -f -w better-sqlite3`)
- `rebuild` script (`electron-rebuild -f -w better-sqlite3`)
- `pnpm.onlyBuiltDependencies` section (no more native builds)

**Add:**
- `@libsql/client` (dependency)

### 6. `vite.config.ts` - External Modules

Replace `better-sqlite3` with `@libsql/client` in `rollupOptions.external` array.

## Files Affected

**Production code (6 files):**
- `database/index.ts` - driver swap
- `core/repositories/sync-state.ts` - convert raw SQL to Drizzle
- `database/seed.ts` - convert to libsql client
- `database/seed-march-23-24.ts` - convert to libsql client
- `database/seeder.ts` - convert to libsql client
- `vite.config.ts` - update externals

**Test files (~20 files):**
- All files in `__tests__/features-pov/` that call `getSqlite()`
- All files in `__tests__/features-pov/scenarios/` that call `getSqlite()`
- All files in `__tests__/features-pov/edge-cases/` that call `getSqlite()`
- `__tests__/repositories/` files
- `__tests__/tmp/test-sync-state-isPaused.test.ts`

**Config (2 files):**
- `package.json` - dependency and script changes
- `vitest.config.ts` - no changes needed (already uses node environment)

## Verification

After implementation:
1. `pnpm test` - all 1,051 tests pass
2. `pnpm dev` - Electron app starts and connects to database
3. No `better-sqlite3` references remain in the codebase
4. No `@electron/rebuild` dependency
5. No `postinstall` script that rebuilds native modules
