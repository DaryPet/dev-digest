# Spec: Skills Lab — UI

Author the client UI for **Skills** in the studio. Skills are reusable,
directive markdown rules linked to review agents; the server module (`/skills`
CRUD + import preview, see §0) already exists. This spec covers ONLY the
Next.js client: a Skills list + a per-skill editor that **mirrors the Agent
editor**, the import flow, and the Agent editor's **Skills** tab (link / enable
/ reorder).

The DB is the source of truth. All server data goes through
`src/lib/hooks/*` → `src/lib/api.ts` — never `fetch` ad hoc from a component
(`client/AGENTS.md`). Contracts come from `@devdigest/shared` (vendored) — reuse
`Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` instead of re-declaring.

### Pre-seeded scaffolding (verified) — and a design divergence to resolve

Parts of this feature are already stubbed in the repo and must be reconciled
with the **new** screenshots, not followed blindly:

- `messages/en/skills.json` **already exists**, but it encodes an *older*
  design: an "Add a skill" **Drawer** with `From file / From URL / Community`
  tabs, an "untrusted / needs vetting / disabled until vetted" framing, and a
  side **preview** pane. The new design (these screenshots) is a **full editor
  page mirroring the Agent editor** (tabs Config/Preview/Versions/Stats)
  and import is **file/zip only** (no URL, no community — matches the TЗ and the
  server, which only ships `POST /skills/import`). Build the new design. Reuse
  the catalog keys that still apply (`listItem.type.*`, `preview.*`, `file.*`,
  `page.crumb*`, the untrusted-notice copy for §5's trust banner); add new keys
  for the editor tabs; ignore the `url.*` / `community.*` / `drawer.tabs.url|
  community` keys.
- `messages/en/agents.json` already has `editor.tabs.skills` and a `skills.*`
  section (`title`, `enabledCount`, `filterPlaceholder`, `orderHint` —
  *"Order matters — earlier skills appear earlier in the assembled prompt"*) for
  the agent **Skills** tab (§6). Reuse them.
- The Agent editor was designed for the Skills tab: its `TABS` constant only
  lists `config`, but the i18n + the `mount.body` stub anticipate the rest.

### Confirmed component / API inventory

- Layout primitives & kit (all from `@devdigest/ui`): `Tabs`, `Dropdown`,
  `FormField`, `TextInput`, `Textarea`, `SelectInput`, `SearchableSelect`,
  `Drawer`, `Modal`, `Checkbox`, `Button`, `Icon`, `Badge`, `Toggle`, `Card`,
  `EmptyState`, `ErrorState`, `Skeleton`, `SectionLabel`, `Markdown`,
  `CircularScore`, `PercentProgress`. Token maps `SEV`, `CAT` (no `SkillType`
  map — see §7).
- `Markdown` is children-based: `<Markdown>{skill.body}</Markdown>` (react-
  markdown + GFM, no `source` prop).
- `Dropdown` API (from `AgentsListView`): `<Dropdown trigger={<Button.../>}
  items={[{ label, icon, onClick }]} />`.
- Messages load per-namespace from `client/messages/<locale>/<ns>.json` via
  `src/i18n/request.ts` (`loadMessages`) — adding/extending a namespace is just
  editing that JSON file; no shared wiring to touch.

## 0. Server contract (already built — reference)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/skills` | list (workspace-scoped, newest first) |
| GET | `/skills/:id` | one skill |
| POST | `/skills` | create (also the **confirm-import** path) |
| PUT | `/skills/:id` | update / toggle `enabled`; body change → new version |
| DELETE | `/skills/:id` | delete (agent links cascade) |
| GET | `/skills/:id/versions` | body snapshot history, newest first |
| POST | `/skills/import` | `{filename, content_base64}` → **preview** (no persist, no execution) |

Reused unchanged for agent binding: `GET /agents/:id/skills`,
`POST /agents/:id/skills` (set/reorder with `skill_ids`, or link one with
`skill_id` + `order`).

**One additive endpoint needed for Stats (§4.4):** `GET /skills/:id/agents` →
the agents that link this skill (derived from `agent_skills`). Small, additive,
workspace-scoped; mirrors the existing agents repository join.

## 1. Routes & layout

Mirror the Agents feature exactly (`src/app/agents/`):

- `src/app/skills/page.tsx` — thin entry → `<SkillsListView />`.
- `src/app/skills/[id]/page.tsx` — three-pane: sidebar (AppShell) + middle
  **Skills** list + right **SkillEditor**. Tab state in `?tab=` like the agent
  editor (`src/app/agents/[id]/page.tsx`); `VALID_TABS = ["config","preview",
  "versions","stats"]`, default `config`.
- Breadcrumb: `[{ label: "Skills Lab" }, { label: "Skills", href: "/skills" },
  { label: skill?.name }]` (matches the agent editor crumb).

Pages stay thin; feature logic in colocated `_components/<Name>/` folders, each
with its own `*.test.tsx` (`client/AGENTS.md`).

## 2. Data layer — `src/lib/hooks/skills.ts`

New hooks file mirroring `src/lib/hooks/agents.ts`. Query keys:
`["skills"]`, `["skill", id]`, `["skill-versions", id]`, `["skill-agents", id]`.

- `useSkills()` → `GET /skills`
- `useSkill(id)` → `GET /skills/:id` (`enabled: !!id`)
- `useCreateSkill()` → `POST /skills`; invalidates `["skills"]`. Input type
  reuses `Skill` field names (`name`, `description`, `type`, `source?`, `body`,
  `enabled?`, `evidence_files?`).
- `useUpdateSkill()` → `PUT /skills/:id` (also the enabled toggle); invalidates
  `["skills"]`, sets `["skill", id]`, invalidates `["skill-versions", id]`.
- `useDeleteSkill()` → `DELETE /skills/:id`.
- `useSkillVersions(id)` → `GET /skills/:id/versions`.
- `useImportSkillPreview()` → `POST /skills/import` (mutation; returns the draft
  preview, writes nothing).
- `useSkillAgents(id)` → `GET /skills/:id/agents` (Stats).

Agent-binding hooks (extend `src/lib/hooks/agents.ts`, the agents module owns
the link table): `useAgentSkills(agentId)` → `GET /agents/:id/skills`;
`useSetAgentSkills()` → `POST /agents/:id/skills` with `{ skill_ids }` (the
reorder/replace path). On success invalidate `["agent-skills", agentId]`.

## 3. Skills list (middle column) — `_components/SkillsListView`

- Search input filters by name/description (client-side over `useSkills()`).
- `+ Add skill` button → a small menu (reuse the agents list's `Dropdown` /
  "Add Agent" pattern) with **Create** (→ blank editor / create) and **Import**
  (→ import dialog, §5).
- `SkillCard` per skill: name, **type badge** (§7), description (truncated),
  `enabled` `Toggle` (optimistic via `useUpdateSkill`), and the stats strip
  (runs / accept %) — render the runs/accept strip only when data exists,
  otherwise omit (we have no per-skill run aggregate yet; show nothing rather
  than `0 0`). Active card highlighted; click → `/skills/:id`.
- Empty state: reuse `EmptyState` primitive.

## 4. SkillEditor — `src/app/skills/[id]/_components/SkillEditor`

Mirror `AgentEditor` (`src/app/agents/[id]/_components/AgentEditor/`): a
`Tabs` bar + a body that renders the active tab. `constants.ts` `TABS`:
`config · preview · versions · stats` (icons via `@devdigest/ui` `IconName`).
**No Evals tab** — it is not in the TЗ; do not add it (not even a placeholder).

### 4.1 Config tab
Fields: `Enabled` toggle, **Name** (`TextInput`), **Description** (`Textarea` —
helper text: *"The skill's directive interface — write it as an instruction the
agent follows"*), **Type** (`SelectInput`, `SkillType` values), **Skill body**
(`Textarea`, markdown). Local state seeded from the skill, reset on `skill.id`
change (same `useEffect([skill.id])` pattern as `ConfigTab`). Save → 
`useUpdateSkill`; toast on success/failure (`useToast`). A body change creates a
new version server-side (no client logic needed).

### 4.2 Preview tab
Render `skill.body` with `<Markdown>{skill.body}</Markdown>` (the
children-based primitive, react-markdown + GFM). Subtitle: *"Rendered as it
appears in the review agent's prompt"*. No editing.

### 4.3 Versions tab
`useSkillVersions(id)` → list newest-first: version number, `created_at`, a
`Current` badge on the highest version, a body excerpt, and a **Restore**
action. Restore = `useUpdateSkill({ id, patch: { body: <snapshot body> } })`,
which bumps to a new version with the restored body (no destructive rewrite of
history). NOTE: the mock shows per-version commit-style messages (e.g. "Added
Tests dimension"); the schema (`skill_versions`: `version`, `body`,
`created_at`) stores **no label**, so we show version # + date, not invented
messages. (A `message` column would be a schema change — out of scope.)

### 4.4 Stats tab (minimal)
`useSkillAgents(id)` → "USED BY N agents" + an "Agents using this skill" list
(name + link to the agent). The mock's richer metrics (pull frequency, cost,
findings-by-category donut) depend on run/eval aggregation from other lessons —
**out of scope**; render the agents panel and omit the rest (no placeholder
fake numbers). Requires the additive `GET /skills/:id/agents` endpoint (§0).

## 5. Import dialog — `_components/ImportSkillDialog`

Triggered from `+ Add skill → Import`. Flow:

1. File input accepting `.md,.markdown,.zip`. Read the file in-browser
   (`FileReader`), base64-encode the bytes (the server has no multipart;
   `/skills/import` takes `{ filename, content_base64 }`).
2. `useImportSkillPreview()` → render the returned **draft** (name, description,
   type, body markdown preview) + `ignored_files` + `warnings`. Nothing is
   saved yet.
3. **Trust notice** (prominent): *"An imported skill is someone else's
   instructions injected into your agent's prompt. Review the body before
   enabling it."* — matches the video's trust framing. Show `ignored_files`
   explicitly as *"executable files skipped — not stored or run"*.
4. **Save** (confirm) → `useCreateSkill` with the (possibly edited) draft fields
   and `source: 'extracted'`. Only here does anything persist. Cancel discards.

## 6. Agent editor → Skills tab

Per the original TЗ (and the earlier agent-editor screenshots): bind / enable /
reorder a skill set on an agent; **order = block order in the prompt**.

- `src/app/agents/[id]/_components/AgentEditor/constants.ts`: add
  `{ key: "skills", labelKey: "editor.tabs.skills", icon: ... }` to `TABS`.
- `src/app/agents/[id]/page.tsx`: add `"skills"` to `VALID_TABS`.
- `AgentEditor.tsx`: render `<SkillsTab agent={agent} />` when `tab === "skills"`
  (today it renders `ConfigTab` unconditionally — branch on `tab`).
- `_components/SkillsTab`: list linked skills (`useAgentSkills`) with a per-row
  enable/disable and **drag-to-reorder** (HTML5 DnD or a tiny index-swap; order
  is the array index). A picker adds an unlinked skill. Persist the whole
  ordered set via `useSetAgentSkills({ agentId, skill_ids })`. Reuse the type
  badge (§7). Note for the demo: a row's enable here toggles the *link-time*
  view; the actual "disabled skill not in the prompt" gate is `skill.enabled`
  (server `run-executor.ts:187` filters `l.skill.enabled`). Keep the row toggle
  bound to the skill's `enabled` (via `useUpdateSkill`) so "enabled skill shows
  as its own block in the logs, disabled doesn't" holds end to end.

## 7. Type badges — color source

Skill types are `rubric · convention · security · custom`. Per `client/INSIGHTS`
(2026-06-24) severity/verdict colors must come from ONE source and never be
hand-typed per component — but `SEV` covers *finding severities*, not skill
types. So introduce **one** canonical map for skill-type color/label (e.g.
`client/src/components/SkillTypeBadge/` wrapping the `Badge` primitive, or a
`SKILL_TYPE_META` constant beside it) and reuse it in the card, the editor
header, and the agent Skills tab. Do not inline a `Record<SkillType, string>` in
three components. Pick colors from the existing token palette
(`vendor/ui/primitives/tokens.ts`), not fresh hex.

## 8. Navigation (vendored — coordinated edit)

`src/vendor/ui/nav.ts` hardcodes `NAV`; `Sidebar` imports it directly (no prop
override). With coordination, add a `skills` item so the sidebar matches the
design:

```
{ key: "skills", label: "Skills", icon: <IconName>, href: "/skills", gKey: "s" }
```

Add it to the WORKSPACE group (or a new `SKILLS LAB` section grouping
Skills + Agents). Add the matching `g s` entry to `SHORTCUTS`. This is the only
vendored edit; keep it to these lines. (Conventions / Eval Dashboard / GLOBAL
sections in the mock belong to later lessons — not added here.)

## 9. i18n

`next-intl`, single locale `en`, one JSON per namespace at
`client/messages/en/<ns>.json` merged by `src/i18n/request.ts`; consumed via
`useTranslations("<ns>")`. Edit `messages/en/skills.json` (it exists) — add the
editor-tab keys (`editor.tabs.config|preview|versions|stats`), the Config
field labels/helper text, the Versions/Restore copy, and the §5 trust-banner
copy (reuse the existing `preview.untrustedNotice` / `file.bodyHint` wording).
Remove or leave unused the stale `url.*` / `community.*` keys (see the
divergence note up top). The agent **Skills** tab (§6) reuses the existing
`agents.json` `editor.tabs.skills` + `skills.*` keys — no new file there.

## 10. Tests

Colocated `*.test.tsx` per component (Vitest + Testing Library), mocking `fetch`
(`client/AGENTS.md`): SkillCard (badge, toggle), ConfigTab (edit→save),
Preview (markdown render), Versions (list + restore call), ImportSkillDialog
(preview → trust notice + ignored_files → confirm persists), agent SkillsTab
(reorder persists ordered `skill_ids`). Real browser journeys live in `../e2e`,
not here.

## 11. Out of scope (this lesson)

**Evals — not built at all** (not a tab, not a placeholder; not in the TЗ);
Stats full metrics beyond the agents-using panel (pull frequency / cost /
findings donut); Conventions + Eval Dashboard nav sections and pages; any
schema change (version `message` column, new tables); the seed agents +
control-experiment fixtures (tracked separately in the rollout plan, not this
UI spec).
