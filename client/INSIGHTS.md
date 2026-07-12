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
- **2026-07-02** — To render text wrapped in visible quotation marks (design
  shows a quoted summary) without breaking RTL `getByText("<exact text>")`
  assertions, use the `<q>` element: its quotes come from CSS-generated
  content (`::before`/`::after`), so they never enter `textContent`. Literal
  template quotes (`` `“${text}”` ``) put the quotes into the same text node
  and make exact-string matches fail. Evidence:
  `_components/IntentCard/IntentCard.tsx` (summary `<q>`), its unchanged
  `getByText("Refactor the auth module to use JWT.")` test still passing.

- **2026-07-02** — The persistent accent "box" around a just-clicked tab comes
  from the vendored global `:focus-visible { outline: 2px solid var(--accent) }`
  (`src/vendor/ui/styles.css:214`) landing on the bare `<button>` in vendor
  `kit/Tabs.tsx` — the button keeps focus after the click-driven
  `router.replace` re-render. Vendor-safe fix (vendor is do-not-touch): wrap
  `<Tabs>` in a `<div onMouseDownCapture={e => { if (target closest button)
  e.preventDefault(); }}>` so pointer clicks never give the button focus
  (keyboard Tab/Enter unaffected → a11y ring preserved), plus app-level
  `button:focus:not(:focus-visible) { outline: none }` in `globals.css`.
  Evidence: `_components/PrDetailHeader/PrDetailHeader.tsx`,
  `src/app/globals.css`.

- **2026-07-03** — `position: fixed` (used by `FindingsHoverCard` to escape
  an ancestor's `overflow: hidden`, see the 2026-06-20 entry above) removes
  ancestor clipping but does NOT protect against the viewport edge or a
  child's intrinsic width — those are separate failure modes that need
  separate fixes. Viewport-bottom overflow: compute
  `maxHeight = window.innerHeight - top - 12` in the position-calculating
  handler and set `overflowY: "auto"` on the card (plus `position: "sticky"`
  on its header so it stays visible while scrolling) — otherwise a card with
  many items silently runs off the bottom of the screen with no way to
  reach the rest (page scroll can't move a `position: fixed` element).
  Intra-card horizontal overflow: a `display:flex` row with no
  `minWidth: 0`/`overflow: hidden` on its children lets an unbroken long
  string (e.g. a Next.js dynamic-route file path with no spaces) render at
  full content width and burst past the card's own border — flex items
  default to `min-width: auto`. Fix: `flex: 1, minWidth: 0, overflow:
  hidden, textOverflow: "ellipsis", whiteSpace: "nowrap"` on the text
  element (mirror `RunHistory.tsx`'s `commitMessageStyle`), `flexShrink: 0`
  on any sibling badge that must stay fully visible, and a `title` attr for
  the untruncated value on hover. Evidence:
  `components/SeverityCounts/FindingsHoverCard.tsx`.

- **2026-07-03** — `SmartDiff.groups[].files[].finding_lines` (contract in
  `@devdigest/shared`) holds the actual line **numbers**, not a count — the
  findings badge text (`t("findings", {count: finding_lines.length})`) and the
  in-group file sort both derive from `finding_lines.length`. A test fixture
  with e.g. `finding_lines: [5]` renders a "1 findings" badge, not "5 findings"
  — the `5` is a line number, so the array needs one element per finding to
  hit a given badge count. Hit writing `SmartDiffViewer.test.tsx`'s
  `SMART_DIFF_STUB`, which had conflated the two. Evidence:
  `_components/SmartDiffViewer/SmartDiffViewer.tsx`,
  `_components/SmartDiffViewer/SmartDiffViewer.test.tsx`.
- **2026-07-03** — `diff-viewer`'s public surface (`components/diff-viewer/index.ts`)
  was narrower than what a second consumer actually needed: it exported only
  `DiffViewer`/`DiffCommentApi`, so `SmartDiffViewer` (which renders its own
  diff lines to anchor "N findings" badges — see `specs/smart-diff.md` §11)
  had to deep-import `parsePatch`/`Line` from `diff-viewer/helpers.ts`,
  flagged by `architecture-reviewer` as a boundary violation. Fixed by
  promoting `parsePatch`/`Line` to `diff-viewer/index.ts`'s exports — they're
  pure and stable enough to be public. Before deep-importing from a
  `components/*` group's internal file, check whether the needed primitive
  should just be added to that group's `index.ts` instead. Evidence:
  `components/diff-viewer/index.ts`, `_components/SmartDiffViewer/SmartDiffViewer.tsx`.
- **2026-07-03** — `SmartDiffViewer`'s "N findings" badge originally hardcoded
  `color: "var(--warn)"`/`background: "var(--warn-bg)"` in `styles.ts` instead
  of importing `SEV` from `@devdigest/ui` — a repeat of the exact antipattern
  already logged on 2026-06-24 (hand-rolled severity colors drifting from the
  canonical map). Caught by `plan-verifier` against `specs/smart-diff.md` §7,
  fixed to `SEV.WARNING.c`/`SEV.WARNING.bg`. Before adding ANY warn/crit/sugg-
  colored UI, grep for `var(--warn)`/`var(--crit)`/`var(--sugg)` literals first
  — the plan/task description saying "reuse SEV tokens" is not self-enforcing;
  it has now been missed twice. Evidence:
  `_components/SmartDiffViewer/styles.ts`.

- **2026-07-06** — When a child card gains a data hook, the PARENT composite
  test breaks too: `OverviewTab.test.tsx` renders `BlastRadiusCard` as a real
  child, so once the card called `useBlastRadius` the parent test needed its
  own `vi.mock("@/lib/hooks/blast")` or it attempted a real fetch. Rule: a new
  hook inside a `_components/*` card must be mocked in every composite test
  that renders it, not just the card's own test. Evidence:
  `_components/OverviewTab/OverviewTab.test.tsx`.
- **2026-07-06** — Plan-frozen UI copy with typographic characters (`—`, `…`)
  must land verbatim, and RTL tests assert those strings as exact literals —
  so the messages json and the test file have to change together. An
  implementer that "ASCII-safes" the copy (`--`, `...`) produces a
  copy-fidelity drift that plan-verifier flags. To insert non-ASCII into an
  existing ASCII file, use a Python byte-replace instead of the `Edit` tool
  (same corruption risk as server/INSIGHTS.md 2026-06-30). Evidence:
  `client/messages/en/brief.json`, `_components/BlastRadiusCard/BlastRadiusCard.test.tsx`.
- **2026-07-07** — A count/label pair rendered as **bold number + separately
  styled label in two sibling `<span>`s** (design-mock requirement — e.g.
  `<span>{count}</span> <span>{label}</span>`) breaks a plain
  `getByText("1 symbols")` RTL assertion: the combined string is no longer one
  text node. Match on an element's full `textContent` instead:
  `screen.getByText((_, el) => el?.tagName.toLowerCase() === "span" &&
  el.textContent?.replace(/\s+/g, " ").trim() === "1 symbols")`. Distinct from
  the 2026-07-02 `<q>`-tag entry (that's about CSS-generated quote glyphs, not
  split number/label markup). Evidence:
  `_components/BlastRadiusCard/BlastRadiusCard.test.tsx` (`getByCountText`
  helper).
- **2026-07-11** — A shared-contract field frozen as
  `z.array(z.string()).default([])` (not `.nullish()`) is **required** in the
  inferred TS type (`z.infer` of `.default()` output is non-optional), so every
  plain `Agent`/`Skill` object-literal fixture anywhere in the client breaks on
  `tsc --noEmit` — while `vitest run` (esbuild, type-stripping) stays green,
  masking it. Adding such a field means a repo-wide fixture sweep for
  `project_context_paths: []`-style one-liners, including directories no task
  owns. Evidence: `src/vendor/shared/contracts/knowledge.ts`, fixed fixtures in
  `agents/_components/AgentCard/AgentCard.test.tsx`,
  `skills/_components/{SkillCard,SkillsListView}/*.test.tsx`.
- **2026-07-11** — RTL's `getByText(string)` whitespace normalization applies
  to the rendered DOM text but NOT to a multi-line target string — asserting a
  `<pre>` block's exact content (e.g. `JSON.stringify(arr, null, 2)` with real
  `\n`s) needs a function matcher comparing `el.textContent === expected`.
  Distinct from the 2026-07-02 `<q>` and 2026-07-07 split-span entries (those
  are about generated glyphs / split text nodes). Evidence:
  `SkillEditor/_components/ProjectContextSection/ProjectContextSection.test.tsx`.

- **2026-07-12** — `ContextDocumentAttachList`'s row order previously
  re-seeded (attached-first sort) on **every** toggle because the seeding
  `useEffect`'s dedup key included `attachedKey` (`attached.join(",")`) —
  since toggling changes `attachedPaths`, the key changed on every click and
  the whole list re-sorted, so a row visibly jumped to the top on check and
  back down on uncheck. Fix: seed the display `order` once per catalog only
  (dedup key = `attachable|sorted document paths`, no `attachedKey`); after
  the initial seed, only an explicit drag (`onDrop`) may reorder — checking a
  box must never move a row. Evidence:
  `components/ContextDocumentAttachList/ContextDocumentAttachList.tsx`.
- **2026-07-12** — `useUpdateSkill`/`useUpdateAgent` (`lib/hooks/{skills,agents}.ts`)
  did not invalidate the `["context"]` query key that `useContextFiles`
  (`lib/hooks/core.ts`) caches its catalog+token data under — so after
  attaching/detaching a document, the per-row `≈N` tokens and the footer
  total stayed frozen at whatever was cached on page load (looked like "only
  the first document has a token count" / "the total never updates") until a
  full reload. The mutation and the query it must invalidate live in
  different hook files, so this is easy to miss when adding a new
  attach/detach mutation — always cross-check `lib/hooks/core.ts` for query
  keys a same-domain mutation should invalidate, not just same-file ones.
  Fix: both mutations' `onSuccess` now also call
  `qc.invalidateQueries({ queryKey: ["context"] })`.
- **2026-07-12** — `ContextDocumentAttachList` is one component shared by the
  Agent Context tab and the Skill "Project context to use" section, but the
  two call sites are NOT visually identical per the design mocks: the agent
  tab's Preview button shows an icon **and** the label text, the skill
  section's Preview button is icon-only. Added a `showPreviewLabel?: boolean`
  prop (default `true`) rather than forking the component — the skill call
  site passes `false`. Also: only the agent Context tab renders a
  token-total footer; the skill section instead renders a "Serializes as"
  block (`## Project specifications` + attached paths) with no token count —
  don't assume adding a footer/prop to one call site's usage should be
  mirrored in the other without checking the mock for that specific screen.
  Evidence: `components/ContextDocumentAttachList/ContextDocumentAttachList.tsx`,
  `_components/ProjectContextSection/ProjectContextSection.tsx`.

## Decisions

- **2026-07-02** — The PR Overview tab is laid out 1:1 per the design mock
  (PR BRIEF verdict card on top → two-column Intent | Blast-radius row →
  Description), but panels whose backend doesn't exist yet (Blast radius,
  Risk areas inside the intent card, Prior-PRs bar) render **honest
  empty-states in the mock's styling — never fabricated/static data**
  (user-approved choice over pixel-perfect fake content). When a later lesson
  ships those backends, replace the empty-state bodies in
  `_components/BlastRadiusCard/` and the Risk-areas section of
  `_components/IntentCard/` — the layout slots are already in place.
  PR BRIEF reuses `VerdictBanner` (now takes optional `cost`/`tokensIn`/
  `tokensOut` rendered via `RunCostBadge` under the score ring) fed by
  `usePrReviews` + `usePrRuns` (cached, no new endpoint).
- **2026-07-12** — A shared component reused across surfaces living in
  DIFFERENT i18n namespaces (`ContextDocumentAttachList`: Project Context page
  → `context`, Agent Context tab → `agents`, Skill section → `skillEditor`)
  takes its display strings as props (`filterPlaceholder`/`categoryLabels`/
  `emptyTitle`/…) instead of owning a `useTranslations` call — the "one
  namespace per component" convention (2026-06-28) assumes a single-surface
  component and can't pick one of three namespaces without duplicating keys.
  Each consumer namespace carries an identically-shaped `contextDocs.*` block.
  Alternative rejected: a fourth standalone namespace just for the shared
  component (breaks the namespace-per-feature file layout). Evidence:
  `src/components/ContextDocumentAttachList/ContextDocumentAttachList.tsx`.
