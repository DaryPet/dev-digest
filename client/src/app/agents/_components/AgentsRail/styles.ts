import type { CSSProperties } from "react";

/** Co-located styles for AgentsRail — the left list rail of the Agents two-pane
    (shared by the /agents landing and the /agents/:id editor). Mirrors
    SkillsRail/styles.ts. */
export const s = {
  rail: {
    width: 300,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    height: "100%",
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 10px" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, flex: 1, letterSpacing: "-0.01em" } satisfies CSSProperties,
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "0 16px 12px",
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "0 12px 16px" } satisfies CSSProperties,
} as const;
