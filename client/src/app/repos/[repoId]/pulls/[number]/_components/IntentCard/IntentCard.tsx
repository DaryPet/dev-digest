"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton, SEV, CAT } from "@devdigest/ui";
import type { BriefRisk } from "@devdigest/shared";
import { useIntent, useComputeIntent } from "@/lib/hooks/intent";
import { useBrief } from "@/lib/hooks/brief";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | number;
  repoFullName: string | null;
  headSha: string | null;
}

/** Strip the server's kind prefix ("FILE:"/"ENDPOINT:"/"CRON:") for display —
 *  falls back to the raw ref for older cached data that predates the prefix
 *  convention (cross-model review finding, 2026-07-13). */
function displayRef(ref: string): string {
  return ref.replace(/^(FILE|ENDPOINT|CRON):/, "");
}

/** Only a "FILE:"-prefixed ref is linkable (ENDPOINT:/CRON: are not files).
 *  The prefix makes this deterministic instead of guessing from the ref's
 *  shape — same fix as `brief/grounding.ts`'s `refMatchesKnownSet`. Falls
 *  back to null (never linked) for an unprefixed ref, since we can no longer
 *  tell whether it's a file without guessing. */
function parseFileRef(ref: string): { file: string; startLine?: number; endLine?: number } | null {
  if (!ref.startsWith("FILE:")) return null;
  const value = ref.slice(5);
  const withLine = value.match(/^([^\s:]+):(\d+)(?:-(\d+))?$/);
  if (withLine) {
    return { file: withLine[1]!, startLine: Number(withLine[2]), endLine: withLine[3] ? Number(withLine[3]) : undefined };
  }
  return { file: value };
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
function RiskAreasList({
  risks,
  emptyLabel,
  repoFullName,
  headSha,
}: {
  risks: BriefRisk[];
  emptyLabel: string;
  repoFullName: string | null;
  headSha: string | null;
}) {
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
              <span style={s.riskItemTitle}>{risk.title}</span>
              <Icon.ChevronDown
                size={14}
                style={{
                  ...s.riskChevron,
                  transform: isOpen ? "rotate(180deg)" : undefined,
                }}
                aria-hidden
              />
            </button>

            {risk.file_refs.length > 0 && (
              <div style={s.riskItemRefs}>
                {risk.file_refs.map((ref, j) => {
                  const parsed = parseFileRef(ref);
                  const href =
                    parsed && repoFullName && headSha
                      ? githubBlobUrl(repoFullName, headSha, parsed.file, parsed.startLine, parsed.endLine)
                      : null;
                  const label = displayRef(ref);
                  return (
                    <React.Fragment key={j}>
                      {j > 0 && <span aria-hidden>, </span>}
                      {href ? (
                        <a
                          className="mono"
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          style={s.refLink}
                        >
                          {label}
                        </a>
                      ) : (
                        <span className="mono" style={s.refLink}>
                          {label}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

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
export function IntentCard({ prId, repoFullName, headSha }: IntentCardProps) {
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
            <RiskAreasList
              risks={risks}
              emptyLabel={t("noRisks")}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          </div>
        </>
      )}
    </div>
  );
}
