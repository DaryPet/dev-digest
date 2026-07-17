import type { CSSProperties } from "react";

/** Shared by tableHeaderRow/tableRow so header labels stay pixel-aligned with
    their data cells: [checkbox, ran at, version, recall, precision, citation,
    pass, cost]. */
const RUN_GRID_COLS = "28px 150px 60px 1fr 1fr 1fr 70px 84px";

/** Co-located styles for the per-agent Eval Dashboard detail page. Mirrors
    `pulls/styles.ts`'s pageHeader/tableCard convention — AppFrame's <main>
    has no default padding (client/INSIGHTS.md 2026-06-28). */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    width: "fit-content",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  pageTitle: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" } satisfies CSSProperties,
  modelBadge: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "3px 9px",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  subtitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
  } satisfies CSSProperties,
  pageSubtitle: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  controlsRow: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,

  body: { padding: "0 32px 44px", display: "flex", flexDirection: "column", gap: 28 } satisfies CSSProperties,

  alertBanner: (color: string, bg: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "16px 32px 24px",
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${color}`,
    background: bg,
    color,
    fontSize: 13,
    fontWeight: 600,
  }),

  metricsGrid: { display: "flex", gap: 12 } satisfies CSSProperties,

  sectionHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  } satisfies CSSProperties,
  selectedCount: { fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" } satisfies CSSProperties,

  chartCard: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 16,
  } satisfies CSSProperties,
  chartHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
  } satisfies CSSProperties,
  sectionHeadingLeft: { display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)" } satisfies CSSProperties,
  sectionHeadingText: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legend: { display: "flex", gap: 16 } satisfies CSSProperties,
  legendItem: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
  }),
  legendDash: (color: string): CSSProperties => ({
    width: 14,
    height: 2,
    borderRadius: 1,
    background: color,
    display: "inline-block",
  }),

  runsTable: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  tableHeaderRow: {
    display: "grid",
    gridTemplateColumns: RUN_GRID_COLS,
    gap: 16,
    alignItems: "center",
    padding: "10px 20px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  tableHeaderCell: (align: "left" | "right" = "left"): CSSProperties => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    textAlign: align,
  }),
  tableRow: {
    display: "grid",
    gridTemplateColumns: RUN_GRID_COLS,
    gap: 16,
    alignItems: "center",
    padding: "14px 20px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  runDateCell: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  versionCell: { fontSize: 13, fontWeight: 700, color: "var(--accent)" } satisfies CSSProperties,
  metricBarCell: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  metricBarTrack: { flex: 1, maxWidth: 130 } satisfies CSSProperties,
  metricBarPct: { fontSize: 13, color: "var(--text-secondary)", flexShrink: 0, width: 36 } satisfies CSSProperties,
  passCell: { fontWeight: 700, color: "var(--text-primary)", fontSize: 13, textAlign: "right" } satisfies CSSProperties,
  costCell: { fontSize: 13, color: "var(--text-secondary)", textAlign: "right" } satisfies CSSProperties,
} as const;
