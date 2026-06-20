/* SeverityCounter — icon+count row above the Review runs list (design:
   compact icon+number, no text labels — see specs/findings-severity-counter.md).
   Purely a client-side aggregation over already-fetched findings (no model
   call). Clicking a level filters every run's FindingsPanel down to that
   severity; clicking the active level again clears the filter. */
"use client";

import React from "react";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { SeverityCounts } from "@/components/SeverityCounts";
import { countBySeverity } from "./helpers";
import { s } from "./styles";

export function SeverityCounter({
  findings,
  selected,
  onSelect,
}: {
  findings: FindingRecord[];
  selected: Severity | null;
  onSelect: (severity: Severity | null) => void;
}) {
  const counts = React.useMemo(() => countBySeverity(findings), [findings]);

  return (
    <div style={s.row}>
      <SeverityCounts
        critical={counts.CRITICAL}
        warning={counts.WARNING}
        suggestion={counts.SUGGESTION}
        active={selected}
        onClick={(severity) => onSelect(selected === severity ? null : severity)}
        size={15}
      />
    </div>
  );
}
