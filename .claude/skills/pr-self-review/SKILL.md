---
name: pr-self-review
description: "Second-pass self-review of the uncommitted diff before it reaches GitHub. Run before declaring work done, before git push, and before opening or merging a pull request. Snapshots the working-tree diff, routes each changed surface to the skills that govern it (client → ui-architecture + react-best-practices + react-testing-library + next-best-practices; server/reviewer-core → onion-architecture + fastify-best-practices + drizzle-orm-patterns; plus zod / postgresql-table-design / security / typescript-expert as touched), collects findings, and gates: any critical finding ⇒ BLOCKED, do not open the PR. On a clean pass it writes the gate marker the PreToolUse hook checks. Trigger terms: before push, before opening PR, pr self review, pre-merge check, ready to merge, готово, review my diff."
metadata:
  tags: pr-self-review, workflow, dispatcher, pre-merge, gate, diff-review, routing, ui-architecture, onion-architecture
---

# PR Self-Review (DevDigest)

A **dispatcher**, not a knowledge base. It carries no architecture or framework
rules of its own — it snapshots the uncommitted diff and routes each changed
surface to the skills that already own those rules, then gates the result. If
you find yourself writing layering/naming/testing rules *into* this file, stop:
they belong in the surface skill (`ui-architecture`, `onion-architecture`, …).

Goal: catch problems **locally, before they reach GitHub** — "перевірити зміни
локально перед відкриттям pull request". A single `critical` finding blocks the
push / PR until it is fixed.

## When to run

- Before declaring work "done" / "готово".
- Before `git push`, `gh pr create`, or `gh pr merge`.

The PreToolUse hook (see `.claude/settings.json`) enforces this: a push or PR
command is **denied** until this skill has run cleanly against the *current*
diff. Running the skill is the only way to clear the gate.

## Workflow

Copy this checklist and work through it:

```
- [ ] A. Snapshot the uncommitted diff
- [ ] B. Classify changed files into surfaces
- [ ] C. Run each routed skill as a checklist over its files
- [ ] D. Classify findings by severity
- [ ] E. Gate: any critical ⇒ BLOCKED; else write PASS marker
- [ ] F. Report
```

### A. Snapshot the uncommitted diff

```bash
git status --porcelain                       # all changes: staged, unstaged, untracked
git diff HEAD                                 # tracked changes (staged + unstaged)
git ls-files --others --exclude-standard      # untracked files (new files to review too)
```

Review the **whole working tree** — staged, unstaged, **and untracked** files —
not just `git diff` (which misses untracked and staged files) and not the last
commit. These are the local changes that would go up in the PR. If
`git status --porcelain` is empty, there is nothing to review: report "no
changes" and stop.

### B. Classify changed files into surfaces

Map each changed path to its surface and union the skills to run. The surfaces
are the four DevDigest packages already fixed in `AGENTS.md` — do not invent new
ones.

| Changed surface (paths) | Skills to run |
|---|---|
| Frontend — `client/**` | `ui-architecture` + `react-best-practices` + `react-testing-library` + `next-best-practices` |
| Backend — `server/**`, `reviewer-core/**` | `onion-architecture` + `fastify-best-practices` + `drizzle-orm-patterns` |
| DB schema — `server/src/db/**`, `*.sql`, migrations | `+ postgresql-table-design` |
| Contracts / validation — `*.zod.ts`, `server/src/vendor/shared/**` | `+ zod` |
| Any TS / security-sensitive change | `typescript-expert`, `security` — as relevant |
| e2e — `e2e/**` | `react-testing-library` (+ check `e2e/AGENTS.md`) |

A diff that touches both client and server runs both rows' skills.

### C. Run each routed skill as a checklist

For every routed skill, read it and check the changed files in that surface
against its rules. Collect concrete findings: `file:line` · what rule · what to
do. Do not re-derive the rules here — defer to the skill.

### D. Classify findings by severity

- **critical** (blocks):
  - Onion dependency-rule violation — an adapter/infrastructure call reached
    straight into a route, or a dependency points outward (`onion-architecture`).
  - Secret leak or a vulnerability flagged by `security`.
  - Broken public contract — a `zod` / `@devdigest/shared` schema change that
    breaks an existing consumer.
  - New logic shipped without its required test (`react-testing-library` /
    `TESTING.md`).
- **warning** (non-blocking): everything else — naming, structure, style,
  nice-to-have refactors.

### E. Gate

- **Any critical** → verdict **BLOCKED**. Do **not** write the pass marker. Do
  not open the PR / push until every critical is fixed (re-run this skill after
  fixing).
- **No critical** → verdict **PASS**. Write the gate marker so the hook lets the
  push / PR through:

  ```bash
  printf 'PASS\n%s\n' "$(bash scripts/pr-self-review-snapshot.sh)" > .claude/.pr-self-review-pass
  ```

  The marker stores the verdict plus a hash of the whole working tree that
  passed — `scripts/pr-self-review-snapshot.sh` covers tracked changes (staged
  **and** unstaged) **and** untracked files, so new files count too. The gate
  hook recomputes the same hash; if the code changes after PASS the hash no
  longer matches and the hook blocks again, so PASS always refers to exactly
  what is being pushed.

### F. Report

Print a short report:

- Surfaces touched and which skills were run.
- Findings table: `file:line` · severity · rule · fix.
- Verdict: **PASS** or **BLOCKED**. On BLOCKED, state plainly that the PR must
  not be opened until the listed criticals are resolved.

## Notes

- This skill never commits, pushes, or opens a PR — it only reviews and gates.
- The marker `.claude/.pr-self-review-pass` is intentionally tracked (not
  gitignored): in this teaching repo it is useful evidence that the gate ran.
