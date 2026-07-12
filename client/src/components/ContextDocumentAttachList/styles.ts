import type { CSSProperties } from "react";

/** Co-located styles for ContextDocumentAttachList (mirrors AgentEditor's
    SkillsTab styles.ts — compact, draggable/checkable catalog rows). */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 240,
  } satisfies CSSProperties,
  filterIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (checked: boolean, dragging: boolean, selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid " + (selected ? "var(--accent)" : checked ? "var(--border-strong)" : "var(--border)"),
    background: checked ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: dragging ? 0.5 : 1,
  }),
  grip: { display: "inline-flex", color: "var(--text-muted)", cursor: "grab", flexShrink: 0 } satisfies CSSProperties,
  info: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  name: { fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  path: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  tokens: { fontSize: 11, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
} as const;
