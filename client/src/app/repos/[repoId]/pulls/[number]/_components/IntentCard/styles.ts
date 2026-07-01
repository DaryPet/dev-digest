import type { CSSProperties } from "react";

/** Co-located styles for IntentCard (CSS-in-JS with var(--token) CSS vars). */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  cardTitle: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  cardBody: {
    padding: "16px 16px 18px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
  } satisfies CSSProperties,

  summary: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap" as const,
  } satisfies CSSProperties,

  section: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  } satisfies CSSProperties,

  sectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  } satisfies CSSProperties,

  listItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  bullet: {
    flexShrink: 0,
    marginTop: 2,
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--text-muted)",
    display: "inline-block",
  } satisfies CSSProperties,

  emptyState: {
    padding: "24px 16px",
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
} as const;
