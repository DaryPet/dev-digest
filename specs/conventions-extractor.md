# Spec: Conventions Extractor

Analyze a repo's existing code to **propose** code-style conventions (naming,
error-handling shape, module boundaries, etc.), let a human approve / reject /
edit each candidate with cited, code-verified evidence, then bundle the
accepted ones into a `Skill` that can be linked to any agent (reusing the
existing `agentSkills` link mechanism — no new agent-side plumbing). Two
screens: a candidate review list and a "create skill from selection" modal.

Most candidates will be noise (low-confidence guesses); the feature's job is to
surface a small number that are genuinely worth promoting to a project rule,
not to auto-accept anything.

> Scope note: the mockups show a global "Skills Lab" sidebar (Eval Dashboard,
> Memory, Multi-Agent Review, Agent Performance, CI Runs). None of those exist
> and they are **out of scope** — the source of truth is the homework brief +
> the two screens it describes, not the surrounding chrome in the mock. This
> spec builds only the Conventions list screen and the Create-skill modal.

## 0. What already exists (reuse, don't rebuild)

- `repoIntel.getConventionSamples(repoId, 12)` (`repo-intel/service.ts:630`) —
  returns the top-12 file **paths** by rank (minus tests/configs/migrations).
  It returns paths only, not contents.
- `container.git.readFile(repoRef, path)` (`adapters/git/simple-git.ts:129`,
  port `GitClient`) — reads a file from the repo's local clone. **All file
  reads (sample contents, config files, evidence verification) go through this
  port** — never `fs` inline in a service (onion: side effects behind a port).
- `container.llm(provider)` + `StructuredRequest<T>` / `StructuredResult<T>`
  (`vendor/shared/adapters.ts`) — structured JSON model call with a Zod schema.
- `resolveFeatureModel(container, workspaceId, 'conventions')`
  (`settings/feature-models.ts`) — the per-workspace model for the already
  registered `conventions` feature slot (`contracts/platform.ts:73`, default
  `openai/gpt-5.4`). Don't hardcode a model.
- `POST /skills` (`skills/routes.ts:65`, `CreateSkillBody` with `source`,
  `type`, `evidence_files`) — the real Skill-creation endpoint **already
  exists**. This resolves the old open question: §6 is a *preview* generator;
  the actual row is created by `POST /skills`, no new creation endpoint needed.
- `POST /agents/:id/skills` (`agents/routes.ts:152`, `setSkills`/`linkSkill`) —
  links a skill to an agent.
- `githubBlobUrl(repoFullName, headSha, file, line)` (client
  `lib/github-urls.ts`) — builds the clickable evidence → GitHub link.

## 1. Schema / migration

`conventions` is declared in `server/src/db/schema/knowledge.ts:31` but never
migrated. Change it to:

- `+ category` (`text`, nullable) — candidates aren't all the same shape
  (naming vs. architecture vs. error-handling); `rule` alone conflates them.
- replace `accepted: boolean` with
  `status: text({ enum: ['pending','accepted','rejected'] }).notNull().default('pending')`
  — the UI needs a third "still pending" state, not just true/false.
- `+ createdAt` (`now()`) — drives the header's "last scan Xh ago"
  (`MAX(createdAt)` per repo) and the list's newest-first ordering. The table
  currently has no timestamp at all, so this must be added.
- `+ index` `conventions_repo_idx` on `repoId` (every query scopes by repo).

Deliberately **not** added: a `scanId` / "scan" entity. Neither the brief nor
the mockups model a scan as a thing — the only scan-related UI is the single
"last scan" timestamp, which `createdAt` covers. Re-scan dedup (§3) works on
rows + fingerprint, not on scan grouping.

Per `server/INSIGHTS.md` (2026-06-20): after `drizzle-kit generate`, verify the
new `.sql` is listed in `meta/_journal.json` — an orphaned file that isn't
journaled is silently skipped by `db:migrate`.

Mirror the contract `ConventionCandidate`
(`server/src/vendor/shared/contracts/knowledge.ts:144` **and** the client copy
`client/src/vendor/shared/contracts/knowledge.ts` — keep them identical):
add `category` (nullish), `status` enum (replaces `accepted`), `created_at`.

## 2. Sample selection (no model call)

`getConventionSamples(repoId, 12)` → paths; for each, read contents via
`container.git.readFile(repoRef, path)`. Plus read `.eslintrc*`,
`tsconfig*.json`, `.prettierrc*` from the clone root if present (missing ones
silently skipped). Concatenate into the extraction prompt's context — purely
mechanical, no model involved in *selecting* samples. The count of files read
becomes the header's "Detected from N sample files".

## 3. `POST /repos/:id/conventions/extract`

New module `server/src/modules/conventions/` (routes + service + repository +
helpers/constants/types), per `onion-architecture`'s module template; register
it in `server/src/modules/index.ts`. Steps:

1. Build the sample bundle (§2).
2. Resolve the model with `resolveFeatureModel(..., 'conventions')`, call
   `container.llm(provider).structured(...)` with a Zod schema for a JSON array
   of `{ category, rule, evidence: { file, line }, confidence }`.
3. **Evidence verification (code, not model):** for each candidate, read the
   cited file via `git.readFile`; drop it unless (a) the file exists and (b)
   the cited line is in range. For survivors, slice an evidence snippet around
   the cited line. Unverifiable claims never reach the UI.
4. **Re-scan dedup:** fingerprint each survivor by
   `(evidence_path, normalized rule text)`. If it matches an existing
   **rejected** candidate for this repo, skip the insert — a previously
   rejected rule must not silently reappear as pending. Re-running appends a
   fresh batch otherwise; prior decisions are never wiped.
5. Insert survivors with `status: 'pending'`.

## 4. `GET /repos/:id/conventions`

List candidates for the repo, newest first (`createdAt DESC`). Per candidate:
`rule`, `category`, `evidence_path`, line range, an evidence snippet (read at
request time via `git.readFile`, not stored — keeps the table small),
`confidence` (0–1, rendered as the colored bar: green ≥ 0.8, amber otherwise),
`status`, `created_at`. Plus header meta: `sampleCount` and `lastScanAt`
(`MAX(createdAt)`).

## 5. `PATCH /repos/:id/conventions/:id`

Body: `{ status: 'accepted' | 'rejected' }` **or** `{ rule: string }` (manual
edit of the proposed wording before accepting).

## 6. `POST /repos/:id/conventions/skill-preview`

Body: `{ candidateIds: string[] }`. Server:

1. Loads the named candidates (must all be `status: 'accepted'`).
2. Generates a markdown skill body — `# <name>`, an intro line ("House
   conventions for `<repo>`. Flag changes that violate any rule below and cite
   the offending `file:line`."), then one `## <slug>` per candidate: the rule
   text + "Detected in `file:line`:" + the evidence snippet (matches the
   modal's preview).
3. Returns the generated body **only** (nothing persisted). The modal lets the
   user edit it client-side before saving ("Everything below is editable before
   you save"). The actual `Skill` row is created by the existing `POST /skills`
   with `source: 'extracted'`, `type: 'convention'`, and `evidence_files`
   populated from the candidates' `evidence_path`s.

## 7. UI — list screen

`client/src/app/repos/[repoId]/conventions/page.tsx` (thin) + colocated
`_components/`. Per `ui-architecture`: page is thin, data goes through
`lib/hooks/conventions.ts` → `lib/api.ts` (no ad-hoc `fetch`), contracts from
`@devdigest/shared`.

- Header: "Conventions in `<repo>`", "Detected from N sample files · last scan
  …", **Re-scan** button (§3).
- Toolbar: "Deselect all", "N of M accepted" counter, **Create skill** button
  (enabled only when ≥ 1 candidate is accepted) → opens the modal (§8).
- `ConventionCard`: italic rule title; a `path:line` block with a copy icon and
  a monospace code snippet; `ConfidenceBar` (green ≥ 0.8 / amber otherwise,
  with %); **Accepted** (active/blue) / **Reject** buttons; green accent stripe
  on the left edge. The `path:line` links to GitHub via
  `githubBlobUrl(repoFullName, headSha, file, line)`.
- `ConfidenceBar`: small reusable presentational component (bar + %).

## 8. UI — `CreateSkillFromConventionsModal`

Colocated `_components/`. Banner: "Merged from N accepted conventions in
`<repo>`. Everything below is editable before you save." Fields: **Name**,
**Description**, **Type** (select, default `convention`, options = `SkillType`
enum `rubric/convention/security/custom` — the mock shows a dropdown defaulted
to `convention`), **Enabled** (toggle, "Whether this block is added to agents'
prompts"). **Skill body**: markdown editor pre-filled from §6, with a
`<name>.md` filename header and a token count. Footer: Cancel / **Create
skill** → `POST /skills`.

## 9. Data hooks (client)

`lib/hooks/conventions.ts`: `useConventions(repoId)`, `useExtractConventions`,
`usePatchConvention`, `useSkillPreview`, `useCreateSkill` — all through
`lib/api.ts`.

## 10. Productizing ideas (homework's "more/better findings" — follow-up)

Not building now; recorded for follow-up:

- **Diff/history-weighted sampling**: prefer files touched across many commits
  over `repoIntel`'s pure rank order.
- **Self-consistency pass**: run extraction twice (or with two prompts —
  naming/style vs. architecture/error-handling) and keep recurring rules.
- **Negative sampling**: ask the model to also find *violations* of a candidate
  rule elsewhere in the sample set; zero counterexamples = stronger evidence.
- **User-seeded examples**: let the user paste a known-good/known-bad file pair
  to anchor "a convention" before the first scan.

## Decisions (previously open)

- **Skill creation** — resolved: `POST /skills` already exists; §6 is a preview
  generator only.
- **Re-scan dedup** — resolved (§3.4): fingerprint by `(evidence_path,
  normalized rule text)`; skip if it matches an existing rejected candidate.
- **No scan entity** (§1): `createdAt` covers "last scan" + ordering; `scanId`
  is not added.
