## Implementation Plan — Project Context Folder
**Date:** 2026-07-10

### 1. Objective

Implements `specs/SPEC-01-project-context-folder.md` (approved). One-line objective: turn any markdown file under a repo's `specs/`/`docs`/`insights` folders into manually-attachable, run-time-injected review context (`reviewer-core`'s existing `## Project context` slot), with full visibility in the run trace — no auto-selection, no indexing/embedding.

### 2. Requirements review & recommendations

Requirements are as understood from SPEC-01 (§Goals, §AC-1..27, §Assumptions 1–4) — no re-derivation here; see the spec for WHAT/WHY.

Two material gaps were found and resolved with the developer before this plan (both approved, not spec re-openings — the spec is silent on both):

- **Repo scoping for the agent Context tab / skill Project-context section.** Agents/skills carry no `repo_id` (confirmed: no such column in `server/src/db/schema/agents.ts`/`skills.ts`) and Assumption 4 explicitly says attach paths carry no repo binding, yet AC-8/AC-14 imply "that agent's repo." **Resolved:** a lightweight, non-persisted repo selector local to the Context tab/section (sourced from the existing `useRepos()`), defaulting to (and hiding entirely for) the single-repo case.
- **A pre-existing, unused "Project Context" scaffold occupies this exact surface** — `useContextFiles`/`useReindexContext` (`client/src/lib/hooks/core.ts`) hitting `GET/POST /repos/:id/context[/reindex]`, contracts `SpecFile`/`IndexStatus` (`vendor/shared/contracts/platform.ts`), `context.json` messages, and `activeKeyFor` already mapping `/context` → nav key `"context"`. Its shape encodes a chunk/embedding-indexing design SPEC-01 marks Non-goal. **Resolved:** reuse the pre-wired **route path** (`GET /repos/:id/context`) and **nav key** (`"context"`); define fresh contract types in a new `contracts/project-context.ts` (do not repurpose `SpecFile`); delete `useReindexContext`; leave `SpecFile`/`IndexStatus` types in place unused; repurpose `context.json`'s copy (drop the indexing/edit-mode keys it currently has — they describe Non-goal functionality — replace with real copy for this page).

Additional planner decisions (not spec re-openings — spec explicitly defers these):

- **Discovery mechanism** (AC-1): reuse `container.git.clonePathFor(repo)` (already part of the `GitClient` port, `server/src/vendor/shared/adapters.ts:227`) to get the clone's local root, then a **fresh filesystem walk** rooted there (`node:fs/promises.readdir`/`stat`, never-follow-symlinks) mirroring `repo-intel/pipeline/walk.ts`'s established pattern — not a new git-port method (no vendor-adapter-interface change needed) and not reusing `repo-intel`'s indexer (different scope: named-dir discovery vs whole-repo AST indexing).
- **Size/perf guards** (Edge cases, "not frozen here"): `MAX_DISCOVERED_FILES = 2000` (walk stops enumerating further), `MAX_SPEC_CHARS = 20_000` per document when assembling the run-time prompt block (truncated with a `…[truncated]` note; the Preview panel shows full content, uncapped except a hard 400 KB read guard to avoid pathological files).
- **Path-safety at the write boundary**: attach paths only ever originate from checkbox UI (never free text — per spec's Untrusted-inputs note), but as defense-in-depth the agents/skills `update()` services reject any incoming `project_context_paths` entry containing a `..` segment or a leading `/` before persisting (cheap, no repo lookup needed).
- **Trace token size for the specs block** (AC-25 "approximate injected token size"): needs a real number computed with the project's tokenizer (Assumption 3), which the trace contract doesn't currently carry per-slot. Adds one new **nullish** field `RunTrace.specs_tokens` (backward-compatible per the exact recipe already documented in `reviewer-core/INSIGHTS.md` 2026-06-30 for optional-slot additions).

Recommendation (no action required, informational): `reviewer-core` needs **zero changes** — `PromptParts.specs`, `assemblePrompt`'s `## Project context` rendering, `wrapUntrusted`, and `INJECTION_GUARD` already do exactly what AC-19/26/27 need (verified in `reviewer-core/src/prompt.ts` and `src/review/run.ts:60,139`).

### 3. Acceptance criteria

See `specs/SPEC-01-project-context-folder.md` §Acceptance criteria (EARS), AC-1..AC-27. Not re-derived here.

### 4. Scope

See SPEC-01 §Goals/Non-goals. Deltas this plan itself introduces (not in the spec, needed to execute it):
- IN: retiring the dead `useReindexContext` hook and repurposing `context.json`'s copy (both currently orphaned, no spec ACs reference them).
- IN: a non-persisted repo picker in the agent/skill Context UI (UX-only, not a stored preference).
- OUT: touching `SpecFile`/`IndexStatus` contract types, `server/src/platform/trace-builder.ts` (currently uncalled — verified via repo-wide grep — omitting the new `specs_tokens` field there is backward-compatible, no edit forced), any CI-runner wiring, and any e2e test (no precedent for e2e coverage on comparable single-package features — `conventions`/`intent` have none either).

### 5. Affected packages & modules

| Package/module | Onion layer(s) | Why touched |
|---|---|---|
| `server/src/vendor/shared` | contracts | new `project-context.ts`; extend `knowledge.ts` (`Agent`/`Skill`), `trace.ts` (`RunTrace.specs_tokens`) |
| `server/src/modules/project-context` (new) | domain/service, infrastructure (fs walk), presentation (routes) | discovery, effective-set dedup, preview, run-time resolve |
| `server/src/modules/agents` | service, repository, presentation | persist/serialize `project_context_paths` |
| `server/src/modules/skills` | service, repository, presentation | persist/serialize `project_context_paths` |
| `server/src/modules/reviews` (`run-executor.ts`) | application/service | wire `specs`/`specs_read`/`specs_tokens` into the existing run pipeline |
| `server/src/db/schema` (`agents.ts`, `skills.ts`) | infrastructure | new jsonb columns + generated migration |
| `server/src/modules/index.ts` | composition root | register the new module (sequential-only file) |
| `client/src/vendor/shared` | contracts | mirrors the server vendor edits (own copy, own file) |
| `client/src/vendor/ui/nav.ts` | UI config | new sidebar nav item |
| `client/src/lib/hooks`, `client/src/lib/types.ts` | data access | catalog/preview/attach hooks |
| `client/src/app/repos/[repoId]/context` (new) | UI feature | Project Context page |
| `client/src/app/agents/[id]/_components/AgentEditor` | UI feature | new Context tab |
| `client/src/app/skills/[id]/_components/SkillEditor` | UI feature | new Project-context section in ConfigTab |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer` | UI feature | AC-25 label + token size on the specs prompt block |
| `client/src/components` (new `ContextDocumentAttachList`) | shared UI | row-list reused by 3 surfaces |
| `client/messages/en` (`context.json`, `agents.json`, `skillEditor.json`, `runs.json`) | i18n | copy for all of the above |

`reviewer-core`: **no changes** (see §2).

### 6. Frozen interface contracts

#### 6.1 New shared contract file — `contracts/project-context.ts`
Create identically in **both** `server/src/vendor/shared/contracts/project-context.ts` and `client/src/vendor/shared/contracts/project-context.ts` (each task edits only its own package's copy — see §7):

```ts
import { z } from 'zod';

export const ProjectContextCategory = z.enum(['specs', 'docs', 'insights']);
export type ProjectContextCategory = z.infer<typeof ProjectContextCategory>;

export const ProjectContextDocument = z.object({
  path: z.string(),
  category: ProjectContextCategory,
});
export type ProjectContextDocument = z.infer<typeof ProjectContextDocument>;

export const ProjectContextEffectiveDocument = ProjectContextDocument.extend({
  approx_tokens: z.number().int(),
});
export type ProjectContextEffectiveDocument = z.infer<typeof ProjectContextEffectiveDocument>;

/** Present only when the catalog request specified agent_id or skill_id. */
export const ProjectContextAttachment = z.object({
  attached_paths: z.array(z.string()),
  /** Post-dedup effective set (agent: direct + inherited skills; skill: its own list only). */
  effective: z.array(ProjectContextEffectiveDocument),
  total_approx_tokens: z.number().int(),
});
export type ProjectContextAttachment = z.infer<typeof ProjectContextAttachment>;

export const ProjectContextCatalog = z.object({
  root_path: z.string(),
  documents: z.array(ProjectContextDocument),
  attachment: ProjectContextAttachment.nullish(),
});
export type ProjectContextCatalog = z.infer<typeof ProjectContextCatalog>;

export const ProjectContextPreview = z.object({
  path: z.string(),
  category: ProjectContextCategory,
  content: z.string(),
  used_by_count: z.number().int(),
});
export type ProjectContextPreview = z.infer<typeof ProjectContextPreview>;
```

Add `export * from './contracts/project-context.js';` to both `index.ts` barrels (server's and client's — each is a distinct file, no cross-task collision).

#### 6.2 Extend existing contracts (both vendor copies, `knowledge.ts` + `trace.ts`)

```ts
// knowledge.ts — Agent, add one field:
project_context_paths: z.array(z.string()).default([]),

// knowledge.ts — Skill, add one field:
project_context_paths: z.array(z.string()).default([]),

// trace.ts — RunTrace, add one nullish field (sibling to specs_read):
specs_tokens: z.number().int().nullish(),
```
Mirrors the exact `evidence_files` precedent already in `Skill` and the "new optional slot" recipe in `reviewer-core/INSIGHTS.md` (2026-06-30) — zero breaking changes, `buildRunTrace`/`traceFromBuffer` compile unchanged since the field is optional.

#### 6.3 DB schema deltas (server-owned; migration generated, never hand-written)

```ts
// db/schema/agents.ts — agents table, add:
projectContextPaths: jsonb('project_context_paths').$type<string[]>(),

// db/schema/skills.ts — skills table, add:
projectContextPaths: jsonb('project_context_paths').$type<string[]>(),
```
Nullable, no DB default (mirrors `skills.evidenceFiles` exactly) — DTO mapping always normalizes `row.projectContextPaths ?? []`. Generate with `./node_modules/.bin/drizzle-kit generate` (two columns added, no drops → not the interactive-rename case from `server/INSIGHTS.md` 2026-06-28's note, but worth an `expect`-driven run if it does prompt). Confirm the new `.sql` lands in `meta/_journal.json` (2026-06-20 insight). `AgentRow`/`SkillRow` (`db/rows.ts`) pick the new column up automatically via `$inferSelect` — no edit needed there.

#### 6.4 New API routes (server, in `modules/project-context/routes.ts` + extended `agents`/`skills` routes)

```
GET  /repos/:id/context                          → ProjectContextCatalog
       query: agent_id?: uuid  |  skill_id?: uuid   (mutually exclusive; governs `.attachment`)
GET  /repos/:id/context/preview?path=<repo-rel>  → ProjectContextPreview
PUT  /agents/:id   (existing route)  body += project_context_paths?: string[]
PUT  /skills/:id   (existing route)  body += project_context_paths?: string[]
```
`PUT` reuses the existing update path deliberately (not a new sub-route): `project_context_paths` is a plain jsonb column, not a join table like `agent_skills`, so it needs no dedicated link/reorder endpoint — and it is **not** added to `isConfigChange`'s field list (`agents/helpers.ts`) / the skills "body changed" check (`skills/repository.ts`), so toggling/reordering documents never bumps `agents.version`/`skills.version` or snapshots a version row (verified against both existing version-bump rules).

Preview validates `path` against a **fresh** `discoverDocuments()` call (not the client-supplied value blindly) — satisfies AC-3's escape guard and AC-4's freshness in one place.

#### 6.5 Pure helper contracts (new module, reused by run-executor — freeze signatures)

```ts
// modules/project-context/reader.ts
export interface DiscoveredDocument { path: string; category: 'specs' | 'docs' | 'insights'; }
export async function discoverDocuments(rootPath: string, rootNames: readonly string[]): Promise<DiscoveredDocument[]>;

// modules/project-context/effective-set.ts
/** direct paths first (persisted order), then each skill's paths (skill-link order),
    dedup by path — first occurrence wins position. Pure, no I/O. */
export function computeEffectiveAttachedPaths(
  directPaths: string[],
  skillPathLists: string[][],
): string[];

export function isSafeRelativePath(path: string): boolean; // rejects '..' segments / leading '/'

// modules/project-context/service.ts
export class ProjectContextService {
  getCatalog(workspaceId: string, repoId: string, opts?: { agentId?: string; skillId?: string }): Promise<ProjectContextCatalog>;
  getPreview(workspaceId: string, repoId: string, path: string): Promise<ProjectContextPreview | undefined>;
  /** Run-time resolve: reads each effective path via container.git.readFile, silently
      drops unreadable ones (AC-20). Returns specs in effective order + the paths actually read. */
  resolveForRun(repo: { owner: string; name: string }, effectivePaths: string[]): Promise<{ specs: string[]; specsRead: string[] }>;
}
```

#### 6.6 `run-executor.ts` wiring (exact placement, mirrors the existing `intentBlock` pattern at lines 128–141)

The resolve step lives **inside `runOneAgent`**, right after `linkedSkills` is fetched (existing line 226), since attach lists are per-agent, not shared pre-work like intent:
```ts
const linkedSkills = await this.agents.linkedSkills(agent.id);
const skills = linkedSkills.filter((l) => l.skill.enabled).map((l) => l.skill.body);
const effectivePaths = computeEffectiveAttachedPaths(
  agent.projectContextPaths ?? [],
  linkedSkills.filter((l) => l.skill.enabled).map((l) => l.skill.projectContextPaths ?? []),
);
const { specs, specsRead } = effectivePaths.length > 0
  ? await this.container.projectContextService.resolveForRun({ owner: repo.owner, name: repo.name }, effectivePaths)
  : { specs: [], specsRead: [] };
```
Then: `...(specs.length > 0 ? { specs } : {})` added to the `reviewPullRequest({...})` call (alongside the existing `skills`/`intent`/`repoMap` spreads), and in the persisted `trace`:
```ts
specs_read: specsRead,                                          // was []
specs_tokens: specs.length > 0 ? this.container.tokenizer.count(outcome.assembly.specs ?? '') : null,
```
`traceFromBuffer` (failure path) stays `specs_read: []` unchanged — no run completed, nothing was injected. `container.projectContextService` needs one new lazy getter on `Container` (mirrors `agentsRepo`/`reviewRepo`) — **this is the one `container.ts` edit in the plan**, single-owner (backend task), additive only.

#### 6.7 UI copy — exact frozen strings

`runs.json`:
```jsonc
"prompt": {
  // was: "specs": "Project context (dynamic)",
  "specs": "Project context — attached specs (untrusted)",   // AC-25, verbatim
  "specsTokens": "≈{count} tokens"                            // new key
}
```
`PromptBlock` gets one new optional prop `approxTokens?: number`, rendered as `t("trace.prompt.specsTokens", {count})` next to the label when present — passed only for the specs block in `TraceBody.tsx` (`approxTokens={trace.specs_tokens ?? undefined}`).

### 7. Directory ownership map (non-overlapping)

| Task | Agent surface | Owns (dirs/files) |
|---|---|---|
| **T1 — backend** | `server/` | `server/src/vendor/shared/**` (own copy only), `server/src/db/schema/agents.ts`, `server/src/db/schema/skills.ts`, `server/src/db/migrations/**` (generated), `server/src/modules/project-context/**` (new), `server/src/modules/agents/{repository,routes,service,helpers}.ts`, `server/src/modules/skills/{repository,routes,service,helpers}.ts`, `server/src/modules/reviews/run-executor.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts` (one additive getter) |
| **T2 — client** | `client/` | `client/src/vendor/shared/**` (own copy only), `client/src/vendor/ui/nav.ts`, `client/src/lib/hooks/{core,agents,skills}.ts`, `client/src/lib/types.ts`, `client/src/app/repos/[repoId]/context/**` (new), `client/src/app/agents/[id]/_components/AgentEditor/**` (Context tab), `client/src/app/skills/[id]/_components/SkillEditor/**` (Project-context section), `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/**`, `client/src/components/ContextDocumentAttachList/**` (new), `client/messages/en/{context,agents,skillEditor,runs}.json` |

No file is owned by both tasks. The only two "sequential-only" files in Hard-Rule-4's sense (`modules/index.ts`, `container.ts`) are touched exclusively by T1; `nav.ts` exclusively by T2. The two vendor/shared copies are physically distinct files per package, so T1/T2 apply the §6 frozen contract text to their own copy independently, with **zero coordination needed** (content is identical by construction, not by runtime merge).

Given only two genuinely non-overlapping ownership areas exist (server slice, client slice) — matches the developer's expected decomposition; no further split was viable (reviewer-core needs no changes).

### 8. Execution mode

**Team of parallel `implementer` agents** — as given upfront by the orchestrator (T1 backend, T2 client). Task decomposition confirms this: exactly two non-overlapping ownership areas, no mismatch with the pre-agreed mode.

### 9. Tasks

| Task | Surface | Goal | Depends on | Merge order |
|---|---|---|---|---|
| T1 | backend | Contracts, schema+migration, `project-context` module, agents/skills persistence, run-executor wiring | none | 1st (or parallel — no code dependency on T2; T2 only needs the *frozen* contract text from §6, already fixed) |
| T2 | client | Contract mirrors, Project Context page, Agent Context tab, Skill Project-context section, trace UI (AC-25), nav | none (contracts frozen in §6) | 1st (parallel with T1) |

Both tasks apply the identical §6 contracts to their own files — genuinely parallel, no blocking dependency. (End-to-end manual verification of a live run naturally needs both merged, but that's post-implementation QA, not a build-time dependency.)

**T1 — backend.** Skills to apply: `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` (new jsonb columns), `zod` (all new/extended schemas), `typescript-expert`, `security` (path-traversal guard on discovery + attach persistence, `INJECTION_GUARD`/`wrapUntrusted` reuse verification), `engineering-insights` (session end).

Sub-steps:
1. `contracts/project-context.ts` (new) + barrel export; extend `knowledge.ts` (Agent/Skill), `trace.ts` (`specs_tokens`) — server's vendor copy only.
2. `db/schema/agents.ts` + `skills.ts` columns → `drizzle-kit generate` → verify journal.
3. `modules/project-context/{constants,reader,effective-set,repository,service,routes}.ts` (+ `.test.ts` per file) — discovery walk with symlink-skip + realpath escape guard (AC-3), `MAX_DISCOVERED_FILES`/`MAX_SPEC_CHARS` caps, `getCatalog`/`getPreview`/`resolveForRun`, `used_by_count` computed via `container.agentsRepo.list` + `container.agentsRepo.linkedSkills` (reuse the existing cross-domain accessor — do **not** `new AgentsRepository(container.db)` directly, per the documented anti-pattern in `server/INSIGHTS.md` 2026-07-03).
4. Register module in `modules/index.ts`; add `container.projectContextService` getter.
5. `agents/{repository,service,routes,helpers}.ts` + `skills/{repository,service,routes,helpers}.ts`: extend Update types/DTOs with `project_context_paths`, apply `isSafeRelativePath` guard, confirm no version-bump regression (unit test: PUT with only `project_context_paths` changed → `version` unchanged).
6. `reviews/run-executor.ts`: wire per §6.6 exactly; extend existing run-executor tests + add a case covering AC-20 (unreadable attached path silently excluded) and AC-27-style (specs text present in assembled prompt, verifiable via `trace.prompt_assembly.specs`/`specs_read`).

**T2 — client.** Skills to apply: `ui-architecture`, `react-best-practices`, `next-best-practices`, `react-testing-library`, `zod` (n/a beyond reused types), `typescript-expert`, `security` (n/a — no new user-input surface beyond existing form primitives), `engineering-insights` (session end).

Sub-steps:
1. `vendor/shared/contracts/project-context.ts` (new, identical to T1's) + barrel; extend `knowledge.ts`/`trace.ts` mirrors — client's vendor copy only.
2. `lib/hooks/core.ts`: repoint `useContextFiles(repoId, {agentId?, skillId?})` → `ProjectContextCatalog` against `GET /repos/:id/context`; add `useContextPreview(repoId, path)` → `GET /repos/:id/context/preview`; **delete** `useReindexContext`. `lib/hooks/agents.ts`/`skills.ts`: add `"project_context_paths"` to `UpdateAgentInput`/`UpdateSkillInput`'s `Pick<>` (reuses existing `useUpdateAgent`/`useUpdateSkill` — no new mutation hooks needed). `lib/types.ts`: add the new re-exports.
3. `nav.ts`: add `{ key: "context", label: "Project Context", icon: "FileText", href: "/repos/:repoId/context" }` under `SKILLS LAB` (mirrors `conventions`'s placement) — `activeKeyFor` already maps `/context`, no edit needed there.
4. New shared `components/ContextDocumentAttachList/` — state machine modeled directly on `SkillsTab.tsx` (order/dragIndex/filter/checked/persist-on-toggle-drop), parameterized with an `attachable: boolean` prop so the read-only Project Context page's document list and the attach-capable Context tab/section share one component; row = drag handle (attachable only) + checkbox (attachable only) + filename + path + category badge + Preview action.
5. `app/repos/[repoId]/context/page.tsx` + `_components/PreviewPanel` (rendered markdown, filename, "Used by N agents", using `used_by_count`) + AC-7 empty state — mirrors `conventions/page.tsx` structure/padding conventions (`pageHeader`/`tableCard` padding pattern from `client/INSIGHTS.md` 2026-06-28).
6. `AgentEditor`: add `"context"` to `TABS`, new `_components/ContextTab/` (repo picker + `ContextDocumentAttachList` + AC-12 header count + AC-13 footer token total, sourced from `.attachment`).
7. `SkillEditor/_components/ConfigTab/ConfigTab.tsx`: render new `_components/ProjectContextSection` below the body field (AC-14/15/16 — repo picker + attach list + "serializes as" preview derived from `skill.project_context_paths`).
8. `RunTraceDrawer`: `PromptBlock.tsx` add `approxTokens?: number`; `TraceBody.tsx` pass `trace.specs_tokens` for the specs block only.
9. `messages/en/context.json` (repurpose — drop `chunks`/`reindex`/`indexing`/`resync`/`resyncing`/`indexStatus`/`mode.edit`/`editor.*`; keep/reword `title`/`empty.*`), `agents.json` (Context tab), `skillEditor.json` (section), `runs.json` (per §6.7).

### 10. Test commands per scope

**T1 (backend)** — from `server/`:
```
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/vitest run "project-context"
./node_modules/.bin/vitest run "run-executor"
./node_modules/.bin/vitest run "agents"
./node_modules/.bin/vitest run "skills"
```
(`pnpm typecheck`/`pnpm test` are broken in this env — `ERR_PNPM_IGNORED_BUILDS`, per `server/INSIGHTS.md` 2026-06-20 — use the local binaries above.)

**T2 (client)** — from `client/`:
```
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run "ContextTab"
./node_modules/.bin/vitest run "ProjectContextSection"
./node_modules/.bin/vitest run "ContextDocumentAttachList"
./node_modules/.bin/vitest run "PromptBlock"
./node_modules/.bin/vitest run "context/page"
```

### 11. Relevant engineering insights

- `server/INSIGHTS.md` 2026-06-28 — read repo files via `container.git.readFile({owner,name}, path)`, never `fs` in a service; `MockGitClient.readFile` returns `''` not throw for unknown paths in tests (mind this when unit-testing AC-20's "unreadable → excluded" path — the real `SimpleGitClient` throws on ENOENT, so tests should seed a `MockGitClient` explicitly or assert against the try/catch behavior directly).
- `server/INSIGHTS.md` 2026-06-30 — "silently drop empty/unknown paths" is the established precedent (intent module) that AC-20 continues.
- `server/INSIGHTS.md` 2026-07-03 — use `container.agentsRepo`/`container.reviewRepo` accessors for cross-domain reads, not `new XRepository(container.db)` — applies directly to `used_by_count`.
- `server/INSIGHTS.md` 2026-06-30/2026-07-06 — non-ASCII characters (`—`, `≈`, `…`) near existing text risk `Edit`-tool corruption; use a byte-safe replace for `runs.json`'s frozen `"Project context — attached specs (untrusted)"` string.
- `client/INSIGHTS.md` 2026-06-27 — Agents/Skills are two-pane master-detail; reuse `AgentsRail`/`SkillsRail`, don't rebuild.
- `client/INSIGHTS.md` 2026-06-28 — page content needs explicit `padding: "24px 32px 10px"` (header) / `"0 32px 44px"` (body) — `AppFrame` has none; `nav.ts` **must be hand-edited** for new sidebar items (it's project config, not vendor).
- `client/INSIGHTS.md` 2026-06-30/2026-07-06 — mock TanStack Query hooks with `as unknown as ReturnType<typeof useX>`; frozen UI copy with typographic chars must land verbatim and match the RTL test literal exactly.
- `reviewer-core/INSIGHTS.md` 2026-06-30 — the exact recipe for adding a new optional `PromptParts`/`PromptAssembly` slot is backward-compatible by construction; applies to `specs_tokens` on `RunTrace` too (same pattern, one layer up).

### 12. Architecture diagram

```mermaid
flowchart TB
  subgraph Client [T2 client]
    CTXPAGE["/repos/:repoId/context page"]
    CTXTAB["Agent Editor · Context tab"]
    SKILLSEC["Skill Editor · Project-context section"]
    ATTACHLIST["ContextDocumentAttachList (shared)"]
    TRACEUI["RunTraceDrawer · PromptBlock"]
    CTXPAGE --> ATTACHLIST
    CTXTAB --> ATTACHLIST
    SKILLSEC --> ATTACHLIST
  end

  subgraph Server [T1 backend]
    ROUTE["GET /repos/:id/context (+preview)"]
    PUTA["PUT /agents/:id"]
    PUTS["PUT /skills/:id"]
    SVC["ProjectContextService"]
    READER["reader.ts — fs walk under clonePathFor(repo)"]
    EFFSET["effective-set.ts — dedup"]
    DB[("agents.project_context_paths\nskills.project_context_paths")]
    RUNEXEC["run-executor.ts"]
    RC["reviewer-core: assemblePrompt\n(## Project context, wrapUntrusted, INJECTION_GUARD)"]
    TRACE[("run_traces.specs_read / .prompt_assembly.specs / .specs_tokens")]
  end

  ATTACHLIST -->|browse| ROUTE
  ATTACHLIST -->|toggle/reorder| PUTA
  ATTACHLIST -->|toggle/reorder| PUTS
  ROUTE --> SVC --> READER
  PUTA --> DB
  PUTS --> DB
  RUNEXEC -->|agent.project_context_paths + linked skills'| EFFSET
  EFFSET -->|effective paths| SVC
  SVC -->|container.git.readFile per path| RUNEXEC
  RUNEXEC -->|specs: string[]| RC
  RC -->|assembly.specs| RUNEXEC
  RUNEXEC --> TRACE
  TRACE --> TRACEUI
```

### 13. Risks & integration concerns

- **Filesystem walk on the server** for discovery has no existing unit-test precedent using a real temp clone (`fs.mkdtemp`) — T1 must build this test scaffolding fresh (standard Node/vitest technique, just not yet used in this codebase for a comparable walk).
- **`resolveForRun`'s per-file `container.git.readFile` calls are sequential** in the naive implementation; for a large effective set this could add run latency. Acceptable for this lesson's scope (manual attach implies a small, curated set) — flag as a candidate for `Promise.all` if profiling later shows it matters (not frozen as a requirement here).
- **T1/T2 parallel edits to their own vendor/shared copy carry a soft drift risk** if either implementer deviates from the frozen §6 text — both must copy the schema blocks verbatim, not "re-derive similar" ones (already-observed drift between the two vendor copies for unrelated past features, per `diff` verified during planning — don't compound it).
- **`context.json`'s copy repurposing** touches previously-shipped (if orphaned) translation keys — low risk since nothing consumes them today (verified via grep), but flag to `architecture-reviewer`/`plan-verifier` that this is an intentional repurpose, not an accidental copy regression.

### 14. Open questions

— none — (both material gaps were resolved with the developer in Q1/Q2 before this plan was written; all other decisions are planner-owned per the spec's explicit deferrals in Edge cases / Assumptions).
