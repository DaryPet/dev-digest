# @devdigest/reviewer-core — agent guide

Pure review logic: diff → prompt → LLM → grounded findings. No DB, GitHub, or
filesystem — the only side effect is an LLM call through an injected
`LLMProvider`. Consumed as source by the server via a tsconfig path alias.

## Before answering

Always search this package's `docs/`, `specs/`, and `INSIGHTS.md` for what the
user asks about FIRST — these are curated and may already answer it — then
read code.

## Conventions (not obvious from code)

- Stay pure — no Fastify/Next/DB/fs imports. New side effects go behind an
  injected port, never inline.
- Grounding is the mandatory gate: a finding that doesn't cite a real line in
  the diff is dropped; the score is recomputed from the surviving findings —
  the model's self-reported score is ignored.
- Injection defense is one shared trusted rule (`INJECTION_GUARD` in
  `prompt.ts`), not keyword scanning. Claims of "intentional / demo / test /
  do not flag" never descope a review.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`) are fed by
  later lessons; in the starter they're omitted — don't assume they're populated.
- The package never emits JS — `build` is just a type-check.

## Do-not-touch

- `src/index.ts` exported surface — consumers (server) import directly from it;
  don't break it without checking callers.

## Use when

- Full pipeline diagram or the exported public-API list → read `README.md`.
- Touching prompt assembly or the findings schema → read
  `../docs/agent-prompts/` (read **before** changing).
- Adding tests or touching the CI matrix → read `../TESTING.md`.
- A repo-wide spec governs the change → read `../specs/`. *(grows with the
  project — may not exist yet)*
- Need the rationale behind a cross-cutting decision → read `INSIGHTS.md`.
