# client — insights

Decisions/insights log for `@devdigest/web` — the *why* behind a non-obvious
choice (tradeoffs considered, what was rejected and why), not the *what*
(that's [`specs/`](./specs/)) or the *how it works* (that's [`docs/`](./docs/)).

## Codebase Patterns & Tool/Library Notes

- **2026-06-20** — Run cost is rendered through one shared component,
  `client/src/components/RunCostBadge/RunCostBadge.tsx`, used in three places:
  the PR-list `COST` column (`variant="compact"`, PRRow), the run-timeline row
  (`variant="detailed"` → `$0.014 · 8.2K→1.3K`, RunHistory), and the trace
  flyout Stats section (calls `formatCost` directly, TraceBody). Reuse it —
  don't re-format cost inline. Rule: `cost == null` → `"—"` (no data);
  `cost === 0` → `"$0.00"` (genuinely free model only). The detailed variant
  hides tokens unless cost and both token counts are present.
