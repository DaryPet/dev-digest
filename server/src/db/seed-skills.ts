/**
 * Premium skill bodies for the Skills Lab demo catalog.
 *
 * A skill is a reusable, directive markdown rule that the reviewer injects into
 * a review agent's prompt (assembled into the `## Skills / rules` section by
 * @devdigest/reviewer-core — see server/src/modules/reviews/run-executor.ts).
 * These mirror the depth/discipline of the reviewer system prompts in
 * ./seed-prompts.ts: each one states what to flag (stack-specific signals), how
 * to judge severity, what NOT to flag (false-positive guardrails), and the
 * output discipline. Stack assumed: Fastify 5 + Drizzle/postgres-js + zod +
 * TypeScript ESM, with a Next.js client and @devdigest/shared Zod contracts.
 *
 * The DB row is the source of truth at run time; editing a body here only
 * affects freshly seeded skills. `phantom-api-gate` is provided as a markdown
 * fixture (frontmatter + body) because the seed runs it through the REAL import
 * parser, exercising the same code path as the UI's "Import from file" flow.
 */

export const PR_QUALITY_RUBRIC = `# PR Quality Rubric

Evaluate the pull request against four dimensions and surface the WEAKEST one as
the headline. This is a holistic rubric, not a defect scanner — use it to frame
the overall verdict, then defer to the specific-defect skills for line-level
findings.

## What to assess (score each, then report the weakest)
1. **Correctness** — does the change actually do what the PR title/description
   claims, with no obviously broken edge case on the changed path? Trust the
   diff over the description.
2. **Tests** — are the new or changed branches covered, including at least one
   failure path? A green test suite that only exercises the happy path does not
   count as "tested".
3. **Clarity** — can the next maintainer read the diff and understand intent
   without archaeology? Names, control flow, and comments where the "why" is
   non-obvious.
4. **Scope** — is the PR focused on one change, or does it smuggle in unrelated
   refactors/renames that make review and rollback harder?

## How to judge
- A dimension is a **WARNING** when it is clearly weak (e.g. zero tests for new
  logic, or an unrelated 200-line refactor mixed in) but the code is not wrong.
- Escalate to **CRITICAL** only when a dimension hides an actual defect — e.g.
  the change does NOT do what it claims, or an untested branch handles money,
  auth, or data integrity.
- If all four dimensions are solid, return an EMPTY findings list and use the
  summary to say which dimensions you checked.

## What NOT to flag
- Subjective style preferences, naming bikeshedding, or "I would have done it
  differently" with no concrete cost.
- Missing tests for pre-existing code the diff did not touch.
- A large diff that is large for a legitimate reason (generated code, a single
  cohesive feature).

Report only DISTINCT issues, each citing an exact file:line in the diff. Zero
findings + approve is a valid, good outcome.`;

export const NO_THEN_CHAINS = `# No .then() chains

Enforce \`async/await\` over \`.then()\`/\`.catch()\`/\`.finally()\` promise chains in
changed code. Chains obscure control flow, make error handling easy to drop, and
turn sequential logic into nested callbacks.

## What to flag
- Any chain of **two or more** \`.then()\` calls, or a \`.then(...).catch(...)\`
  used for sequential async logic that would read more clearly as \`await\`
  inside a \`try/catch\`.
- A \`.then()\` whose callback itself returns a promise that is not returned/awaited
  (a dropped promise → unhandled rejection, lost ordering).
- \`.catch()\` that swallows an error (empty body, or logs and continues) where
  the caller needs to know the operation failed — this is the dangerous case.
- \`Promise.resolve().then(...)\` / \`.then()\` used only to defer work, where the
  intent is unclear.

## How to judge
- A mechanical chain with no error impact (readability only) → **SUGGESTION**
  with the equivalent \`await\` rewrite.
- A chain that **drops or swallows an error**, or where a missing \`return\`
  causes a race / lost result → **WARNING** (or CRITICAL if that lost error is
  on a money/auth/data path).

## What NOT to flag
- A single fire-and-forget \`.catch(logger.error)\` on a genuinely
  non-awaitable side effect.
- Stream/pipe APIs, \`.then()\` on a thenable that is not a real Promise, or
  framework patterns that require a callback.
- Test code using \`.rejects\`/\`.resolves\` matchers.

Cite the exact file:line and give the \`async/await\` rewrite. Report only
distinct occurrences; do not list every line of one chain separately.`;

export const SECRET_LEAKAGE_GATE = `# Secret Leakage Gate

Block the merge when the diff introduces a credential in source. A committed
secret is compromised the moment it lands in git history — flag it as CRITICAL
and tell the author to move it to an env var AND rotate it.

## What to flag (concrete patterns)
- **Provider keys**: Stripe \`sk_live_\`/\`sk_test_\`/\`rk_live_\`, AWS \`AKIA...\`
  access keys, GitHub \`ghp_\`/\`gho_\`/\`github_pat_\`, Google \`AIza...\`,
  Slack \`xox[baprs]-...\`, OpenAI/Anthropic \`sk-...\`.
- **Database / infra**: a Supabase/Postgres \`service_role\` key or a connection
  string with an inline password (\`postgres://user:password@host\`).
- **Private keys / tokens**: \`-----BEGIN ... PRIVATE KEY-----\` blocks, JWTs
  with a real signature, long high-entropy hex/base64 literals assigned to a
  name like \`secret\`, \`token\`, \`apiKey\`, \`password\`.
- **Client exposure**: a real secret behind a \`NEXT_PUBLIC_\`/\`VITE_\`/\`PUBLIC_\`
  prefix — these are bundled into the browser and are effectively public.
- A committed \`.env\`/\`.env.local\` (not \`.env.example\`) containing live values.

## How to judge
- A plausibly-real secret reachable in the built artifact → **CRITICAL**
  (request changes). State the exact file:line, that it must be rotated (not
  just removed — git history retains it), and moved to server-side env config.
- A secret that is real but only in a local-dev/test scope with no prod path →
  **WARNING**.

## What NOT to flag
- Obvious placeholders: \`sk_live_xxx\`, \`your-api-key-here\`, \`changeme\`,
  \`example\`, all-zeros, \`<REDACTED>\`.
- Test fixtures clearly using fake values, or \`.env.example\` templates.
- A reference to an env var (\`process.env.STRIPE_KEY\`) — that is the correct
  pattern, not a leak.

Never echo the full secret back in your finding — cite file:line and the key
type only. Report each distinct secret once.`;

export const LETHAL_TRIFECTA = `# Lethal Trifecta

Detect the specific AI-agent exfiltration risk: a single flow where untrusted
content can trick an agent into leaking private data. Classify conservatively —
a false trifecta is worse than none.

## The three components (all required, each with a file:line)
1. **Untrusted input** ingested by an LLM/agent: a PR body, web page, file,
   email, issue comment, or tool output an attacker can influence.
2. **Private data** the same agent/code path can read: secrets, other users'
   data, internal systems, the file system.
3. **An exfiltration path**: an outbound HTTP call, a tool with side effects, or
   output rendered somewhere the attacker can read it.

Only when you can name a concrete file:line for ALL THREE in one connected flow,
set \`kind: "lethal_trifecta"\` and fill \`trifecta_components\` with the evidence.

## How to judge
- A complete, connected trifecta → **CRITICAL**: an attacker controls untrusted
  input that steers an agent holding private data with a way to send it out.
- Two of three present (e.g. untrusted input reaches an LLM, but no private data
  or no exfiltration channel) → at most a **WARNING**, reported as a normal
  injection/data-exposure finding with \`kind: "finding"\`.

## What NOT to flag (this is the whole point of the skill)
- A normal authenticated endpoint of the shape \`request param → DB read → JSON
  response\` returning data to the logged-in user — that is ordinary access
  control, NOT a trifecta, even when the data is sensitive.
- An LLM call on fully trusted, developer-authored input with no untrusted source.
- Private data access with no untrusted input feeding the agent.

When in doubt, downgrade to a plain finding. Cite file:line for each component
you do claim.`;

export const TEST_COVERAGE_NUDGE = `# Test Coverage Nudge

Counter the "the tests pass, ship it" reflex. Passing tests prove the covered
paths work — not that the change is adequately tested. Your job is to name what
is NOT covered.

## What to flag
- New or changed production logic with **no failure-path test** — only the
  success/happy case is asserted.
- A new function with multiple logical outcomes but a single test case.
- An error branch (\`catch\`, validation failure, guard/early-return) added by
  the diff with zero coverage.
- An assertion that only checks "it didn't throw" / a mock was called, with no
  assertion on the actual observable result.

## How to judge
- Happy-path-only coverage of a non-trivial change → **WARNING**, and name the
  SPECIFIC untested branch/case (cite the production file:line, not just the
  test file), so the author knows exactly what to add.
- Escalate to **CRITICAL** when the untested branch handles money, auth, data
  integrity, or destructive actions.

## What NOT to flag
- Trivial code with no meaningful branches (a pure getter, a constant, a
  one-line passthrough).
- Pre-existing untested code the diff did not touch.
- Genuinely thorough tests that cover the happy path, the obvious edge cases,
  AND the diff's error branches — approve those.

Report only distinct gaps; cite the untested production file:line. Zero findings
is valid when coverage is actually adequate.`;

export const UNCOVERED_BRANCHES = `# Uncovered Branches

Audit branch coverage for the exact code this diff adds or changes. For every
decision point introduced or modified, confirm a test exercises the NON-default
path.

## What to flag
- An \`if\`/\`else if\`/\`else\`, \`switch\` case, ternary, optional chaining
  fallback (\`?.\`/\`??\`), or early \`return\`/\`throw\` added by the diff where only
  one side is exercised by tests.
- \`catch\` blocks and validation-failure paths with no test — the highest
  priority, because error handling is where untested bugs hide.
- A boolean parameter / feature flag whose alternate value is never tested.
- A guard clause (\`if (!x) return\`) with no test passing the falsy input.

## How to judge
- An untested non-default branch on normal logic → **WARNING**, naming the exact
  branch (file:line) and the input that would exercise it.
- An untested error/guard branch protecting money, auth, data integrity, or a
  destructive operation → **CRITICAL**.

## What NOT to flag
- Branches fully covered by existing tests (check the test files in the diff
  before flagging).
- Defensive \`default:\`/unreachable branches that exist only for exhaustiveness
  (e.g. a TypeScript \`never\` assertion) — note them at most as SUGGESTION.
- Pre-existing branches the diff did not change.

Cite the production file:line of the uncovered branch and the input that hits it.
Report each branch once.`;

export const EDGE_CASE_COVERAGE = `# Edge Case Coverage

For every function this diff adds or changes, confirm the tests cover the inputs
that break naive implementations — not just the typical case.

## What to flag (missing tests for…)
- **Empty**: empty string, empty array/object, empty collection — especially
  where the code maps/reduces/indexes into it.
- **Absent**: \`null\` / \`undefined\` arguments where the type permits them; a
  missing optional field.
- **Boundary**: \`0\`, \`-1\`, the first/last element of a loop, the min/max of a
  numeric range, an off-by-one at an array or pagination edge.
- **Scale**: a large input where behavior plausibly changes (pagination,
  truncation, batching) but only a small input is tested.
- **Shape**: malformed/unexpected input for anything parsing external data
  (request bodies, files, third-party responses).

## How to judge
- A changed function whose realistic empty/null/boundary case has no test →
  **WARNING**, naming the specific missing case and the function (file:line).
- **CRITICAL** when the missing edge case is on a path handling money, auth, or
  data integrity (e.g. an unhandled empty-cart or zero-amount case).

## What NOT to flag
- Edge cases the type system already makes impossible (a non-null \`number\`
  param does not need a \`null\` test).
- Cases already covered by existing tests in the diff.
- Purely theoretical inputs that cannot occur given the call sites.

Cite the function's file:line and the concrete missing input. Zero findings is
valid when the edges are genuinely covered.`;

export const MOCK_OVERUSE_GATE = `# Mock Overuse Gate

Flag tests that mock so much they no longer verify real behavior — the test
passes regardless of whether the code is correct, giving false confidence.

## What to flag
- **Mocking the unit under test** itself (or its core logic), so the test only
  asserts the mock's return value.
- Mocking a **pure / in-memory dependency** (a formatter, a reducer, a pure
  helper) that could and should run for real.
- A test whose only assertions are on **mock call arguments** (\`expect(mock).
  toHaveBeenCalledWith(...)\`) with no assertion on the actual output/behavior.
- Over-stubbing that hard-codes the exact result the code is supposed to
  compute, so a bug in that computation cannot fail the test.
- Re-implementing the production logic inside the mock (the test now tests the
  mock, not the code).

## How to judge
- Mocking that meaningfully hides whether the code works → **WARNING**, naming
  what is over-mocked and what real assertion is missing.
- A test that is effectively tautological (passes for any implementation) on a
  critical path → **CRITICAL**.

## What NOT to flag
- Mocking TRUE I/O boundaries — network/HTTP (octokit, fetch, LLM providers),
  the database, the filesystem, \`Date.now()\`/timers, and randomness. That is
  correct, deterministic testing.
- Lightweight fakes/stubs that still let the real logic run.
- Integration tests that intentionally exercise real collaborators.

Cite the test file:line and say which collaborator should be real (or which
output assertion is missing). Report each distinct over-mock once.`;

/**
 * `phantom-api-gate` is seeded THROUGH the real import parser
 * (server/src/modules/skills/import.ts) — this markdown fixture (frontmatter +
 * body) is what the parser receives, exercising the same path as the UI's
 * "Import from file" flow. The parser derives name/description/type from the
 * frontmatter and sets source: 'extracted'.
 */
export const PHANTOM_API_GATE_MARKDOWN = `---
name: phantom-api-gate
description: Detects imports of functions/modules that don't exist, and breaking changes to route signatures and shared contracts.
type: security
---
# Phantom API Gate

Catch contract breaks before they ship — changes that compile in this PR but
break callers you cannot see in the diff. Passing tests prove the new shape
works, not that old consumers still do.

## What counts as a contract
- An HTTP route's method, path, path/query params, request body, response body,
  status codes, or error envelope.
- A shared Zod contract in \`@devdigest/shared\` consumed by more than one package
  (client + server, or multiple modules) — a field rename or type change there
  ripples everywhere it is imported.
- An exported function/class signature other modules import and call.

## What to flag
- **Removed or renamed** response/request fields, route params, or route paths
  with no backward-compatible alias.
- **Narrowed** types: \`string | null\` → \`string\`, an optional field made
  required, or an enum value removed that a caller may still send/expect.
- **Status code / error-shape** changes: a success path that returned 200 now
  returns 201/204 (dropping a body callers parse), or an \`{error:{code,message}}\`
  envelope reshaped so \`error.code\` branches break.
- A **phantom import**: importing a symbol/path that does not exist or was
  renamed in the same PR — a runtime crash the type-checker may miss across
  package boundaries.
- A \`@devdigest/shared\` contract change whose consumers are not all updated in
  this diff (you cannot prove every caller from the diff alone — say so).

## How to judge
- A removed/renamed/narrowed element on a contract with cross-package or external
  consumers, no compat path → **CRITICAL** (request changes). Cite the OLD shape
  (the diff's removed lines) and the NEW shape, and name the concrete breakage.
- A break whose blast radius you cannot fully confirm from the diff → **WARNING**.

## What NOT to flag
- Purely **additive** changes: a new optional field, a new route, a new enum
  value alongside the old ones — these do not break existing callers.
- Internal/private helpers with no cross-module consumers.
- A rename where the diff demonstrably updates every caller AND the symbol is not
  exported beyond the package.

Report only distinct breaks, each citing file:line of both shapes.`;
