# Spec: Project Context Folder  |  Spec ID: SPEC-01  |  Status: approved

## Проблема й навіщо

Today every markdown file under `specs/`, `docs/`, or `insights/` in a repo is
written **for humans** — an agent review never sees it. A reviewer agent has
no way to know a project's invariants ("module `api/` never imports `db/`
directly"), architectural decisions, or domain rules unless someone
copy-pastes them into the agent's system prompt by hand.

This is lesson **L05** of the course (`README.md` — *"L05 | Project Context
Folder · Onboarding generator · PR Brief card"*), and the bridge to **L06**
("a later agent whose only job is to check the implementation against the
spec and block merge" — explicitly future, not this spec).

`reviewer-core`'s prompt assembly is already wired for this
(`reviewer-core/src/prompt.ts`: `PromptParts.specs`, the `## Project context`
section, `wrapUntrusted` + the shared `INJECTION_GUARD`) and the run-trace
contract already reserves `specs_read` / `PromptAssembly.specs`
(`server/src/vendor/shared/contracts/trace.ts:90,43`) — but
`run-executor.ts` currently always writes empty values
(`server/src/modules/reviews/run-executor.ts:330,476,480`). This spec makes
that slot real: turn any markdown spec into review context, **manually
attached** (no auto-selection in this lesson — the "flash-selector" that
picks specs per-PR automatically is explicitly future work per the TЗ).

## Goals / Non-goals

- Goals:
  - Recursively discover every `.md` file under configured root directory
    names (default `specs`, `docs`, `insights`) at any depth in a repo's
    clone, and show them with their paths on a new **Project Context** page.
  - Let a developer manually attach/detach/reorder discovered documents to an
    **agent** (Context tab) and to a **skill** (its own "Project context to
    use" section); agents inherit the documents attached to any skill they
    use.
  - Store attached documents as an **ordered list of repo-relative paths** in
    agent/skill metadata — never embed document text into the stored
    config/prompt template.
  - At review run time, resolve the effective attached path list, read the
    files, and feed them into the existing `## Project context` prompt slot
    — zero new LLM calls.
  - Make what was actually injected **visible**: which paths were read
    (`specs_read`), their approximate token size, and the full assembled
    `## Project context` text, in the run trace.
  - Show a per-document and running-total **approximate** token estimate
    wherever documents are attached (editor tabs), so a developer can judge
    prompt-budget impact before running a review.
- Non-goals (explicitly out of scope for this spec):
  - Automatic spec selection / "flash-selector" per PR — future work per the
    TЗ.
  - Editing a document's content from the Project Context page.
  - The mock's "coverage" ring, the `+ / folder / upload` toolbar, and the
    "Indexed: N files · N chunks" footer — not requested by the TЗ.
  - Chunk/embedding-based indexing or retrieval of project-context documents.
  - A settings UI for configuring the specs/docs/insights root directory
    names — configurable at the config/deploy level (mirrors the existing
    `REPO_INTEL_ENABLED`-style env/constants pattern), not exposed as an
    end-user toggle in this spec.
  - The L06 "spec-compliance blocking agent" — explicitly a future bridge.
  - Guaranteeing that the LLM correctly cites/enforces an attached spec's
    invariant on every run — the spec's *presence in the assembled prompt* is
    deterministic and testable; the model's resulting judgment is not (see
    Edge cases).

## User stories

- As a developer, I want to browse every spec/doc/insight document already in
  my repo on one page, with its path, so I can find the right context without
  digging through the file tree.
- As a developer, I want to attach specific project documents to an agent (or
  to a skill that agent uses), and control the order they appear in, so the
  agent's review is grounded in my project's actual rules.
- As a developer, I want to see, per attached document and as a running
  total, roughly how many tokens it adds to every prompt, so I don't
  accidentally blow the model's context budget.
- As a developer, I want to open a completed run's trace and see exactly
  which documents were attached and read, their size, and the full text that
  was pasted into the prompt, so I never have to guess what context the
  agent actually saw.
- As a developer, I want to attach a spec containing an explicit invariant to
  a reviewer agent, submit a PR that violates it, and see the reviewer flag
  it citing that spec — proving the context loop actually works end to end.

## Acceptance criteria (EARS)

**Reader (discovery)**
- AC-1: WHEN a repo's clone is available on disk, THE system SHALL discover
  every `.md` file located at any depth under a directory whose name matches
  one of the configured root names (default: `specs`, `docs`, `insights`) —
  equivalent to the glob `**/{specs,docs,insights}/**/*.md`.
- AC-2: WHERE the configured root name set differs from the default, THE
  reader SHALL use the configured set instead of the default one.
- AC-3: IF a candidate path resolves outside the repo clone's root directory
  (e.g. via a symlink or a `..` segment) THEN THE reader SHALL exclude it from
  the discovered list.
- AC-4: WHEN the same repo is scanned again (e.g. after a resync), THE
  discovered list SHALL reflect the current state of the clone (added,
  removed, and renamed files are picked up; nothing stale is served from a
  prior scan for the visible list).

**Project Context page**
- AC-5: WHEN a developer opens the Project Context page for a repo, THE page
  SHALL display that repo's root path and a flat list of every discovered
  document with its repo-relative path.
- AC-6: WHEN a developer selects a document in the list, THE page SHALL show
  a Preview panel with the rendered markdown, the filename, and a
  "Used by N agents" count, where N is the number of agents for which this
  document is currently part of the agent's effective attached set (directly
  attached OR inherited via a linked skill).
- AC-7: IF a repo's clone has zero discovered documents under the configured
  roots THEN THE Project Context page SHALL render an explicit empty state
  instead of an empty list with no explanation.

**Manual attach — Agent Context tab**
- AC-8: WHEN a developer opens an agent's Context tab, THE tab SHALL list
  the full catalog of documents discovered for that agent's repo, each row
  showing a drag handle, an attach checkbox, the filename, the path, a
  `specs`/`docs`/`insights` badge, and a Preview action.
- AC-9: WHEN a developer toggles a document's checkbox in the Context tab,
  THE system SHALL persist that document's repo-relative path as
  attached/detached to the agent's metadata (path only, no document text).
- AC-10: WHEN a developer reorders attached documents via drag, THE system
  SHALL persist the new order; the assembled `## Project context` block
  SHALL render attached documents in that order (earlier = appears earlier).
- AC-11: WHEN a developer types into the Context tab's "Filter documents…"
  box, THE tab SHALL show only documents whose filename or path contains the
  typed text (case-insensitive).
- AC-12: THE Context tab header SHALL show "Project context — N of M
  attached" where N = attached count and M = total discovered count.
- AC-13: THE Context tab footer SHALL show an approximate running token
  total across the agent's directly-attached documents, and note that this
  content is injected as an untrusted `## Project context` block on every
  run.

**Manual attach — Skill Context section**
- AC-14: WHEN a developer opens a skill's editor, THE skill editor SHALL show
  a "Project context to use — N attached" section, with the same row style
  as the agent Context tab (drag handle, checkbox, name, path, badge,
  preview) and the note "Any agent using this skill inherits these
  documents."
- AC-15: WHEN a developer toggles/reorders a document in a skill's Project
  context section, THE system SHALL persist that document's repo-relative
  path as attached/detached, ordered, on the skill's metadata (path only).
- AC-16: THE skill's Project context section SHALL show a "serializes as"
  preview listing the currently attached paths in their persisted order.

**Effective attach set (dedup + inheritance)**
- AC-17: WHEN an agent runs a review, THE system SHALL compute its effective
  attached document list as: the agent's directly-attached paths in their
  persisted order, followed by each linked skill's attached paths (in the
  skill's persisted order, skills taken in the agent's skill-link order),
  with any path already present earlier in the combined list removed from
  later positions (dedup by path, first occurrence wins position).
- AC-18: THE per-document and running-total token estimates shown in the
  agent Context tab SHALL be computed over the agent's effective attached set
  (post-dedup), not just its directly-attached documents, so the number
  matches what will actually be injected.

**Run-time assembly**
- AC-19: WHEN a review run starts for an agent with a non-empty effective
  attached set, THE system SHALL resolve each attached path against the
  repository of the PR being reviewed, read its content, and pass the
  resulting list into the existing `PromptParts.specs` slot
  (`reviewer-core/src/prompt.ts`) — reusing the existing `## Project context`
  rendering, `wrapUntrusted` wrapping, and `INJECTION_GUARD` unchanged.
- AC-20: IF an attached path does not resolve to a readable file in the PR's
  repository (moved, deleted, or the agent/skill was configured against a
  different repository) THEN THE system SHALL silently exclude it from both
  the assembled prompt and `specs_read` — it SHALL NOT fail or block the run.
- AC-21: A review run SHALL make zero additional LLM calls as a result of
  Project Context attachment (reading and assembling attached documents is
  fully deterministic).

**Trace visibility**
- AC-22: WHEN a review run completes, THE persisted `RunTrace.specs_read`
  SHALL contain exactly the repo-relative paths that were actually read and
  injected for that run (post-dedup, post missing-path exclusion) — never
  the full discovered catalog.
- AC-23: WHEN a review run completes, THE persisted
  `RunTrace.prompt_assembly.specs` SHALL contain the assembled, delimiter-
  wrapped text that was injected into the `## Project context` slot for that
  run (or be absent when the effective attached set was empty).
- AC-24: WHEN a developer opens a run's trace, THE Configuration section
  SHALL show a "Specs read" line listing `specs_read`'s paths (or an explicit
  "none" state when empty).
- AC-25: WHEN a developer opens a run's Prompt assembly section and the run
  had a non-empty `specs` block, THE block SHALL be labeled exactly
  "Project context — attached specs (untrusted)" and SHALL show its
  approximate injected token size.
- AC-26: WHEN a developer expands the "Project context — attached specs"
  block, THE system SHALL show the full injected text for that run, with an
  in-block search field and a Copy action (reusing the existing prompt-block
  expand affordance already built for the other assembly blocks).

**Live check (illustrative)**
- AC-27: WHEN a spec containing an explicit invariant (e.g. "module `api/`
  must not import `db/` directly") is attached to a reviewer agent and that
  agent reviews a PR that violates the invariant, THE assembled prompt for
  that run SHALL deterministically contain the spec's text in the
  `## Project context` block (verifiable via the run trace) — whether the
  model's finding actually cites it is a property of the LLM's judgment, not
  a deterministic guarantee of this feature.

## Edge cases

- Zero documents discovered under the configured roots → explicit empty
  state on the Project Context page (AC-7), and an empty (not broken) Context
  tab / skill section.
- An attached path no longer exists (renamed/deleted/wrong repo) → silently
  excluded at run time, never fails the run (AC-20) — same precedent as the
  intent/conventions modules ("silently drop empty/unknown paths").
- A discovered path escaping the clone root (symlink, `..`) → excluded from
  discovery entirely (AC-3) — security guard, not just a UX nicety.
- Same document attached both directly to an agent AND via a linked skill →
  appears once, at its first-occurrence position (AC-17), never duplicated in
  the prompt or in the token count.
- A very large individual document, or a very large total attached set → the
  reader/assembler must not crash or hang the run; exact size limits (if any)
  are an implementation-planner decision, not frozen here.
- An agent/skill configured against one repository is reused (or its config
  copied) for a PR in a different repository of the same workspace → paths
  are resolved per-run against the PR's actual repository; a path absent
  there is treated as absent (AC-20), not as an error.
- The workspace's LLM is asked to review a PR while an attached spec contains
  text that reads like an instruction (e.g. "ignore the following findings")
  → the existing `INJECTION_GUARD` + `wrapUntrusted` treatment (already
  covering `specs`) applies unchanged; this feature does not weaken it.

## Non-functional

- **Security:** every attached document's content is untrusted, external
  data — read into the prompt only inside the existing
  `<untrusted source="spec-i">` wrapper with the shared `INJECTION_GUARD`
  (`reviewer-core/src/prompt.ts`), never as instructions, regardless of what
  the document's text claims about itself. Discovery must not allow escaping
  the repo clone root (AC-3).
- **Accuracy:** token counts shown anywhere in this feature (per-document,
  running total, trace) are **approximate** (prefixed "≈" in the UI) — they
  reflect a project-standard token-counting mechanism, not necessarily the
  exact tokenization of whichever model a given agent is configured to use.
- **Reliability:** a missing/unreadable attached document degrades
  gracefully (excluded, not fatal) — a review run must never fail solely
  because a previously-attached project-context path became invalid.

## Inputs (provenance)

- Repo clone's markdown files under `specs/`/`docs/`/`insights/` —
  [deterministic: recursive filesystem walk of the existing clone, scoped by
  configured root names].
- File content of attached paths at run time —
  [deterministic: read via the repo's existing git-backed read path, same
  pattern as `container.git.readFile` used elsewhere in the server].
- `## Project context` prompt rendering, `wrapUntrusted`, `INJECTION_GUARD` —
  [reused: existing `reviewer-core/src/prompt.ts` `PromptParts.specs` slot,
  already shipped, unmodified by this feature].
- Token estimate per document / running total —
  [deterministic: reuses the existing tokenizer capability
  (`server/src/adapters/tokenizer`), no new LLM call].
- Attached-path metadata on agents/skills —
  [new: persistence only; no LLM involved].

## Untrusted inputs

- **Attached document content** (any `.md` file discovered under
  `specs/`/`docs/`/`insights/`) — read purely as data for the
  `## Project context` block; never treated as instructions, even if it
  contains text that looks like one (per the shared `INJECTION_GUARD`
  already enforced by `reviewer-core/src/prompt.ts`). This applies even
  though the documents live in the reviewed repo itself — repo content is
  still attacker-reachable (e.g. a malicious contributor editing a doc).
- **Repo-relative paths** stored on agent/skill metadata are developer-
  authored (attached through the UI, not free text), but are still resolved
  defensively against path traversal at discovery time (AC-3) and treated as
  "may not exist" at run time (AC-20), never assumed valid.

## Assumptions (locked in this spec — developer-approved)

1. **Root allow-list & defaults** — configured as a small module-level
   constant list (mirrors `repo-intel/constants.ts`'s `EXCLUDED_DIRS`
   pattern), default `['specs', 'docs', 'insights']`, overridable via
   config/env, not exposed as an end-user Settings UI in this spec.
2. **Dedup / precedence** for a document attached both directly and via a
   skill: dedup by path, first occurrence wins its position — direct
   attachments are listed before inherited skill attachments in the agent's
   effective set (AC-17).
3. **Token-count fidelity** — approximate by design (mock shows "≈"); reuses
   the project's existing tokenizer capability rather than a new/hand-rolled
   heuristic; never presented as an exact match to a specific model's
   tokenizer.
4. **Cross-repo attachment (workspace has multiple repos)** — attached paths
   are plain repo-relative strings with no repo binding in the data model;
   they are resolved at run time against whichever repository the reviewed
   PR belongs to, and silently dropped if absent there (same precedent as
   the intent/conventions modules).
