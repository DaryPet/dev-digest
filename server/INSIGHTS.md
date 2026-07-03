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

- **2026-06-30** — `resolveFeatureModel` → `completeStructured` now has a
  second real consumer beyond `conventions`: the `intent` module
  (`server/src/modules/intent/service.ts`, feature slot `review_intent`)
  confirms the pattern generalizes to any "system-LLM feature with internal-only
  sourcing". Template for the next such feature: same-repo linked issue via the
  existing GitHub adapter (`resolveLinkedIssue`/`getIssue`,
  `adapters/github/octokit.ts`), an in-repo file referenced by path via the git
  port (capped count, silently drop empty/unknown paths — see the
  `MockGitClient.readFile` note above), and explicitly **no fetching of
  external URLs** found in free text (PR body/issue body) — leave them as
  plain text in the prompt. Evidence: `server/src/modules/intent/service.ts`.
- **2026-06-30** — A path-extraction regex over free-form PR-body prose (e.g.
  `extractSpecPaths` in `server/src/modules/intent/helpers.ts`, used to find an
  in-repo spec file referenced by path) greedily captures trailing
  sentence-punctuation (`specs/foo.md.` at the end of a sentence). Strip it
  after matching: `.replace(/[.,;:!?)'"\]}>]+$/, '')` per match.
- **2026-07-03** — `completeAgentRun` (`reviews/repository/run.repo.ts:166`)
  must guard its `UPDATE` on `status = 'running'` (same pattern as the
  sibling `cancelRunIfRunning`), otherwise it silently overwrites an
  already-terminal row. Cause: `cancelRun` (`reviews/service.ts:85`) marks a
  row `cancelled` and completes the run bus immediately, but the orphaned
  `runOneAgent` promise (`run-executor.ts`) keeps awaiting the LLM call in
  the background — for `single-pass` (the project default,
  `reviews/constants.ts`) there is no cancellation checkpoint once the call
  has started (`checkCancelled()` in `reviewer-core/src/review/run.ts:170`
  only runs between chunks, and single-pass is exactly one chunk). When the
  orphaned call eventually errors on its own (observed: `ECONNRESET` ~36 min
  later, plausibly a suspended laptop), its catch block used to overwrite
  the row to `failed`, making a cancelled run look like a crash. Checking
  `runBus.isCancelled(runId)` in that catch block does NOT fix it —
  `RunBus.complete()` (`platform/sse.ts`) deletes the runId from the
  `cancelled` Set before the orphaned call's catch ever runs, so the
  in-memory flag is already gone; only a DB-level status guard is race-proof.
  Actually aborting the wasted in-flight request (not just hiding the
  symptom) needs `AbortSignal` propagated through
  `reviewer-core`'s `LLMProvider`/`OpenRouterProvider` — deliberately out of
  scope here, planned at `todo/abort-signal-cancellation.md`.

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

- **2026-06-30** — The `Edit` tool can corrupt a TypeScript file when the
  edit target is near existing non-ASCII characters (e.g. the `·` middle dot
  or a curly apostrophe `'`/U+2019): it can silently convert ASCII straight
  single-quote string delimiters (U+0027) into Unicode smart quotes
  (U+2018/U+2019), producing `TS1127 "Invalid character"` and cascading tsc
  failures. Hit while changing `FEATURE_MODELS` entries in
  `server/src/vendor/shared/contracts/platform.ts` — several entries in that
  file (`'PR Review · Intent'`, curly-apostrophe descriptions) carry non-ASCII
  text, so this will recur on future edits there. Workaround: for files with
  embedded non-ASCII literals near the edit target, do a byte-safe replacement
  (e.g. a one-off Python `content.replace(old_bytes, new_bytes)`) instead of
  the `Edit` tool, then verify with `tsc --noEmit`.

- **2026-06-28** — `conventions` feature slot was defaulted to `openai/gpt-5.4` — wrong for this project. The standard across ALL features is `openrouter` + `deepseek/deepseek-v4-flash` (see `server/src/db/seed.ts:29`, `platform.ts:49`). Any new feature slot added to `FEATURE_MODELS` in `vendor/shared/contracts/platform.ts` must use `defaultProvider: 'openrouter'`, `defaultModel: 'deepseek/deepseek-v4-flash'` unless there is a specific reason to differ. Using a provider whose key isn't configured causes a **`ConfigError` → 500** (see below).
- **2026-06-28** — `ConfigError` (thrown by `container.llm(id)` when an API key is missing) extends `AppError` with `statusCode = 500` (`platform/errors.ts:39`). So a missing API key surfaces as a plain 500 — no descriptive body in the browser console. Diagnose by checking the server terminal for `ConfigError: <PROVIDER>_API_KEY is not configured`.

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
