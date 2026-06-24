# @devdigest/e2e — agent guide

Deterministic browser e2e for the web app, driven by Vercel agent-browser
(native Rust + CDP CLI). No Playwright, no LLM, no API key.

## Before answering

Always search this package's `docs/`, `specs/`, and `INSIGHTS.md` for what the
user asks about FIRST — these are curated and may already answer it — then
read code.

## Conventions (not obvious from code)

- Assertions are `wait` commands. `wait --text` / `wait --url` time out and
  exit non-zero if the condition never holds — that is the assertion.
- Deterministic locators only (`--url`, `--text`, `find role|text|label`).
  Never use the AI `chat` command — runs must stay stable and key-free.
- Flows target read-only seeded data (`acme/payments-api`, PR #482, seeded
  agents) so nothing triggers a model call.
- Precondition: flows 02/04/05 assume a freshly-seeded DB with only the seed
  repo — use the hermetic runner (`pnpm run e2e:hermetic`), not your dev stack.

## Do-not-touch

- Never run `docker compose down -v` to "reset" the dev DB — `-v` deletes the
  `devdigest_pgdata` volume and every repo/review you've imported.

## Use when

- Authoring a flow, wiring env knobs, or checking the per-spec coverage table
  → read `README.md`.
- A flow needs to match a UI route or selector → read `../client/README.md`.
- Per-package test strategy / CI matrix → read `../TESTING.md`.
- A repo-wide spec governs the change → read `../specs/`. *(grows with the
  project — may not exist yet)*
- Need the rationale behind a cross-cutting decision → read `INSIGHTS.md`.
