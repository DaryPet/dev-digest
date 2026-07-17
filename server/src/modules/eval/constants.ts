/**
 * Eval module constants (spec `specs/eval-pipeline.md`, D7).
 */

/**
 * Dashboard alert threshold (D7) — the current version-group's recall,
 * precision, or citation_accuracy dropping by AT LEAST this many percentage
 * points versus the immediately preceding version-group surfaces a non-null
 * alert (AC-33). No preceding version-group (first run ever) → alert is
 * always null, regardless of this threshold.
 */
export const ALERT_THRESHOLD_PP = 2;

/**
 * Cap on `EvalDashboard.recent_runs` (AC-31/AC-32's "Recent runs" list) —
 * newest first. Not spec-frozen; a sane bound so the dashboard payload stays
 * small even after many eval runs accumulate.
 */
export const RECENT_RUNS_LIMIT = 20;

/** Eval-case runs are tiny, single-file diff fragments (D5) — always reviewed
 *  in one pass, never map-reduce. */
export const EVAL_REVIEW_STRATEGY = 'single-pass' as const;
