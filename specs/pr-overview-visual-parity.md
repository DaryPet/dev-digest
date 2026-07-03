## Development Plan — PR Overview tab visual parity
**Date:** 2026-07-02

### 1. Objective
Bring the PR-detail **Overview tab** to 1:1 parity with the design mock
(`Screenshot 2026-07-02 at 19.17.28.png`). Fix five reported defects — a stray
Description section, a focus-ring "box" on tabs, the PR-brief verdict picking the
wrong review, plus assorted spacing/label deltas — without inventing backend data
(empty states stay honest per the already-approved decision in
`client/INSIGHTS.md` 2026-07-02).

### 2. Acceptance criteria
1. The Overview tab renders **no** "DESCRIPTION" section (mock has none);
   `descriptionBox` style, the `MessageSquare` label, and the now-unused `prBody`
   prop plumbing are removed with no dead imports.
2. Clicking any tab with a mouse shows **no** accent-colored rounded outline on
   the tab button; the thin blue **underline** on the active tab remains;
   **keyboard** `Tab` focus still shows the WCAG focus ring.
3. Overview render order matches the mock top-to-bottom: **PR BRIEF** section
   label + verdict card → two-column **Intent | Blast-radius** grid. (Verified
   already correct in code — see §11.)
4. The PR BRIEF verdict reflects the PR's **gate status**: given the latest
   review pass has agents disagreeing (e.g. one `comment`, one
   `request_changes`), the card shows the **most-blocking** verdict
   (`request_changes`), not merely the newest review's.
5. Remaining enumerated visual deltas (§5.3) are closed;
   `./node_modules/.bin/tsc --noEmit` and the affected `vitest` specs pass.

### 3. Scope
- **IN:** Client-only edits to the PR-detail Overview components + `globals.css`
  (app-owned) + PrBriefCard verdict-selection logic + tests.
- **OUT:** Any backend/endpoint change; fabricating Blast-radius / Risk-areas /
  Prior-PRs data (stays honest empty state); removing the Intent **Recompute**
  button (kept per `specs/intent-layer.md` #8, even though the mock omits it);
  aggregating findings/cost across agents (verdict selection changes, aggregation
  does not); any `client/src/vendor/**` hand-edit.

### 4. Affected packages & modules
| Package/module | Layer | Why touched |
|---|---|---|
| `client/.../_components/OverviewTab/` | UI | Remove Description block + unused style/prop |
| `client/.../_components/PrBriefCard/` | UI | Fix verdict selection (defect #4) |
| `client/.../_components/PrDetailHeader/` | UI | Wrap vendor `<Tabs>` to suppress pointer-focus ring (defect #2) |
| `client/.../pulls/[number]/page.tsx` | UI | Drop `prBody` prop passed to OverviewTab |
| `client/src/app/globals.css` | UI (app-owned) | Complementary `:focus:not(:focus-visible)` outline suppression |

Not touched (honest empty states, per constraint): `IntentCard/`,
`BlastRadiusCard/`, `VerdictBanner/`. Vendor `Tabs.tsx` / `styles.css` are
**not** edited.

### 5. Frozen decisions & contracts

**5.1 — Defect #4 verdict selection (FROZEN, client-only, from existing
`/pulls/:id/reviews` newest-first + `/pulls/:id/runs`).**
Root cause verified: the server only ever writes `kind: 'review'` rows — one per
agent per run (`server/src/modules/reviews/run-executor.ts:271`); **no
`kind:'summary'` aggregate row is written anywhere**. So
`reviews.find(r => r.verdict != null)` (`PrBriefCard.tsx:34`) returns whichever
agent's review is newest — showing `comment` even when another current agent said
`request_changes`. That is a **selection bug**, not correct data-driven behavior.
New rule:
```
BLOCKING_RANK = { request_changes: 3, comment: 2, approve: 1 }
latestPass  = for each key (agent_id ?? agent_name ?? id), the newest review
              (first occurrence, since list is newest-first)
candidates  = latestPass.filter(r => r.verdict != null)
selected    = candidates with max BLOCKING_RANK[verdict];
              tie → newest created_at (first in list)
```
`selected` supplies `verdict / summary / score`; its `run_id`'s run row supplies
`blockers / cost_usd / tokens_in / tokens_out`; `findingsCount =
selected.findings.length` (unchanged). Empty state (no verdict-bearing review)
unchanged. Cross-agent findings/cost aggregation is explicitly OUT.

**5.2 — Defect #2 focus ring (FROZEN, vendor-safe).**
Root cause: the vendored global rule
`:focus-visible { outline: 2px solid var(--accent); border-radius: 3px }`
(`client/src/vendor/ui/styles.css:214`) lands on the bare `<button>` in vendor
`Tabs.tsx` and persists after the click-triggered `router.replace` re-render;
cross-browser `:focus-visible` heuristics make it show for mouse users. Fix
without editing vendor:
- **Primary:** in `PrDetailHeader.tsx` (app-owned) wrap `<Tabs>` in a
  `<div onMouseDownCapture={e => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>`.
  Preventing mousedown default stops the button taking focus on click, so
  `:focus-visible` never engages for pointer; keyboard activation (Enter/Space,
  real `Tab` focus) is unaffected → underline stays, keyboard ring stays.
- **Belt-and-suspenders:** add to `globals.css`
  `button:focus:not(:focus-visible) { outline: none; }` (app-owned).

Implementer verifies both mouse (no ring) and keyboard `Tab` (ring visible)
in-browser.

**5.3 — Defect #5 enumerated deltas:**
- Remove Description section — `OverviewTab.tsx:33-38` + `styles.ts`
  `descriptionBox` + `prBody` prop + `page.tsx:138` `prBody={pr.body}`
  (defect #1).
- Label casing "PR brief" → renders "PR BRIEF": already correct — `SectionLabel`
  forces `textTransform: uppercase` (`SectionLabel.tsx:22`); no `brief.json`
  change (defect #3 casing sub-point).
- Intent card **Recompute** kept (mock omits it) — intentional divergence,
  documented, per spec #8.
- Grid `1fr 1fr` matches mock proportions — no change.
- Prior-PRs bar placement (below Blast-radius card, right column) already
  matches — no change.

### 6. Directory ownership map
Single UI surface. **§12 decision: one sequential implementer track** (both
tasks below run in sequence in a single track).
| Task | Surface | Owns |
|---|---|---|
| T1 | ui | `client/.../_components/PrBriefCard/**` |
| T2 | ui | `client/.../_components/OverviewTab/**`, `client/.../_components/PrDetailHeader/**`, `client/.../pulls/[number]/page.tsx`, `client/src/app/globals.css` |

No file shared between T1 and T2. T2 renders `<PrBriefCard>` but does not edit it
→ no conflict.

### 7. Parallelizable tasks
Run sequentially in one track (per §12). Both have no cross-dependency.
- **T1 — PR-brief verdict fix** (deps: none). Implement §5.1; update
  `PrBriefCard.test.tsx` with a multi-agent fixture proving `request_changes`
  wins over a newer `comment`. Skills: `react-best-practices`,
  `react-testing-library`, `typescript-expert`, `zod`, `engineering-insights`.
- **T2 — Layout cleanup + focus fix** (deps: none). Implement §5.2 and §5.3
  (remove Description, wrap Tabs, globals.css rule, drop `prBody`). Update/add
  tests (OverviewTab renders no Description; keyboard-vs-mouse focus note).
  Skills: `ui-architecture`, `react-best-practices`, `next-best-practices`,
  `react-testing-library`, `typescript-expert`, `engineering-insights`.

### 8. Test commands per scope
From `client/` (local binaries — `pnpm test`/`typecheck` are broken in this env):
- T1: `./node_modules/.bin/vitest run PrBriefCard` and
  `./node_modules/.bin/tsc --noEmit -p tsconfig.json`
- T2: `./node_modules/.bin/vitest run OverviewTab` (+ `PrDetailHeader` if a test
  is added) and `./node_modules/.bin/tsc --noEmit -p tsconfig.json`
- Use plain substrings in vitest filters (per `client/INSIGHTS.md` 2026-06-30 —
  `.` won't match literal `[repoId]`).

### 9. Relevant engineering insights
- Verdict colors come from one source `VERDICT_META`
  (`VerdictBanner/constants.ts`) — the fix changes *which review* is selected,
  not the color map (`client/INSIGHTS.md` 2026-06-24).
- CSS-in-JS `var(--token)`, not Tailwind; tests wrap in
  `NextIntlClientProvider` + mock `fetch` (`client/INSIGHTS.md` 2026-06-28).
- Overview layout is already the mock's order (PR BRIEF → grid → Description),
  per the 2026-07-02 decision entry — so #3 is a cleanup, not a re-order.
- vitest CLI filters are plain substrings (`client/INSIGHTS.md` 2026-06-30).

### 10. Architecture diagram
```mermaid
flowchart TD
  Page[page.tsx] -->|prId| OT[OverviewTab]
  OT --> PB[PrBriefCard]
  OT --> Grid[Intent | BlastRadius grid]
  PB -->|usePrReviews + usePrRuns| SEL{most-blocking verdict<br/>of latest-per-agent}
  SEL --> VB[VerdictBanner]
  Page --> Hdr[PrDetailHeader]
  Hdr -->|onMouseDownCapture preventDefault| Tabs[(vendor Tabs)]
```

### 11. Risks & integration concerns
- **19.30.00 screenshot (PR #10, intent-first, full-width, no PR BRIEF)
  contradicts current committed code**, which renders PR BRIEF first +
  two-column grid. It appears to be a **stale build** predating the 2026-07-02
  layout. The implementer should rebuild and confirm; no re-ordering code change
  is needed.
- Focus-ring fix depends on browser behavior — implementer must verify mouse
  (no ring) **and** keyboard (ring present). If the `onMouseDownCapture`
  approach is somehow insufficient, the documented fallback is a **coordinated**
  one-line vendor edit (`onMouseDown={e => e.preventDefault()}` in `Tabs.tsx`) —
  flagged, not taken by default.

### 12. Open questions
1. **Parallel vs sequential:** RESOLVED — **one sequential implementer track**
   (T1 then T2), per the developer's decision. Rationale: the work is small and
   cohesive; fewer tokens than two parallel tracks.
