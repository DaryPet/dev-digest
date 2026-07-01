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
- **2026-06-20** — A hover popover/tooltip placed inside a PR-list row gets
  **clipped** by the table card's `overflow: hidden` ancestor (`pulls/styles.ts`
  `tableCard`). An `position: absolute` child renders but is cut off at the card
  edge. Fix: render the popover via `createPortal(..., document.body)` with
  `position: fixed`, coordinates from the trigger's `getBoundingClientRect()`
  (clamp `left` to viewport). Evidence:
  `client/src/components/SeverityCounts/FindingsHoverCard.tsx`. The same
  component works un-clipped inside the PR-detail timeline (no overflow ancestor
  there) — so this only bites in the list.
- **2026-06-20** — Severity findings counts (icon+number per CRITICAL/WARNING/
  SUGGESTION, no text label) render through one shared component
  `client/src/components/SeverityCounts/` (mirrors the `RunCostBadge` reuse
  pattern), used in the PR-list FINDINGS column (PRRow), the PR-detail timeline
  rows (RunHistory), and the clickable filter row above Review runs
  (SeverityCounter). Reuses the `SEV` token map (`vendor/ui/primitives/tokens.ts`)
  for icon/color — don't hand-pick severity colors. `hideZero` prop skips a
  level whose count is 0 (PR-list/timeline show only what was found); the filter
  row omits it so all three levels stay clickable. Each badge carries a
  severity-colored underline (dotted; solid when it's the active filter).
- **2026-06-20** — To make a portaled hover-card **interactive** (click a link
  inside it), `pointerEvents: none` must be OFF *and* the open/close needs a
  grace period: `onMouseLeave` on the anchor schedules close after ~140ms,
  `onMouseEnter` on the portaled card cancels it (and the card's own
  `onMouseLeave` re-schedules). Without the delay the card closes the instant
  the cursor crosses the gap between trigger and card, so the link is
  unclickable. Evidence:
  `client/src/components/SeverityCounts/FindingsHoverCard.tsx`. file:line links
  use `githubBlobUrl(repoFullName, headSha, file, line)` (`lib/github-urls.ts`)
  — pin to the PR head sha so line numbers stay accurate.
- **2026-06-24** — Severity/verdict colors must come from one source, not be
  retyped per component: `FindingCard/constants.ts`,
  `RunTraceDrawer/.../FindingsSection.tsx`, and `ReviewRunAccordion.tsx` each
  had their own hand-typed `SEV_COLOR`/`VERDICT_COLOR` map instead of importing
  `SEV` (from `@devdigest/ui`, same source `SeverityCounts` already uses) or
  `VerdictBanner/constants.ts`'s `VERDICT_META`. Two had already drifted from
  the canonical values — `FindingsSection.tsx` mapped `SUGGESTION` to
  `var(--accent)` instead of `var(--sugg)`; `ReviewRunAccordion.tsx` mapped
  verdict `comment` to `var(--warn)` instead of `var(--info)` — a real,
  shipped visual inconsistency, not a hypothetical risk. Before adding any
  severity- or verdict-colored UI, grep for
  `SEV_COLOR`/`VERDICT_COLOR`/`VERDICT_META` first and import the existing
  map; don't hand-roll a new `Record<Severity, string>`.
- **2026-06-24** — To base64-encode a `File`'s bytes (incl. binary, e.g. a
  `.zip`) for a no-multipart JSON endpoint (`POST /skills/import` takes
  `{filename, content_base64}`), use `FileReader.readAsDataURL` then strip the
  prefix by finding the **first comma** (`result.indexOf(",")`), not a fixed
  offset — the `data:<mime>;base64,` prefix length varies with the detected
  mime type. `readAsArrayBuffer` + manual `btoa` works too but is more code
  for the same result. Evidence: `client/src/app/skills/_components/ImportSkillDialog/helpers.ts`.
- **2026-06-24** — No existing test renders `<AppShell>` directly — it pulls in
  `CommandPalette`, `ShortcutsHelp`, and the shell-context/shortcuts hooks,
  which is more than a component test needs. For a page-level component that
  wraps its content in `AppShell` (e.g. `*ListView`), `vi.mock` the
  `components/app-shell` module to a passthrough (`({children}) => <div>{children}</div>`)
  rather than rendering the real thing. Evidence:
  `client/src/app/skills/_components/SkillsListView/SkillsListView.test.tsx`.
- **2026-06-27** — Agents/Skills are a **two-pane master-detail**, not a
  centered card grid. The list view (`AgentsListView`/`SkillsListView`) is the
  *left rail*, persistent on both the landing (`/agents`, `/skills`) and the
  editor (`/agents/:id`, `/skills/:id`) — the right pane is the editor or a
  "Select a…" `EmptyState`. The rail (header + `+ Add` dropdown + search +
  active-highlighted cards) lives in **one shared component per domain**,
  `_components/AgentsRail` / `_components/SkillsRail`, reused by both routes — do
  not re-inline the list in `[id]/page.tsx`, and do not rebuild a `maxWidth`
  centered grid for the landing (that was the original `specs/skills-lab-ui.md`
  §1/§3 divergence). The empty-right copy was pre-seeded before the layout
  existed: `skills.json` `page.selectPrompt.*`, `agents.json`
  `list.selectTitle/selectBody`. Evidence:
  `client/src/app/skills/_components/SkillsRail/SkillsRail.tsx`,
  `client/src/app/agents/_components/AgentsRail/AgentsRail.tsx`.
- **2026-06-28** — UI copy is next-intl namespace files
  (`client/messages/en/<ns>.json`), one `useTranslations("<ns>")` per
  component; some namespaces are **pre-seeded before the feature is built**
  (e.g. `conventions.json` predated the conventions page). Component tests that
  use translations wrap in
  `<NextIntlClientProvider locale="en" messages={{ <ns>: json }}>` (import the
  json directly) — mirror `ConfigTab.test.tsx`. Styling is CSS-in-JS
  `styles.ts` objects using `var(--token)` CSS vars — **not Tailwind** (despite
  the `react-best-practices` skill) — match the surrounding `s.*` pattern
  (`pulls/styles.ts`).
- **2026-06-28** — Form primitives live in `@devdigest/ui`: `FormField` wraps
  `TextInput` / `Textarea` / `Toggle` / `SelectInput`. There is **no `Select`**
  — use `SelectInput value/onChange options={[{value,label}]}`. `Modal` (kit)
  takes `title/subtitle/onClose/footer/children`; `IconBtn` takes
  `icon/label(required)/onClick`. `ConfigTab.tsx` is the canonical form
  template (seed local state from the prop, reset on id change, save via
  mutation + toast). Evidence:
  `client/src/app/skills/[id]/_components/SkillEditor/_components/ConfigTab/ConfigTab.tsx`.
- **2026-06-28** — `src/vendor/ui/nav.ts` **must be edited** to add new sidebar items — it is a project config file, not an external library. Add a `NavItemDef` to the correct `NavGroup` (`WORKSPACE` for repo-scoped pages, `SKILLS LAB` for lab features). `activeKeyFor` in `components/app-shell/helpers.ts` maps routes to nav keys and already handles `/conventions` → `"conventions"` — add the route mapping there if the new route isn't covered. The earlier note ("link from pulls page, do not add a nav entry") was wrong: the design screenshot shows Conventions in the sidebar, not a button. Evidence: `src/vendor/ui/nav.ts:33`, `components/app-shell/helpers.ts:31`.
- **2026-06-28** — Page content inside `AppShell`/`AppFrame` has **no default padding** — `<main>` in `AppFrame.tsx` is bare (`flex: 1, overflow: auto`). Every new page must add its own `padding: "24px 32px 10px"` on the page header and `padding: "0 32px 44px"` on the content list/body — match `pulls/styles.ts` (`pageHeader`, `tableCard`). Without explicit padding all content sticks to the edges. Evidence: `src/app/repos/[repoId]/conventions/styles.ts`, `pulls/styles.ts:67`.
- **2026-06-30** — `vitest run` CLI filters match as a **plain substring** of
  the file path, not a regex you can rely on dot-matching bracket characters:
  `vitest run "src/app/repos/.*IntentCard"` finds nothing because the `.` in
  `.*` doesn't match the literal `[` in route folders like `[repoId]`/
  `[number]`. Pass a plain substring instead, e.g. `vitest run "IntentCard"`.
- **2026-06-30** — Mocking a TanStack Query hook in a component test
  (`vi.mocked(useXyz).mockReturnValue(stub)`) requires `stub` to satisfy the
  full `UseQueryResult`/`UseMutationResult` shape for `tsc` to accept it even
  though the component only reads 2-3 fields — cast with
  `stub as unknown as ReturnType<typeof useXyz>` rather than hand-filling every
  TanStack Query field. Evidence: `_components/IntentCard/IntentCard.test.tsx`.
- **2026-06-30** — `@devdigest/ui`'s `SectionLabel` has `marginBottom: 14`
  baked in, which throws off a flex card-header row that also holds an action
  button (e.g. a title + "Recompute" button side by side) — it's designed for
  standalone use above a content block, not inline in a flex row. Use a plain
  styled `<span>` for the title text in a title+action header instead.
  Evidence: `_components/IntentCard/IntentCard.tsx`.
  `githubBlobUrl(repoFullName, ref, file, start?, end?)` (`lib/github-urls.ts`)
  builds evidence deep-links; pin `ref` to the repo's `default_branch` for
  repo-level (non-PR) evidence.
