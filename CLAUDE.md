# Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Architecture & Boundaries (TuskerBrain)

These rules exist to prevent the specific failure modes already documented in
`docs/reviews/architecture-assessment-2026-04-25.md`. Each rule is the
positive form of a real defect found in this codebase. Treat violations as
defects, not preferences.

### Process & module map

```
src/  (renderer)  ──IPC──▶  electron/  (main)  ──messages──▶  electron/utility/  (worker)
                                  │
                                  ▼
                              core/  (domain logic; no Electron, no React)
                                  │
                                  ▼
                              database/  (Drizzle schema + generated types only)
```

### Layer rules — enforced by import direction

- `src/` imports only from `src/`. **Never** from `database/`, `core/`, or
  `electron/`. The renderer talks to main only through `window.electronAPI`.
  If you find yourself reaching into `database/` for a helper, the helper
  belongs in a `src/` hook, a `src/utils/` module, or behind a new IPC call.
- `electron/` may import from `core/` and `database/`. It is the orchestrator
  process and does no domain logic of its own. If a function in `electron/`
  is more than a thin wrapper over a `core/` call, the body belongs in `core/`.
- `core/` may import from `database/` (for schema/types) and from `core/`
  itself. It must not import from `electron/` or `src/`. Domain logic must
  remain runnable without Electron and without a browser.
- `database/` exports schema and Drizzle-generated types only. No business
  logic, no formatters, no filters, no domain helpers. If you are tempted to
  add `database/<concept>.ts` next to `core/repositories/<concept>.ts`, you
  are leaking domain logic into the schema layer — write it in `core/` instead.

### File size budgets

A file over **400 lines** is a smell; over **600 lines** is a defect.
Exceptions are tightly cohesive single-concern modules (one parser, one
state machine, one schema, one prompt). When a file approaches the budget,
**stop and split** before adding more — do not append to a god file because
that's where the imports already are. The four files that must shrink, not
grow, are: `electron/main.ts`, `src/App.tsx`, and the two big screens.

### Singletons & initialisation

Do not create module-level `let foo: T | null = null` followed by
initialisation in another function. A nullable module global forces every
consumer to bang-assert (`foo!`) or guard (`if (!foo) return`) — both are
noise that hides a contract violation. **A `!`-bang in a handler body is a
bug report.**

Instead:
- Inject the dependency through a constructor or function parameter, or
- Construct a single context object once at startup and pass it explicitly.

The same rule applies to `core/`: no `static` fields holding mutable state
on a class with instance methods. That is a singleton wearing an instance
trenchcoat. If state must persist for the life of the process, name that
explicitly with a single owner, constructed at boot.

### Module shape — public surface and composition

Every module under `core/`, `database/`, `electron/ipc/`, `src/components/ui/`,
and `src/hooks/` has an explicit public surface. Either it has an `index.ts`
that re-exports the public names, or its file is small enough that "everything
exported is public" is obvious from one glance.

- Internal helpers are not exported. If a function needs to be tested in
  isolation, write a public function that exercises it, or a test-only
  subclass under `__tests__/`.
- A consumer should be able to read a module's `index.ts` (or top of file)
  and know what the module does. If they have to read the implementation
  to find out, the surface is wrong.
- Prefer plain functions over classes unless state is genuinely shared
  across method calls. A class with one stateful field and three methods
  is usually three functions.
- Composition over inheritance. No deep class hierarchies; no abstract
  base classes with hooks for subclasses. If you reach for a base class,
  you probably want a function that takes a config.
- Don't wrap a third-party library to "abstract" it unless you have at
  least two real implementations behind the wrapper. Single-implementation
  wrappers are interface-with-one-impl ceremony.
- Barrel files (`index.ts`) re-export — they do not contain logic. If
  `index.ts` has more than re-exports, that logic belongs in a sibling
  file with a real name.

### Types as contracts

Types do most of the work that runtime checks would otherwise have to do.
Lean on them.

**Make illegal states unrepresentable.** Prefer types that cannot encode
invalid combinations.

- A `Status = 'idle' | 'syncing' | 'done' | 'error'` discriminated union
  beats four boolean fields (`isIdle`, `isSyncing`, `isDone`, `hasError`).
- A discriminated result (`{ kind: 'success', data: T } | { kind: 'error',
  error: E }`) beats `{ data?: T; error?: E; success?: boolean }`.
- A non-empty array type beats a `T[]` plus a runtime length check.
- If a type allows a state that can never legitimately exist, the type is
  wrong. Fix the type before writing runtime guards against the impossible.

**Parse, don't validate — at every boundary.** Untrusted input becomes a
trusted typed value at the boundary. Downstream code receives guarantees,
not obligations. The boundaries in this app are:

- IPC payloads (renderer ↔ main): zod-parse at the handler entry.
- Utility-process messages (main ↔ worker): zod-parse on receive.
- HTTP responses from external APIs (Gmail, LLM providers): zod-parse the
  response shape; do not trust the API's TypeScript types.
- Database rows: Drizzle's row types are a parse, but if a column needs
  domain interpretation (JSON-encoded fields, enum-like text columns),
  the repository parses it and returns the domain type — not the raw row.

A function that takes `unknown` is a function that has not done its job.
If you find yourself writing `if (typeof x === 'object' && x !== null &&
'foo' in x)` in domain code, the parse should have happened upstream.

### IPC contract discipline

- Every channel name lives **once**, in `electron/ipc/channels.ts`, as a
  `const` plus a paired `Request` / `Response` type.
- Every handler is **registered once**, in `electron/ipc/` — never inline in
  `main.ts`. New IPC handlers go in a domain file
  (`electron/ipc/<concept>.ts`), not in a god `handlers.ts`.
- Every payload is **validated at the boundary** with zod. Parse, don't
  validate: the handler body receives a parsed type, never `unknown`. The
  same applies to messages between main and the utility process.
- The renderer talks to main only through the typed wrapper in
  `src/hooks/ipc.ts` (or a child hook). No `window.electronAPI.invoke(<raw
  string>, …)` calls in components.

### Test code stays in test files

- Production classes must not contain methods named `simulate*`, `mock*`,
  `_test*`, or anything that exists only to make tests pass.
- If a test needs an unusual state, it constructs it through the same public
  API a real caller would, or via a test-only subclass under `__tests__/`.
- Mock data (e.g. `getMockTimelineData`) lives in `__tests__/fixtures/` or
  `src/__fixtures__/` — never inline in a production component, never
  shipped in the renderer bundle.

### Seeds, fixtures, and demo data

- Production seed lives in **one** file: `database/seeder.ts`. It is
  idempotent. Date-stamped or scenario-stamped seeds (e.g. `seed-march-23-24`)
  are test fixtures by definition and belong in `__tests__/fixtures/`.
- Fixtures live in `__tests__/fixtures/`. Do not create a parallel fixture
  system anywhere else.
- "Render with no real data" UI fallbacks are a debugging aid, not
  production code. They go behind a dev-only flag or in stories — not in
  the component file.

### One concept, one owner

- A concept (`deals`, `topics`, `senders`, …) is owned by **one** module in
  `core/repositories/`. Helpers, formatters, filters, type derivations all
  live with the repository.
- "for backward compat" re-exports are a symptom: when you write that
  comment, stop and consolidate to one source instead.
- Two functions that look alike but change for different reasons are not
  duplicates — leave them apart. Two functions that look alike *and* change
  for the same reason are duplicates — extract on the third write, not the
  second.

### State ownership

For every piece of state in the system, name the owner. State without an
owner becomes state with several owners that drift apart.

| Kind of state | Owner |
|---|---|
| User preferences (theme, sync interval, lookback) | `core/settings` (encrypted on disk) |
| API keys and secrets | `core/settings` (encrypted) |
| OAuth tokens | `core/auth/token-manager` (encrypted) |
| Domain data (emails, topics, deals, summaries) | SQLite via `core/repositories/*` |
| Sync history (`historyId`, last sync time) | `sync_state` table |
| Job state | `core/jobs/queue` (in-memory) + `audit_log` (in DB) |
| Renderer UI state (selection, filters, modal open) | React component state or zustand |
| Server-state cache in renderer | One hook per concept (`useDeals`, `useTimeline`) |

Rules that fall out of this:

- Do not duplicate state across owners. If the renderer needs a value the
  main process owns, fetch via IPC; do not mirror it into zustand.
- Do not hold the same data in two repositories. If two places appear to
  own the same thing, one is the real owner and the other is a cache —
  state which.
- Renderer-side caches must have a single invalidation path. Optimistic
  updates and IPC-confirmed results reconcile through the same code path,
  not two parallel ones.
- "I'll just keep a copy here for convenience" is the start of a drift bug.

### Don't hand-roll frameworks

Before writing a generic queue, scheduler, retry loop, event bus, DI
container, or workflow engine, check whether the language, the runtime, or
an already-installed dependency provides it. Hand-rolled framework code is
the most expensive form of speculative abstraction: it carries the
maintenance cost of a library with none of the testing or documentation.
If a feature needs persistence, use Drizzle. If it needs scheduling, use
the existing scheduler. If it needs an LLM workflow, use LangGraph. New
infrastructure requires explicit justification.

### Effects at the edges, pure core

Network, time, randomness, filesystem, IPC, and Electron APIs belong at the
boundary (`electron/`, the IPC layer, the auth/sync clients). The domain
core (`core/workflows`, `core/timeline/filter`, `core/processing`,
repositories' query-shaping logic) must remain deterministic and unit-
testable without mocking the world. If a function in `core/` reads
`Date.now()` directly, takes that as a parameter instead.

### Background work belongs in the worker

- Anything that takes more than ~50 ms of CPU, hits the network, or
  touches a large amount of data goes in the utility process as a job.
- The main process triggers jobs and forwards events. It does not run
  long-running work itself, because the main process also runs the
  Electron event loop and a hung handler hangs the UI.
- The renderer never does background work directly. It dispatches via IPC
  and observes via events.
- "Just doing it inline because the dependency is in scope" is not a
  reason — it is the reason `electron/main.ts` got to 1,732 lines.

### Schema as contract

The shape of `database/schema.ts` is a contract between `database/` and
`core/repositories/`, and indirectly with every consumer.

- Schema changes go through `pnpm db:generate`. Never hand-edit the
  generated SQL except to fix a generator bug.
- Migrations are append-only after they ship. If a migration is wrong,
  write a new migration that fixes forward — never rewrite history.
- `db:push` is for development scratch databases only. Never run it
  against a database that has real user data.
- A renamed or dropped column needs an explicit data-migration step in
  the new migration, not a runtime fallback in the repository.
- A schema change committed without a migration is a bug.
- Foreign keys, `NOT NULL`, and `ON DELETE CASCADE` belong in the schema,
  not in application code. If Drizzle's TypeScript builder can't express
  the constraint (e.g. self-references), use raw SQL inside the migration
  rather than papering over it in the repository.

### Cross-cutting concerns

For each cross-cutting concern, pick one place. Do not let a second one
appear.

- **Logging.** `electron-log`, configured once, imported elsewhere. No
  `console.log` in committed code. Detailed rules in section 6.
- **Errors.** Caught at the layer boundary, not at every call site.
  Detailed rules in section 6.
- **Auth.** Token plaintext lives only inside `core/auth/token-manager`.
  The OAuth flow lives in `electron/oauth-service` because the callback
  HTTP server is process-bound. No other module reads or writes token
  plaintext.
- **Encryption.** All secrets pass through `core/security/encryption`.
  No module re-implements `safeStorage` calls.
- **Observability.** Every job is recorded in `audit_log`. Do not invent
  a parallel "interesting events" log.
- **Configuration.** User-visible settings go through `SettingsManager`.
  Build-time configuration goes in `vite.config.ts` and environment
  variables. There is no third configuration system, and you do not need
  one.
- **Time, randomness, IDs.** Injected, not imported. See "Effects at the
  edges" above.

### Where new code goes — decision flow

Before writing code for a new feature, answer these in order:

1. **Is it domain logic?** (parsing emails, classifying, computing topics,
   filtering, summarising.) → `core/`, in the relevant subfolder
   (`gmail/`, `workflows/`, `repositories/`, `timeline/`, …). New
   subfolder if the concept is new and has 3+ files.
2. **Is it persistent state?** → schema change in `database/schema.ts`,
   migration via `pnpm db:generate`, repository in `core/repositories/`.
3. **Does the renderer need it?** → IPC channel (see checklist below),
   typed wrapper in `src/hooks/ipc.ts`, hook in `src/hooks/`.
4. **Is it long-running work?** → job in the utility process, not in
   `electron/main.ts` directly.
5. **Is it UI?** → reuse an existing `src/components/ui/*` primitive if
   one fits; new screen goes in `src/components/screens/`; shared screen
   pieces go in `src/components/`.
6. **Is it cross-cutting?** → see the cross-cutting section. Do not
   invent a new place for it.

If your feature does not obviously map to one of those answers, the
feature is bigger than it looks — split it.

#### Checklist: adding a new IPC channel

1. Define request / response type pair in `electron/ipc/channels.ts`.
2. Define zod schemas for both.
3. Create or extend the domain handler file at
   `electron/ipc/<concept>.ts`. The handler parses the request schema at
   entry and returns a value shaped like the response.
4. Expose the method on the preload surface (`electron/preload.ts`).
5. Expose a typed wrapper in `src/hooks/ipc.ts` (or a child hook).
6. Write at least one integration test that exercises the channel
   end-to-end.
7. Do not register the handler inline in `electron/main.ts`.

#### Checklist: adding a new domain concept

1. Add the table in `database/schema.ts` with FK constraints, indices,
   and timestamps.
2. Run `pnpm db:generate`. Review the migration. Commit schema and
   migration together.
3. Add the repository in `core/repositories/<concept>.ts`. Export it via
   `core/repositories/index.ts`.
4. Add a repository test in `__tests__/repositories/<concept>.test.ts`
   covering the public methods.
5. If the renderer needs it, add IPC channel(s) per the checklist above.
6. If the UI needs it, add a hook in `src/hooks/`.
7. If a screen is needed, add it in `src/components/screens/`.
8. Add fixtures in `__tests__/fixtures/` if other tests will need
   instances of the concept.

### When in doubt, ask

If a new feature does not obviously land in one of the existing files
under one of the rules above, **stop and ask** where it belongs. The
wrong answer is "I'll just add it where the imports already are." That is
exactly how this codebase grew its god files.

### Self-check before submitting code

Before declaring a change done, verify:

1. No file you touched crossed a layer boundary it shouldn't have (`src/`
   importing from `database/`, `core/` importing from `electron/`, etc.).
2. No file you touched crossed the 400-line smell line; no new file crossed
   the 600-line defect line.
3. No new `let x: T | null = null` module global; no new `!`-bang assertion
   on a module-scope dependency.
4. No new IPC channel registered outside `electron/ipc/`; no new handler
   without a paired zod parse at the boundary.
5. No `simulate*`/`mock*` methods on production classes; no mock data in
   production components.
6. Any concept you touched has exactly one owner module.
7. You did not hand-roll something a dependency already provides.
8. No new type allows a state that should never legitimately exist.
9. No untrusted input enters domain code without a parse at the boundary.
10. No piece of state is now owned by two places.
11. Any schema change has a paired `pnpm db:generate` migration committed
    alongside it.
12. Any new long-running work runs in the utility process, not the main
    process or the renderer.

If any of these fail, fix it or surface it explicitly in your summary —
don't ship the violation silently.


## 6. Code-Level Discipline

Section 5 governs structure. This section governs the lines, functions,
and files inside that structure. Each rule is the positive form of a
common LLM tendency: bureaucratic naming, narrating comments, defensive
try/catch, log noise, type escape hatches, floating promises, dependency
creep.

### Naming & ubiquitous language

- No bureaucratic suffixes — `Manager`, `Helper`, `Util`, `Handler`,
  `Service`, `Wrapper`, `Engine`, `Processor`, `Provider` — unless the
  domain genuinely uses that word. (`OAuthService` and `LLMProvider` are
  fine because the domains really are services and providers.
  `SettingsManager`, `LabelManager`, `TokenManager` are the suffix you
  reach for when you can't think of a name.)
- Name things after what they *are* (`TokenStore`, `LabelCache`,
  `SyncState`) or what they *do* (`syncEmails`, `refreshToken`,
  `applyLabels`). Not after their bureaucratic role.
- Match the domain language used in the README and product spec. If the
  product calls them "Topics", the code calls them topics — not
  categories, tags, or labels.
- Function names start with verbs. Type and class names start with nouns.
- Booleans read as predicates: `isExpired`, `hasUnreadEmails`,
  `shouldRetry`. Not `expired`, `unread`, `retry`.
- Single-letter variables (`e`, `i`, `x`) are allowed only in trivial
  loops or arrow callbacks. `error`, `index`, `item` cost nothing.
- Avoid abbreviations that aren't already in the domain. `usr`, `cfg`,
  `tmpl`, `proc` save four characters and lose a reader.

### Comments — why, not what

- A comment is justified when it conveys context the code can't: a
  non-obvious tradeoff, a workaround for a known bug, a reference to an
  external API quirk, an invariant a reader would otherwise have to
  derive.
- Ban narrating comments (`// loop over emails`, `// return the result`,
  `// set the state`).
- Ban docstrings on trivial helpers. A function whose name and signature
  already say what it does does not need a paragraph above it.
- Ban leftover assistant chatter — phrases like "Here we...", "This
  function will...", "Now we need to..." in comments are an LLM signature.
- `TODO` comments must include an owner and a ticket reference.
  `// TODO: handle this later` is a defect.
- A block comment at the top of a file describing what the file does is
  redundant — the file's exports already say that.
- Comments inside functions that re-state the next line in English
  (`// increment the counter` above `counter++`) get deleted on sight.

### Error handling

- Catch only what you can handle. Let unexpected errors bubble to a
  single boundary per layer.
- The boundaries:
  - In `core/`, errors throw. Consumers handle them.
  - In `electron/ipc/`, errors are caught at the wrapper and converted
    to `{ success: false, error }`.
  - In `src/`, errors surface to a user-visible toast or fallback UI via
    a React error boundary or an explicit catch in the hook.
- Ban empty catches (`catch {}`).
- Ban catches that just `console.error` and continue. That is "I don't
  know what to do, so I'll hide the problem."
- Ban defensive try-blocks around code that cannot throw.
- A new try/catch needs a one-line comment explaining what it is
  recovering and why.
- Convert third-party errors into your own at the boundary if you depend
  on the shape — don't let `googleapis` error shapes leak into `core/`.

### Logging

- Use `electron-log`. No `console.log` / `console.error` in committed
  code, except in one-off scripts and in `electron-log`'s own setup file.
- One log line describes one event. Use a stable, structured shape:
  `log.info('sync.cycle.start', { historyId, lookbackDays })`.
- Log facts, not narration. `'Starting sync cycle...'` is narration;
  `'sync.cycle.start'` with structured fields is a fact.
- Levels mean what they say: `error` is a bug, `warn` is a recoverable
  anomaly, `info` is a milestone, `debug` is for diagnosis. If everything
  is `info`, nothing is.
- No emoji in logs. No multi-line messages. No log output that looks
  like UI.
- Never log secrets. API keys, OAuth tokens, email bodies (which may
  contain personal data) are not logged at any level.

### Type hygiene

- Ban `as any`. Ban `as unknown as X`.
- Ban `// @ts-ignore`. `// @ts-expect-error` is acceptable only with an
  inline reason and a TODO link to the underlying issue.
- Ban `Object`, `{}`, and `Function` as types. Use `Record<string, …>`,
  the actual interface, or a function signature.
- A type assertion is a claim that you know more than the compiler. If
  you reach for one, the type is probably wrong — fix the type, don't
  escape it.
- Optional chaining (`?.`) is for values that are *legitimately* optional.
  It is not a substitute for ensuring an invariant. A chain of `?.` over
  a value the rest of the file assumes exists is a contract violation
  hidden in syntax.
- Prefer `unknown` over `any` when you genuinely don't know — and then
  parse it (see "Parse, don't validate" in section 5).

### Async & promises

- Every promise is either `await`-ed, returned, or explicitly discarded
  with `void`.
- No bare `.then()` chains without a `.catch()` (or a top-level boundary
  that catches).
- No `setInterval(async () => …)` without a clear failure path. An async
  callback that throws inside `setInterval` becomes a silent unhandled
  rejection.
- Long-lived callbacks (event subscriptions, intervals, IPC listeners)
  read state through refs, not closure captures. Stale closures are the
  most common bug class in this codebase.
- Don't `Promise.all` over user-paginated or unbounded data; use a real
  concurrency limit.
- Don't race timers and IO without an explicit reason. If you find
  yourself writing `Promise.race([fetch(...), sleep(30000)])`, ask
  whether the underlying client supports a timeout — it usually does.
- `await` inside a `forEach` does nothing useful. Use `for…of` for
  sequential, `Promise.all` (with concurrency limit) for parallel.

### Dependencies

- Adding a new npm package requires a one-paragraph justification in the
  PR or commit message: what problem does it solve that the existing
  stack can't?
- Default answer is "use the existing stack":
  - Persistence → Drizzle.
  - Validation → zod.
  - LLM workflow → LangGraph.
  - HTTP to Gmail → `googleapis`.
  - HTTP to LLM providers → the AI SDK packages already installed.
  - UI primitives → Radix; styling → Tailwind.
  - Date manipulation → `date-fns`.
  - Server-state cache (renderer) → `@tanstack/react-query` (already
    installed; use it instead of hand-rolling a fetcher hook).
  - Lightweight UI state → `zustand` (already installed).
  - HTML sanitisation → `dompurify`.
- Adding a router beyond the current routing, a state library beyond
  zustand, an HTTP client, a scheduler, a queue, or a date library
  requires explicit approval.
- Do not add a transitive utility (`lodash`, `ramda`, `underscore`)
  because one helper would be convenient. Write the helper.
- Removing a dependency is also a change — verify nothing imports it
  before deleting from `package.json`.

### Database migrations (operational)

- Schema changes go through `pnpm db:generate`. Never edit the generated
  SQL by hand except to fix a generator bug.
- Migrations are append-only after they ship. If a migration is wrong,
  write a new migration to fix forward.
- Never `db:push` against a database that has real user data. Generate,
  review, commit, run.
- A schema change committed without a migration is a bug.
- A new migration is reviewed for: data preservation (does it drop or
  rename without a data step?), index coverage (are query paths still
  covered?), and rollback feasibility (could we ship a fix-forward if
  this is wrong?).


<!-- dgc-policy-v11 -->
# Dual-Graph Context Policy

This project uses a local dual-graph MCP server for efficient context retrieval.

## MANDATORY: Always follow this order

1. **Call `graph_continue` first** — before any file exploration, grep, or code reading.

2. **If `graph_continue` returns `needs_project=true`**: call `graph_scan` with the
   current project directory (`pwd`). Do NOT ask the user.

3. **If `graph_continue` returns `skip=true`**: project has fewer than 5 files.
   Do NOT do broad or recursive exploration. Read only specific files if their names
   are mentioned, or ask the user what to work on.

4. **Read `recommended_files`** using `graph_read` — **one call per file**.
   - `graph_read` accepts a single `file` parameter (string). Call it separately for each
     recommended file. Do NOT pass an array or batch multiple files into one call.
   - `recommended_files` may contain `file::symbol` entries (e.g. `src/auth.ts::handleLogin`).
     Pass them verbatim to `graph_read(file: "src/auth.ts::handleLogin")` — it reads only
     that symbol's lines, not the full file.
   - Example: if `recommended_files` is `["src/auth.ts::handleLogin", "src/db.ts"]`,
     call `graph_read(file: "src/auth.ts::handleLogin")` and `graph_read(file: "src/db.ts")`
     as two separate calls (they can be parallel).

5. **Check `confidence` and obey the caps strictly:**
   - `confidence=high` -> Stop. Do NOT grep or explore further.
   - `confidence=medium` -> If recommended files are insufficient, call `fallback_rg`
     at most `max_supplementary_greps` time(s) with specific terms, then `graph_read`
     at most `max_supplementary_files` additional file(s). Then stop.
   - `confidence=low` -> Call `fallback_rg` at most `max_supplementary_greps` time(s),
     then `graph_read` at most `max_supplementary_files` file(s). Then stop.

## Token Usage

A `token-counter` MCP is available for tracking live token usage.

- To check how many tokens a large file or text will cost **before** reading it:
  `count_tokens({text: "<content>"})`
- To log actual usage after a task completes (if the user asks):
  `log_usage({input_tokens: <est>, output_tokens: <est>, description: "<task>"})`
- To show the user their running session cost:
  `get_session_stats()`

Live dashboard URL is printed at startup next to "Token usage".

## Rules

- Do NOT use `rg`, `grep`, or bash file exploration before calling `graph_continue`.
- Do NOT do broad/recursive exploration at any confidence level.
- `max_supplementary_greps` and `max_supplementary_files` are hard caps - never exceed them.
- Do NOT dump full chat history.
- Do NOT call `graph_retrieve` more than once per turn.
- After edits, call `graph_register_edit` with the changed files. Use `file::symbol` notation (e.g. `src/auth.ts::handleLogin`) when the edit targets a specific function, class, or hook.

## Context Store

Whenever you make a decision, identify a task, note a next step, fact, or blocker during a conversation, call `graph_add_memory`.

**To add an entry:**
```
graph_add_memory(type="decision|task|next|fact|blocker", content="one sentence max 15 words", tags=["topic"], files=["relevant/file.ts"])
```

**Do NOT write context-store.json directly** — always use `graph_add_memory`. It applies pruning and keeps the store healthy.

**Rules:**
- Only log things worth remembering across sessions (not every minor detail)
- `content` must be under 15 words
- `files` lists the files this decision/task relates to (can be empty)
- Log immediately when the item arises — not at session end

## Session End

When the user signals they are done (e.g. "bye", "done", "wrap up", "end session"), proactively update `CONTEXT.md` in the project root with:
- **Current Task**: one sentence on what was being worked on
- **Key Decisions**: bullet list, max 3 items
- **Next Steps**: bullet list, max 3 items

Keep `CONTEXT.md` under 20 lines total. Do NOT summarize the full conversation — only what's needed to resume next session.
