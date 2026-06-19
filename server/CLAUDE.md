# @devdigest/api — agent guide

Fastify 5 + Drizzle/Postgres (pgvector) backend. Imports repos/PRs, indexes a
repo, stores agents, runs the reviewer (diff → `reviewer-core` → grounded
findings). Runs on the host at `:3001`.

## Before answering

Always search this package's `docs/`, `specs/`, and `INSIGHTS.md` for what the
user asks about FIRST — these are curated and may already answer it — then
read code.

## Conventions (not obvious from code)

- Routes are schema-first: zod `params`/`body` reject invalid input `422`
  before the handler runs — don't hand-roll `Schema.parse(req.body)`.
- Secrets are not in `AppConfig`. API keys + `GITHUB_TOKEN` go through
  `SecretsProvider` → `~/.devdigest/secrets.json` (mode `0600`), `process.env`
  fallback — never in git/DB.
- Modules are registered statically in `src/modules/index.ts` (no filesystem
  autoload). Plugins register before modules so they inherit
  helmet/cors/rate-limit/SSE + the shared error handler.
- DB-backed tests must use the `*.it.test.ts` suffix (testcontainers Postgres);
  the unit/integration split keys off the filename.

## Do-not-touch

- `src/vendor/` — vendored (`@devdigest/shared` lives at `src/vendor/shared`),
  never hand-edit without coordination.
- `src/db/migrations/` — never hand-edit; generate via `pnpm db:generate`.

## Use when

- Request/DI flow diagram, full API map, env table, review-context (repo-intel
  / injection-guard) notes → read `README.md`.
- Adding tests or touching the CI matrix → read `../TESTING.md`.
- Touching an agent prompt or the findings schema → read
  `../docs/agent-prompts/`.
- A repo-wide spec governs the change → read `../specs/`. *(grows with the
  project — may not exist yet)*
- Need the rationale behind a cross-cutting decision → read `INSIGHTS.md`.
