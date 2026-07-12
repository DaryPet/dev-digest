import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextSection (mirrors the sibling agent
    ContextTab's styles.ts, adapted to sit inline inside ConfigTab). */
export const s = {
  wrap: { marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 4, flexWrap: "wrap" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, flex: 1 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  repoPicker: { width: 220 } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 } satisfies CSSProperties,
  serializesAs: { marginTop: 16 } satisfies CSSProperties,
  serializesAsLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  } satisfies CSSProperties,
  serializesAsPre: {
    margin: 0,
    padding: "14px 16px",
    fontSize: 12.5,
    lineHeight: 1.9,
    color: "var(--text-secondary)",
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    whiteSpace: "pre-wrap",
    overflowX: "auto",
  } satisfies CSSProperties,
} as const;
