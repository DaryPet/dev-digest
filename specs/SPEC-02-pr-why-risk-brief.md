# Spec: PR Why + Risk Brief  |  Spec ID: SPEC-02  |  Status: draft

## Проблема й навіщо

Today a developer opening a PR sees per-agent verdicts, raw findings, and (per
L03/L04) machine-derived Intent and Blast-radius panels — but nothing that
synthesizes all of that into one plain-language answer to "what is this PR,
why was it opened, how risky is it, and which few lines should I read first."
This is the "PR Brief card" deliverable of lesson **L05**
(`README.md`: "L05 | Project Context Folder · Onboarding generator · PR Brief
card") — Project Context Folder (SPEC-01) already shipped; this spec is the
PR Brief card itself.

**Explicit amendment note:** the Overview tab already has a component named
`PrBriefCard` at the top of the tab, shipped ahead of this feature
(`client/.../_components/PrBriefCard/`), rendering a review-verdict banner
(verdict label/color, findings·blockers pill, the selected review's own
summary, score ring) sourced from `usePrReviews`/`usePrRuns` — frozen by
`specs/pr-overview-visual-parity.md` §5.1 (2026-07-02, "PR-brief verdict
selection"). This spec **amends** that frozen decision: `PrBriefCard` is
extended in place (same file, same slot) to source its narrative/color from
the new Brief object instead of the raw verdict, while the findings·blockers
pill and score ring (independent, review-derived data) are kept unchanged.
§5.1's *selection algorithm* (`selectMostBlockingReview`) is **not**
superseded — it is reused for a second purpose (see AC-2). Developer-approved
(2026-07-12).

## Goals / Non-goals

- Goals:
  - A new `POST /pulls/:id/brief` endpoint whose LLM input is assembled
    entirely from already-built, already-computed data (PR intent, blast
    radius, smart-diff group statistics, the linked issue, attached Project
    Context documents) — zero new fetching of raw file/diff bodies.
  - One structured LLM call producing a `Brief`: `what`, `why`, `risk_level`
    (low/medium/high), `risks[]` (each grounded in a real file/endpoint),
    `review_focus[]` (each grounded in a real file:line).
  - Grounding enforcement: any risk/review_focus item citing a file, line, or
    endpoint that isn't actually present in the assembled input is dropped,
    never surfaced.
  - Per-PR cache (reusing the existing, currently-unused `pr_brief` table);
    a single endpoint that serves the cache by default and recomputes only
    when explicitly asked.
  - `PrBriefCard` (existing component, same Overview-tab slot) shows the
    Brief's `what`/`why` as its narrative and `risk_level` as its color,
    replacing the verdict-derived narrative/color it shows today; the
    findings·blockers pill and score ring stay as they are.
  - A new "REVIEW FOCUS — READ THESE FIRST" section on the Overview tab with
    a count badge, each item a clickable deep link to the referenced
    file/line.
- Non-goals (explicit exclusions):
  - Fetching any new raw file content or diff body for the Brief's LLM input
    — only already-built summaries (intent/blast/smart-diff/linked-issue/
    attached specs) are used.
  - Prior-PR history (`PrHistory` contract, Prior-PRs bar) — not mentioned by
    the TЗ; stays a separate, untouched, unbuilt feature.
  - Automatic ("flash-selector") attachment of specs/docs — reuses only the
    existing manual Project Context attachment (SPEC-01), unchanged.
  - Per-risk severity fields beyond the single overall `risk_level` — not
    requested; `risks[]` items need only a grounded file/endpoint reference.
  - Any change to intent/blast-radius/smart-diff's own endpoints, service
    logic, or UI cards beyond what's needed for Brief to read their existing
    data — all three are consumed strictly read-only.
  - Cross-repo (`org/repo#NNN`) linked-issue resolution — same same-repo-only
    adapter limitation as intent-layer.
  - A separate `GET /pulls/:id/brief` cache-read route — one `POST` endpoint
    only, per developer decision.
  - Rate-limiting/queueing concurrent recompute requests beyond disabling the
    UI's Recompute control while a request is in flight.

## User stories

- As a developer opening a PR, I want a one- or two-sentence what/why summary
  and an overall risk level, so I can gauge how carefully to review before
  reading any findings.
- As a developer, I want a short, ranked "Review Focus" list of specific
  files/lines to read first, so I don't miss the highest-risk part of a large
  PR.
- As a developer, I want every cited risk to point at a real file or
  endpoint, so I can trust and act on it instead of second-guessing whether
  the model made it up.
- As a developer, I want to force a fresh Brief after pushing more commits,
  without waiting on or trusting a stale cached one.

## Acceptance criteria (EARS)

**Input assembly**
- AC-1: The Brief's assembled LLM input SHALL be built entirely from
  already-computed data — PR intent (if computed), blast-radius
  summary/downstream data, smart-diff diff statistics by group, the linked
  issue (if resolvable via the existing GitHub adapter), and the effective
  Project Context documents attached to the selected agent — and SHALL
  include no newly-fetched raw file content or diff body beyond what these
  sources already contain.
- AC-2: THE "selected agent" used to resolve Project Context input SHALL be
  the agent behind the PR's current most-blocking review, using the exact
  same selection algorithm the existing `PrBriefCard` already applies
  (`selectMostBlockingReview`, `specs/pr-overview-visual-parity.md` §5.1).
- AC-3: IF a PR has no verdict-bearing review yet (no most-blocking review to
  select an agent from), THEN THE Brief assembly SHALL omit the Project
  Context input entirely rather than fail or block.

**LLM call & grounding**
- AC-4: WHEN the assembled input is ready, THE system SHALL make exactly one
  structured LLM call producing a Brief containing `what` (what the PR
  does), `why` (the rationale, informed by intent/linked issue when
  available), `risk_level` (one of low/medium/high), `risks` (concrete risk
  items), and `review_focus` (an ordered list of the most important files to
  look at first).
- AC-5: Every `risks` item SHALL cite at least one file path or
  endpoint/cron string that is actually present in the assembled input's own
  known set of changed files (from smart-diff) and known endpoints/crons
  (from blast-radius).
- AC-6: IF the model's raw output cites a file, endpoint, or cron absent from
  the assembled input's known set, THEN THE system SHALL drop that
  risks/review_focus item before persisting or returning the Brief.
- AC-7: Every `review_focus` item SHALL cite a real file path and a real
  line number sourced only from blast-radius caller data or smart-diff
  `finding_lines` for that PR.
- AC-8: IF no real, groundable line number exists for a file the model wants
  to flag, THEN THE system SHALL drop that `review_focus` item entirely
  rather than render a file-only or invented-line entry.

**Caching**
- AC-9: WHEN a client calls `POST /pulls/:id/brief` without a recompute flag
  AND a cached Brief already exists for that PR, THE system SHALL return the
  cached Brief and SHALL make zero new LLM calls.
- AC-10: WHEN a client calls `POST /pulls/:id/brief` and no cached Brief
  exists yet for that PR (regardless of the recompute flag), THE system
  SHALL assemble the input, make one LLM call, persist the result keyed by
  the PR, and return it.
- AC-11: WHEN a client calls `POST /pulls/:id/brief` with the recompute flag
  set, THE system SHALL bypass any existing cached Brief, reassemble the
  input from the current state of intent/blast/smart-diff/linked-issue/
  attached-specs, make one new LLM call, and — only on success — overwrite
  the persisted Brief for that PR.
- AC-12: IF a recompute call's LLM call fails, THEN THE system SHALL leave
  any previously cached Brief untouched and SHALL surface an error to the
  client rather than persisting a partial/failed result.

**UI**
- AC-13: WHEN the PR-detail Overview tab loads, THE existing `PrBriefCard`
  SHALL request that PR's Brief (get-cached-or-compute) and, once available,
  render the `what`+`why` narrative as the card's summary text and
  `risk_level` as the card's color/label, in place of the
  review-verdict-derived summary/color it renders today; the existing
  findings·blockers count pill and score ring (sourced from the PR's
  reviews, unrelated to the Brief) SHALL remain unchanged.
- AC-14: WHILE a Brief request (initial or recompute) is in flight, THE
  `PrBriefCard` SHALL show a loading state and disable its Recompute control,
  mirroring the existing Intent card's pending-state behavior.
- AC-15: IF a Brief request fails, THEN THE `PrBriefCard` SHALL render an
  explicit error/empty state for the Brief content only — it SHALL NOT block
  the rest of the Overview tab (Intent card, Blast-radius card) from
  rendering.
- AC-16: WHEN a PR's Brief has a non-empty `review_focus`, THE Overview tab
  SHALL render a "REVIEW FOCUS — READ THESE FIRST" section with a count
  badge equal to `review_focus.length`, listing each item as
  `path:line — reason`.
- AC-17: WHEN a developer clicks a `review_focus` item, THE system SHALL open
  that file at that line via the existing `githubBlobUrl` deep-link pattern
  (pinned to the PR's head sha, opened in a new tab) — the same pattern
  already used by `FindingsHoverCard` and `BlastRadiusCard` caller links.
- AC-18: IF a PR's Brief has an empty `review_focus` (no groundable items
  survived filtering), THEN THE Overview tab SHALL render an explicit,
  honest empty state for the Review Focus section — never a fabricated
  placeholder and never a silently missing section that looks broken.

## Edge cases

- PR with zero reviews → Project Context input omitted (AC-3); the
  findings·blockers pill/score ring show their own existing empty state,
  unaffected by the Brief.
- No linked issue resolvable (offline, or PR body doesn't reference one) →
  `why` is built from intent/PR title/body alone — same offline-path
  precedent as `specs/intent-layer.md` §11.
- Blast-radius index degraded/partial → whatever downstream data exists is
  still used as input; grounding (AC-5/6) only trusts what's actually
  present, so a degraded index simply yields fewer legitimate citations,
  never a crash.
- Brand-new/trivial PR with no intent computed, no blast data, no smart-diff
  findings, no linked issue, no attached specs → the Brief is still computed
  off whatever minimal signal exists (at minimum the PR title/body and
  smart-diff's file list) — never hard-blocks, mirroring intent-layer's
  "never hard-blocks" precedent; `risk_level`/`risks`/`review_focus` may
  legitimately end up minimal or empty.
- Concurrent double-click on Recompute → the control is disabled while a
  request is in flight (AC-14); only the last completed recompute persists.
- A very large PR (many blast/smart-diff entries) → the composed input may
  need a size cap before the LLM call; exact limits are an
  implementation-planner decision, not frozen here (same precedent as
  SPEC-01's "very large document" edge case).
- An attached Project Context document becomes unreadable/moved since it was
  attached → silently excluded from the Brief's input, same precedent as
  SPEC-01 AC-20 (never fails the request).

## Non-functional

- **Security:** PR title/body, linked-issue title/body, and attached Project
  Context document content are untrusted, externally/repo-authored text —
  passed into the Brief's LLM call as data only, under the same
  untrusted-wrapping convention (`wrapUntrusted`/`INJECTION_GUARD`) already
  established for intent and Project Context, never treated as instructions.
- **Reliability:** none of the five input sources (intent, blast, smart-diff,
  linked issue, attached specs) is a hard dependency for this feature — each
  degrades gracefully to "omitted" per the Edge cases above; the Brief LLM
  call itself is the only hard dependency.
- **Consistency:** the `risk_level` color/label SHALL reuse the codebase's
  existing severity/verdict color-token source (e.g. `SEV` or
  `VERDICT_META`) rather than introduce a new hand-rolled color map — this
  exact antipattern has already recurred twice per `client/INSIGHTS.md`
  (2026-06-24, 2026-07-03).

## Inputs (provenance)

- PR intent (`Intent`, if computed) — [reused: L03 — `specs/intent-layer.md`,
  `server/src/modules/intent`].
- Blast-radius summary/downstream data — [reused: L04 —
  `specs/blast-radius.md`, `server/src/modules/blast`].
- Diff statistics by group (`SmartDiff.groups`) — [reused: L03 —
  `specs/smart-diff.md`, `server/src/modules/smart-diff`].
- Linked GitHub issue — [reused: L03 pattern — same `resolveLinkedIssue`/
  `getIssue` adapter (`adapters/github/octokit.ts`) intent-layer already
  uses].
- Effective Project Context documents (attached specs) for the selected
  agent — [reused: L05 — `specs/SPEC-01-project-context-folder.md`, already
  shipped].
- Most-blocking-review agent/verdict selection — [reused: existing client
  logic, `specs/pr-overview-visual-parity.md` §5.1] [deterministic].
- Cache storage — [reused: pre-existing scaffolded `pr_brief` table,
  `server/src/db/schema/reviews.ts:57`, previously unused].
- Grounding/citation validation (filtering ungrounded risks/review_focus
  items) — [deterministic: cross-reference against the assembled input's own
  known file/endpoint/cron set — no extra LLM call].
- The Brief object itself (`what`/`why`/`risk_level`/`risks`/`review_focus`)
  — [new: 1 LLM call, via the established `resolveFeatureModel` →
  `completeStructured` pattern (`server/INSIGHTS.md` 2026-06-28/2026-06-30)].
- Existing findings·blockers count + score ring — [reused: unchanged,
  existing `PrBriefCard`/`VerdictBanner` logic (`usePrReviews`/`usePrRuns`)]
  [deterministic].

## Untrusted inputs

- **PR title/body** — untrusted repo-authored text, read as data only.
- **Linked issue title/body** — untrusted GitHub-authored text, read as data
  only.
- **Attached Project Context document content** — untrusted repo-authored
  markdown, read as data only (same treatment SPEC-01 already established,
  unchanged by this feature).
- **File/symbol/endpoint names surfaced via blast-radius/smart-diff** —
  repo-controlled strings an attacker could still influence (e.g. an
  adversarially-named file) — passed as data only, never as instructions;
  ties to the `security` skill the same way intent-layer's own
  internal-only sourcing does.
