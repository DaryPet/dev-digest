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

- **2026-07-03** — `container.ts:70-72` added `reviewRepo`/`agentsRepo`
  getters specifically so a cross-domain module can read another module's
  data without `new XRepository(container.db)` reaching into that module's
  folder — but both `intent/service.ts:30` and `smart-diff/service.ts:26`
  bypass the accessor and construct `new ReviewRepository(container.db)`
  directly anyway. Flagged by `architecture-reviewer` as a Major boundary
  smell in isolation, but downgraded to informational here: it's the exact
  pattern the plan for `smart-diff` explicitly froze (`specs/smart-diff.md`
  §4, "Reused as-is via `new ReviewRepository(container.db)`... Not
  modified"), it's already the precedent set by `intent`, and fixing only one
  of the two would leave them inconsistent — by developer decision, left
  as-is (not fixed this session). If a third cross-domain module repeats this,
  treat it as a real cross-cutting cleanup (all three call sites switched to
  `container.reviewRepo` together), not another one-off.

- **2026-07-05** — SDK-isolation template for a "thin adapter over the domain"
  module that wraps an external SDK (first used by the local MCP stdio server,
  `server/src/mcp/`). Keep ALL runtime imports of the external SDK
  (`@modelcontextprotocol/sdk`) in just the two presentation entry files
  (`mcp/index.ts` = `StdioServerTransport`, `mcp/server.ts` = `McpServer`); the
  application layer (`mcp/application/mcp-service.ts`) returns a **neutral
  discriminated union** `McpResult<T> = {kind:'ok',data} | {kind:'error',...}`,
  and the SDK's `CallToolResult` conversion is localized to the tool handlers
  (`mcp/tools/*.ts` via `toolError`/`toolSuccess` in `mcp/errors.ts`). Tool
  files pull the server type as `import type { McpServer }` and receive the
  instance as a parameter, so even they are SDK-runtime-free. Payoff: every
  logic file (application/infrastructure/helpers/schemas/errors) typechecks and
  unit-tests **before** the real `pnpm install` of the SDK — critical because a
  brand-new dep can't be installed in the sandbox (see Tooling Notes). Reuse
  this split for any future external-SDK adapter.
- **2026-07-05** — `db/rows.ts` re-exports most row shapes
  (`AgentRow`/`FindingRow`/`PullRow`/`AgentRunRow`, etc.) so cross-cutting
  consumers avoid importing another module's `repository.ts` — but it did NOT
  export `ConventionRow`, so consumers of the conventions row shape either
  duplicated `typeof t.conventions.$inferSelect` locally or reached into
  `modules/conventions/repository.ts` (the exact cross-module drift `db/rows.ts`
  exists to prevent; `architecture-reviewer` flagged it Minor). Added
  `ConventionRow` to `db/rows.ts` this session. When adding a new
  conventions-row consumer, import from `db/rows.js`, never the module.
- **2026-07-05** — MCP unit-test patterns without a real DB
  (`server/src/mcp/**/*.test.ts`): `McpService` takes an optional
  `overrides?: { reviewService?, mcpRepo? }` constructor arg so tests inject
  stubs while production falls through to `new ReviewService/McpRepository`;
  stub a Drizzle table by keying its name off `Symbol.for('drizzle:Name')`;
  `AuthProvider.currentWorkspace(req: unknown)` requires the arg even in no-auth
  mode (pass `null`); `CallToolResult.content` is a union, so reading `.text`
  in a test needs an `item.type === 'text'` guard first (else TS2339).

- **2026-07-06** — A pure, zero-I/O helper that physically lives under
  `adapters/` (e.g. `adapters/git/diff-parser.ts`, which imports only
  `@devdigest/shared` types) MAY be imported by a presentation entry point
  without breaking the Onion dependency rule — the real side effect must stay
  behind an injected seam. Precedent: the pre-push CLI's `review-command.ts`
  imports `parseUnifiedDiff` directly while the actual `git diff` call is
  behind the injected `getGitDiff` wrapper; `architecture-reviewer` graded it
  Minor/low-confidence and it was deliberately kept (frozen in
  `specs/blast-radius.md` §5.5). Don't re-litigate this exact import in future
  reviews; a helper like this can also just be relocated out of `adapters/`.
  Evidence: `server/src/cli/review-command.ts`, `server/src/cli/git-diff.ts`.

- **2026-07-11** — Adding a nullable jsonb column to `agents`/`skills` still
  makes it a **required key** in the `$inferSelect` row type (`T | null`, not
  optional), so every pre-existing test file that hand-builds a fully-typed
  `AgentRow`/`SkillRow` object literal breaks with TS2741 — including files far
  outside the feature's scope. Only `tsc --noEmit` surfaces this (vitest runs
  esbuild and ignores types). Budget a repo-wide fixture sweep into any schema
  column addition. Evidence: `src/db/schema/agents.ts` (`projectContextPaths`),
  fixed fixtures in `src/cli/review-command.test.ts`,
  `src/mcp/application/mcp-service.test.ts`.
- **2026-07-11** — Passing an object literal whose keys have ZERO overlap with
  an all-optional-fields interface triggers TS2559 ("no properties in common")
  even through an intermediate `const` — TS weak-type detection, not the
  excess-property check. A test that deliberately exercises a patch outside the
  interface (e.g. proving `project_context_paths` is NOT a version-bump field)
  needs `as unknown as InterfaceName`. Evidence:
  `src/modules/agents/helpers.test.ts`, `src/modules/skills/helpers.test.ts`.
- **2026-07-11** — A module with no tables of its own that needs the minimal
  repo row (owner/name/clone path) queries `t.repos` directly in its own
  workspace-scoped `repository.ts` — the `repo-intel/repository.ts`
  `getRepoBasics` precedent — rather than inventing a `container.reposRepo`
  accessor. Nuance to the 2026-07-03 cross-domain note: `project-context` also
  constructs `new SkillsRepository(container.db)` as a named class field
  (container exposes only `agentsRepo`/`reviewRepo`; the plan froze exactly one
  additive getter) — that's now a third direct-construction site, so the
  cross-cutting cleanup flagged there is due if another one appears. The named
  field keeps it test-swappable via
  `(svc as unknown as {repo}).repo = {...}`. Evidence:
  `src/modules/project-context/{repository,service}.ts`.

- **2026-07-17** — The L06 eval module (`server/src/modules/eval/service.ts`)
  is a full cross-domain feature (case CRUD, from-finding creation, run
  execution, dashboard aggregation, Promote) that reads agents/reviews data
  EXCLUSIVELY through `container.agentsRepo`/`container.reviewRepo` — zero
  `new AgentsRepository(...)`/`new ReviewRepository(...)` anywhere in the
  module, confirmed by grep. It's the fourth cross-domain module after
  `intent`/`smart-diff`/`project-context` (the 2026-07-03/07-11 entries'
  deviation trio) and did NOT need to bypass the accessor pattern to get its
  job done — including a route (`POST /findings/:id/eval-case`) that resolves
  finding→review→agent→PR-files, arguably the most cross-domain-heavy read in
  the codebase so far. Strengthens the case, per the 2026-07-03 entry's own
  closing note, that the `intent`/`smart-diff`/`project-context` direct
  construction is a real cleanup opportunity, not an unavoidable pattern —
  due if a cross-cutting pass through those three ever happens.
- **2026-07-17** — Design precedent for "a deeply-nested leaf component needs
  an action that requires data owned by an ancestor 5+ levels up": prefer a
  dedicated server route that re-resolves the needed context from a stable
  identifier, over threading new props through every intermediate component.
  `POST /findings/:id/eval-case` (`modules/eval/service.ts`,
  `createCaseFromFinding`) resolves `finding.id` → review → agent → PR files
  entirely server-side so `FindingCard` (5 component levels below the page
  that has the PR/agent context) needed ZERO new props to gain a "Turn into
  eval case" action — confirmed by architecture-reviewer: the prop list is
  byte-identical to before the feature. The alternative (client assembles the
  diff fragment and threads `agentId`/`prFiles` down through
  `FindingsTab`→`ReviewRunAccordion`→`FindingsPanel`→`FindingCard`) was
  explicitly considered and rejected in `plans/eval-pipeline.md` §2. Reuse
  this "resolve server-side from an id, not client-side via prop-threading"
  pattern for the next feature with a similar shape.

## Tooling Notes

- **2026-06-20** — `pnpm typecheck`/`pnpm test` abort in this env on a dep
  build-script pre-check (`ERR_PNPM_IGNORED_BUILDS` → "pnpm install" exit 1).
  Run the local binaries directly instead: `./node_modules/.bin/tsc --noEmit -p
  tsconfig.json`, `./node_modules/.bin/vitest run`. Pre-existing tsc errors in
  `reviewer-core`/`adapters/llm` (missing `openai`/`zod` modules, `unknown→T`)
  are env noise, unrelated to app code.
- **2026-07-03** — Nuance to the 2026-06-20/2026-06-24 "pnpm install fails on
  `ERR_PNPM_IGNORED_BUILDS`" notes: `pnpm install --lockfile-only` **works** in
  this env (build scripts never run, so the pre-check doesn't trigger). That's
  enough to re-sync `pnpm-lock.yaml` after editing `package.json` specifiers
  (e.g. pinning exact versions) — resolved versions stay put, only
  `specifier:` lines change, plus pnpm v11 adds harmless `libc:` metadata to
  native optional deps. Actually *adding* a new package still needs a real
  install and remains not viable here. Evidence: `client/pnpm-lock.yaml`
  regenerated 2026-07-03.

- **2026-07-05** — Claude Code IGNORES the `cwd` field in `.mcp.json` and
  launches stdio MCP servers from the repo root. Symptom: `/mcp` says
  `Failed to reconnect to devdigest: -32000` while the same command works
  fine when run manually from `server/`. Three cwd-dependent things break in
  sequence: (1) a relative entry path in `args`, (2) tsx's tsconfig discovery —
  without `server/tsconfig.json` the `@devdigest/shared` path alias fails with
  `ERR_MODULE_NOT_FOUND` even when the entry path is absolute, (3)
  `dotenv/config`, which loads `.env` from cwd (repo root has none). Fix, all
  three in `.mcp.json`: absolute entry path, `--tsconfig
  <abs>/server/tsconfig.json` in `args`, and
  `DOTENV_CONFIG_PATH=<abs>/server/.env` in `env`. Verify with a manual
  handshake: pipe `initialize` + `notifications/initialized` + `tools/list`
  JSON-RPC lines into the exact command from the repo root. Evidence:
  `.mcp.json`, `server/src/mcp/index.ts:11`.

- **2026-06-28** — `drizzle-kit generate` is INTERACTIVE when a column is
  dropped while others are added (it asks "created or renamed from another
  column?" per new column) and IGNORES piped stdin / heredocs. Drive it with a
  pty via `expect`:
  `expect -c 'spawn ./node_modules/.bin/drizzle-kit generate; expect { -re {created or renamed} { send "\r"; exp_continue } eof }'`
  — Enter selects the default "create column". Confirm the new `.sql` landed in
  `meta/_journal.json` afterward (see the 2026-06-20 journal note above).

- **2026-07-06** — `node:util.parseArgs` option declarations in TS need
  `as const` on each option's `type` field (`{ type: 'string' as const }`) —
  without it the values type broadens to `string | boolean |
  (string | boolean)[]` and won't assign to `string`, even though the option
  is declared as a string. Evidence: `server/src/cli/index.ts`.
- **2026-07-06** — `test/conventions.it.test.ts` fails 3/4 against the shared
  dev DB **on pristine HEAD too** (verified on c72490e) — it's a pre-existing
  state-dependent failure, not a regression signal; don't let it block an
  unrelated diff. Technique to prove a full-suite failure is pre-existing
  without stashing (safe while read-only subagents run):
  `git worktree add <scratchpad>/baseline HEAD`, symlink
  `server/node_modules` into it, copy `server/.env`, run the failing file
  there, then `git worktree remove --force`. Evidence: baseline run
  2026-07-06, `test/conventions.it.test.ts`.

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
- **2026-07-06** — Nuance to the 2026-06-30 non-ASCII corruption note above:
  the risk is specific to `Edit` on files that already contain non-ASCII near
  the target. `Write` of a NEW file containing `·`/`—`/`…` encodes correct
  UTF-8 (confirmed: `blast/service.ts` summary string written with a literal
  `·`). For *inserting* non-ASCII into an existing ASCII file, use the Python
  byte-replace workaround from the 2026-06-30 entry. Evidence:
  `server/src/modules/blast/service.ts`.

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
