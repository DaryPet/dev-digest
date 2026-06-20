# Spec: Run Cost Badge

Surface the **USD cost of each review run** in the UI, reusing usage data the
engine already returns. No new model calls.

## Goal

Every *completed* agent run shows what it cost, in three places:

1. **PR list** — a `COST` column, compact (`$0.012`).
2. **PR detail → run timeline** — a detailed badge on each run row
   (`$0.014 · 8.2K→1.3K`, i.e. cost · tokens in→out).
3. **Run trace flyout → Stats** — a `COST` stat beside Duration / Tokens /
   Findings.

## Data source (zero extra model calls)

Cost is already computed inside the engine and must not trigger any new request:

- `reviewer-core/src/llm/openrouter.ts` reads `usage.cost` straight from the
  OpenRouter response (an OpenRouter extension), falling back to an injected
  `estimateCost(model, tokensIn, tokensOut)`.
- The server injects pricing via `PriceBook`
  (`server/src/platform/price-book.ts`) when constructing `OpenRouterProvider`
  in `server/src/platform/container.ts`.
- `reviewer-core/src/review/run.ts` returns `costUsd` on the run outcome.

The run executor threads `outcome.costUsd` → `agent_runs.cost_usd` → the API
contracts → the client.

## Contract fields

`cost_usd: number | null` is added to:

- `RunStats` and `RunSummary` (`…/contracts/trace.ts`) — per-run cost.
- `PrMeta` (`…/contracts/platform.ts`) — the **latest review's** cost, for the
  list column only (mirrors how `score` is the latest-review score).

Vendored client copies under `client/src/vendor/shared/contracts/` are kept in
sync with the server copies.

## Display rules

- **`null` → render `—`.** No attributable cost: unknown model price, or a
  failed / cancelled run. Never `$0.00` for missing data.
- **`0` → render `$0.00`.** Reserved for a genuinely free model.
- Positive cost → `$X.XXX` (three decimals).
- Tokens (`8.2K→1.3K`) show only in the *detailed* badge variant and only when
  cost and both token counts are present.

`formatCost` / `formatRunTokens` and the two-variant `RunCostBadge`
(`compact` | `detailed`) live in
`client/src/components/RunCostBadge/RunCostBadge.tsx` — the single source of
cost formatting (the flyout Stat calls `formatCost` directly).

## List aggregation

The PR list endpoint (`server/src/modules/pulls/routes.ts`) computes the latest
review per PR newest-first, then left-joins `agent_runs` on `reviews.run_id` to
read that run's `cost_usd`. A review with no linked run (e.g. seeded demo data)
yields `null` → `—`.

## Storage

`agent_runs.cost_usd` (`double precision`, nullable) — restored by migration
`0010`. Do not hand-edit migrations; the column is generated.
