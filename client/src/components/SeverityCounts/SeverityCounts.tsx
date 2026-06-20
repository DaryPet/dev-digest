/* SeverityCounts — the icon+number severity badge used across the app
   (PR list FINDINGS column, PR-detail timeline rows, the Review-runs
   counter). No text label — icon colored per severity + the count + a
   severity-colored underline, matching the design's compact style. Renders
   nothing for a severity whose count is undefined (so callers that only have
   critical/warning, e.g. the timeline, don't show a stray "0 SUGGESTION");
   with `hideZero`, also skips levels whose count is 0. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";

const ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export interface SeverityCountsProps {
  critical?: number | null;
  warning?: number | null;
  suggestion?: number | null;
  /** Per-severity click handler (omit for a static/non-interactive display). */
  onClick?: (severity: Severity) => void;
  /** Currently active/selected severity, for callers that filter on click. */
  active?: Severity | null;
  /** Skip a level whose count is 0 (PR-list column: show only what was found). */
  hideZero?: boolean;
  size?: number;
}

const COUNT_BY_SEVERITY: Record<Severity, "critical" | "warning" | "suggestion"> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

export function SeverityCounts({
  critical,
  warning,
  suggestion,
  onClick,
  active,
  hideZero,
  size = 14,
}: SeverityCountsProps) {
  const counts = { critical, warning, suggestion };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {ORDER.map((severity) => {
        const count = counts[COUNT_BY_SEVERITY[severity]];
        if (count == null) return null;
        if (hideZero && count === 0) return null;
        const sev = SEV[severity];
        const I = Icon[sev.icon];
        const isActive = active === severity;
        const Tag = onClick ? "button" : "span";
        return (
          <Tag
            key={severity}
            type={onClick ? "button" : undefined}
            onClick={onClick ? () => onClick(severity) : undefined}
            aria-pressed={onClick ? isActive : undefined}
            // No native `title` on the static badge — the FindingsHoverCard
            // already shows the rich preview, and a `title` would render a
            // second, redundant browser tooltip. Keep the label for a11y only.
            aria-label={
              onClick
                ? `${isActive ? "Clear" : "Show only"} ${sev.label} findings`
                : `${sev.label}: ${count}`
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              border: "none",
              background: "none",
              padding: 0,
              cursor: onClick ? "pointer" : "default",
              fontSize: 12.5,
              fontWeight: 600,
              color: sev.c,
              paddingBottom: 2,
              // Severity-colored underline (design): dotted normally, solid when
              // this level is the active filter.
              borderBottom: `2px ${isActive ? "solid" : "dotted"} ${sev.c}`,
            }}
          >
            <I size={size} style={{ color: sev.c }} />
            <span className="tnum">{count}</span>
          </Tag>
        );
      })}
    </span>
  );
}
