# plans/ (top-level)

Home for **cross-cutting Implementation Plans** — the HOW of a change that
touches **several packages or the whole codebase**, written by
`implementation-planner` and consumed by `implementer` agents.

## Placement rule (specs and plans, same logic)

A spec/plan lives where its scope is:

- touches **only one package** → that package's folder
  (`server/plans/`, `client/plans/`, `reviewer-core/plans/`, `e2e/plans/`);
- touches **several packages or the whole codebase** → the **top-level**
  `plans/` (this folder), so every implementer across packages reads it from
  one shared location.

One flat file per feature (`plans/skills-lab-ui.md`,
`server/plans/conventions-extractor.md`, …), kebab-case slug. A plan is written
only **after the developer approves it**.

## Relationship to specs/

- **`plans/` (here + per package)** — Implementation Plans (HOW), by
  `implementation-planner`.
- **`specs/` (top-level + per package)** — WHAT/WHY specs (EARS), by
  `spec-creator`.
- Both follow the same scope-based placement rule above. Top-level `specs/`
  also keeps legacy Development Plans for history.

The planner works in one of two modes: **Mode A** designs against an existing
`SPEC-NN` (referencing it, never duplicating its WHAT/WHY); **Mode B** (no
spec) makes the plan a HOW document with only a brief WHAT anchor. See
`.claude/agents/implementation-planner.md`.
