import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";

/** Colored square bullet per role group (mock: blue core, orange wiring,
 *  gray boilerplate). Roles are not severities, so no SEV mapping here. */
export const ROLE_BULLET: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  wiring: "var(--warn)",
  boilerplate: "var(--text-muted)",
};

/** Co-located styles for SmartDiffViewer (CSS-in-JS with var(--token) CSS vars).
 *  Pattern mirrors diff-viewer/styles.ts and IntentCard/styles.ts. */
export const s = {
  /** Outer wrapper; sits above the flat DiffViewer in the Files-changed tab. */
  wrapper: {
    marginBottom: 24,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  /** "REVIEWER-ORDERED DIFF" uppercase section label. */
  sectionLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  /** "N files · +X −Y" summary line under the section label. */
  summaryRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  /** "Smart order | Original order" pill toggle (right edge of summary row). */
  orderToggle: {
    display: "inline-flex",
    marginLeft: "auto",
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    flexShrink: 0,
  } satisfies CSSProperties,

  orderBtn: {
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: 600,
    background: "transparent",
    color: "var(--text-muted)",
    border: "none",
    cursor: "pointer",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  orderBtnActive: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  /** Warning banner shown when the PR exceeds the split threshold. */
  splitBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 14px",
    borderRadius: 7,
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    color: "var(--warn)",
    fontSize: 13,
    fontWeight: 500,
  } satisfies CSSProperties,

  /** One role group: flat label row + its file cards (not a collapsible box). */
  group: {
    marginTop: 8,
  } satisfies CSSProperties,

  /** Flat group label row: bullet, title, muted description, file count. */
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "2px 2px 10px",
  } satisfies CSSProperties,

  groupBullet: {
    width: 8,
    height: 8,
    borderRadius: 2,
    flexShrink: 0,
  } satisfies CSSProperties,

  groupTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-primary)",
    flexShrink: 0,
  } satisfies CSSProperties,

  groupDesc: {
    flex: 1,
    fontSize: 12,
    color: "var(--text-muted)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } satisfies CSSProperties,

  groupCount: {
    fontSize: 12,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  /** Muted placeholder shown when a role group has no files in this PR. */
  emptyGroup: {
    padding: "8px 14px",
    fontSize: 12,
    color: "var(--text-muted)",
    border: "1px dashed var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,

  /** File cards stacked with a small gap (each file is its own card). */
  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  /** Single file card. */
  fileCard: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,

  /** Clickable file header row: chevron, icon, path, dot, +/- stats, badge. */
  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    cursor: "pointer",
    userSelect: "none" as const,
  } satisfies CSSProperties,

  /** File path text — truncated with ellipsis if the path is long. */
  filePath: {
    fontSize: 13,
    fontWeight: 500,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  /** Dot marking a file the latest review flagged (mock's red dot). */
  findingDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: SEV.WARNING.c,
    flexShrink: 0,
  } satisfies CSSProperties,

  /** Spacer pushing stats/badge to the right edge of the header. */
  headerSpacer: {
    flex: 1,
    minWidth: 12,
  } satisfies CSSProperties,

  fileStat: {
    fontSize: 12,
    flexShrink: 0,
  } satisfies CSSProperties,

  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,

  /** Clickable "N findings" badge; reuses the shared SEV token map (WARNING
   *  level) rather than hand-rolling severity colors. */
  findingsBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    color: SEV.WARNING.c,
    background: SEV.WARNING.bg,
    border: "none",
    cursor: "pointer",
    flexShrink: 0,
    letterSpacing: "0.01em",
    lineHeight: 1.4,
  } satisfies CSSProperties,

  /** Diff content area shown when a file is expanded. */
  fileDiff: {
    borderTop: "1px solid var(--border)",
    background: "var(--bg-surface)",
    padding: "8px 0",
  } satisfies CSSProperties,

  /** One rendered diff line (add / del / ctx). */
  diffLine: {
    display: "flex",
    alignItems: "stretch",
    fontSize: 13,
    lineHeight: "20px",
  } satisfies CSSProperties,

  lineNo: {
    width: 44,
    textAlign: "right" as const,
    padding: "0 10px 0 0",
    color: "var(--text-muted)",
    userSelect: "none" as const,
    flexShrink: 0,
  } satisfies CSSProperties,

  lineSign: {
    width: 14,
    textAlign: "center" as const,
    flexShrink: 0,
  } satisfies CSSProperties,

  lineText: {
    flex: 1,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    color: "var(--text-primary)",
    paddingRight: 12,
  } satisfies CSSProperties,

  /** Unified-diff hunk header line (@@ -x +y @@). */
  hunkLine: {
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    padding: "0 14px",
  } satisfies CSSProperties,

  /** Placeholder for a file with no diff (binary / empty patch). */
  noDiff: {
    padding: "14px 18px",
    fontSize: 13,
    color: "var(--text-muted)",
    textAlign: "center" as const,
  } satisfies CSSProperties,
} as const;
