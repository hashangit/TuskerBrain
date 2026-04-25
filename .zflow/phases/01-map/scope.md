# Cleanup Assessment Scope

## Problem Statement

The codebase may contain AI-generated slop, over-engineering, dead scaffolding, weak boundaries, and inconsistent domain language.

## Success Criteria

- Produce a read-only map of the codebase before any app-code edits.
- Capture baseline test, type-check, lint, build, audit, and security-scan status where commands exist.
- Identify public contracts that must not change without approval.
- Produce a health heatmap by area.
- Keep notes in `.zflow/scratchpad.md` so the assessment can resume cleanly.

## Constraints

- Do not modify app code during Phases 1, 2, 2.5, or 3.
- Do not change observable behavior without explicit approval.
- Do not silently fix likely bugs or security findings.
- Do not hand-edit generated, vendored, or migration code.
- Every future cleanup item must trace to code evidence.

## Scope Boundaries

- In scope: source code, tests, build and CI configuration, scripts, dependency metadata, documentation, and runtime contracts.
- Out of scope for this phase: code cleanup, refactoring, dependency upgrades, formatting, and behavior changes.

## UI Work Flag

ui_work: false
