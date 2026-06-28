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

- **2026-06-24** — `POST /skills/import` (zip/markdown skill import) decodes
  ZIP archives with a **hand-rolled central-directory reader +
  `node:zlib.inflateRawSync`** (`server/src/modules/skills/import.ts`), not a
  third-party zip library — `pnpm install` fails in this env
  (`ERR_PNPM_IGNORED_BUILDS`, see Tooling Notes), so adding a new dependency
  isn't viable here. Supports the two standard ZIP storage methods (stored +
  raw deflate). Executable entries (`.sh`/`.js`/`.py`/etc., see
  `EXECUTABLE_EXTENSIONS` in `constants.ts`) are matched by extension and
  never decoded or persisted — only their names surface in `ignored_files` for
  the import preview. If a real zip dependency becomes installable later, this
  reader can be swapped, but the executable-skip behavior must be preserved
  (it's the safety guarantee the import flow promises the user).
- **2026-06-28** — A new system-LLM feature (the `conventions` module is the
  first real consumer of `resolveFeatureModel`, `settings/feature-models.ts`)
  wires the model as: `resolveFeatureModel(container, ws, '<slot>')` →
  `(await container.llm(provider)).completeStructured({ schema, schemaName,
  messages, temperature })`. Read repo files for prompt context AND for
  code-side evidence verification through the **git port**,
  `container.git.readFile({ owner, name }, path)`
  (`adapters/git/simple-git.ts:129`) — never `fs` in a service.
  `repoIntel.getConventionSamples` returns file PATHS only, not contents.
  Evidence: `server/src/modules/conventions/service.ts`.
- **2026-06-28** — `MockGitClient.readFile` returns `''` for an unknown path —
  it does NOT throw (`src/adapters/mocks.ts:293`). So a service that drops a
  candidate when "the file doesn't exist" won't see null in a unit/integration
  test; an absent-file citation instead surfaces as line-out-of-range on empty
  content. To exercise the drop path: seed
  `new MockGitClient({ files: { 'p': contents } })` and cite a line greater than
  the file's length. `MockLLMProvider({ structured })` validates the fixture
  against the call's Zod schema, so the fixture must satisfy the real schema.

## Tooling Notes

- **2026-06-20** — `pnpm typecheck`/`pnpm test` abort in this env on a dep
  build-script pre-check (`ERR_PNPM_IGNORED_BUILDS` → "pnpm install" exit 1).
  Run the local binaries directly instead: `./node_modules/.bin/tsc --noEmit -p
  tsconfig.json`, `./node_modules/.bin/vitest run`. Pre-existing tsc errors in
  `reviewer-core`/`adapters/llm` (missing `openai`/`zod` modules, `unknown→T`)
  are env noise, unrelated to app code.
- **2026-06-28** — `drizzle-kit generate` is INTERACTIVE when a column is
  dropped while others are added (it asks "created or renamed from another
  column?" per new column) and IGNORES piped stdin / heredocs. Drive it with a
  pty via `expect`:
  `expect -c 'spawn ./node_modules/.bin/drizzle-kit generate; expect { -re {created or renamed} { send "\r"; exp_continue } eof }'`
  — Enter selects the default "create column". Confirm the new `.sql` landed in
  `meta/_journal.json` afterward (see the 2026-06-20 journal note above).

## Recurring Errors & Fixes

- **2026-06-28** — `db:migrate` failing with Postgres **`42701`** ("column
  already exists") means the **shared dev DB drifted ahead of on-disk
  migrations** — typically a table was `drizzle-kit push`ed directly in a prior
  session (e.g. `conventions` already had `category`/`status`/`created_at`
  **plus an extra `scan_id`** and a `__drizzle_migrations` row with no matching
  on-disk file), so the new migration's `ALTER … ADD COLUMN` re-adds existing
  columns. Fix for an **empty** table: revert it to its pre-migration (`0000`)
  shape via psql, then `./node_modules/.bin/tsx src/db/migrate.ts` applies the
  new migration cleanly and records it. Prove the chain is deploy-safe on a
  throwaway DB first:
  `docker exec -i devdigest-postgres psql -U devdigest -d devdigest -c 'CREATE DATABASE devdigest_migtest'`
  then `DATABASE_URL=postgres://devdigest:devdigest@localhost:5432/devdigest_migtest ./node_modules/.bin/tsx src/db/migrate.ts`.
  Note: `docker exec` needs **`-i`** to receive a heredoc/SQL on stdin (without
  it the SQL silently no-ops). Evidence:
  `server/src/db/migrations/0011_typical_talos.sql`.
