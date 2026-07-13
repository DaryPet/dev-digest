"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton, SEV, CAT } from "@devdigest/ui";
import type { BriefRisk } from "@devdigest/shared";
import { useIntent, useComputeIntent } from "@/lib/hooks/intent";
import { useBrief } from "@/lib/hooks/brief";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | number;
}

interface ScopeListProps {
  items: string[];
  label: string;
}

function ScopeList({ items, label }: ScopeListProps) {
  if (items.length === 0) return <span style={s.emptyHint}>—</span>;
  return (
    <ul style={s.list} aria-label={label}>
      {items.map((item, i) => (
        <li key={i} style={s.listItem}>
          <span style={s.bullet} aria-hidden>
            ·
          </span>
          {/* plain text — no dangerouslySetInnerHTML */}
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Keyword-based presentational icon/color pick for a risk item — reuses the
 *  existing CAT/SEV tokens (never a hand-rolled color, per SPEC-02's
 *  Non-functional Consistency rule). Purely cosmetic grouping of already-
 *  grounded data; the Brief schema itself carries no category field. */
function riskVisual(risk: BriefRisk): { icon: typeof Icon.AlertTriangle; color: string } {
  const haystack = `${risk.title} ${risk.explanation} ${risk.file_refs.join(" ")}`.toLowerCase();
  if (
    /\b(auth|token|session|credential|secret|password|jwt|login|security|vulnerab|injection|xss|traversal|exploit|csrf|permission)\b/.test(
      haystack,
    )
  ) {
    return { icon: Icon[CAT.security.icon], color: SEV.CRITICAL.c };
  }
  if (/package\.json|\bdependenc(y|ies)\b|\bnpm\b|\byarn\b|\bpnpm\b/.test(haystack)) {
    return { icon: Icon.Boxes, color: SEV.WARNING.c };
  }
  if (/\b(redis|latency|cache|n\+1|query|round-trip|performance|timeout|slow)\b/.test(haystack)) {
    return { icon: Icon[CAT.perf.icon], color: "var(--text-muted)" };
  }
  if (/\b(migration|schema|database)\b|\/migrations\//.test(haystack)) {
    return { icon: Icon.Database, color: SEV.WARNING.c };
  }
  if (/\bbugs?\b|\bregression|\bedge case|\breintroduce|\bbreak existing/.test(haystack)) {
    return { icon: Icon.Bug, color: "var(--text-muted)" };
  }
  return { icon: Icon.AlertTriangle, color: SEV.WARNING.c };
}

/** Risk areas list — sourced from the Brief's grounded `risks[]` (SPEC-02).
 *  Each item cites at least one real file/endpoint (`file_refs`); expandable
 *  to show the model's `explanation`. LLM-derived text rendered as plain
 *  text only — never dangerouslySetInnerHTML. */
function RiskAreasList({ risks, emptyLabel }: { risks: BriefRisk[]; emptyLabel: string }) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null);

  if (risks.length === 0) return <span style={s.emptyHint}>{emptyLabel}</span>;

  return (
    <div style={s.riskList}>
      {risks.map((risk, i) => {
        const isOpen = openIndex === i;
        const { icon: RiskIcon, color: riskColor } = riskVisual(risk);
        return (
          <div key={i} style={s.riskItem}>
            <button
              type="button"
              style={s.riskItemHeader}
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? null : i)}
            >
              <RiskIcon size={14} style={{ color: riskColor }} aria-hidden />
              <span style={s.riskItemText}>
                <span style={s.riskItemTitle}>{risk.title}</span>
                {risk.file_refs.length > 0 && (
                  <span className="mono" style={s.riskItemRefs}>
                    {risk.file_refs.join(", ")}
                  </span>
                )}
              </span>
              <Icon.ChevronDown
                size={14}
                style={{
                  ...s.riskChevron,
                  transform: isOpen ? "rotate(180deg)" : undefined,
                }}
                aria-hidden
              />
            </button>
            {isOpen && <p style={s.riskExplanation}>{risk.explanation}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Intent card for the PR Overview tab.
 *  Shows the machine-derived PR intent: quoted summary, side-by-side
 *  In-scope / Out-of-scope columns, the Brief's grounded Risk areas, and a
 *  Recompute button. LLM-derived text is rendered as plain text only — never
 *  dangerouslySetInnerHTML. */
export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading } = useIntent(prId);
  const compute = useComputeIntent(prId);
  const { data: briefData } = useBrief(prId);
  const risks = briefData?.brief.risks ?? [];

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={s.headerLeft}>
          <Icon.Target size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
          <span style={s.cardTitle}>{t("block.intent")}</span>
        </span>
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          loading={compute.isPending}
          disabled={compute.isPending}
          onClick={() => compute.mutate()}
        >
          {t("recompute")}
        </Button>
      </div>

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton height={16} />
          <Skeleton height={16} width="80%" />
          <Skeleton height={16} width="60%" />
        </div>
      ) : data?.intent == null ? (
        <div style={s.emptyState}>
          <div style={s.emptyTitle}>{t("unavailable")}</div>
          <div style={s.emptyHint}>{t("unavailableHint")}</div>
        </div>
      ) : (
        <>
          {/* Summary — plain text inside <q> (quotes come from CSS-generated
              content, keeping the text node clean); LLM-derived, never HTML */}
          <p style={s.summary}>
            <q>{data.intent.intent}</q>
          </p>

          <div style={s.scopeGrid}>
            <div style={s.scopeCol}>
              <div style={s.scopeHeader}>
                <Icon.Check size={14} style={{ color: "var(--ok)" }} aria-hidden />
                {t("inScope")}
              </div>
              <ScopeList items={data.intent.in_scope} label={t("inScope")} />
            </div>

            <div style={s.scopeCol}>
              <div style={s.scopeHeader}>
                <Icon.X size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
                {t("outOfScope")}
              </div>
              <ScopeList items={data.intent.out_of_scope} label={t("outOfScope")} />
            </div>
          </div>

          {/* Risk areas — sourced from the Brief's grounded risks[] (SPEC-02);
              honest empty state when none survived grounding. */}
          <div style={s.scopeCol}>
            <div style={s.scopeHeader}>
              <Icon.AlertTriangle size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
              {t("riskAreas")}
            </div>
            <RiskAreasList risks={risks} emptyLabel={t("noRisks")} />
          </div>
        </>
      )}
    </div>
  );
}
