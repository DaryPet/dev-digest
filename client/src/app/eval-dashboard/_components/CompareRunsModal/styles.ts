import type { CSSProperties } from "react";
import type { DiffLine } from "./helpers";

/** Co-located styles for CompareRunsModal. */
export const s = {
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,
  sectionHeading: { fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: "var(--text-primary)" } satisfies CSSProperties,
  metricsTable: {
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  metricsHeaderRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
    padding: "8px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.03em",
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  metricRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
    padding: "10px 14px",
    fontSize: 13,
    alignItems: "center",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  metricLabel: { fontWeight: 500, color: "var(--text-primary)" } satisfies CSSProperties,
  metricValue: { fontVariantNumeric: "tabular-nums" } satisfies CSSProperties,
  metricDelta: (sign: number): CSSProperties => ({
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    color: sign > 0 ? "var(--ok)" : sign < 0 ? "var(--crit)" : "var(--text-muted)",
  }),
  noDataNote: { fontSize: 12, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  diffCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "auto",
    maxHeight: 320,
    background: "var(--bg-surface)",
    fontFamily: "var(--font-mono, monospace)",
  } satisfies CSSProperties,
  diffEmpty: { padding: "16px 18px", fontSize: 13, color: "var(--text-muted)", textAlign: "center" } satisfies CSSProperties,
  diffLine: (kind: DiffLine["kind"]): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    fontSize: 12.5,
    lineHeight: "20px",
    background: kind === "add" ? "var(--ok-bg)" : kind === "del" ? "var(--crit-bg)" : "transparent",
  }),
  diffSign: (kind: DiffLine["kind"]): CSSProperties => ({
    width: 18,
    textAlign: "center",
    flexShrink: 0,
    userSelect: "none",
    color: kind === "add" ? "var(--ok)" : kind === "del" ? "var(--crit)" : "var(--text-muted)",
  }),
  diffText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    paddingRight: 12,
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerSpacer: { flex: 1 } satisfies CSSProperties,
} as const;
