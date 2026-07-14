import type { CSSProperties } from "react";

/** Co-located styles for ReviewFocusSection (mirrors the BlastRadiusCard /
 *  IntentCard card shell — border/radius/bg/padding, uppercase muted title). */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "20px 24px 24px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 16,
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
  } satisfies CSSProperties,

  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
  } satisfies CSSProperties,

  listItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    minWidth: 0,
  } satisfies CSSProperties,

  bullet: {
    color: "var(--accent-text)",
    flexShrink: 0,
    marginTop: 6,
  } satisfies CSSProperties,

  link: {
    display: "block",
    minWidth: 0,
    borderRadius: 4,
    textDecoration: "none",
  } satisfies CSSProperties,

  plainText: {
    display: "block",
    minWidth: 0,
  } satisfies CSSProperties,

  path: {
    fontSize: 13,
    lineHeight: 1.6,
    fontWeight: 500,
    color: "var(--accent-text)",
    overflowWrap: "anywhere" as const,
  } satisfies CSSProperties,

  reason: {
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere" as const,
  } satisfies CSSProperties,
} as const;
