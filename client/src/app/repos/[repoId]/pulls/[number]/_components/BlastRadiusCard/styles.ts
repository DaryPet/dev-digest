import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";

/**
 * Co-located styles for BlastRadiusCard (CSS-in-JS, var(--token) CSS vars).
 *
 * SEV token map used for endpoint (INFO/blue) and cron (WARNING/orange) badge
 * colors AND the degraded banner — never hand-rolled (client/INSIGHTS.md
 * 2026-06-24 / 2026-07-03 repeat-offender pattern).
 *
 * Long unbroken file paths: minWidth:0 + overflow:hidden + textOverflow +
 * title attr on the text element (client/INSIGHTS.md 2026-07-03).
 */

// Exported token references so the component and SVG graph can reuse them
// without re-importing SEV.
export const ENDPOINT_COLOR = { c: SEV.INFO.c, bg: SEV.INFO.bg } as const;
export const CRON_COLOR = { c: SEV.WARNING.c, bg: SEV.WARNING.bg } as const;

export const s = {
  // ---- card container ----

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
    textAlign: "center" as const,
    padding: "18px 0 8px",
  } satisfies CSSProperties,

  // ---- counts row ----

  countRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap" as const,
  } satisfies CSSProperties,

  /** One count entry (icon + bold-number + muted-label). */
  countItem: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,

  countIcon: {
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
  } satisfies CSSProperties,

  countNum: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  countLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  // ---- Tree / Graph segmented toggle (mirrors SmartDiffViewer orderToggle) ----

  togglePill: {
    display: "inline-flex",
    marginLeft: "auto",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    flexShrink: 0,
  } satisfies CSSProperties,

  toggleBtn: {
    padding: "4px 14px",
    fontSize: 12,
    fontWeight: 600,
    background: "transparent",
    color: "var(--text-muted)",
    border: "none",
    cursor: "pointer",
    font: "inherit",
    lineHeight: "1.5",
  } satisfies CSSProperties,

  toggleBtnActive: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  // ---- symbol list (tree view) ----

  symbolList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  } satisfies CSSProperties,

  /** Full-width clickable band row — the whole row is the expand/collapse trigger. */
  symbolBand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 12px",
    background: "var(--bg)",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    font: "inherit",
    textAlign: "left" as const,
  } satisfies CSSProperties,

  symbolChevron: {
    color: "var(--text-muted)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  } satisfies CSSProperties,

  /** Blue `<>` icon for the symbol type marker. */
  symbolCodeIcon: {
    color: "var(--accent)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  } satisfies CSSProperties,

  symbolName: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } satisfies CSSProperties,

  symbolCallerCount: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
    marginLeft: 4,
    fontWeight: 400,
  } satisfies CSSProperties,

  // ---- expanded body ----

  expandedBody: {
    paddingLeft: 14,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  } satisfies CSSProperties,

  /** Guide-line tree container for caller rows (left border = vertical guide). */
  callerTree: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    borderLeft: "2px solid var(--border)",
    paddingLeft: 10,
    marginLeft: 8,
  } satisfies CSSProperties,

  /** Applied to both the <a> link wrapper and the <div> plain-text fallback. */
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    padding: "2px 0",
    textDecoration: "none",
    color: "inherit",
  } satisfies CSSProperties,

  callerCorner: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  /** Monospace file:line text with ellipsis (INSIGHTS 2026-07-03). */
  callerText: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
    color: "var(--text-secondary)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } satisfies CSSProperties,

  // ---- badge row (endpoints + crons) ----

  badgeRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 5,
    paddingLeft: 20,
  } satisfies CSSProperties,

  // ---- degraded banner (SEV.WARNING — never hand-rolled) ----

  degradedBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 7,
    background: SEV.WARNING.bg,
    border: `1px solid ${SEV.WARNING.c}`,
    color: SEV.WARNING.c,
    fontSize: 13,
    fontWeight: 500,
  } satisfies CSSProperties,

  degradedBannerText: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  } satisfies CSSProperties,

  degradedBannerTitle: {
    fontWeight: 700,
    fontSize: 12,
  } satisfies CSSProperties,

  degradedBannerHint: {
    fontWeight: 400,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  // ---- SVG graph wrapper ----

  graphWrapper: {
    width: "100%",
    overflow: "hidden",
  } satisfies CSSProperties,

  // ---- Prior-PRs bar (UNCHANGED) ----

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
