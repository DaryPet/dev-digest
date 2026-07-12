import type { CSSProperties } from "react";

/** Co-located styles for ContextTab (mirrors the sibling SkillsTab's styles.ts). */
export const s = {
  wrap: { maxWidth: 920 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 6, flexWrap: "wrap" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, flex: 1 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  countPill: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent)",
    background: "var(--accent-bg)",
    padding: "2px 9px",
    borderRadius: 999,
  } satisfies CSSProperties,
  repoPicker: { width: 220 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 16,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  footerTokens: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  footerNote: { fontSize: 12, color: "var(--text-muted)", flex: 1, textAlign: "right" } satisfies CSSProperties,
} as const;
