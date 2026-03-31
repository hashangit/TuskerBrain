# Direct SQL Anti-Pattern Audit

**Date:** 2026-03-30
**Scope:** All source files (excluding `node_modules/`, `__tests__/`, `database/migrations/`)
**Method:** 4 parallel agents searched for raw SQL strings, direct `better-sqlite3` usage, `db.execute`/raw query patterns, and Drizzle vs non-Drizzle import mapping. Findings cross-verified manually.

## Executive Summary

The main application code is clean — all 7 repositories use Drizzle ORM exclusively through the `TuskerBrainDatabase` wrapper. Anti-patterns are limited to **seed files** and the **database wrapper itself**, which exposes raw SQL escape hatches.

## Confirmed Anti-Pattern Instances

| # | File | Lines | Pattern | Severity | Description |
|---|------|-------|---------|----------|-------------|
| 1 | `database/index.ts` | 44-73 | `execSql()` | Medium | Exposes raw SQL execution method on `TuskerBrainDatabase`. Splits on statement breakpoints and executes via `this.client.execute(statement)`. Bypasses Drizzle entirely. |
| 2 | `database/index.ts` | 79-81 | `run()` | Medium | Exposes raw parameterized SQL (`INSERT`/`UPDATE`/`DELETE`) via `this.client.execute({ sql, args })`. Bypasses Drizzle's type-safe insert/update builders. |
| 3 | `database/index.ts` | 87-89 | `get()` | Medium | Exposes raw `SELECT` via `this.client.execute({ sql, args })`. Returns untyped `Row`. Bypasses Drizzle's type-safe select builder. |
| 4 | `database/seeder.ts` | 238-244 | `client.execute('DELETE FROM ...')` | Low | 7 `DELETE` statements to clear tables before seeding. Uses direct `@libsql/client`, not the Drizzle wrapper. |
| 5 | `database/seeder.ts` | 250, 271, 289, 306, 322, 331, 341 | `client.execute({ sql: 'INSERT INTO ...', args })` | Low | ~30 parameterized `INSERT` statements for topics, emails, timeline updates, deals, email_topics, topic summaries, and sender summaries. Uses direct `@libsql/client`. |
| 6 | `database/seed.ts` | 145-151 | `client.execute('DELETE FROM ...')` | Low | 7 `DELETE` statements to clear tables. Same pattern as seeder.ts. |
| 7 | `database/seed.ts` | 155-236 | `client.execute({ sql: 'INSERT INTO ...', args })` | Low | ~30 parameterized `INSERT` statements (duplicates of seeder.ts logic with slightly different data). |
| 8 | `database/seed-march-23-24.ts` | 8 | `import { createClient } from '@libsql/client'` | Low | Creates its own direct libsql connection instead of using `TuskerBrainDatabase`. Contains ~5 additional raw SQL operations. |

## Clean Areas (No Issues Found)

| Area | Files | Status |
|------|-------|--------|
| `core/repositories/emails.ts` | 1 | Uses Drizzle `select()`, `insert()`, `update()` |
| `core/repositories/timeline.ts` | 1 | Uses Drizzle with complex joins |
| `core/repositories/deals.ts` | 1 | Uses Drizzle `insert()`, `select()`, `update()` |
| `core/repositories/topics.ts` | 1 | Uses Drizzle query builders |
| `core/repositories/summaries.ts` | 1 | Uses Drizzle query builders |
| `core/repositories/sync-state.ts` | 1 | Uses Drizzle query builders |
| `core/repositories/labels.ts` | 1 | Uses Drizzle query builders |
| `database/schema.ts` | 1 | Proper Drizzle schema definitions |
| `electron/main.ts` | 1 | Creates centralized `TuskerBrainDatabase` instance, passes to repos |
| `core/orchestrator.ts` | 1 | Uses repositories, no direct DB access |

## Impact Analysis

### High Priority
None — no production application code bypasses Drizzle ORM.

### Medium Priority
- **`database/index.ts` escape-hatch methods** (`execSql`, `run`, `get`): These exist as a convenience layer but enable bypassing Drizzle's type safety. Used primarily by test files. Consider deprecating or restricting access.

### Low Priority
- **Seed files** (`seeder.ts`, `seed.ts`, `seed-march-23-24.ts`): These are one-time utility scripts, not application code. They bypass Drizzle for simplicity during data seeding. Low risk since they're not imported by the main app.

## Recommendations

1. **Seed files**: Refactor to use `TuskerBrainDatabase` + Drizzle ORM for type consistency and to avoid maintaining raw SQL column mappings that could drift from the schema.
2. **Wrapper escape hatches**: Consider marking `execSql()`, `run()`, `get()` as `@internal` or moving them behind a separate `RawSqlAccess` interface to make the anti-pattern explicit.
3. **Test files** (not in scope): Many tests use `db.run()` and `db.get()` for setup — consider adding repository-level test helpers to reduce raw SQL in tests.
