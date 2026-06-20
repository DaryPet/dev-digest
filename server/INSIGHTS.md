# server — insights

Decisions/insights log for `@devdigest/api` — the *why* behind a non-obvious
choice (tradeoffs considered, what was rejected and why), not the *what*
(that's [`specs/`](./specs/)) or the *how it works* (that's [`docs/`](./docs/)).

## Codebase Patterns & Tool/Library Notes

- **2026-06-20** — `completeAgentRun` is declared in TWO places that must stay
  in sync: the inline `values` type on the repo facade
  (`server/src/modules/reviews/repository.ts:151`) AND the real implementation
  (`server/src/modules/reviews/repository/run.repo.ts:142`). Adding a field
  (e.g. `costUsd`) to only one yields a confusing TS2345 at the call site, not
  at the declaration. Edit both.
- **2026-06-20** — A migration `.sql` + `meta/<idx>_snapshot.json` that exists
  on disk but is NOT listed in `meta/_journal.json` is **silently skipped** by
  `db:migrate` (drizzle treats the journal as the source of truth). Symptom: a
  column that "has a migration" never appears in the DB. Fix: delete the
  orphaned files and regenerate with `./node_modules/.bin/drizzle-kit generate`
  (generate diffs schema vs the last *journaled* snapshot — no DB needed — and
  writes the journal entry). Hit when re-adding `agent_runs.cost_usd`.
- **2026-06-20** — Per-run cost is fully plumbed server-side even when not
  surfaced: `PriceBook` (`platform/price-book.ts`) → `OpenRouterProvider`'s
  injected `estimateCost` (`platform/container.ts:185`) → `usage.cost` /
  estimate in `reviewer-core/.../openrouter.ts` → `outcome.costUsd`
  (`reviewer-core/.../review/run.ts`). To expose cost, only thread
  `outcome.costUsd` through `run-executor` → `completeAgentRun` →
  `agent_runs.cost_usd` → contracts; no pricing logic to rebuild.
- **2026-06-20** — In the PR-list endpoint (`GET /repos/:id/pulls`,
  `server/src/modules/pulls/routes.ts`) SCORE and COST come from the PR's
  **latest** review (newest-first, first-seen-per-PR), but the FINDINGS column
  must aggregate across **all** of the PR's reviews — otherwise a PR whose last
  agent approved (0 findings) shows `0 0 0` even though earlier agents found
  issues, contradicting the PR-detail SeverityCounter (which flatMaps every
  run's findings). Aggregate findings by joining `findings` → `reviews.pr_id`
  (not by latest-review id) and group per `pr_id`. Symptom that flagged it:
  list said `0 0 0` while the detail page showed `C1 W2` for the same PR.
- **2026-06-20** — `RunSummary.warnings` (per-run WARNING count, surfaced in the
  timeline) is computed **on read** in `listRunsForPull`
  (`reviews/repository/run.repo.ts`) by joining `findings` ← `reviews.run_id` —
  it is NOT denormalized onto `agent_runs` like `blockers`/`findings_count`. So
  there's no migration; the count reflects current (non-dismissed) findings.

## Tooling Notes

- **2026-06-20** — `pnpm typecheck`/`pnpm test` abort in this env on a dep
  build-script pre-check (`ERR_PNPM_IGNORED_BUILDS` → "pnpm install" exit 1).
  Run the local binaries directly instead: `./node_modules/.bin/tsc --noEmit -p
  tsconfig.json`, `./node_modules/.bin/vitest run`. Pre-existing tsc errors in
  `reviewer-core`/`adapters/llm` (missing `openai`/`zod` modules, `unknown→T`)
  are env noise, unrelated to app code.
