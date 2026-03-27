# Database Implementation Issues

**Audited**: 2026-03-28
**Validated**: 2026-03-28
**Scope**: `database/`, `core/repositories/`, `electron/ipc/`, seeders

---

## Open Issues

### H3. `async` Wrapper on Synchronous Library
**Files**: All repositories
**Status**: Deferred — cosmetic, not functional

`better-sqlite3` is entirely synchronous, yet every repository method is `async`. This adds unnecessary microtask overhead and misleadingly implies I/O-bound operations. The Drizzle wrapper for better-sqlite3 also returns synchronously — these should not be awaited.

### H5. Topics Self-Referencing FK — Blocked by Drizzle
**Files**: `database/schema.ts:70`
**Status**: Blocked — TypeScript TS2577 circular reference

The design doc specifies `parent_id TEXT REFERENCES topics(id) ON DELETE SET NULL`. Drizzle ORM triggers a circular type error when a table references itself via the builder API. See the inline comment in `schema.ts` for details. The `TopicsRepository` handles parent deletion in application code as a workaround.

---

## Fixed (2026-03-28)

| Issue | Description | Fix |
|-------|-------------|-----|
| C1 | Dual DDL/Drizzle source of truth | Replaced raw SQL with Drizzle `migrate()` |
| C2 | Timestamp mode mismatch (year 56000+) | Changed all columns to `timestamp_ms` |
| C3 | `@ts-nocheck` on 3 repository files | Removed, fixed all type errors |
| H1 | No transactions on multi-table ops | Added `db.transaction()` to critical paths |
| H2 | Dead channel definitions in channels.ts | Removed unused `DB_*` entries |
| H4 | Missing composite PKs on junction tables | Added `primaryKey()` to `emailTopics`, `emailLabels` |
| M1 | Types file used `$inferInsert` only | Now exports both `$inferSelect` and `$inferInsert` |
| M2 | Duplicate type definitions | Consolidated to single source, re-exported |
| M3 | Labels `count()` returned ID, not count | Fixed to `sql<number>\`count(*)\`` |
| M4 | Dead `inClause` variable in `getTopicDetail` | Removed |
| M5 | Timeline `findAll` produced duplicate rows | Two-query approach with `TopicInfo` |
| M6 | `findExpiring` compared int vs ISO string | Fixed to compare ms timestamps |
| M7 | seed.ts wrote `emailCount` to `update_count` | Fixed to use `1` |
| L1 | Unused `app` import in database/index.ts | Removed with DDL deletion |
| L2 | No migration strategy | Added Drizzle migrations + `migrate()` |
