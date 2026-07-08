# specs/ (top-level)

Home for **cross-cutting specs** — the WHAT/WHY (EARS) of features that touch
**several packages or the whole codebase**, written by `spec-creator`.

## Placement rule (specs and plans, same logic)

A spec/plan lives where its scope is:

- touches **only one package** → that package's folder
  (`server/specs/` + `server/plans/`, `client/specs/` + `client/plans/`,
  `reviewer-core/…`, `e2e/…`);
- touches **several packages or the whole codebase** → the **top-level**
  `specs/` (this folder) and `plans/`.

So a single-package spec never lands here; a cross-package one always does.
`SPEC-NN` numbering is global across every `specs/` location (see
`.claude/agents/spec-creator.md`).

## Legacy

This folder also still holds the **legacy Development Plans** written by the
earlier `planner` agent (now `implementation-planner`). They are kept **for
memory/history only** — a record of past decisions — and are not the model for
new files.
