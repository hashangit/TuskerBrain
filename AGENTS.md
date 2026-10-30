# TuskerBrain

Local-first Gmail inbox management with AI: an Electron + React desktop app that syncs your Gmail over OAuth and runs every email through a per-email AI pipeline (classify → decide → extract → label → summarize) built on LangGraph, then surfaces the results in a Timeline / Topics / Deals / Senders dashboard. Privacy-first and serverless by design — everything stays on the user's machine: a local SQLite database (via `@libsql/client` + Drizzle ORM) and user-supplied LLM keys (OpenAI, Anthropic, Google); the only traffic is to Gmail and the user's chosen LLM provider. Pre-1.0, organized into six layers (`src/`, `electron/`, `domain/`, `capabilities/`, `vendors/`, `foundations/`) with lint-enforced boundaries. Product, rules, architecture, and design docs live in the Obsidian vault.

**Read before writing any code:** the primary documents in the Obsidian vault (paths below), in this order:

1. `~/Tailscale Share/Obsidian/TuskerBrain/PRODUCT_DOCUMENT.md` — complete product scope: features, how each works, the sync and AI pipeline, the dashboard views, out of scope.
2. `~/Tailscale Share/Obsidian/TuskerBrain/RULES.md` — naming and coding rules, boundaries, do's and don'ts. If code and this file disagree, the file wins.
3. `~/Tailscale Share/Obsidian/TuskerBrain/ARCHITECTURE.md` — the six layers, import rules, data flows, boundary enforcement.
4. `~/Tailscale Share/Obsidian/TuskerBrain/DESIGN_GUIDE.md` — the visual contract: direction, design tokens, component vocabulary, screens. Every UI screen is built against the design guide.
5. `~/Tailscale Share/Obsidian/TuskerBrain/PRODUCT_IDENTITY.md` — the product's identity: voice, tone, naming. Read alongside the product document.

# Commands

All scripts come from `package.json` and run with pnpm:

- `pnpm electron:dev` — the full app for everyday work: starts the Vite dev server, waits for it, then launches Electron with hot reload. Electron loads the renderer from `http://localhost:5173`, so the Vite server must be up on 5173 (the script handles this; an Electron started by hand will not).
- `pnpm dev` — Vite dev server only (renderer without Electron).
- `pnpm build` — typecheck (`tsc`) plus the Vite production build of the renderer.
- `pnpm test` — Vitest in watch mode. For a one-shot run use `npx vitest run`.
- `pnpm test:e2e` — Playwright E2E (its web server builds the renderer first).
- `pnpm lint` / `pnpm format` — ESLint / Prettier.
- `pnpm db:generate`, `pnpm db:push`, `pnpm db:seed` — generate Drizzle migrations, apply them to the local SQLite database, seed sample data.
- `pnpm electron:build` — packaged production app via electron-builder (output in `release/`).

**Gotchas:** `pnpm install` runs `scripts/fix-electron.mjs` in `postinstall` — don't delete or bypass it; it fixes up the Electron install. Any change that moves code across layers must also pass `pnpm test:boundaries` (`scripts/verify-boundaries.sh`).

# Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

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
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. In-Place Upgrades & No Legacy Baggage

**Upgrade directly. Do not preserve obsolete paths.**

- When modifying or iterating on a feature, rewrite and replace existing functions, components, and contracts directly in place rather than appending alternate implementations, `V2` suffixes, parallel helpers, or wrapper shims.
- Do not keep backward compatibility shims, fallback branches, or deprecated functions unless explicitly instructed.
- When an updated approach replaces an older mechanism, delete the legacy code paths, obsolete flags, and unused options immediately in the same change.

## 6. Zero Tolerance for Dead Code & Bloat

**Leave no orphans or obsolete baggage.**

- Always remove unused imports, dead variables, obsolete handlers, orphaned types, and unreachable conditionals before completing an edit.
- Clean up tests, fixtures, or mock data that tested obsolete code paths.
- Apply dead-code detection discipline (e.g. `knip`, `ts-prune`) to ensure no unused exports, orphan files, or dangling dependencies remain.

## 7. The Greenfield Rewrite Pattern

**Prefer complete, clean replacement over additive patchworks.**

- When significantly updating or refactoring a feature, avoid stacking incremental condition checks, flags, or wrapper shims on top of legacy code (which creates brittle, additive patchworks).
- Treat significant iterations as a clean-slate replacement of the component/module: write the new streamlined implementation, replace the old code in place, and wire the callers directly.

## 8. Pre-1.0 / Beta Lifecycle & Breaking Changes

**Rapid improvement phase — no legacy shims before v1.0.0.**

- **Pre-1.0 (Beta state)**: This app is a local desktop tool with no external consumers requiring backward compatibility. Do not add compatibility shims, fallback adapters, or deprecation wrappers. Change contracts directly and update every caller in the same change.
- **Data outlives code**: the user's local SQLite database is permanent even while the code churns. Schema changes ship as Drizzle migrations that carry existing data forward in the same change; never a dual-write path or a "new column alongside the old one" detour.
- **Documenting decisions**: when a change contradicts RULES.md or PRODUCT_DOCUMENT.md, update the relevant document in the same change.

## 9. Talk to Me Like a Human & Use Unslop Always

**Speak like a person, not a language model. Explain things the way you would to a human engineer.**

- **You are talking to a human, not an AI.** The user is a person, not a language model. Never explain things as if prompting, instructing, or briefing another model.
- **Plain, direct explanations.** Explain concepts, technical tradeoffs, and status the way one engineer explains them to another in the room. Ground explanations in concrete facts and code reality.Also include the product perspective.
- **Use the `unslop` skill always.** Apply `unslop` across every conversational response, technical explanation, commit message, pull request description, and release note without exception.
- **Honest voice and readable rhythm.** Have a point of view, keep sentences readable, and say what happened or what needs doing without corporate or assistant theater. Do not write unnecessarily long text. Only as needed to clearly explain your point and the background of it so the human can understand what you are trying to say.
- **Bring the background with you.** I don't read spec docs and I can't keep every past decision in my head. When you bring something up (a change, a review result, a bug, a plan), open with the context I need to follow it: what this is, where it came from, and why it matters now. A few sentences of orientation, not a document dump. Never point me at a spec or a past session as if I remember it.
- **When asking me questions or asking me to make a decision.** Spell out the options with their explanation and implications in plain terms, so I can judge them without having to read anything first.

# Documentation Storage

Documentation is split between the **Obsidian vault** (internal) and the **project repo** (user-facing). When unsure where a document belongs, default to the vault.

## Obsidian vault — internal documentation

All internal engineering and product documentation lives in the Obsidian vault under `~/Tailscale Share/Obsidian/TuskerBrain/`, **not** in the project repo: product scope, identity, rules, architecture, and the design guide.

**Access:** Read and write vault files directly via their filesystem paths (e.g. `Read` / `Write` / `Edit` on `~/Tailscale Share/Obsidian/TuskerBrain/...`). The `obsidian` CLI only launches the GUI app and is not scriptable from agents — use direct filesystem access for all vault work.

## Vault structure

```
~/Tailscale Share/Obsidian/TuskerBrain/
├── PRODUCT_DOCUMENT.md    # Complete product scope (features, sync + AI pipeline, dashboard, out of scope)
├── PRODUCT_IDENTITY.md    # Identity: voice, tone, naming (read alongside PRODUCT_DOCUMENT.md)
├── RULES.md               # Naming/coding rules, boundaries, do's and don'ts
├── ARCHITECTURE.md        # The six layers, import rules, flows, enforcement
└── DESIGN_GUIDE.md        # Visual contract: direction, tokens, component vocabulary, screens
```

**Maintenance — keep this map in sync.** This tree is the agent's contract for what to expect in the vault. When vault files are added, removed, renamed, or restructured, update this tree in the same change.

## Project repo — user-facing documentation

The repo holds code and operational files only: `AGENTS.md` (this file), the user-facing `README.md` (features, setup, architecture overview), source, configs, and working notes under `docs/`. Internal engineering prose belongs in the vault, not here.

# Architecture

Full architectural reference: `~/Tailscale Share/Obsidian/TuskerBrain/ARCHITECTURE.md`. The six layers (the legacy `core/` and `database/` folders are gone):

```
UI  →  Transport  →  Domain  →  Capabilities  →  Vendors
                                        ↘ Foundations (imported by all, imports none)
```

| Layer | Path | Job |
|-------|------|-----|
| **UI** | `src/` | React screens and components for the Timeline / Topics / Deals / Senders views; Zustand stores; hooks that wrap IPC calls. Never talks to Gmail, SQLite, or an LLM directly |
| **Transport** | `electron/` | The Electron main process: IPC handlers (exposed via the contextBridge preload) plus the composition root in `main.ts`. Validates input and delegates — no business logic in IPC handlers |
| **Domain** | `domain/` | Business rules: what happens to an email (the type×age cleanup decision table in `domain/processing/email-rules.ts`), pipeline decisions |
| **Capabilities** | `capabilities/` | Stable internal APIs: Gmail sync, LLM providers, labeling, summaries, timeline extraction, the job queue |
| **Vendors** | `vendors/` | SDK usage quarantined: `googleapis`, `@ai-sdk/*`, LangGraph, `@libsql/client` |
| **Foundations** | `foundations/` | Drizzle schema and the database handle, persistence, the IPC contracts (in `foundations/contracts`), shared types |

**Hard rules:** no layer-skipping, no importing upward, no `utils/` grab-bag; no vendor SDK import outside `vendors/`; no business logic in IPC handlers; the renderer never touches the network, the database, or an LLM directly — everything crosses the preload's contextBridge through the IPC contracts in `foundations/contracts`.

**Non-negotiables:** the type×age cleanup decision table in `domain/processing/email-rules.ts` is the single source of truth for what happens to an email (process / archive / delete / extract) — nothing re-implements it elsewhere. Every processed email flows through the LangGraph pipeline (classify → decide → extract → label → summarize). Label changes write back to Gmail under the `TuskerBrain/` label tree. Background work goes through the job queue, never ad-hoc timers or one-off scripts. OAuth tokens and LLM keys stay on-device (Electron `safeStorage`); nothing is uploaded anywhere.

# Conventions

- **pnpm**, never npm.
- **TypeScript everywhere**, strict mode; path aliases `@/*` (src), `@core/*`, `@db/*`, `@electron/*` in `tsconfig.json` and Vitest.
- **Vitest** for unit tests in `__tests__/` (node environment for `.ts`, jsdom for `.tsx`); **Playwright** for E2E in `__tests__/e2e/`.
- **Drizzle migrations** in `database/migrations/`: `db:generate` writes them, `db:push` applies them to the local SQLite database. Seeding (`db:seed`) is opt-in — the database stays empty so the onboarding and sync flows stay testable.
- **husky** pre-commit runs `pnpm test`; lint-staged runs `eslint --fix` and `prettier --write` on staged `.ts`/`.tsx` files.
- **ESLint boundary zones** (`no-restricted-imports` per layer) and `scripts/verify-boundaries.sh` enforce the layer rules above; they must pass on every change that moves code across a boundary (`pnpm test:boundaries`).

# Model Restrictions for Subagents

- **Disallowed Models**: **GPT Sol**, **Opus**, or **GLM 5.3** are **strictly not allowed** to be used for subagents.
- **Allowed Models**: Only **GLM 5.3 Flash**, **Gemini 3.8 Flash**, and **DeepSeek V4.1 Flash** are allowed to be used for subagents.
