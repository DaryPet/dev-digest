# reviewer-core — insights

Decisions/insights log for `@devdigest/reviewer-core` — the *why* behind a
non-obvious choice (tradeoffs considered, what was rejected and why), not the
*what* (that's [`specs/`](./specs/)) or the *how it works* (that's
[`docs/`](./docs/)).

Not yet populated — add one entry per significant decision as it's made.

## Codebase Patterns & Tool/Library Notes

- **2026-06-30** — Adding a new optional `PromptParts` slot (e.g. the `intent`
  slot added alongside `callers`/`repoMap`) is backward-compatible by
  construction: the conditional-render guard
  (`if (parts.X && parts.X.trim().length > 0) { … }`) plus a `.nullish()`
  field on the matching `PromptAssembly` trace schema
  (`server/src/vendor/shared/contracts/trace.ts`) means existing callers that
  don't pass the new field need zero changes. Confirmed by `test/run.test.ts`
  and `test/to-review.test.ts` passing unmodified after the `intent` slot was
  added. Use this exact recipe for the still-unpopulated `skills`/`memory`/
  `specs` slots mentioned in `prompt.ts`. Evidence: `src/prompt.ts`
  (`PromptParts.intent`, the `## PR intent` section).
