# Phase 2 Inventory

Status: awaiting gate. App code stayed read-only.

## Totals By Category

| Category | Count |
| --- | ---: |
| Slop and LLM tells | 4 |
| Dead matter | 3 |
| Stubs, mocks, fakes in real paths | 1 |
| Over-engineering | 2 |
| Duplication and drift | 3 |
| Wiring and boundaries | 4 |
| Type and data-model integrity | 5 |
| Error handling philosophy | 3 |
| Concurrency correctness | 2 |
| Security | 4 |
| Performance | 1 |
| Observability | 3 |
| Dependency hygiene | 2 |
| Test quality | 4 |
| Build, CI, deploy, migrations | 4 |
| Naming and domain language | 3 |
| Documentation that earns its place | 2 |

## Findings By Area

### Build And CI

| ID | Lines | Category | Risk | Behavior-preserving | Evidence | Proposed action | Non-functional impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BLD-001 | `electron/main.ts:1753` | Build, CI, deploy | L1 | Yes, if limited to syntax repair | `pnpm run build` and `pnpm run lint` both fail on unexpected `}`. | Root-cause the surrounding block, write/identify characterization coverage if possible, then make the minimal syntax repair. | Restores build; no intended runtime behavior change. |
| BLD-002 | `__tests__/e2e/app-launch.test.ts:29`, `auto-updater.test.ts:26`, `onboarding.test.ts:35`, `settings.test.ts:35` | Test quality | L2 | Unknown | `pnpm test:e2e` fails because Electron process does not launch, then `afterAll` calls `electronApp.close()` on `undefined`. | First investigate launch failure; only then make teardown robust if that is still needed. | Improves verification signal; may expose app startup failures. |
| BLD-003 | project-wide lint baseline | Build, CI, deploy | L2 | Yes if batched by rule and tested | `pnpm run lint` reports 569 errors and 1 warning. | Do not mass-fix. Batch by category after behavior tests exist. | Reduces CI noise; high review load if bundled. |
| BLD-004 | package scripts | Build, CI, deploy | L1 | Yes | No configured secrets scan command found. | Add no new tool in cleanup. Record as missing baseline unless team asks for a security tooling task. | Keeps process honest; no runtime impact. |

### Electron Runtime Boundary

| ID | Lines | Category | Risk | Behavior-preserving | Evidence | Proposed action | Non-functional impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EL-001 | `electron/main.ts` module-level | Wiring and boundaries | L2 | Unknown | Phase 1 map found main owns lifecycle, DB, OAuth, sync, repositories, IPC, auto-updater, and utility process wiring. | Avoid architectural rewrite. Extract only if a later L1/L2 finding has a tight local seam and tests. | Reduces blast radius only if done surgically. |
| EL-002 | `electron/preload.ts`, `electron/ipc/channels.ts` | Public API / wiring | L2 | Yes if type-only | Preload exposes timeline/topics/deals/senders/action-items/emails/shell/backfill/progress APIs not represented in `CHANNEL`. | Align type/contract definitions only after confirming handlers and renderer call sites. | Improves contract visibility; no wire-format change. |
| EL-003 | `src/hooks/ipc.ts:1` | Type integrity | L2 | Yes if type-only | File starts with `// @ts-nocheck`; lint flags this. | Remove only after typing the hook boundary incrementally, with tests and type-check. | Improves compile-time safety; could reveal hidden contract drift. |
| EL-004 | `src/hooks/ipc.ts` hook bodies | Error handling | L2 | Unknown | Hooks mix wrapped `{ success, data }` and raw response handling. | First document current response shapes; then normalize one hook family at a time. | Reduces UI error ambiguity; may surface existing backend inconsistency. |

### OAuth And Secrets

| ID | Lines | Category | Risk | Behavior-preserving | Evidence | Proposed action | Non-functional impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | `electron/oauth-service.ts` callback server HTML | Security | L3 | No, security behavior changes | OAuth callback echoes query-string `error` and caught error messages into HTML responses. | Treat as security fix, not cleanup. Escape or replace with fixed text after approval. | Reduces local callback XSS/error disclosure risk. |
| SEC-002 | `electron/oauth-service.ts` logging | Security / observability | L3 | Observable logs change | Logs include OAuth status flow and email address. | Decide whether logs are user/debug contract; redact email if approved. | Reduces PII in logs; changes observability. |
| SEC-003 | `electron/oauth-service.ts` token storage | Security | L2 | Unknown | Tokens are stored in `oauth-tokens.enc` via encryption helpers, but encryption helper was not inspected in Phase 2. | Inspect `@core/security/encryption` during security-specific pass before claiming posture. | Avoids false confidence. |
| SEC-004 | `pnpm audit` output | Dependency hygiene / security | L3 | Unknown | 24 advisories: 16 moderate and 8 high, including Vite, DOMPurify, uuid, langsmith, axios/follow-redirects transitive paths. | Separate dependency-upgrade plan. Do not bundle with source cleanup. | Security improves; upgrade risk varies by package. |

### Database And Seed Data

| ID | Lines | Category | Risk | Behavior-preserving | Evidence | Proposed action | Non-functional impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DB-001 | `database/index.ts` imports | Wiring and boundaries | L2 | Yes if moved carefully | Database module imports `@core/jobs/queue` for `recoverUnprocessedJobs`. | Leave for now; later move recovery orchestration out of database if covered by startup tests. | Improves dependency direction; no schema change. |
| DB-002 | `database/schema.ts` topics table | Type/data integrity | L3 | Unknown | Comment says `parentId` intentionally lacks a self-FK, leaving orphan risk handled in app code. | Do not alter schema in cleanup. Flag for domain/schema discussion. | Schema changes would affect persisted data. |
| DB-003 | `database/seed.ts`, `database/seeder.ts`, `database/seed-march-23-24.ts` | Stubs/sample data | L3 | Unknown | Realistic demo emails and dated samples exist; `electron/main.ts` imports `seed` from `@db/seed`. | First confirm when seed runs. If prod path, gate or remove separately. | Prevents sample data leaking into real runtime; risk to onboarding/dev data. |
| DB-004 | `database/deals.ts` / `src/hooks/useTimeline.ts` | Naming/domain language | L2 | Yes if mapping preserved | DB uses `dealTitle`, `brandName`; UI uses `title`, `brand`; hooks remap shapes with `any`. | Keep mapping local; type it before renaming anything. | Improves boundary clarity; no user-visible change. |

### Core Sync, Jobs, And Workflows

| ID | Lines | Category | Risk | Behavior-preserving | Evidence | Proposed action | Non-functional impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CORE-001 | `core/gmail/sync.ts` Gmail client interface | Type integrity | L2 | Yes if type-only | Interface uses many optional methods returning `Promise<any>`. | Only narrow types where production callers and tests prove concrete shapes. | Better type safety; avoid constraining real Gmail API adapters incorrectly. |
| CORE-002 | `core/gmail/sync.ts`, `core/repositories/sync-state.ts` | Duplication and drift | L2 | Yes if characterization exists | `BackfillJob` and sync-state shapes appear in both sync manager and repository. | Do not unify by shape alone. First confirm same reason-to-change. | Could reduce drift; wrong unification would couple persistence to runtime state. |
| CORE-003 | `core/workflows/processing-decision.ts` module header | Duplication and drift | L2 | Unknown | File says LangGraph has duplicated `decideNode` logic rather than importing this utility. | Characterize both paths, then decide whether shared logic is safe. | Reduces decision drift if done carefully. |
| CORE-004 | `core/gmail/sync.ts` state fields | Concurrency correctness | L2 | Unknown | Sync manager keeps mutable progress, checkpoint, processed ID set, shared state, event handlers, retry config. | Inventory only until race/reentrancy behavior is tested. | Avoids introducing sync regressions. |

### Renderer UI And Hooks

| ID | Lines | Category | Risk | Behavior-preserving | Evidence | Proposed action | Non-functional impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UI-001 | `src/components/screens/TimelineScreen.tsx` `TimelineCard` export | Dead matter / stubs | L2 | Unknown | Phase 1 read showed comment: “Stub export retained for backwards-compat”; actual rendering uses `RichTimelineCard`. | Find callers before removal. If public export is unused, delete in L1 batch. | Shrinks UI surface; risk if tests or consumers import it. |
| UI-002 | `src/components/screens/TimelineScreen.tsx::TimelineCardProps` | Naming/API surface | L1 | Yes | Props expose only `data` and `onClick`; adjacent Phase 1 evidence shows broader screen props and unused `ThreadGroup` lint. | Keep as-is unless deleting the stub export. | No impact if left alone. |
| UI-003 | `src/hooks/useTimeline.ts` data mapping | Type integrity | L1 | Yes if type-only | Hook maps IPC data using `u: any` and `d: any`; lint also flags `any`. | Add narrow response types only after confirming preload response shape. | Improves type safety; no runtime change. |
| UI-004 | `src/hooks/useDeals.js` and `src/hooks/useDeals.ts` | Dead matter / duplication | L2 | Unknown | Lint reports many browser/global and flow errors in `.js`; `.ts` also exists and is linted. | Confirm import graph before deleting either file. | Could reduce lint noise; deletion risk depends on imports/build config. |

### Tests

| ID | Lines | Category | Risk | Behavior-preserving | Evidence | Proposed action | Non-functional impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TST-001 | `__tests__/test-helpers/assertions.ts` module-level | Test quality / type integrity | L1 | Yes | Helper functions accept `any` broadly while tests still pass. | Type helpers only when touching related tests; avoid mass churn. | Improves test quality; no production impact. |
| TST-002 | `__tests__/test-helpers/assertions.ts` docblocks | Slop and LLM tells | L1 | Yes | Many trivial helpers have narrating docblocks like “Assert array is empty”. | Remove low-value comments in a test-only cleanup batch if approved. | Reduces noise; no runtime impact. |
| TST-003 | `__tests__/features-pov/email-processing-pipeline.test.ts::buildOrchestrator` | Test quality | L1 | Yes | Test builder casts mocks through `unknown as OrchestratorOptions[...]`. | Leave unless tests are being refactored; it is test-only and currently green. | Avoids destabilizing passing tests. |
| TST-004 | `__tests__/features-pov/configurations/sync-configuration-matrix.test.ts` | Test quality / boundary piercing | L1 | Yes | Test resets private static `SettingsManager` state through `@ts-expect-error`. | Keep until settings state is refactored; it is characterization-like coverage. | Preserves useful coverage despite awkwardness. |

### Observability, Docs, And Comments

| ID | Lines | Category | Risk | Behavior-preserving | Evidence | Proposed action | Non-functional impact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OBS-001 | `electron/oauth-service.ts`, `src/hooks/ipc.ts` | Observability | L2 | Observable logs change | Console logs are used for OAuth and frontend auth status. | Do not delete wholesale. Decide which logs are diagnostic versus noisy. | Can reduce PII/noise; may reduce debuggability. |
| OBS-002 | `core/workflows/processing-decision.ts`, `core/gmail/sync.ts`, test files | Documentation | L1 | Yes | Comments narrate phases, canonicality, or simple helper behavior. | Remove only comments that do not encode behavior, rationale, or contract. | Improves maintainability. |
| OBS-003 | `database/schema.ts` topics comment | Documentation | L3 | Yes if left alone | Comment documents missing self-FK and orphan implication. | Keep. It explains a non-obvious schema decision. | Prevents unsafe “cleanup”. |

## Areas That Look Like Real Bugs

- `electron/main.ts:1753`: build-breaking syntax error.
- Playwright e2e launch failure: app does not launch before tests run.
- OAuth callback HTML reflects user-controlled/caught error text. Treat as security, not cosmetic cleanup.
- Dependency audit advisories include direct runtime/development packages and transitive build tooling.

## Sorting Notes

Within each area, L1 items are listed before L2 and L3 when comparable. Higher-impact known-red or security findings are kept near the top of their area even when they require later approval.

## Phase 2 Limits

- No app code was changed.
- Because the dual-graph query returned high confidence, Phase 2 did not run broad `rg` sweeps.
- Some line ranges come from baseline tool output or symbol excerpts rather than full file reads.
- Migrations and generated artifacts remain unmapped.
