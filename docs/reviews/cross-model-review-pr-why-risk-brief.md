# Cross-model review — ../plans/pr-why-risk-brief.md

**Reviewer model:** google/gemini-2.5-pro (via OpenRouter) — independent family from the Claude-based
pipeline (spec-creator / implementation-planner / implementer / architecture-reviewer /
plan-verifier) that produced this plan. Given the plan cold, with no other chat context.

**Tokens:** 7710 in / 4441 out · **Cost:** $0.0540

## Summary
The implementation plan is exceptionally detailed, well-researched, and demonstrates a strong understanding of the existing architecture and its precedents. It correctly identifies and mitigates several potential issues, such as fixing an existing feature-model bug and acknowledging duplicated logic. However, the review identified a few gaps primarily related to error handling and contract ambiguity that could impact robustness and observability.

## Findings
- **[blocker]** The `getBrief` repository method's error handling for parse failures is dangerous. The plan specifies that `Brief.safeParse` failure should return `undefined`, treating it as a cache miss. This is a silent failure. If a schema change makes existing cached data invalid, this will cause every subsequent request for those PRs to trigger a full, expensive LLM re-computation. This should be logged as a high-severity error to make these failures visible and prevent unexpected cost and latency spikes.
- **[concern]** The `BriefService` logic for gathering 'Project Context' (step 3) does not specify error handling for downstream service calls like `agentsRepo.getById` or `projectContextService.resolveForRun`. If these calls fail, it could result in an unhandled exception and a 500 error for the user. The service should gracefully degrade in this scenario, logging the internal error and proceeding as if no project context was available.
- **[concern]** The contract for `BriefRisk.file_refs` is ambiguous. It's a simple `z.array(z.string())` intended to hold file paths, API endpoints, and cron strings. The grounding logic checks these generic strings against separate, typed sets (`knownFiles`, `knownEndpointsOrCrons`). This creates ambiguity (e.g., is '/api/users' a file or an endpoint?) and relies on the LLM and grounding logic correctly interpreting untyped strings. The contract should be more explicit, for example by having the LLM prefix references (e.g., 'FILE:/path/to/file.ts', 'ENDPOINT:GET /api/users') and having the grounding logic parse these prefixes.
- **[nit]** The `Brief` schema defines `what` and `why` as unbounded strings. While the plan mentions capping inputs to the LLM, it doesn't specify any constraints on the length of these output fields. An unexpectedly verbose LLM response could break UI layouts. The prompt should include instructions for brevity (e.g., 'in 1-2 sentences'), or the service should enforce a reasonable character limit before caching.
- **[nit]** The `BriefReviewFocusItem` schema defines `line` as `z.number().int()`. Since file line numbers are always positive, using `z.number().int().positive()` would make the contract more precise and provide slightly stronger validation.
- **[nit]** The plan correctly identifies that `risks[]` is computed but not rendered. While this is noted as intentional, it means compute and LLM cost is being spent on a feature with no user value in this iteration. This should be explicitly confirmed as acceptable trade-off, or the generation of `risks` should be deferred until the UI is ready to display it.

## Verdict
Approved with changes. The plan is strong, but the 'blocker' and 'concern' findings must be addressed before implementation begins to ensure system robustness and observability.
