import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseEditorModal. */
export const s = {
  body: { padding: "20px 24px" } satisfies CSSProperties,
  inputTabsWrap: { marginBottom: 12, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" } satisfies CSSProperties,
  inputTabBody: { padding: 12, background: "var(--bg-surface)" } satisfies CSSProperties,
  metaRow: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  expectedHeaderRow: { display: "flex", alignItems: "center", marginBottom: 8, gap: 10 } satisfies CSSProperties,
  jsonStatus: (valid: boolean): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    color: valid ? "var(--ok)" : "var(--crit)",
  }),
  errorText: { fontSize: 12, color: "var(--crit)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
  runOnSaveRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 6,
  } satisfies CSSProperties,
  lastRun: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 10,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
} as const;
