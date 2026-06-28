/** Conventions page constants. */

/** Confidence at/above this renders the bar green; below it, amber (mock + spec §4). */
export const CONFIDENCE_GREEN_THRESHOLD = 0.8;

/** Viz colors for the confidence bar — token first, hex fallback to match the mock. */
export const CONFIDENCE_GREEN = "var(--ok, #3fb950)";
export const CONFIDENCE_AMBER = "var(--warn, #d29922)";

/** Skeleton placeholder count while the first scan loads. */
export const SKELETON_ROWS = 3;
