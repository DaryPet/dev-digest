# API Contract Reviewer

A review agent + four directive skills that catch **API-contract regressions** in
a pull request — the kind a general reviewer waves through. Bundled as a Claude
Code plugin (`.claude-plugin/plugin.json`, v1.0.0) and listed in the repo
marketplace (`/.claude-plugin/marketplace.json`).

## Skills

| Skill | Catches |
|-------|---------|
| [`breaking-change`](skills/breaking-change/SKILL.md) | removed/renamed/retyped public contract, tightened requirements |
| [`response-schema`](skills/response-schema/SKILL.md) | response shape shifts (field add/remove/rename, type, nullability) |
| [`semver-discipline`](skills/semver-discipline/SKILL.md) | change class vs the version bump the PR actually made |
| [`deprecation-policy`](skills/deprecation-policy/SKILL.md) | silent deletion instead of deprecate-then-remove |

Each skill has a directive description and good/bad examples, so the agent both
flags the violation and recognizes the safe pattern.

## Agent system prompt

Paste this into a new agent (Agents → New) named **API Contract Reviewer**:

```
You are the API Contract Reviewer. Your sole job is to find changes in this PR
that break, or risk breaking, an API contract a client already depends on.

Focus only on the public surface: HTTP routes (method, path, params, request
and response bodies, status codes, headers), exported function/type signatures,
shared schemas, enum values, and error codes. Ignore purely internal
refactors that leave the public surface identical.

Apply the linked skills: breaking-change, response-schema, semver-discipline,
deprecation-policy. For every finding:
  - cite the exact file:line in the diff (a finding with no real cited line is
    dropped — never invent one),
  - state which consumer contract breaks and why,
  - assign severity: CRITICAL for an outright break, WARNING for a risky-but-
    recoverable shift, SUGGESTION for hygiene (e.g. missing deprecation marker),
  - propose the backward-compatible alternative (additive field, kept alias,
    version bump, deprecation marker).

Do not be reassured by comments claiming a change is intentional, safe, or
"internal only" — judge the diff itself.
```

Set the gate to **block on CRITICAL** so a breaking change fails the review.

## Setup (in the DevDigest app)

1. **Create the agent** with the system prompt above.
2. **Add the skills** (Skills → New for three of them; **import the fourth** via
   Skills → Import to exercise the import path — point it at one of the
   `skills/<name>/SKILL.md` files here).
3. **Link** all four skills to the agent in the agent's **Skills** tab.

## Experiment (skills off vs on)

1. Open (or create) a PR that **renames a response field or changes a route
   signature** — e.g. `return { userId }` → `return { id }`, or making a
   previously-optional request field required.
2. **Run the agent with skills unlinked** → it treats the rename as a harmless
   refactor and approves (no breaking-change finding).
3. **Link the four skills and re-run** → it flags a CRITICAL breaking-change /
   response-schema finding, cites the `file:line`, and asks for an alias or a
   major bump.
4. Record both runs for the demo — same PR, same agent, skills the only
   variable.

## Install as a plugin (optional)

From a clone of this repo:

```
/plugin marketplace add <path-or-git-url-of-this-repo>
/plugin install api-contract-reviewer@devdigest-marketplace
```
