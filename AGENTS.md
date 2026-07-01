# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each
lesson adds one feature.

## MANDATORY — engineering-insights (read this before doing anything else)

This is a hard requirement, not a suggestion, not something to do "if there's
time." It applies to every session that touches `client/`, `server/`,
`reviewer-core/`, or `e2e/` — including quick fixes, audits, and questions
that turn into work. Skipping it is a protocol violation, the same severity
as editing a do-not-touch path.

1. **Before exploring code or doing any work:** open and read the
   `INSIGHTS.md` of every package you're about to touch
   (`client/INSIGHTS.md`, `server/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`,
   `e2e/INSIGHTS.md`). State back, briefly, the top relevant points before
   starting. Do this first — before spawning Explore agents, before reading
   other code, before anything else. Treat it as high-confidence guidance
   unless told otherwise.
2. **At the end of the session, unprompted** (do not wait for the user to
   ask): run the `engineering-insights` skill against every package you
   touched. If nothing substantial came up, write nothing — but the *check*
   itself is never optional.

## Before answering

Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for
what the user asks about FIRST — these are curated and may already answer
it — then read code.

## Catalog and index files — never use an agent

`README.md`, `INSIGHTS.md`, and `MEMORY.md` files are always edited directly
by the orchestrator using `Edit`. Never spawn an agent just to add rows to a
table, append to a Sources list, or update an index. These are mechanical
edits — do them inline.

## Before spawning a researcher agent

Check `.claude/skills/README.md` first. If the topic is already covered by a
skill (`react-testing-library`, `onion-architecture`, `fastify-best-practices`,
etc.) — invoke that skill directly instead of launching a `researcher` agent.
A researcher is only needed for topics not covered by any existing skill.

## Conventions (not obvious from code)

- NOT a monorepo workspace — each package has its own `package.json`/lockfile;
  cross-package code is shared via tsconfig path aliases, not published modules.
- Modules are registered statically in `server/src/modules/index.ts` (no
  filesystem autoload).
- The shared Zod contract package (`@devdigest/shared`) is not a 5th folder —
  it lives at `server/src/vendor/shared`.

## Do-not-touch

- `server/src/vendor/` and `client/src/vendor/` — vendored, never hand-edit
  without coordination.
- `server/src/db/migrations/` — never hand-edit; generate via `pnpm db:generate`.

## Use when

- Stack, commands, architecture, how to run → read `README.md`.
- Working inside a package → read that package's AGENTS.md: `server/AGENTS.md`,
  `client/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md`.
- Adding tests or touching the CI matrix → read `TESTING.md`.
- Touching an agent prompt or the findings schema → read `docs/agent-prompts/`.
- A repo-wide spec governs the change → read `specs/`. *(grows with the
  project — may not exist yet)*
- Need the rationale behind a cross-cutting decision → read `INSIGHTS.md`.
