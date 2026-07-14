/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score.
   SPEC-02: `riskLevel`/`riskLabel` are an additive, backward-compatible override —
   when present they win over `verdict` for the icon/color/label (PrBriefCard's
   Brief-driven narrative), while every other prop (findings·blockers pill, score
   ring, cost/tokens) stays exactly as before. Legacy callers (ReviewRunAccordion)
   never pass the new props, so their rendering is unaffected. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, CircularScore } from "@devdigest/ui";
import type { RiskSeverity, Verdict } from "@devdigest/shared";
import { RunCostBadge } from "@/components/RunCostBadge/RunCostBadge";
import { VERDICT_META, RISK_META } from "./constants";
import { s } from "./styles";

export function VerdictBanner({
  verdict,
  riskLevel,
  riskLabel,
  summary,
  score,
  findingsCount,
  blockers,
  agentName,
  cost,
  tokensIn,
  tokensOut,
}: {
  verdict?: Verdict;
  /** SPEC-02: when present, wins over `verdict` for icon/color/label. */
  riskLevel?: RiskSeverity;
  /** Pre-translated by the caller (PrBriefCard uses its own "brief" namespace). */
  riskLabel?: string;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  blockers: number;
  agentName?: string | null;
  /** Run cost shown under the score ring; omit the prop to hide the row. */
  cost?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}) {
  const t = useTranslations("prReview");
  const verdictMeta = VERDICT_META[verdict ?? "comment"];
  const meta = riskLevel ? RISK_META[riskLevel] : verdictMeta;
  const VIcon = Icon[meta.icon];
  const label = riskLevel ? riskLabel : t(`verdict.${verdictMeta.labelKey}`);
  return (
    <div style={s.wrap}>
      <div style={s.iconBox(meta.bg, meta.c)}>
        <VIcon size={22} />
      </div>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.label(meta.c)}>{label}</span>
          <Badge color="var(--text-secondary)">
            {t("verdict.findingsCount", { count: findingsCount })}
            {blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
          </Badge>
          {agentName && (
            <Badge color="var(--accent-text)" bg="var(--accent-bg)" icon="Cpu">
              {agentName}
            </Badge>
          )}
        </div>
        {summary && <p style={s.summary}>{summary}</p>}
      </div>
      {score != null && (
        <div style={s.scoreCol}>
          <CircularScore score={score} size={52} stroke={5} />
          <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
          {cost !== undefined && (
            <RunCostBadge cost={cost} tokensIn={tokensIn} tokensOut={tokensOut} variant="detailed" />
          )}
        </div>
      )}
    </div>
  );
}
