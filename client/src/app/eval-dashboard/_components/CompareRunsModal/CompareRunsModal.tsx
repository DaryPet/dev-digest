"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Skeleton } from "@devdigest/ui";
import { useEvalDashboard, useEvalRunSnapshot, usePromoteConfig } from "@/lib/hooks/eval";
import { formatCost } from "@/components/RunCostBadge/RunCostBadge";
import { diffLines, formatCostDelta, formatPercent, formatPercentDelta, metricDelta, metricsForVersion } from "./helpers";
import { s } from "./styles";

interface CompareRunsModalProps {
  agentId: string;
  versions: [number, number]; // exactly two selected version-groups
  onClose: () => void;
  onPromoted?: () => void;
}

/** Compare-runs modal (SPEC-03 Group G, AC-34..37) — shows metric deltas and
    a system-prompt diff between two selected version-groups, and lets the
    developer Promote either side's snapshot config as the agent's live
    config (a real backend effect, D8) or Close without any side effect. */
export function CompareRunsModal({ agentId, versions, onClose, onPromoted }: CompareRunsModalProps) {
  const t = useTranslations("eval");
  const [versionA, versionB] = versions;

  const snapshotA = useEvalRunSnapshot(agentId, versionA);
  const snapshotB = useEvalRunSnapshot(agentId, versionB);
  const { data: dashboard, isLoading: dashboardLoading } = useEvalDashboard("agent", agentId);
  const promote = usePromoteConfig(agentId);

  const [promotingVersion, setPromotingVersion] = React.useState<number | null>(null);

  const loading = snapshotA.isLoading || snapshotB.isLoading || dashboardLoading;

  const runs = dashboard?.recent_runs ?? [];
  const metricsA = React.useMemo(() => metricsForVersion(runs, versionA), [runs, versionA]);
  const metricsB = React.useMemo(() => metricsForVersion(runs, versionB), [runs, versionB]);
  const anyMissingSamples = metricsA.sampleCount === 0 || metricsB.sampleCount === 0;

  const diff = React.useMemo(
    () => diffLines(snapshotA.data?.system_prompt ?? "", snapshotB.data?.system_prompt ?? ""),
    [snapshotA.data?.system_prompt, snapshotB.data?.system_prompt],
  );
  const hasDiffChanges = diff.some((line) => line.kind !== "ctx");

  const handlePromote = (version: number) => {
    setPromotingVersion(version);
    promote.mutate(version, {
      onSuccess: () => onPromoted?.(),
      onSettled: () => setPromotingVersion(null),
    });
  };

  const metricRows: Array<{
    key: string;
    label: string;
    a: string;
    b: string;
    delta: string;
    sign: number;
  }> = [
    {
      key: "recall",
      label: t("compare.metricLabels.recall"),
      a: formatPercent(metricsA.recall),
      b: formatPercent(metricsB.recall),
      delta: formatPercentDelta(metricDelta(metricsA.recall, metricsB.recall)),
      sign: Math.sign(metricDelta(metricsA.recall, metricsB.recall) ?? 0),
    },
    {
      key: "precision",
      label: t("compare.metricLabels.precision"),
      a: formatPercent(metricsA.precision),
      b: formatPercent(metricsB.precision),
      delta: formatPercentDelta(metricDelta(metricsA.precision, metricsB.precision)),
      sign: Math.sign(metricDelta(metricsA.precision, metricsB.precision) ?? 0),
    },
    {
      key: "citationAccuracy",
      label: t("compare.metricLabels.citationAccuracy"),
      a: formatPercent(metricsA.citation_accuracy),
      b: formatPercent(metricsB.citation_accuracy),
      delta: formatPercentDelta(metricDelta(metricsA.citation_accuracy, metricsB.citation_accuracy)),
      sign: Math.sign(metricDelta(metricsA.citation_accuracy, metricsB.citation_accuracy) ?? 0),
    },
    {
      key: "cost",
      label: t("compare.metricLabels.cost"),
      a: formatCost(metricsA.cost_usd),
      b: formatCost(metricsB.cost_usd),
      delta: formatCostDelta(metricDelta(metricsA.cost_usd, metricsB.cost_usd)),
      // A cost increase is a regression (red), a decrease is an improvement (green) — inverse of the other metrics.
      sign: -Math.sign(metricDelta(metricsA.cost_usd, metricsB.cost_usd) ?? 0),
    },
  ];

  const footer = (
    <div style={s.footer}>
      <Button kind="secondary" onClick={onClose}>
        {t("compare.close")}
      </Button>
      <div style={s.footerSpacer} />
      <Button
        kind="secondary"
        onClick={() => handlePromote(versionA)}
        disabled={promote.isPending}
        loading={promotingVersion === versionA}
      >
        {promotingVersion === versionA ? t("compare.promoting") : t("compare.promote", { version: versionA })}
      </Button>
      <Button
        kind="primary"
        onClick={() => handlePromote(versionB)}
        disabled={promote.isPending}
        loading={promotingVersion === versionB}
      >
        {promotingVersion === versionB ? t("compare.promoting") : t("compare.promote", { version: versionB })}
      </Button>
    </div>
  );

  return (
    <Modal width={860} title={t("compare.title", { versionA, versionB })} onClose={onClose} footer={footer}>
      {loading ? (
        <div style={s.body}>
          <Skeleton height={140} />
          <Skeleton height={200} />
        </div>
      ) : (
        <div style={s.body}>
          <section>
            <h3 style={s.sectionHeading}>{t("compare.metricsHeading")}</h3>
            <div style={s.metricsTable}>
              <div style={s.metricsHeaderRow}>
                <span />
                <span>{t("compare.versionColumn", { version: versionA })}</span>
                <span>{t("compare.versionColumn", { version: versionB })}</span>
                <span>{t("compare.deltaColumn")}</span>
              </div>
              {metricRows.map((row) => (
                <div key={row.key} style={s.metricRow}>
                  <span style={s.metricLabel}>{row.label}</span>
                  <span style={s.metricValue}>{row.a}</span>
                  <span style={s.metricValue}>{row.b}</span>
                  <span style={s.metricDelta(row.sign)}>{row.delta}</span>
                </div>
              ))}
            </div>
            {anyMissingSamples && <div style={s.noDataNote}>{t("compare.noData")}</div>}
          </section>

          <section>
            <h3 style={s.sectionHeading}>{t("compare.promptDiffHeading")}</h3>
            <div style={s.diffCard}>
              {!hasDiffChanges ? (
                <div style={s.diffEmpty}>{t("compare.identicalPrompts")}</div>
              ) : (
                diff.map((line, idx) => (
                  <div key={idx} style={s.diffLine(line.kind)}>
                    <span style={s.diffSign(line.kind)}>{line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}</span>
                    <span style={s.diffText}>{line.text}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
