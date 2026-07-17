/* Eval Dashboard — per-agent detail, /eval-dashboard/:agentId. Metric cards
   with deltas (AC-32/AC-17-style), a "Metric trend" chart across version-
   groups, a "Recent runs" list with checkboxes feeding Compare (AC-32), and
   a non-null-only regression alert (AC-33, D7). Compare/Promote itself is
   T-E's CompareRunsModal (../_components/CompareRunsModal) — this page only
   owns selecting exactly two runs and deriving their `[v1, v2]` versions.
   Spec: specs/eval-pipeline.md SPEC-03 Group F/G (minus the modal's guts). */
"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Checkbox,
  Dropdown,
  EmptyState,
  Icon,
  LineChart,
  MetricCard,
  ProgressBar,
  Skeleton,
  SEV,
  type ChartSeries,
  type DropdownItemDef,
} from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { formatCost } from "@/components/RunCostBadge/RunCostBadge";
import { useAgent, useAgents } from "@/lib/hooks/agents";
import { useEvalDashboard, useRunAllEvals } from "@/lib/hooks/eval";
import { CompareRunsModal } from "../_components/CompareRunsModal";
import { compareVersionsFor, formatRunDate, groupRunsByVersion } from "./helpers";
import { s } from "./styles";

const RANGE_OPTIONS = [7, 30, 90] as const;

export default function EvalDashboardDetailPage() {
  const t = useTranslations("eval");
  const router = useRouter();
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const { data: agent } = useAgent(agentId);
  const { data: agents } = useAgents();
  const { data: dashboard, isLoading } = useEvalDashboard("agent", agentId);
  const runAll = useRunAllEvals(agentId);

  const [selectedRunIds, setSelectedRunIds] = React.useState<Set<string>>(new Set());
  const [compareVersions, setCompareVersions] = React.useState<[number, number] | null>(null);
  const [rangeDays, setRangeDays] = React.useState<number>(30);

  const toggleRun = (id: string) =>
    setSelectedRunIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runs = dashboard?.recent_runs ?? [];
  const canCompare = selectedRunIds.size === 2;

  const handleCompare = () => {
    const versions = compareVersionsFor(runs, selectedRunIds);
    if (versions) setCompareVersions(versions);
  };

  const handlePromoted = () => {
    // usePromoteConfig's own onSuccess already invalidates ["eval-dashboard"]
    // broadly (plan §6.5) — closing the modal is all this callback needs to do.
    setCompareVersions(null);
    setSelectedRunIds(new Set());
  };

  // Range selector (AC: "N days" picker) scopes the trend chart + recent runs
  // list only — the metric cards above show the latest snapshot regardless of
  // range, same as the overview page's per-agent cards.
  const withinRange = (isoDate: string) => Date.now() - new Date(isoDate).getTime() <= rangeDays * 86_400_000;
  const fullTrend = dashboard?.trend ?? [];
  const trend = fullTrend.filter((p) => withinRange(p.ran_at));
  const visibleRuns = runs.filter((r) => withinRange(r.ran_at));
  const current = dashboard?.current;
  const delta = dashboard?.delta;

  const series: ChartSeries[] = [
    { name: t("dashboard.legend.recall"), color: "var(--accent)", data: trend.map((p) => p.recall) },
    { name: t("dashboard.legend.precision"), color: "var(--ok)", data: trend.map((p) => p.precision) },
    { name: t("dashboard.legend.citation"), color: "var(--warn)", data: trend.map((p) => p.citation_accuracy) },
  ];

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval-dashboard" },
    { label: agent?.name ?? agentId },
  ];

  const agentItems: DropdownItemDef[] = (agents ?? []).map((a) => ({
    label: a.name,
    icon: "Cpu" as const,
    hint: a.id === agentId ? undefined : a.model,
    onClick: () => {
      if (a.id !== agentId) router.push(`/eval-dashboard/${a.id}`);
    },
  }));

  const rangeItems: DropdownItemDef[] = RANGE_OPTIONS.map((n) => ({
    label: t("dashboard.rangeLabel", { days: n }),
    onClick: () => setRangeDays(n),
  }));

  const runGroups = React.useMemo(() => groupRunsByVersion(visibleRuns), [visibleRuns]);

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <Link href="/eval-dashboard" style={s.backLink}>
          <Icon.ChevronLeft size={15} />
          {t("dashboard.allAgents")}
        </Link>

        <div style={s.titleRow}>
          <h1 style={s.pageTitle}>{agent?.name ?? t("dashboard.defaultTitle")}</h1>
          {agent?.model && (
            <span className="mono" style={s.modelBadge}>
              {agent.model}
            </span>
          )}
        </div>

        <div style={s.subtitleRow}>
          <p style={s.pageSubtitle}>
            {dashboard
              ? t("dashboard.casesSummary", { count: dashboard.cases_total, runs: dashboard.recent_runs.length })
              : t("dashboard.loading")}
          </p>

          <div style={s.controlsRow}>
            <Dropdown
              items={agentItems}
              trigger={
                <Button kind="secondary" size="sm" icon="Cpu" iconRight="ChevronDown">
                  {agent?.name ?? t("dashboard.defaultTitle")}
                </Button>
              }
            />
            <Dropdown
              items={rangeItems}
              trigger={
                <Button kind="secondary" size="sm" icon="Calendar">
                  {t("dashboard.rangeLabel", { days: rangeDays })}
                </Button>
              }
            />
            <Button kind="primary" icon="Play" onClick={() => runAll.mutate()} loading={runAll.isPending}>
              {runAll.isPending ? t("dashboard.running") : t("dashboard.runEval", { count: dashboard?.cases_total ?? 0 })}
            </Button>
          </div>
        </div>
      </div>

      {dashboard?.alert && (
        <div style={s.alertBanner(SEV.WARNING.c, SEV.WARNING.bg)}>
          <Icon.AlertTriangle size={16} />
          {dashboard.alert}
        </div>
      )}

      <div style={s.body}>
        {isLoading ? (
          <div style={s.metricsGrid}>
            <Skeleton height={92} />
            <Skeleton height={92} />
            <Skeleton height={92} />
          </div>
        ) : (
          <div style={s.metricsGrid}>
            <MetricCard
              label={t("dashboard.metrics.recall")}
              value={current ? `${Math.round(current.recall * 100)}%` : "—"}
              delta={delta ? delta.recall * 100 : undefined}
              trend={fullTrend.map((p) => p.recall * 100)}
              color="var(--accent)"
            />
            <MetricCard
              label={t("dashboard.metrics.precision")}
              value={current ? `${Math.round(current.precision * 100)}%` : "—"}
              delta={delta ? delta.precision * 100 : undefined}
              trend={fullTrend.map((p) => p.precision * 100)}
              color="var(--ok)"
            />
            <MetricCard
              label={t("dashboard.metrics.citationAccuracy")}
              value={current ? `${Math.round(current.citation_accuracy * 100)}%` : "—"}
              delta={delta ? delta.citation_accuracy * 100 : undefined}
              trend={fullTrend.map((p) => p.citation_accuracy * 100)}
              color="var(--warn)"
            />
          </div>
        )}

        <section>
          {trend.length === 0 ? (
            <EmptyState icon="TrendingUp" title={t("dashboard.metricTrend")} body={t("dashboard.noRuns")} />
          ) : (
            <div style={s.chartCard}>
              <div style={s.chartHeaderRow}>
                <div style={s.sectionHeadingLeft}>
                  <Icon.TrendingUp size={14} />
                  <span style={s.sectionHeadingText}>{t("dashboard.metricTrend")}</span>
                </div>
                <div style={s.legend}>
                  {series.map((sr) => (
                    <span key={sr.name} style={s.legendItem(sr.color)}>
                      <span style={s.legendDash(sr.color)} />
                      {sr.name}
                    </span>
                  ))}
                </div>
              </div>
              <LineChart series={series} w={100_000} />
            </div>
          )}
        </section>

        <section>
          <div style={s.sectionHeaderRow}>
            <div style={s.sectionHeadingLeft}>
              <Icon.History size={14} />
              <span style={s.sectionHeadingText}>{t("dashboard.recentRuns")}</span>
              {selectedRunIds.size > 0 && (
                <span style={s.selectedCount}>{t("dashboard.selectedCount", { count: selectedRunIds.size })}</span>
              )}
            </div>
            <Button kind="primary" size="sm" icon="GitMerge" onClick={handleCompare} disabled={!canCompare}>
              {t("dashboard.compare")}
            </Button>
          </div>
          {runs.length === 0 ? (
            <EmptyState
              icon="FlaskConical"
              title={t("dashboard.recentRuns")}
              body={t("dashboard.noRuns")}
              cta={t("dashboard.configure")}
              onCta={() => router.push(`/agents/${agentId}`)}
            />
          ) : visibleRuns.length === 0 ? (
            <EmptyState icon="FlaskConical" title={t("dashboard.recentRuns")} body={t("dashboard.noRunsInRange", { days: rangeDays })} />
          ) : (
            <div style={s.runsTable}>
              <div style={s.tableHeaderRow}>
                <span />
                <span style={s.tableHeaderCell()}>{t("dashboard.table.ranAt")}</span>
                <span style={s.tableHeaderCell()}>{t("dashboard.table.version")}</span>
                <span style={s.tableHeaderCell()}>{t("dashboard.table.recall")}</span>
                <span style={s.tableHeaderCell()}>{t("dashboard.table.precision")}</span>
                <span style={s.tableHeaderCell()}>{t("dashboard.table.citation")}</span>
                <span style={s.tableHeaderCell("right")}>{t("dashboard.table.pass")}</span>
                <span style={s.tableHeaderCell("right")}>{t("dashboard.table.cost")}</span>
              </div>
              {runGroups.map((g) => {
                const repId = g.runIds[0]!;
                return (
                  <div key={g.key} style={s.tableRow}>
                    <Checkbox checked={selectedRunIds.has(repId)} onChange={() => toggleRun(repId)} />
                    <span style={s.runDateCell}>{formatRunDate(g.ranAt)}</span>
                    <span style={s.versionCell}>{g.version != null ? `v${g.version}` : "—"}</span>
                    <MetricBarCell pct={g.recall} color="var(--accent)" />
                    <MetricBarCell pct={g.precision} color="var(--ok)" />
                    <MetricBarCell pct={g.citationAccuracy} color="var(--warn)" />
                    <span style={s.passCell}>{`${g.passed}/${g.total}`}</span>
                    <span style={s.costCell}>{formatCost(g.costUsd)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {compareVersions && (
        <CompareRunsModal
          agentId={agentId}
          versions={compareVersions}
          onClose={() => setCompareVersions(null)}
          onPromoted={handlePromoted}
        />
      )}
    </AppShell>
  );
}

function MetricBarCell({ pct, color }: { pct: number | null; color: string }) {
  const rounded = pct == null ? null : Math.round(pct * 100);
  return (
    <div style={s.metricBarCell}>
      <div style={s.metricBarTrack}>
        <ProgressBar value={rounded ?? 0} color={color} height={5} />
      </div>
      <span style={s.metricBarPct}>{rounded == null ? "—" : `${rounded}%`}</span>
    </div>
  );
}
