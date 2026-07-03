import type { CSSProperties } from "react";

/** Co-located styles for BlastRadiusCard (CSS-in-JS with var(--token) vars). */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "20px 24px 24px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 18,
  } satisfies CSSProperties,

  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,

  cardTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  emptyHint: {
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center" as const,
    padding: "18px 0 8px",
  } satisfies CSSProperties,

  historyBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg)",
    padding: "12px 16px",
    cursor: "pointer",
    font: "inherit",
    textAlign: "left" as const,
  } satisfies CSSProperties,

  historyLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  chevron: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  historyBody: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "0 16px",
  } satisfies CSSProperties,
} as const;
