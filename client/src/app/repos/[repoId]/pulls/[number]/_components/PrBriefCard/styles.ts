import type { CSSProperties } from "react";

/** Co-located styles for PrBriefCard (loading/empty card shell; the populated
 *  state renders through VerdictBanner, which carries its own card styles). */
export const s = {
  emptyCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "22px 18px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    alignItems: "center",
    textAlign: "center" as const,
  } satisfies CSSProperties,

  emptyTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  emptyHint: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  /** Wraps the populated VerdictBanner + the Recompute row underneath it. */
  wrap: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  } satisfies CSSProperties,

  recomputeRow: {
    display: "flex",
    justifyContent: "flex-end",
  } satisfies CSSProperties,
} as const;
