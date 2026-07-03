"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

/** BLAST RADIUS card + "Prior PRs touching these files" bar for the Overview
 *  tab (right column of the PR-brief grid, per the PR-page design). The blast
 *  radius / PR-history backends are separate features that don't exist yet,
 *  so both render honest "not computed" states — never fabricated data. */
export function BlastRadiusCard() {
  const t = useTranslations("brief");
  const [historyOpen, setHistoryOpen] = React.useState(false);

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <Icon.Boxes size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
        <span style={s.cardTitle}>{t("block.blast")}</span>
      </div>
      <div style={s.emptyHint}>{t("noBlast")}</div>

      {/* Prior-PRs bar lives INSIDE the blast-radius card (per the mock). */}
      <button
        type="button"
        style={s.historyBar}
        onClick={() => setHistoryOpen((v) => !v)}
        aria-expanded={historyOpen}
      >
        <Icon.History size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
        <span style={s.historyLabel}>{t("priorPrs")}</span>
        {historyOpen ? (
          <Icon.ChevronDown size={14} style={s.chevron} aria-hidden />
        ) : (
          <Icon.ChevronRight size={14} style={s.chevron} aria-hidden />
        )}
      </button>
      {historyOpen && <div style={s.historyBody}>{t("noHistory")}</div>}
    </div>
  );
}
