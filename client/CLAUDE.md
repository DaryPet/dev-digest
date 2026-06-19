# @devdigest/web — agent guide

Next.js 15 studio UI. Import repos, browse PRs, run/read AI reviews, author
agents. App Router, data via TanStack Query hooks over the Fastify API. Runs
on the host at `:3000`.

## Before answering

Always search this package's `docs/`, `specs/`, and `INSIGHTS.md` for what the
user asks about FIRST — these are curated and may already answer it — then
read code.

## Conventions (not obvious from code)

- All server data goes through `src/lib/hooks/*` → `src/lib/api.ts` — don't
  `fetch` the API ad hoc from components.
- Pages are thin; feature logic sits in colocated `_components/<Name>/`
  folders, each with its own `*.test.tsx`.
- Contracts come from `@devdigest/shared` (vendored) — reuse those Zod types
  instead of re-declaring request/response shapes on the client.
- Component tests mock `fetch`; real browser journeys live in `../e2e`, not here.

## Do-not-touch

- `src/vendor/` — vendored (`ui`, `shared`), never hand-edit without
  coordination.

## Use when

- UI route map or page→hook→API wiring overview → read `README.md`.
- A change needs a real browser journey (client + API + seeded DB) → read
  `../e2e/README.md`.
- Adding tests or touching the CI matrix → read `../TESTING.md`.
- A repo-wide spec governs the change → read `../specs/`. *(grows with the
  project — may not exist yet)*
- Need the rationale behind a cross-cutting decision → read `INSIGHTS.md`.
