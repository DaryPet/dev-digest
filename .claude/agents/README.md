
# Agents

Project subagents for DevDigest. Each agent is a Markdown file with YAML
frontmatter (`name`, `description`, `model`, `tools`, …) and a system-prompt
body. They live in `.claude/agents/` and are shared with the team via version
control. Claude delegates to an agent automatically by matching a request
against its `description`; you can also invoke one explicitly.

For the skill catalog these agents draw on, see [`../skills/README.md`](../skills/README.md).

## Catalog

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| [researcher](researcher.md) | Sonnet | Read-only + WebSearch/WebFetch | Finds and reports information (project or web); returns a strictly structured report, never changes files |
| [spec-creator](spec-creator.md) | Sonnet | Read, Grep, Glob, Bash, Write (new spec file only) | Turns a feature request + supplied designs into an EARS-style **Spec** (WHAT/WHY); presents it for approval, then saves it as a new `SPEC-NN` file in the scope-appropriate `specs/` (a package's, or top-level for cross-package) after approval; runs before `implementation-planner` |
| [implementation-planner](implementation-planner.md) | Sonnet | Read-only + Write (plan file only) | Reviews requirements, freezes contracts, and produces a structured **Implementation Plan** — Mode A designs against a spec, Mode B authors a HOW plan with a brief WHAT anchor; confirms multi-agent vs single-agent execution, then saves it to the scope-appropriate `plans/` (a package's, or top-level for cross-package) after approval |
| [implementer](implementer.md) | Sonnet | Read, Write, Edit, Bash, Grep, Glob | Implements ONE scoped slice of an Implementation Plan (UI or backend), in parallel, and self-verifies via tests |
| [test-writer](test-writer.md) | Sonnet | Read, Write, Edit, Bash, Grep, Glob | Writes and extends automated tests for already-implemented functionality; edits test files only; never patches source |
| [architecture-reviewer](architecture-reviewer.md) | Sonnet | Read, Grep, Glob, Bash | Audits backend Onion layering and UI feature boundaries; returns severity-ranked findings (Critical/Major/Minor) with file:line evidence; read-only |
| [plan-verifier](plan-verifier.md) | Sonnet | Read, Grep, Glob, Bash | Extracts every plan obligation and audits whether each was implemented, returning a per-requirement verdict table and PASS/FAIL gate; read-only |
| [doc-writer](doc-writer.md) | Sonnet | Read, Write, Edit, Grep, Glob | Writes and updates project documentation grounded in actual code and plans, placing each doc type per repo convention |

## Where spec-creator fits

`spec-creator` is an optional stage that runs **before** `implementation-planner`.
It turns a feature request (plus any designs/mockups the developer supplies)
into a requirements-only **Spec** — EARS acceptance criteria, edge cases, goals/
non-goals. It clarifies open questions in chat, **presents the spec for the
developer's approval**, and only then saves it as a new `SPEC-NN` file — the
same approval gate as `implementation-planner`. **Placement is by scope:** a
spec touching only one package goes to that package's `specs/` (`server/specs/`,
`client/specs/`, `reviewer-core/specs/`, `e2e/specs/`); a spec spanning several
packages or the whole codebase goes to the **top-level `specs/`**. It never
edits an existing spec (superseding = a new file with a `Supersedes:` pointer)
and never writes to any `plans/` folder — those are `implementation-planner`'s
territory. (`SPEC-NN` numbering is global across every `specs/` location;
top-level `specs/` also keeps legacy Development Plans for history.)
`implementation-planner` can then design the Implementation Plan against that
Spec's frozen requirements instead of a raw request. This
stage is wired into the `dev-workflow` skill's gate batch as the **Full SDD**
development path (Q2): choosing it runs `spec-creator` first, then
`implementation-planner` designs against the spec. It can also be invoked
directly when a feature needs a formal spec outside the pipeline.

## The implementation-planner → implementer workflow

These two agents are designed to work as a pair:

1. **`implementation-planner`** turns a request into an Implementation Plan:
   requirements review with recommendations, scope, frozen interface contracts,
   a non-overlapping directory-ownership map, and a set of tasks — each
   annotated with the exact skills to apply. It asks clarifying questions if
   needed, presents the plan in chat, confirms whether execution should be a
   multi-agent team or a single-agent pass, and only writes the plan to the
   scope-appropriate `plans/` folder (a package's for single-package work,
   top-level for cross-package) **after the developer approves**.
2. The main session (orchestrator) launches either several **`implementer`**
   agents in parallel (multi-agent mode, one per task) or a single
   **`implementer`** that works through all tasks in sequence (single-agent
   mode), each given the plan's path and its task id(s).
3. Each **`implementer`** reads the plan, implements strictly within its owned
   files to the frozen contracts, applies the surface-appropriate skills
   (backend set vs UI set), runs its scope's tests until green, and returns a
   structured handoff report.

Key design choices:

- **Contracts before code.** The implementation-planner freezes shared
  interfaces (Zod/TS types, API shapes, error formats, DB schema deltas) so
  parallel implementers never invent conflicting ones — the most common
  parallel-agent failure mode.
- **Non-overlapping ownership + worktree isolation.** No two implementers share
  a file; lockfiles, migrations, `server/src/modules/index.ts`, and root config
  are sequential-only.
- **Self-verify ≠ code review.** Implementers only run the existing tests for
  their scope; full review is a separate downstream step.
- **Engineering insights, two levels.** The implementation-planner distills
  relevant insights from root + package `INSIGHTS.md` into the plan; each
  implementer additionally reads its own package's `INSIGHTS.md` on the spot.
  New insights are reported in the handoff and persisted by the orchestrator
  (not written by parallel implementers, to avoid worktree write conflicts).
- **Skills are baked into both.** The implementation-planner knows the full
  skill catalog and assigns skills per task; the implementer invokes the
  backend or UI skill set depending on where its scope lives.

## What the implementation-planner and implementer are based on

Both agents were designed from a survey of official and community best practices
for Claude Code subagents and skills (see **Sources** below). Concretely:

**`implementation-planner`**
- Modeled on Claude Code's built-in **Plan** agent: a focused planning role that
  gathers context and returns a plan, kept nearly read-only. *(src: 1)*
- **Spec-driven development** — separate design from implementation; the
  implementation-planner emits a machine-usable plan that the implementer
  consumes. *(src: 13, 14)*
- **Orchestrator-worker** decomposition — tasks emerge from analysis rather than
  a fixed pipeline. *(src: 3)*
- Implementation Plan section structure (objective, requirements review,
  acceptance criteria, scope in/out, contracts, ownership map, execution mode,
  tasks, tests, risks). *(src: 7, 8, 13)*
- **Contracts-before-code** and **sequential-only files** rules. *(src: 7, 8)*
- `description`-as-router and intentional tool allowlisting. *(src: 1, 5, 11)*

**`implementer`**
- **Parallel-agent model** with non-overlapping directory ownership and
  worktree isolation. *(src: 7, 8, 1)*
- **Self-verification = run the scope's tests**, not code review. *(src: 7)*
- Structured handoff report (scope, files, commands, test result, risks).
  *(src: 7)*
- **Surface-conditional skill selection** (backend vs UI skill sets). *(src: 2, 12)*
- Single-responsibility body, explicit "do NOT" boundaries, numbered workflow.
  *(src: 6, 10, 11)*

## Sources

| # | URL | Used for |
|---|-----|----------|
| 1 | https://code.claude.com/docs/en/sub-agents | Subagent YAML schema, built-in Plan/Explore agents, tool allowlist, isolation |
| 2 | https://code.claude.com/docs/en/skills | SKILL.md schema, surface/path-based skill activation, skill composition |
| 3 | https://www.anthropic.com/research/building-effective-agents | Orchestrator-worker & parallelization patterns |
| 4 | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills | Skills philosophy, progressive disclosure |
| 5 | https://claude.com/blog/subagents-in-claude-code | Delegation triggers, `description` field, decomposition heuristics |
| 6 | https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/ | Single-responsibility, tool hygiene, implementation-planner vs implementer scoping |
| 7 | https://www.aakashx.com/blog/parallel-claude-code-agents/ | Parallel model, file-ownership rules, contract scaffold, self-verification |
| 8 | https://zachwills.net/how-to-use-claude-code-subagents-to-parallelize-development/ | Parallel planning phase, parallel implementation example |
| 9 | https://claudefa.st/blog/guide/agents/sub-agent-best-practices | Parallel vs sequential decision criteria, cost tuning |
| 10 | https://www.tembo.io/blog/claude-code-subagents | Production agent templates, body structure |
| 11 | https://www.mindstudio.ai/blog/build-custom-sub-agents-claude-code-yaml | Strong vs weak `description`, three-part prompt structure |
| 12 | https://alexlavaee.me/blog/skills-over-subagents/ | Skill vs subagent decision framework, lazy-loading |
| 13 | https://addyosmani.com/blog/good-spec/ | Spec sections, scope boundaries, success criteria |
| 14 | https://www.thoughtworks.com/en-us/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices | Spec-driven development: plan-then-implement separation |

*The `researcher` agent predates this survey and follows the same read-only,
strictly-structured-report conventions; it is documented here for completeness.*

## Adding a new agent

1. Create `.claude/agents/<name>.md` with frontmatter (`name`, `description`,
   `model`, `tools`) and a system-prompt body. Write `description` as a routing
   rule ("Use this agent when…") so delegation works.
2. Allowlist only the tools the role needs (read-only roles get
   `Read, Grep, Glob`; implementers get write/exec tools).
3. Add a row to the **Catalog** table above.
