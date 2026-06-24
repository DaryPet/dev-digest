# Spec: Conventions Extractor

Analyze a repo's existing code to **propose** code-style conventions
(naming, error-handling shape, module boundaries, etc.), let a human
approve/reject each candidate with cited evidence, then bundle the accepted
ones into a `Skill` that can be linked to any agent (reusing A2's
`agentSkills` link mechanism — no new agent-side plumbing). Two screens:
a candidate review list and a "create skill from selection" modal.

Most candidates will be noise (low-confidence guesses); the feature's job is
to surface a small number that are genuinely worth promoting to a project
rule, not to auto-accept anything.

## 1. Schema / migration

`conventions` is already declared in `server/src/db/schema/knowledge.ts:31-42`
but never migrated — generate + apply it (`drizzle-kit generate`, then
`db:migrate`). Per `server/INSIGHTS.md` (2026-06-20): verify the new `.sql` is
actually listed in `meta/_journal.json` after generation — an orphaned file
on disk that isn't journaled is silently skipped by `db:migrate`.

Add one column not yet on the table: `category` (`text`, nullable) — the
mockup's candidates aren't all the same shape (naming vs. architecture vs.
error-handling); `rule` alone conflates the two. Extend `ConventionCandidate`
(`server/src/vendor/shared/contracts/knowledge.ts:144-152`) with the same
field, plus `status: z.enum(['pending','accepted','rejected'])` (replaces the
plain `accepted: boolean()` — the UI needs a third "still pending" state, not
just true/false).

## 2. Sample selection (no model call)

Reuse `repoIntel.getConventionSamples(repoId, 12)`
(`server/src/modules/repo-intel/service.ts:630`) for the top-12 files, plus
read `.eslintrc*`, `tsconfig*.json`, `.prettierrc*` from the repo root if
present. Concatenate into the extraction prompt's context — purely
mechanical, no model involved in *selecting* samples.

## 3. `POST /repos/:id/conventions/extract`

New module `server/src/modules/conventions/` (routes + service + repository,
mirroring the shape of `repo-intel`'s module split). Steps:

1. Build the sample bundle (§2).
2. Call the model configured for the `conventions` feature slot — already
   registered in Settings (`contracts/platform.ts:73-78`, default
   `openai/gpt-5.4`); reuse `container.llm()` + the per-feature model
   resolution already used elsewhere (same pattern other `FeatureModelId`
   entries use — don't hardcode a model here).
3. Prompt asks for a JSON array of
   `{ category, rule, evidence: { file, line }, confidence }`.
4. **Evidence verification (code, not model):** for each candidate, read the
   cited file from the repo's local clone/snapshot and confirm (a) the file
   exists, (b) the cited line is in range. Drop candidates that fail either
   check — do not surface unverifiable claims in the UI at all.
5. Insert survivors into `conventions` with `status: 'pending'`.

Re-running extract (the mockup's "Re-scan" button) appends a fresh batch
rather than wiping prior decisions — a previously-rejected rule re-detected
should not silently reappear as pending. (Open question, flagged in §6.)

## 4. `GET /repos/:id/conventions`

List candidates for the repo, newest scan first. Response shape mirrors the
mockup: rule text, evidence file + line range, an evidence code snippet
(read at request time from the same source used in §3, not stored — keeps
the table small), confidence (0–1, rendered as the mockup's colored bar:
green ≥ 0.8, amber otherwise), and `status`.

## 5. `PATCH /repos/:id/conventions/:id`

Body: `{ status: 'accepted' | 'rejected' }` or `{ rule: string }` (manual
edit of the proposed wording before accepting — the mockup's cards are
plain text, not yet shown as editable, but the spec calls for an edit step
before skill creation, so allow it here rather than only in the skill-body
textarea).

## 6. `POST /repos/:id/conventions/skill`

Body: `{ candidateIds: string[], name, description, type, enabled }`
(matches the "Create skill from conventions" modal fields). Server:

1. Loads the named candidates (must all be `status: 'accepted'`).
2. Generates a markdown skill body — one `##` section per candidate, title
   = the rule, body = "Detected in `file:line`" + the evidence snippet
   (matches the modal's preview: `# payments-api-conventions`, `## async-
   await-then-chains`, "Always use async/await instead of .then() chains.",
   "Detected in `src/api/users.ts:23-31`:").
3. Returns the generated body to the client **uneditable on the server
   side** — the modal lets the user edit it client-side before the actual
   save call, per the mockup's "Everything below is editable before you
   save" banner. So this endpoint is a *preview* generator; the actual
   `Skill` row is created by the existing skill-creation path once one
   exists (see Open question below) with `source: 'extracted'`,
   `type: 'convention'`, `evidence_files` populated from the candidates'
   `evidence_path`s.

## 7. UI

### `client/src/app/repos/[repoId]/conventions/page.tsx` (new route)

List screen from the first mockup: header with sample-file count + last-scan
time, "Re-scan" button (calls §3), "N of M accepted" counter, "Deselect all",
per-candidate card (rule, evidence path:line, code snippet, confidence bar,
Accept/Reject). "Create skill" button enabled only when ≥1 candidate is
accepted; opens the modal below.

### `CreateSkillFromConventionsModal` (new component, colocated
`_components/`)

Form screen from the second mockup: banner naming the source repo + accepted
count, Name/Description/Type/Enabled fields, a `body` textarea pre-filled
from §6's generated markdown (editable), Cancel / "Create skill" buttons.

Both screens are net-new pages/components — there is currently no client
route for conventions and no global "Skills Lab" nav section in `AppShell`.
This spec does **not** rebuild that nav (the mockup's sidebar includes
Eval Dashboard / Multi-Agent Review / Agent Performance / CI Runs / Memory,
none of which exist yet — out of scope). The new page is reached the same
way `pulls` is — linked from the repo's existing page.

## 8. Productizing ideas (the ТЗ's "additional task" — more/better findings)

Not building these now, recorded for follow-up:

- **Diff/history-weighted sampling**: prefer files touched across many
  commits (a rule enforced for a year carries more signal than one seen in
  a single file once) over `repoIntel`'s pure rank order.
- **Self-consistency pass**: run extraction twice (or with two prompts —
  naming/style vs. architecture/error-handling) and keep only rules that
  recur, as a confidence boost independent of the model's own stated score.
- **Negative sampling**: explicitly ask the model to also look for
  *violations* of a candidate rule elsewhere in the sample set — a rule with
  zero counterexamples in 12 files is weaker evidence than a model's
  unverified confidence score suggests.
- **User-seeded examples**: let the user paste a known-good/known-bad file
  pair to anchor what "a convention" means for this repo before the first
  scan, instead of starting from a cold prompt.

## Open questions

- Where does `Skill` row creation actually happen? There is currently no
  `POST /skills` route anywhere in the codebase (only `POST /agents/:id/
  skills` which *links* an existing skill id). §6 assumes one will exist;
  if not, this spec's last step needs its own creation endpoint, scoped
  separately from the conventions module.
- Re-scan dedup against already-rejected candidates (§3) needs a decision
  before implementation — fingerprint by `(file, line, rule-text-similarity)`
  is the likely approach but isn't specified yet.
