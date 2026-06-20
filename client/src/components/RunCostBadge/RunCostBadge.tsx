/* RunCostBadge — shared cost display for a single run, used in three places:
   the PR list COST column (compact), the Review Runs accordion header
   (detailed), and the run flyout's Stats section (via formatCost directly).
   A run with no attributable cost (unknown model, failed run) renders "—",
   never "$0.00" — that value is reserved for a genuinely free model. */
"use client";

import React from "react";

/** Token in→out summary (e.g. "8.2K→1.3K"). Mirrors RunTraceDrawer's
    formatTokens but with one decimal on the "in" side to match the spec's
    "8.2K→1.3K" example (that helper rounds "in" to an integer). */
export function formatRunTokens(tokensIn: number, tokensOut: number): string {
  const fmt = (n: number) => {
    const k = n / 1000;
    return `${k >= 10 ? k.toFixed(0) : k.toFixed(1)}K`;
  };
  return `${fmt(tokensIn)}→${fmt(tokensOut)}`;
}

/** USD cost formatting. null = no data ("—"); 0 = a genuinely free model ("$0.00"). */
export function formatCost(cost: number | null | undefined): string {
  if (cost == null) return "—";
  if (cost === 0) return "$0.00";
  return `$${cost.toFixed(3)}`;
}

export function RunCostBadge({
  cost,
  tokensIn,
  tokensOut,
  variant = "compact",
}: {
  cost: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "detailed";
}) {
  const costLabel = formatCost(cost);
  const showTokens = variant === "detailed" && cost != null && tokensIn != null && tokensOut != null;

  return (
    <span
      className="mono"
      style={{
        fontSize: 12,
        color: cost == null ? "var(--text-muted)" : "var(--text-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      {costLabel}
      {showTokens && (
        <span style={{ color: "var(--text-muted)" }}> · {formatRunTokens(tokensIn!, tokensOut!)}</span>
      )}
    </span>
  );
}

export default RunCostBadge;
