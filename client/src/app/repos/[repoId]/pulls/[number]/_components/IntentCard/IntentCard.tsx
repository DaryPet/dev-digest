"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Skeleton } from "@devdigest/ui";
import { useIntent, useComputeIntent } from "@/lib/hooks/intent";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | number;
}

/** Intent card for the PR Overview tab.
 *  Shows the machine-derived PR intent: summary, In-scope list, Out-of-scope
 *  list, and a Recompute button. LLM-derived text is rendered as plain text
 *  only — never dangerouslySetInnerHTML. */
export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("brief");
  const { data, isLoading } = useIntent(prId);
  const compute = useComputeIntent(prId);

  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <span style={s.cardTitle}>{t("block.intent")}</span>
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
        <div style={{ padding: "16px 16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
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
        <div style={s.cardBody}>
          {/* Summary — plain text; LLM-derived, never rendered as HTML */}
          <p style={s.summary}>{data.intent.intent}</p>

          {/* In scope */}
          <div style={s.section}>
            <div style={s.sectionLabel}>{t("inScope")}</div>
            {data.intent.in_scope.length === 0 ? (
              <span style={s.emptyHint}>—</span>
            ) : (
              <ul style={s.list}>
                {data.intent.in_scope.map((item, i) => (
                  <li key={i} style={s.listItem}>
                    <span style={s.bullet} aria-hidden />
                    {/* plain text — no dangerouslySetInnerHTML */}
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Out of scope */}
          <div style={s.section}>
            <div style={s.sectionLabel}>{t("outOfScope")}</div>
            {data.intent.out_of_scope.length === 0 ? (
              <span style={s.emptyHint}>—</span>
            ) : (
              <ul style={s.list}>
                {data.intent.out_of_scope.map((item, i) => (
                  <li key={i} style={s.listItem}>
                    <span style={s.bullet} aria-hidden />
                    {/* plain text — no dangerouslySetInnerHTML */}
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
