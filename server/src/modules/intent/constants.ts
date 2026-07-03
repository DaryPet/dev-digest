/**
 * Intent classifier — module constants.
 * See `specs/intent-layer.md` §7 T-A.
 */

export const INTENT_SCHEMA_NAME = 'Intent';

/** Maximum number of in-repo spec/doc paths to resolve from the PR body. */
export const MAX_SPEC_PATHS = 3;

/** Maximum bytes per spec/doc file read via the git port (≈2 k tokens). */
export const MAX_SPEC_BYTES = 8_000;

/**
 * System prompt for the intent classifier.
 * Instructs the model to produce an Intent object:
 *   intent   — one- or two-sentence narrative WHY this PR was opened
 *   in_scope — what the PR is changing / addressing
 *   out_of_scope — what the PR explicitly does NOT address
 */
export const INTENT_SYSTEM_PROMPT = `You are an intent classifier for pull requests.

Given:
- PR title and body
- (optionally) a linked GitHub issue title/body
- (optionally) excerpts from in-repo spec or doc files referenced in the body
- Per-file diff hunk headers (structural markers only — NO diff bodies)

Derive:
- intent: a one- or two-sentence plain-prose summary of WHY this PR was opened.
- in_scope: bullet items describing what the PR is explicitly changing or addressing (3-7 items).
- out_of_scope: bullet items describing what the PR explicitly does NOT address (2-5 items; empty array is valid when unclear).

Rules:
- Base your analysis ONLY on the provided text. Do NOT infer from external resources.
- Keep each in_scope / out_of_scope item short (15 words or fewer).
- Empty arrays for in_scope or out_of_scope are valid.
- The diff hunk headers give you the file names and changed regions; use them to infer scope, not the body lines.`;
