"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import { useIntent, useComputeIntent } from "@/lib/hooks/intent";
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

/** Intent card for the PR Overview tab.
 *  Shows the machine-derived PR intent: quoted summary, side-by-side
 *  In-scope / Out-of-scope columns, and a Recompute button. LLM-derived text
 *  is rendered as plain text only — never dangerouslySetInnerHTML. */
export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading } = useIntent(prId);
  const compute = useComputeIntent(prId);

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

          {/* Risk areas — the risk-analysis backend is a separate feature that
              doesn't exist yet; honest empty state, never fabricated chips. */}
          <div style={s.scopeCol}>
            <div style={s.scopeHeader}>
              <Icon.AlertTriangle size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
              {t("riskAreas")}
            </div>
            <span style={s.emptyHint}>{t("noRisks")}</span>
          </div>
        </>
      )}
    </div>
  );
}
