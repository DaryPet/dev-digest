import type { CSSProperties } from "react";

/** Co-located styles for SeverityCounter. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  } satisfies CSSProperties,
} as const;
