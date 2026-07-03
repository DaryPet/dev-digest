# Development Plan — Smart Diff (risk-ordered diff layout)
**Date:** 2026-07-03

### 1. Objective
Give reviewers a risk-ordered view of a PR's changed files so their eye lands on
business logic first, not on a lock file. The layout classifies each changed
file as core / wiring / boilerplate from the PR detail data alone, overlays
"N findings" badges from the latest review, and (for oversized PRs) suggests a
split — all **token-free** (no new LLM call: the expensive analysis already
happened in the Structured Reviewer). Works right after PR import; the findings
overlay appears once the first review has run.

### 2. Acceptance criteria
1. **Classification** — every `prFiles[]` entry is assigned exactly one role
   (`core` | `wiring` | `boilerplate`) by path/pattern rules. Given
   `pnpm-lock.yaml` / `package-lock.json` / `yarn.lock` → **always** `boilerplate`.
   Given `src/modules/x/service.ts` → `core`. Given `tsconfig.json` /
   `*.config.ts` / `index.ts` barrel → `wiring`.
2. **Endpoint** — `GET /pulls/:id/smart-diff` returns a body validated against
   `SmartDiffResponse` (`= SmartDiff` in `brief.ts`): `groups[{role, files[]}]`
   ordered core → wiring → boilerplate, plus `split_suggestion { too_big,
   total_lines, proposed_splits[] }`. `pseudocode_summary` is always `null`
   (out of scope). Returns before any review has run (empty `finding_lines`).
3. **Findings overlay** — each `SmartDiffFile.finding_lines` holds the
   `start_line`s of the **latest** review's non-dismissed findings for that file.
   Before the first review: all `finding_lines` are `[]` and the layout still
   renders.
4. **Boilerplate collapsed** — in `SmartDiffViewer` the boilerplate group (and
   lock files specifically) is collapsed by default; core/wiring expanded.
5. **Clickable badges** — a file's "N findings" badge is clickable and scrolls
   to / reveals that line in the rendered diff for the file.
6. **Token-free** — running the endpoint produces **zero** new model calls in
   server logs (no `container.llm(...)` on this path).
7. **No inlined thresholds** — every threshold, pattern list, and schema name
   lives in a dedicated constants file, not hard-coded in service/route logic.

### 3. Scope
- **IN:**
  - Server: file-classification logic (pure, tested), constants file, service
    that composes the `SmartDiff` shape from PR files + latest-review findings,
    route `GET /pulls/:id/smart-diff`, one-line registration in the module
    registry.
  - Client: `useSmartDiff` TanStack Query hook, `SmartDiffViewer` component
    (role groups, boilerplate collapsed, findings badges, badge→line navigation),
    mounting it in the PR-detail "Files changed" tab, next-intl copy, tests.
- **OUT (explicit — do not build):**
  - "Smart order / Original order" toggle (screenshot only).
  - Per-file "What this does" pseudocode summaries — `pseudocode_summary`
    stays `null`.
  - Any change to `server/src/vendor/**` or `client/src/vendor/**` (contract
    already exists — consumed via `@devdigest/shared`, never edited).
  - Any new LLM call, prompt, or model wiring.
  - Demo video; opening/linking the PR on GitHub.
  - DB schema / migration changes (feature is read-only over existing tables).

### 4. Affected packages & modules
| Package/module | Onion layer(s) | Why touched |
|---|---|---|
| `server/src/modules/smart-diff/` (NEW) | presentation (routes), application (service), domain (classify), constants | New feature module: classify + compose + expose. |
| `server/src/modules/reviews/repository.ts` | infrastructure (read-only reuse) | Reused as-is via `new ReviewRepository(container.db)` for `getPull`/`getRepo`/`getPrFiles`/`reviewsForPull`. **Not modified.** |
| `server/src/modules/index.ts` | registry | One import + one registry entry. Sole shared-file touch; server task owns it. |
| `client/src/lib/hooks/smart-diff.ts` (NEW) + `hooks/index.ts` | data | New query hook + barrel export. |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/SmartDiffViewer/` (NEW) | UI | The viewer component + styles + test. |
| `client/src/app/.../_components/DiffTab/DiffTab.tsx` | UI | Mount `SmartDiffViewer` at the top of the Files-changed tab. |
| `client/messages/en/smartDiff.json` (NEW) | copy | next-intl namespace for the viewer. |

**Module placement decision (new module vs. inside pulls/reviews):** a **new
`smart-diff` module**, mirroring the `intent` precedent. Rationale: the feature
reads across two domains (PR files from `pulls`, findings from `reviews`) yet
belongs to neither; `intent` set the exact precedent — a cross-domain, read-only
feature that reuses `ReviewRepository` for data access and registers itself in
`modules/index.ts`. A new module keeps ownership non-overlapping (server task
adds only its own folder + one registry line; it never edits `pulls/routes.ts`
or `reviews/routes.ts`), stays token-free, and avoids bloating either existing
module. Onion is preserved: routes → service → `classify` (domain) →
`ReviewRepository` (infra).

### 5. Frozen interface contracts
These are FINAL. Implementers must not alter them.

**5.1 HTTP endpoint**
```
GET /pulls/:id/smart-diff
  params: IdParams              // { id: string } — reuse modules/_shared/schemas
  auth/scoping: getContext(container, req) → workspaceId (same as intent/reviews)
  200 → SmartDiffResponse       // === SmartDiff, from @devdigest/shared
  404 → NotFoundError("Pull request not found")  // PR not in workspace
```
No request body. No query params. No new response shape — the transport type is
exactly `SmartDiffResponse` from `server/src/vendor/shared/contracts/review-api.ts`
(re-exported by `@devdigest/shared`).

**5.2 Response shape (already in `brief.ts` — reproduced as the contract to fill)**
```ts
SmartDiff = {
  groups: Array<{
    role: 'core' | 'wiring' | 'boilerplate';
    files: Array<{
      path: string;
      pseudocode_summary: null;         // ALWAYS null (out of scope)
      additions: number;                // from prFiles.additions
      deletions: number;                // from prFiles.deletions
      finding_lines: number[];          // start_line[] of latest review's
                                        // non-dismissed findings for this path
    }>;
  }>;
  split_suggestion: {
    too_big: boolean;                   // total_lines > SPLIT_TOTAL_LINES_THRESHOLD
    total_lines: number;                // Σ(additions + deletions) over all prFiles
    proposed_splits: Array<{ name: string; files: string[] }>;
  };
};
```

**5.3 Composition rules (frozen semantics)**
- **Group order:** `core`, then `wiring`, then `boilerplate` (risk-first). Emit a
  group only if it has ≥1 file (empty groups omitted).
- **File order within a group:** files with findings first (by `finding_lines.length`
  desc), then by `additions + deletions` desc, then `path` asc. Tie-break is
  deterministic.
- **`finding_lines`:** from the **latest** review of `kind === 'review'` (newest
  `created_at` via `reviewsForPull(prId)[0]`); take its findings where
  `dismissedAt == null`, filter by `file === path`, map to `start_line`, dedupe,
  sort asc. No review yet → `[]` for every file.
- **`total_lines`:** `Σ(additions + deletions)` across ALL prFiles.
- **`too_big`:** `total_lines > SPLIT_TOTAL_LINES_THRESHOLD`.
- **`proposed_splits`:** empty `[]` when `!too_big`. When `too_big`: group the
  **core** files by their top-level path segment (first dir, or `"(root)"` for
  a root file) → one split per segment `{ name: segment, files: [...] }`; then,
  if any wiring/boilerplate files exist, append one split
  `{ name: SPLIT_CHORE_NAME, files: [...wiring, ...boilerplate paths] }`.
  Order splits by descending file count.

**5.4 Classification contract (`classify(path) → SmartDiffRole`)**
Precedence is **boilerplate → wiring → core** (lock files match boilerplate
first even though a lockfile is arguably config). Patterns live in constants
(§5.5); `core` is the default when nothing matches.

**5.5 Constants file — `server/src/modules/smart-diff/constants.ts` (shape frozen; values are the implementer's starting set, all named — never inlined)**
```ts
export const SMART_DIFF_SCHEMA_NAME = 'SmartDiff';

/** Matched FIRST. Lock files, generated/build output, snapshots, minified. */
export const BOILERPLATE_PATTERNS: RegExp[] = [
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock|go\.sum)$/,
  /(^|\/)(dist|build|out|coverage|\.next)\//,
  /(^|\/)__snapshots__\//, /\.snap$/,
  /\.min\.(js|css)$/,
];

/** Matched SECOND. Configs, CI, barrels, ambient types, manifests. */
export const WIRING_PATTERNS: RegExp[] = [
  /(^|\/)(index)\.(ts|tsx|js|jsx)$/,          // barrels
  /\.config\.(js|cjs|mjs|ts)$/,
  /(^|\/)(tsconfig[^/]*\.json|package\.json)$/,
  /(^|\/)\.(eslintrc|prettierrc|npmrc|nvmrc)[^/]*$/,
  /\.(ya?ml)$/,                               // CI / compose
  /(^|\/)Dockerfile$/, /(^|\/)\.env[^/]*$/,
  /\.d\.ts$/,
];

/** total_lines above this ⇒ split_suggestion.too_big = true. */
export const SPLIT_TOTAL_LINES_THRESHOLD = 500;

/** Name of the catch-all split holding wiring + boilerplate files. */
export const SPLIT_CHORE_NAME = 'chore: config & generated';

/** Label used when a core file has no directory (repo root). */
export const ROOT_SPLIT_NAME = '(root)';
```

**5.6 Client hook contract**
```ts
// client/src/lib/hooks/smart-diff.ts
import type { SmartDiff } from "@devdigest/shared";
export function useSmartDiff(prId: string | number | null | undefined):
  UseQueryResult<SmartDiff>;
// queryKey: ["pull", prId, "smart-diff"]; enabled: prId != null
// queryFn: api.get<SmartDiff>(`/pulls/${prId}/smart-diff`)
```

### 6. Directory ownership map (non-overlapping)
| Task | Agent surface | Owns (dirs/files) |
|---|---|---|
| **T1** | backend | `server/src/modules/smart-diff/**` (NEW: `routes.ts`, `service.ts`, `classify.ts`, `classify.test.ts`, `constants.ts`) **and** `server/src/modules/index.ts` (single import + registry entry — sole editor). Read-only reuse of `reviews/repository.ts`. |
| **T2** | ui | `client/src/lib/hooks/smart-diff.ts` (NEW), `client/src/lib/hooks/index.ts` (append one `export *`), `client/src/app/repos/[repoId]/pulls/[number]/_components/SmartDiffViewer/**` (NEW: component, `styles.ts`, `*.test.tsx`), `client/src/app/.../_components/DiffTab/DiffTab.tsx` (mount), `client/messages/en/smartDiff.json` (NEW). |

No file is touched by both tasks. `server/src/modules/index.ts` and
`client/src/lib/hooks/index.ts` each have exactly one owner. Vendor/contract
files are read-only for both.

### 7. Parallelizable tasks
Parallelization is fixed by the request: two implementer agents, one per
surface, running in parallel. They share only the frozen §5 contract.

**T1 — backend: smart-diff module**
- **Goal:** Implement `classify()` + constants, a `SmartDiffService.getSmartDiff(workspaceId, prId)`
  that (a) loads the PR via `ReviewRepository.getPull` (404 if absent),
  (b) loads files via `getPrFiles(prId)`, (c) loads latest-review findings via
  `reviewsForPull(prId)` (newest-first; `[0]`), (d) composes the §5.2 shape per
  §5.3, and the route `GET /pulls/:id/smart-diff`. Register in `modules/index.ts`.
  No `container.llm` anywhere on this path.
- **Dependencies:** none.
- **Merge order:** independent; merge before/after T2 (contract already frozen).
- **Skills:** `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`
  (read-only reuse of `ReviewRepository`), `zod` (validate the response is the
  `SmartDiff` schema; do not redeclare it), `typescript-expert`,
  `engineering-insights` (session end).
  *(No `postgresql-table-design` / `security` — no schema change, no new input
  beyond the `:id` param, no auth/secrets.)*

**T2 — ui: SmartDiffViewer + wiring**
- **Goal:** `useSmartDiff` hook; `SmartDiffViewer` rendering the three role
  groups in order, boilerplate group collapsed by default (core/wiring open),
  a clickable "N findings" badge per file whose `finding_lines.length > 0` using
  the shared `SEV`/`SeverityCounts` tokens for coloring, and badge-click →
  scroll to / reveal the finding line in that file's rendered patch (reuse the
  `diff-viewer` `FileCard`/`CodeLine` to render each file's `patch`). Mount at
  the top of the Files-changed tab (see §4/§11). next-intl `smartDiff` namespace
  for all copy; CSS-in-JS `styles.ts` with `var(--token)`.
- **Dependencies:** consumes T1's endpoint at runtime; can be built in parallel
  against the frozen §5 contract (mock `fetch`/hook in tests).
- **Merge order:** independent.
- **Skills:** `ui-architecture`, `react-best-practices`, `next-best-practices`,
  `react-testing-library`, `zod` (types from `@devdigest/shared`),
  `typescript-expert`, `engineering-insights` (session end).
  *(No `security` — read-only display of already-fetched data.)*

### 8. Test commands per scope
Env quirk (server `INSIGHTS.md`): `pnpm typecheck`/`pnpm test` abort on
`ERR_PNPM_IGNORED_BUILDS` — run the local binaries directly.

- **T1 (from `server/`):**
  - `./node_modules/.bin/tsc --noEmit -p tsconfig.json`
  - `./node_modules/.bin/vitest run smart-diff`
  - Tests to add — `smart-diff/classify.test.ts` (pure): lock files →
    `boilerplate`; `*.config.ts` / `index.ts` / `tsconfig.json` → `wiring`;
    `src/**/service.ts` → `core`; precedence (a lockfile that would also match a
    wiring pattern still resolves `boilerplate`). Plus a service composition test
    with a mocked `ReviewRepository` (or `MockGitClient`-style stub): group order,
    file sort, `finding_lines` mapping from a stub latest review (dismissed
    finding excluded), `total_lines`/`too_big`/`proposed_splits` at/over
    threshold, and the no-review case (all `finding_lines` empty). Assert no LLM
    provider is constructed.
- **T2 (from `client/`):**
  - `./node_modules/.bin/tsc --noEmit`
  - `./node_modules/.bin/vitest run SmartDiffViewer`
  - Tests to add — `SmartDiffViewer.test.tsx`: mocks the `useSmartDiff` hook
    (cast stub `as unknown as ReturnType<typeof useSmartDiff>` per client
    INSIGHTS), wraps in `<NextIntlClientProvider messages={{ smartDiff }}>`;
    asserts group order, boilerplate collapsed by default, badge shown only for
    files with `finding_lines`, badge click triggers the scroll/reveal handler.

### 9. Relevant engineering insights
- **Latest-vs-all findings (server `INSIGHTS.md` 2026-06-20):** for a PR, the
  SCORE/COST use the **latest** review but the FINDINGS aggregation elsewhere
  sums ALL reviews. Smart Diff's overlay is defined by the TЗ as the **latest**
  review only — use `reviewsForPull(prId)[0]` (newest-first), do **not**
  aggregate across runs. Exclude `dismissedAt != null` findings (same rule the
  PR-list findings query uses).
- **Token-savings logging precedent (server `INSIGHTS.md` 2026-06-30, `intent`):**
  the `intent` module is the template for an internal-only, read-only feature
  reusing `ReviewRepository` and registering in `modules/index.ts`. Smart Diff
  follows it minus the LLM call — do not import `resolveFeatureModel`/`container.llm`.
- **Severity color source (client `INSIGHTS.md` 2026-06-24 / 2026-06-20):** never
  hand-roll a `Record<Severity,string>`. Reuse `SEV` tokens / the
  `SeverityCounts` component family for the findings badge; grep for
  `SEV_COLOR`/`VERDICT_META` before adding severity-colored UI.
- **Page padding + CSS-in-JS (client `INSIGHTS.md` 2026-06-28):** styling is
  `styles.ts` `s.*` objects with `var(--token)`, **not** Tailwind; content has no
  default padding — match `pulls/styles.ts`.
- **next-intl namespaces (client `INSIGHTS.md` 2026-06-28):** one
  `useTranslations("smartDiff")` per component; tests wrap in
  `NextIntlClientProvider` importing the json directly (mirror `ConfigTab.test`).
- **Mocking TanStack hooks in tests (client `INSIGHTS.md` 2026-06-30):** cast the
  stub `as unknown as ReturnType<typeof useSmartDiff>`.
- **vitest CLI filter (client `INSIGHTS.md` 2026-06-30):** pass a plain substring
  (`SmartDiffViewer`), not a regex with `.*` — bracket route folders won't match.
- **tsc/vitest env quirk (server `INSIGHTS.md` Tooling):** run local binaries, not
  pnpm scripts; pre-existing `reviewer-core`/`adapters/llm` tsc noise is unrelated.

### 10. Architecture diagram
```mermaid
flowchart TD
  subgraph client [client — T2]
    V[SmartDiffViewer<br/>groups + badges] -->|useSmartDiff| H[hooks/smart-diff.ts]
    V -->|reuse FileCard/CodeLine| DV[diff-viewer]
    DT[DiffTab mount] --> V
  end
  H -->|GET /pulls/:id/smart-diff| R
  subgraph server [server — T1 : smart-diff module]
    R[routes.ts] --> S[service.ts]
    S --> C[classify.ts + constants.ts]
    S --> RR[(ReviewRepository<br/>read-only)]
  end
  RR --> DB[(prFiles + reviews + findings)]
  IDX[modules/index.ts] -. registers .-> R
  SC[[@devdigest/shared SmartDiff]] -. frozen contract .-> S
  SC -. frozen contract .-> H
```

### 11. Risks & integration concerns
- **Mount point coupling:** `SmartDiffViewer` reuses the `diff-viewer` `FileCard`/
  `CodeLine` to render each file's patch and to scroll to a finding line. `FileCard`
  currently exposes no line anchor/`id` or scroll API (verified: no `id=`/
  `scrollIntoView` in `diff-viewer`). T2 must implement the scroll/reveal within
  its own component (e.g. expand the file card + `scrollIntoView` on a ref keyed
  by line) **without editing `src/components/diff-viewer/**`** — those are shared
  and out of T2's ownership. If a line anchor genuinely must live in `diff-viewer`,
  that is a scope change to raise, not a silent edit.
- **Files listed twice:** mounting the viewer above the existing flat
  `DiffViewer` in the Files-changed tab shows files in two places. Accepted
  tradeoff per the "Files-changed tab area" hint; the risk-ordered grouped view
  sits on top, the raw commentable diff remains below. (See §12 for the tab
  alternative.)
- **Empty/near-empty PRs:** a PR with only a lock file must still return a valid
  `SmartDiff` (single boilerplate group, `too_big=false`). Covered by tests.
- **Offline / pre-review:** endpoint must work right after import with no reviews
  — `finding_lines` empty, layout intact.
- **Sequencing:** none between T1/T2 beyond the shared frozen contract; the two
  index-barrel edits (`server/modules/index.ts`, `client/hooks/index.ts`) each
  have a single owner, so no merge conflict.

### 12½. Design-parity amendment (2026-07-03, developer-directed)
Supersedes the §2.4 wording and the T2 layout description to match the design
mock 1:1 (developer decision overriding the earlier group-box layout):
- Header: a "Reviewer-ordered diff" uppercase section label + a
  "N files · +X −Y" summary line above the groups.
- Role groups are **flat label rows** (colored square bullet + name +
  description + "N files"), not collapsible boxes: `Core logic — The substance
  of the change — review closely`, `Wiring — Hooks the core into the app`,
  `Boilerplate — Generated / mechanical — skim`.
- **Every file is always listed** as its own card; "collapsed" applies to the
  file's **diff content**, not to hiding the group.
- **Auto-expand rule (the TЗ's "авто-розгортання карток"):** a file whose
  `finding_lines` is non-empty starts expanded; every other file — lock files
  included — starts collapsed. A muted warning dot marks flagged files next to
  the path.
- **All three group labels always render** client-side, even for a role with
  no files in the PR (muted "No files in this category" placeholder + "0
  files"). The server contract is unchanged — it still omits empty groups
  (§5.3); the client backfills them for layout constancy.
- **Smart/Original order toggle is now IN** (developer-directed 2026-07-03,
  overriding §3 OUT): a pill toggle at the right of the summary row. "Smart
  order" shows the risk-grouped layout; "Original order" shows the pre-existing
  flat commentable `DiffViewer` (with the Files-changed section label and the
  comments button). The two are mutually exclusive — this removes the §11
  "files listed twice" tradeoff: the flat list no longer renders below the
  grouped view. State lives in `DiffTab` (`SmartDiffOrder`); the header +
  toggle render in both modes (totals computed from `prFiles`, not the query).
- Still OUT (unchanged): "What this does" pseudocode summaries, per-line
  severity chips (no per-line severity in the contract).

### 12. Open questions
- **Mount style (one human decision).** Recommended: render `SmartDiffViewer` at
  the **top of the existing "Files changed" tab** (inside `DiffTab.tsx`), above
  the current flat `DiffViewer`, matching the TЗ hint "e.g. a Files-changed tab
  area" and avoiding a page/tab-config change. Alternative: a **dedicated
  "Smart diff" tab** (adds an entry in `PrDetailHeader.tsx` `tabs[]` + a render
  branch in `page.tsx`, both client-owned) — cleaner separation, no duplicate
  file list, but adds a tab. Confirm which before T2 starts; the plan assumes
  the recommended in-tab mount.
