import type { CSSProperties } from "react";

/** Co-located styles for IntentCard (CSS-in-JS with var(--token) CSS vars). */
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
    justifyContent: "space-between",
    gap: 10,
  } satisfies CSSProperties,

  headerLeft: {
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

  summary: {
    margin: 0,
    fontSize: 15,
    fontStyle: "italic" as const,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap" as const,
  } satisfies CSSProperties,

  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 32,
  } satisfies CSSProperties,

  scopeCol: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
    minWidth: 0,
  } satisfies CSSProperties,

  scopeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  } satisfies CSSProperties,

  listItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  bullet: {
    flexShrink: 0,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  emptyState: {
    padding: "10px 0 4px",
    textAlign: "center" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    alignItems: "center",
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

  riskList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  } satisfies CSSProperties,

  riskItem: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,

  riskItemHeader: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left" as const,
    font: "inherit",
    color: "inherit",
  } satisfies CSSProperties,

  riskItemText: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
    minWidth: 0,
    flex: 1,
  } satisfies CSSProperties,

  riskItemTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  riskItemRefs: {
    fontSize: 12.5,
    color: "var(--accent-text)",
    overflowWrap: "anywhere" as const,
  } satisfies CSSProperties,

  riskChevron: {
    flexShrink: 0,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  riskExplanation: {
    margin: 0,
    padding: "0 12px 12px 36px",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
