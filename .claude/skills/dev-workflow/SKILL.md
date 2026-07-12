---
name: dev-workflow
description: >-
  Gated agent-pipeline protocol for any new development TЗ (feature, bug fix,
  refactoring, chore). Classifies the task first (type + size + surfaces),
  then asks ALL gate questions in a SINGLE upfront batch — researcher?
  development path (full SDD spec+plan / plan-only, no spec / inline)?
  implementation approach (team / single)? architecture review? —
  each with a recommendation and its reason. The developer answers once,
  before any work starts; the orchestrator then executes the whole pipeline
  autonomously to the end without pausing to re-confirm. Tests are automatic;
  engineering insights and documentation update ALWAYS, no question. For
  trivial XS changes (button color, card size, few-line bug) the whole batch
  collapses to ONE question: continue in plain chat, or run the batch —
  developer always decides. Use the moment the developer hands over a new
  coding task, or when /dev-workflow is invoked explicitly.
---

# Dev workflow — the gated agent pipeline

Turns a development TЗ into a fixed sequence of stages. All developer
decisions are collected **once, upfront, before any work starts** — never
mid-flight. Confirm-then-work-then-ask-again is exactly the failure mode this
protocol exists to prevent.

- **Stage 0** classifies the TЗ (automatic).
- **The gate batch** asks every applicable gate question in a single
  `AskUserQuestion` call, each option carrying a recommendation and its
  reason. The developer answers all of them at once.
- The orchestrator then **executes end-to-end autonomously** using the
  collected answers — no further "should I continue?", no re-confirmation
  after each stage completes. It only interrupts again for something a gate
  answer could not have anticipated: a genuine blocker, a destructive/shared
  action, or a scope change discovered mid-work.
- **Automatic stages** (tests, insights, docs) never get a question at all.

The developer's answer always wins over the recommendation.

## Stage 0 — TЗ analysis (automatic, always first)

1. Read the `INSIGHTS.md` of every package the task will plausibly touch
   (mandatory AGENTS.md protocol) and state the relevant points.
2. Classify the TЗ and state the classification back to the developer:
   - **Type** — feature / bug fix / refactoring / chore / docs-only.
   - **Size** — **XS** (≤ ~10 lines, one file) · **S** (one package, a few
     files, no new contracts) · **M** (a real feature inside one package) ·
     **L** (cross-package, new contracts, new modules).
   - **Surfaces** — client / server / reviewer-core / e2e / config.
3. The TЗ text is the source of truth; mockups and screenshots only
   illustrate it. If the TЗ is ambiguous on something that changes the
   classification, resolve it now — fold it into the same upfront question
   round rather than stopping later.

This classification drives every recommendation below, including the
predicted (not yet actual) diff shape used for the architecture-review call.

## Trivial shortcut (XS changes only)

When the classification comes out **XS or a trivially small S** — a button
color, card dimensions, a copy tweak, an obvious few-line bug fix — do not
run the gate batch. Ask ONE question instead:

> This is a trivial <type> (<one-line reason>). Recommendation: skip the
> gate batch — no researcher, no plan, no implementer team, no architecture
> review needed. Continue right here in chat?

- **Continue in chat** (the recommendation for trivial changes) — the
  orchestrator makes the fix inline; automatic stages (tests, insights, docs)
  still apply.
- **Run the gate batch anyway** — proceed to the gate batch below. This does
  NOT mean every agent runs: it's still one batch of independent questions,
  and the developer may end up picking any subset (e.g., only implementation-planner + a
  single implementer, no researcher, no architecture review).

For M/L tasks this shortcut does not apply — go straight to the gate batch.

## The gate batch — all questions, asked together, before any work starts

Ask every applicable gate in **one `AskUserQuestion` call** (up to 4
questions per call, which is exactly how many gates exist — researcher,
development path, implementation approach, architecture review). Each question's
options carry the recommendation inline (label ends "(Recommended)") plus a
one-line reason in the description. Do not launch any agent, write any code,
or touch any file before this call returns with all answers.

### Q1 — researcher?

- Recommend **yes** when: the topic is not covered by any existing skill
  (check `.claude/skills/README.md` first — AGENTS.md rule), an unfamiliar
  library / external API / protocol is involved, or the TЗ depends on facts
  that must be located or verified (in the project or on the web).
- Recommend **no** when: an existing skill already covers the topic (invoke
  that skill directly instead — never launch a researcher for it), or the
  task is S in code the session already understands.

### Q2 — development path?

Single-select — how far up the SDD ladder this TЗ goes:

1. **Full SDD** — `spec-creator` writes the spec (a `SPEC-NN-<slug>.md` in the
   scope-appropriate `specs/`: a package's for single-package work, top-level
   for cross-package; WHAT/WHY in EARS) → then `implementation-planner` designs
   the HOW against it (a `<slug>.md` in the matching `plans/` folder).
   Recommend for **L / complex** work: cross-package, new contracts/modules,
   or when the requirements themselves must be frozen and reviewed before
   design.
2. **Plan without spec** — straight to `implementation-planner`, no spec; the
   plan is the broader self-contained WHAT+HOW document. Recommend for **M**
   features (or a non-trivial S) that need a design pass but not a separate
   frozen spec.
3. **Inline / chat** — no spec, no plan; the orchestrator makes the change
   directly. Recommend for small S changes and fixes that don't need a design
   pass. (Same destination as the trivial-XS shortcut, offered here too for
   when the batch was run anyway.)

### Q3 — implementation approach?

**Only applies when Q2 chose a planning path (Full SDD or Plan-without-spec).
If Q2 = Inline / chat, skip this question entirely — there is no plan to
implement from.** Two options, recommendation based on the Stage 0
classification (the plan, if any, doesn't exist yet — a best-effort call made
now, not deferred):

1. **Team of parallel `implementer` agents** — recommend only when the task's
   surfaces/size suggest ≥ 2 non-overlapping ownership areas (e.g.,
   independent client + server slices). If, once the plan actually exists, it
   turns out to have only one task or overlapping ownership, silently fall
   back to a single implementer — note the fallback in the summary, do not
   re-ask.
2. **Single `implementer` agent** — the default recommendation for most
   S/M work.

(Inline editing by the orchestrator is no longer a Q3 option — it lives in Q2
as "Inline / chat". Catalog/index files — README.md, INSIGHTS.md, MEMORY.md —
are always edited inline per AGENTS.md regardless.)

### Q4 — architecture review?

- Recommend **yes** when: the TЗ implies a new server module or UI feature,
  a layer/boundary change, a new external integration (port/adapter), or
  size is L.
- Recommend **no** when: the TЗ describes a small localized fix (a 3-line bug
  fix does not need an architect).

## Autonomous execution (after the batch, no further gates)

With all four answers in hand, run the pipeline straight through:

1. Researcher (if yes) → distill findings.
2. Development path per the Q2 answer:
   - **Full SDD** → run `spec-creator` first (it clarifies, presents the spec,
     and writes `<package>/specs/SPEC-NN-<slug>.md` only after the developer
     approves), then `implementation-planner` designs against that spec.
   - **Plan without spec** → `implementation-planner` only, no spec.
   - **Inline / chat** → skip both; the orchestrator implements the change
     directly, then go straight to the tests/insights/docs stages.
   Each agent's model is declared in its own frontmatter — change models there,
   not in this skill (and optionally override per-call via the `model` param on
   the `Agent` spawn when a specific run warrants it). Present plan, get
   approval, save to the scope-appropriate `plans/` (package-level or
   top-level, matching where the change lands).
3. Implementation per the Q3 answer (Team or Single `implementer`, with the
   silent team→single fallback rule above) — unless Q2 = Inline / chat, in
   which case the orchestrator already made the change in step 2.
4. **plan-verifier (automatic, conditional):** if a plan from any `plans/`
   folder was used, run it FIRST after implementation as the definition-of-done /
   coverage gate — no question. No plan, no run. Running it here is fail-fast:
   if an obligation is MISSING or unresolved PARTIAL, surface that before
   investing in test-writing or an architecture review of incomplete work.
5. **Tests (automatic, no question):** if new testable behavior was
   introduced and isn't already covered, launch `test-writer` for the
   affected surface(s); otherwise skip and say why in one line.
6. Architecture review per the Q4 answer.

Do not stop between these steps to ask "should I proceed?" — that was
already answered in the batch. Only interrupt if something arises that no
gate answer could have covered (a real blocker, a destructive/shared action,
or a scope change).

**A couple of interrupts are built into the pipeline and are NOT gate
re-asks** — do not treat them as violations of "run autonomously":

1. `spec-creator` (Full SDD only) — clarifies in chat, then presents the spec
   and waits for the developer's approval before writing it.
2. `implementation-planner` — presents the plan and waits for the developer's
   go-ahead before saving to `plans/`. Execution mode is NOT re-asked here
   (the batch already answered Q3); only the plan content is approved.

Both agents are doing their defined job — each ends in the developer approving
its artifact — not the orchestrator re-confirming. Everything else runs
straight through.

## Stage — insights & documentation (automatic, ALWAYS, no question)

1. Run the `engineering-insights` skill against every package touched (writes
   only if something substantial came up — but the check itself always runs).
2. Update documentation affected by the change: catalog/index rows inline;
   substantial docs via `doc-writer`.

## After the pipeline

The pipeline ends at verified changes plus updated insights/docs. Committing,
pushing, and opening a PR are the developer's call; `pr-self-review` remains
the separate pre-push gate.
