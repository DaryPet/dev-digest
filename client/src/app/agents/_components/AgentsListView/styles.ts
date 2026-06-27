import type { CSSProperties } from "react";

/** Co-located styles for AgentsListView — the Agents two-pane shell (the list
    rail itself lives in AgentsRail/styles.ts). */
export const s = {
  twoPane: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  rightEmpty: { flex: 1, display: "grid", placeItems: "center", padding: 28 } satisfies CSSProperties,
} as const;
