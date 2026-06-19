# DevDigest — agent guide

Local-first AI PR reviewer. Course starter: Part-0 works end to end; each
lesson adds one feature.

## Before answering

Always search the relevant package's `docs/`, `specs/`, and `INSIGHTS.md` for
what the user asks about FIRST — these are curated and may already answer
it — then read code.

## Session protocol — engineering-insights

- **Start of session:** read the touched module's `INSIGHTS.md` and briefly
  summarize the top relevant points; treat it as high-confidence guidance
  unless told otherwise.
- **End of session:** run the `engineering-insights` skill to capture any new,
  substantial insight into that module's `INSIGHTS.md`. If nothing substantial
  came up, write nothing. Do not skip the check.

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
- Working inside a package → read that package's CLAUDE.md: `server/CLAUDE.md`,
  `client/CLAUDE.md`, `reviewer-core/CLAUDE.md`, `e2e/CLAUDE.md`.
- Adding tests or touching the CI matrix → read `TESTING.md`.
- Touching an agent prompt or the findings schema → read `docs/agent-prompts/`.
- A repo-wide spec governs the change → read `specs/`. *(grows with the
  project — may not exist yet)*
- Need the rationale behind a cross-cutting decision → read `INSIGHTS.md`.
