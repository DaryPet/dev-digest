import type { CSSProperties } from "react";

/** Co-located styles for the Conventions Extractor page + cards + modal. */
export const s = {
  pageHeader: {
    padding: "24px 32px 10px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  } satisfies CSSProperties,
  pageTitle: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)", fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  pageSubtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 32px",
    marginBottom: 4,
  } satisfies CSSProperties,
  acceptedCount: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  toolbarSpacer: { flex: 1 } satisfies CSSProperties,

  list: { display: "flex", flexDirection: "column", gap: 14, padding: "0 32px 44px" } satisfies CSSProperties,

  card: (status: string): CSSProperties => ({
    position: "relative",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${
      status === "accepted"
        ? "var(--accent, #3b82f6)"
        : status === "rejected"
          ? "var(--text-muted)"
          : "var(--ok, #3fb950)"
    }`,
    borderRadius: 10,
    background: "var(--bg-surface)",
    padding: 16,
    opacity: status === "rejected" ? 0.55 : 1,
  }),
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  } satisfies CSSProperties,
  rule: { fontSize: 15, fontStyle: "italic", fontWeight: 550, color: "var(--text-primary)" } satisfies CSSProperties,
  category: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--text-muted)",
    marginTop: 2,
  } satisfies CSSProperties,

  evidenceBox: {
    marginTop: 12,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-base, #0d1117)",
    overflow: "hidden",
  } satisfies CSSProperties,
  evidenceHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 10px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  evidenceLink: {
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
  snippet: {
    margin: 0,
    padding: "10px 12px",
    fontSize: 12.5,
    lineHeight: 1.5,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    overflowX: "auto",
  } satisfies CSSProperties,

  cardFoot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 14,
  } satisfies CSSProperties,
  cardActions: { display: "flex", gap: 8 } satisfies CSSProperties,

  // ConfidenceBar
  confWrap: { display: "flex", alignItems: "center", gap: 10, minWidth: 220 } satisfies CSSProperties,
  confLabel: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  confTrack: {
    flex: 1,
    height: 6,
    borderRadius: 99,
    background: "var(--border)",
    overflow: "hidden",
  } satisfies CSSProperties,
  confFill: (pct: number, color: string): CSSProperties => ({
    width: `${pct}%`,
    height: "100%",
    background: color,
    borderRadius: 99,
  }),
  confPct: { fontSize: 12, color: "var(--text-secondary)", width: 36, textAlign: "right" } satisfies CSSProperties,

  // Modal
  modalBanner: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 16,
  } satisfies CSSProperties,
  modalGrid: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  modalRow: { display: "flex", gap: 16 } satisfies CSSProperties,
  modalCol: { flex: 1 } satisfies CSSProperties,
  enabledLabel: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  enabledHint: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  modalFooter: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
