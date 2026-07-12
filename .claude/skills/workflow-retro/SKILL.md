---
name: workflow-retro
description: Post-run retrospective of a multi-agent workflow in the CURRENT session — token/cost/agent metrics from the session transcript plus qualitative analysis (what went well, what was hard or wasted, duplicated context, actionable recommendations). Invoke ONLY when the developer explicitly runs /workflow-retro — never auto-run, never chain from another skill or pipeline stage.
---

# Workflow Retro

One cheap pass, no agents: a bundled script computes every number from the
session transcript; you add only the qualitative analysis from what you saw
in this session. If the script finds no agent spawns, say "nothing to retro
in this session" and stop (offer main-session totals only if asked).

## Hard rules

- **Manual only.** This skill runs only on explicit `/workflow-retro`
  invocation. Never auto-run it after a workflow, never recommend wiring it
  into another skill.
- **No agents, no exploration.** Do not spawn subagents. Do not re-read
  project files. Inputs are: the script output + your own context.
- **Every number comes from the script.** Never estimate, extrapolate, or
  fill in a metric the script did not print. Missing → write `n/a`.
- Costs are ≈ (pricing table lives in the script; cache-read billed at 0.1×
  input rate, 5m cache writes at 1.25×). Update rates from the `claude-api`
  skill when models change; unknown models print `n/a` — leave them `n/a`.
- Narrative sections in the developer's language; table/labels stay English.

## Step 1 — collect metrics

```bash
python3 .claude/skills/workflow-retro/scripts/collect.py            # current session
python3 .claude/skills/workflow-retro/scripts/collect.py <session>  # specific session id
```

Prints: per-agent table (role, model, depth, in/out, cache-read, hit%, tools,
span, cost) with a `main` orchestrator row, totals (incl. session wall and
agent parallelism), launch order with timestamps, and cross-agent duplicated
reads.

With no argument the script picks the most recently *written* session in this
project — when several Claude sessions are open in parallel that may not be
this one. Check the printed `session:` line against the launch-order
descriptions; if it's the wrong run, pass the session id explicitly.

## Step 2 — report (fixed template, in chat)

```
Workflow Retro — <run slug>

Run: <chain, e.g. spec-creator → planner → 2×implementer> · N agents ·
mode <single|fan-out|single+fan-out> · data: deep (jsonl)

Metrics
<the script's table, verbatim>
<the script's Totals line>
Launch order: <compact arrow form; mark parallel groups with ‖>
Critical path: <longest-span agent + duration; caveat that span is
wall-clock and includes idle (e.g. waiting on approval/resume)>

What went well
- <2–4 bullets grounded in numbers: cache hit%, parallelism that paid off,
  clean delegation, cheap verification…>

What was hard / wasted
- <2–4 bullets: the cost hog and why; duplicated reads (from the script) and
  what a shared pre-read would have saved; retries / rejected tool calls /
  resume rounds; agents that missed info the orchestrator had to supply>

Recommendations (actionable)
1. <numbered, each one a concrete edit: which agent prompt / which skill /
   which orchestration habit to change, with expected saving. Include
   improvements to this retro skill itself when you spot them.>

Ledger
<the line appended in Step 3>
```

Qualitative bullets must cite session facts (a number from the table, a
duplicated file, a visible retry) — no generic advice.

## Step 3 — ledger

Append one line per run to `docs/retros/ledger.md` (create the file with the
header if missing). Append-only — never rewrite old lines.

```
# Workflow retro ledger

| date | run | agents | in→out | cache | wall | par | cost |
|---|---|---|---|---|---|---|---|
| 2026-07-10 | spec-project-context | 2 | 110k→201k | 91% | 76m | 1.0x | ≈$40 |
```

## Step 4 — close

End by asking which recommendation (if any) to apply now — only ones
applicable immediately (a prompt/skill edit), not habits for future runs.
