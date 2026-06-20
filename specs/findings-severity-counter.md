# Spec: Findings Severity Badges

Surface a **per-severity findings breakdown** in three places, matching the
product's design mockups exactly (compact icon + count, no text labels):
the PR list, the PR-detail timeline, and a clickable filter row above
"Review runs" on the PR detail page. No new model calls anywhere — pure
aggregation over data already produced by past reviews.

## Visual design

A badge is **icon + number only** — no spelled-out severity word — colored
per severity (red `AlertOctagon` = CRITICAL, orange `AlertTriangle` =
WARNING, blue `Lightbulb` = SUGGESTION), reusing the existing `SEV` token map
(`client/src/vendor/ui/primitives/tokens.ts:6`, the same tokens behind
`SeverityBadge`/`FindingCard`'s `SEV_COLOR`). Hovering a badge shows a
floating preview card listing the underlying findings (title, file:line,
category) — not just a plain tooltip string.

Shared component: `client/src/components/SeverityCounts/` —
`SeverityCounts` (the badge row; `onClick` makes it interactive/filterable,
omit it for a static display) and `FindingsHoverCard` (the hover preview
popup, wraps any badge; renders nothing extra when `items` is empty).

## 1. PR list — FINDINGS column

Between SCORE and STATUS (`client/src/app/repos/[repoId]/pulls/constants.ts`
— `COLUMN_KEYS`, `GRID`). Static (non-clickable) `SeverityCounts` +
`FindingsHoverCard`, sourced from `PrMeta.findings` — the **latest review's**
severity counts and a capped (10) preview list, computed on read in
`server/src/modules/pulls/routes.ts`'s `GET /repos/:id/pulls` (one
row-level `findings` query per latest-review id, grouped/capped in JS — no
denormalized column). `null` until the PR has a review → renders `—`,
mirroring `score`'s nullability convention.

## 2. PR detail → Agent runs → Timeline

Each run row (`RunHistory.tsx`) shows critical (`blockers`) + warning
(`warnings`) counts inline, replacing the old `"N finding(s)"` text. `
RunSummary.warnings` (`.../contracts/trace.ts`) is new — computed on read in
`listRunsForPull` (`server/src/modules/reviews/repository/run.repo.ts`) via
a join `findings` ← `reviews.run_id`, since (unlike `blockers`/
`findings_count`) it isn't denormalized onto `agent_runs`. The hover preview
here needs no extra request: `FindingsTab` already holds the full
`ReviewRecord[]` (with `findings`) and builds a `run_id → findings` map
passed into `RunHistory` as `findingsByRunId`.

## 3. PR detail → Review runs → severity filter

The clickable aggregate row (`SeverityCounter`, same folder as before) above
"Review runs" — counts across every run currently in the Findings tab.
Clicking a level filters every run's `FindingsPanel` to that severity
(`visibleFindings(findings, hideLow, severityFilter)`); the filter state
lives in `?severity=` (alongside the existing `?tab=`/`?trace=` convention in
`page.tsx`). A collapsed run accordion auto-opens while a filter is active
(`ReviewRunAccordion`'s `effectiveOpen = open || severityFilter != null`) so
a match isn't hidden.

## Note on a reversed decision

`pulls/routes.ts` previously had a comment stating the per-severity
breakdown was "intentionally not surfaced on the list — findings live on
the PR detail page." This spec reverses that, per explicit direction to
match the design mockups (`screen_dashboard.jsx`) exactly, in both
locations they appear.
