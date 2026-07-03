import type { CSSProperties } from "react";

export const s = {
  briefGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 24,
    alignItems: "start",
  } satisfies CSSProperties,
} as const;
