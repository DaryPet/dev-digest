# TODO: Real cancellation via AbortSignal propagation

## Problem

`cancelRun` (`server/src/modules/reviews/service.ts:85-90`) marks the
`agent_runs` row `cancelled` and completes the run bus immediately, but the
in-flight LLM HTTP request is never actually aborted:

- `checkCancelled()` (`reviewer-core/src/review/run.ts:170`) is only checked
  between per-file chunks in the map-reduce loop.
- The default review strategy is `single-pass`
  (`server/src/modules/reviews/constants.ts:12`), which produces exactly ONE
  chunk — so once `input.llm.completeStructured(...)` has started, there is
  no checkpoint left to stop it.
- The orphaned request keeps running in the background (observed: up to ~36
  minutes, likely worsened by laptop sleep suspending the TCP connection)
  until it resolves or errors on its own (e.g. `ECONNRESET`).

A narrower fix (tracked separately, already applied) stops the orphaned
call's eventual failure from **overwriting** an already-`cancelled` row with
`failed`. It does NOT stop the wasted request itself — tokens/cost/time are
still burned, and (if the orphaned call actually succeeds after cancel) a
review could still get persisted for a run the user cancelled. This TODO is
the full fix: actually abort the network request.

## Scope

Cross-package (`server` + `reviewer-core`), touches the `LLMProvider`
contract → classify as **M/L**, needs an Implementation Plan
(`plans/<slug>.md`) via the `implementation-planner` agent before implementation, run
through the full `dev-workflow` gate batch (researcher likely "no" — no
unfamiliar tech, just needs OpenAI SDK's existing `signal` support in
`.create()` options — implementation-planner "yes", architecture review "yes" since it
touches a shared contract consumed by two packages).

## Sketch (for the implementation-planner to validate/refine, not a final design)

1. **`server/src/platform/sse.ts` (`RunBus`)** — hold an `AbortController`
   per `runId` (new `Map<string, AbortController>`), exposed via e.g.
   `registerAbort(runId, controller)` / keep `cancel(runId)` setting the
   existing flag AND calling `controller.abort()` if registered. Clean up
   the map entry in `complete(runId)`.

2. **`server/src/modules/reviews/run-executor.ts` (`runOneAgent`)** —
   create an `AbortController` at the start of the run, register it with
   `runBus` before calling `reviewPullRequest`, pass `controller.signal`
   through.

3. **`reviewer-core/src/review/run.ts` (`ReviewInput`)** — add an optional
   `signal?: AbortSignal` alongside `checkCancelled`. Forward it into every
   `input.llm.completeStructured(...)` call. Package stays "pure" — Web API,
   not a new side-effect port.

4. **`reviewer-core/src/llm/openrouter.ts`
   (`OpenRouterProvider.completeStructured`)** — accept the signal and pass
   `{ signal }` as the OpenAI SDK's second arg to
   `this.client.chat.completions.create(body, { signal })` (SDK supports
   this natively; also aborts the SDK's own internal retries).

5. **`@devdigest/shared` contract** (`server/src/vendor/shared` —
   do-not-touch, needs coordination) — `StructuredRequest` likely needs the
   optional `signal` field, OR keep it a plain extra param outside the
   Zod-validated shape (avoid a `.nullish()` schema field for something
   that's never persisted/traced — check with whoever owns the vendored
   package before touching it).

6. **`server/src/modules/reviews/service.ts` (`cancelRun`)** — no change
   needed if step 1's `cancel()` already triggers the abort internally.

7. **Error handling** — an aborted `fetch` rejects with an `AbortError`
   (or the OpenAI SDK's own abort-flavored error); `runOneAgent`'s catch
   block must recognize it (in addition to `RunCancelledError` and the
   `runBus.isCancelled(runId)` check already in place) and persist status
   `cancelled`, not `failed`.

8. **Tests** — `reviewer-core` unit test: an `AbortSignal` fired mid-call
   surfaces as a cancellation, not a schema/validation failure. `server`
   integration test: `cancelRun` while a `single-pass` review is in flight
   actually stops the mock LLM call (via a controllable mock that observes
   `signal.aborted`).

## Out of scope for this TODO

- Map-reduce mid-chunk cancellation already works today (checkpoint between
  chunks) — no change needed there.
- Retry/backoff behavior on genuine network errors (unrelated to
  cancellation) — not touched by this TODO.
