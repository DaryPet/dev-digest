/* Eval Dashboard — multi-agent overview, /eval-dashboard. Standalone SKILLS
   LAB page (nav.ts) listing every agent that owns at least one eval case
   (AC-28/29), a "Run all agents" batch trigger (AC-30), and a flat, newest-
   first "Recent eval runs · all agents" table (AC-31). The per-agent detail
   view (metric cards, trend chart, Compare) lives at ./[agentId]/page.tsx.
   Spec: specs/eval-pipeline.md SPEC-03 Group F. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon, ProgressBar, Skeleton, Sparkline } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { useEvalAgentSummaries, useRunAllEvals, type EvalAgentSummary } from "@/lib/hooks/eval";
import { snapshotVersion } from "./[agentId]/helpers";
import { s } from "./styles";

/** One row of "Recent eval runs · all agents" — a whole batch (all cases run
    together at one snapshot version), not one row per case (design mock has
    no case column; AGENT/DATE/VERSION/bars/pass-count only). Case-level
    `EvalRunRecord`s sharing an agent+version are grouped and their metrics
    averaged, mirroring `CompareRunsModal/helpers.ts`'s `metricsForVersion`
    resolution (same "no version on EvalTrendPoint" constraint, see
    client/INSIGHTS.md 2026-07-17). */
interface RecentRunGroup {
  key: string;
  agentId: string;
  agentName: string;
  version: number | null;
  ranAt: string;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  passed: number;
  total: number;
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

function formatRunDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Mounted once per agent, always — fires that agent's `useRunAllEvals`
    mutation whenever `generation` advances past what this instance already
    fired (AC-30's "loop useRunAllEvals per agent id"). Renders nothing; each
    instance owns its OWN hook call, since the hook's mutationFn is bound to a
    single fixed agentId and can't be reused across ids from one call site. */
function AgentRunTrigger({
  agentId,
  generation,
  onSettled,
}: {
  agentId: string;
  generation: number;
  onSettled: () => void;
}) {
  const runAll = useRunAllEvals(agentId);
  const firedGen = React.useRef(0);
  React.useEffect(() => {
    if (generation > 0 && generation !== firedGen.current) {
      firedGen.current = generation;
      runAll.mutate(undefined, { onSettled });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);
  return null;
}

export default function EvalDashboardOverviewPage() {
  const t = useTranslations("eval");
  const { data: summaries, isLoading } = useEvalAgentSummaries();
  const { data: agents } = useAgents();
  const modelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const ag of agents ?? []) map.set(ag.id, ag.model);
    return map;
  }, [agents]);

  const [runGeneration, setRunGeneration] = React.useState(0);
  const [settledCount, setSettledCount] = React.useState(0);

  const agentIds = React.useMemo(() => (summaries ?? []).map((a) => a.agent_id), [summaries]);
  const runningAll = runGeneration > 0 && settledCount < agentIds.length;

  const handleRunAll = () => {
    if (agentIds.length === 0) return; // AC edge case: no-op on an empty case set, not an error.
    setSettledCount(0);
    setRunGeneration((g) => g + 1);
  };

  const recentRunGroups: RecentRunGroup[] = React.useMemo(() => {
    const buckets = new Map<string, { agentId: string; agentName: string; version: number | null; runs: EvalRunRecord[] }>();
    for (const a of summaries ?? []) {
      for (const r of a.dashboard.recent_runs) {
        const version = snapshotVersion(r);
        const key = `${a.agent_id}:${version ?? r.id}`;
        const bucket = buckets.get(key) ?? { agentId: a.agent_id, agentName: a.agent_name, version, runs: [] };
        bucket.runs.push(r);
        buckets.set(key, bucket);
      }
    }
    return Array.from(buckets.entries())
      .map(([key, b]) => {
        const ranAt = b.runs.reduce((latest, r) => (new Date(r.ran_at) > new Date(latest) ? r.ran_at : latest), b.runs[0]!.ran_at);
        return {
          key,
          agentId: b.agentId,
          agentName: b.agentName,
          version: b.version,
          ranAt,
          recall: average(b.runs.map((r) => r.recall)),
          precision: average(b.runs.map((r) => r.precision)),
          citationAccuracy: average(b.runs.map((r) => r.citation_accuracy)),
          passed: b.runs.filter((r) => r.pass).length,
          total: b.runs.length,
        };
      })
      .sort((a, b) => new Date(b.ranAt).getTime() - new Date(a.ranAt).getTime());
  }, [summaries]);

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];

  return (
    <AppShell crumb={crumb}>
      {agentIds.map((id) => (
        <AgentRunTrigger key={id} agentId={id} generation={runGeneration} onSettled={() => setSettledCount((c) => c + 1)} />
      ))}

      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("overview.title")}</h1>
          <p style={s.pageSubtitle}>{t("overview.subtitle")}</p>
        </div>
        <Button
          kind="primary"
          icon="RefreshCw"
          onClick={handleRunAll}
          disabled={runningAll || agentIds.length === 0}
          loading={runningAll}
        >
          {runningAll ? t("overview.running") : t("overview.runAllAgents")}
        </Button>
      </div>

      <div style={s.body}>
        {isLoading ? (
          <div style={s.agentList}>
            <Skeleton height={56} />
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        ) : (summaries ?? []).length === 0 ? (
          <EmptyState icon="FlaskConical" title={t("overview.emptyTitle")} body={t("overview.emptyBody")} />
        ) : (
          <>
            <section>
              <div style={s.sectionHeadingRow}>
                <Icon.Cpu size={14} />
                <span style={s.sectionHeadingText}>{t("overview.agentsTitle")}</span>
              </div>
              <div style={s.agentList}>
                {(summaries ?? []).map((a) => (
                  <AgentRow key={a.agent_id} summary={a} model={modelById.get(a.agent_id)} />
                ))}
              </div>
            </section>

            <section>
              <div style={s.sectionHeadingRow}>
                <Icon.History size={14} />
                <span style={s.sectionHeadingText}>{t("overview.recentRunsTitle")}</span>
              </div>
              {recentRunGroups.length === 0 ? (
                <EmptyState icon="History" title={t("overview.recentRunsTitle")} body={t("overview.noRecentRuns")} />
              ) : (
                <div style={s.table}>
                  {recentRunGroups.map((g) => (
                    <RecentRunGroupRow key={g.key} group={g} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function AgentRow({ summary, model }: { summary: EvalAgentSummary; model?: string }) {
  const t = useTranslations("eval");
  const { current, recent_runs } = summary.dashboard;
  const trend = summary.dashboard.trend.map((p) => p.recall * 100);
  const lastRun = recent_runs[0];
  const version = lastRun ? snapshotVersion(lastRun) : null;

  return (
    <Link href={`/eval-dashboard/${summary.agent_id}`} style={s.agentRow}>
      <div style={s.agentIconBox}>
        <Icon.Cpu size={15} />
      </div>

      <div style={s.agentInfo}>
        <div style={s.agentNameRow}>
          <span style={s.agentName}>{summary.agent_name}</span>
          {model && <span className="mono" style={s.agentModelChip}>{model}</span>}
        </div>
        <span style={s.agentMeta}>
          {lastRun && version != null
            ? t("overview.lastRun", {
                version,
                date: new Date(lastRun.ran_at).toLocaleString(),
                passed: current.traces_passed,
                total: current.traces_total,
              })
            : t("overview.neverRun", { passed: current.traces_passed, total: current.traces_total })}
        </span>
      </div>

      {trend.length >= 2 && (
        <div style={s.agentTrend}>
          <Sparkline data={trend} w={72} h={24} />
        </div>
      )}

      <div style={s.agentMetrics}>
        <div style={s.agentMetric}>
          <span style={s.agentMetricLabel}>{t("overview.metrics.recall")}</span>
          <span style={s.agentMetricValue("var(--accent)")}>{Math.round(current.recall * 100)}%</span>
        </div>
        <div style={s.agentMetric}>
          <span style={s.agentMetricLabel}>{t("overview.metrics.precision")}</span>
          <span style={s.agentMetricValue("var(--ok)")}>{Math.round(current.precision * 100)}%</span>
        </div>
        <div style={s.agentMetric}>
          <span style={s.agentMetricLabel}>{t("overview.metrics.citation")}</span>
          <span style={s.agentMetricValue("var(--warn)")}>{Math.round(current.citation_accuracy * 100)}%</span>
        </div>
      </div>

      <span style={s.agentChevron}>
        <Icon.ChevronRight size={16} />
      </span>
    </Link>
  );
}

function RecentRunGroupRow({ group }: { group: RecentRunGroup }) {
  return (
    <div style={s.row}>
      <span style={s.cellPrimary}>{group.agentName}</span>
      <span style={s.runDate}>{formatRunDate(group.ranAt)}</span>
      <span style={s.versionTag}>{group.version != null ? `v${group.version}` : "—"}</span>
      <MetricBarCell pct={group.recall} color="var(--accent)" />
      <MetricBarCell pct={group.precision} color="var(--ok)" />
      <MetricBarCell pct={group.citationAccuracy} color="var(--warn)" />
      <span style={s.passCount}>{group.total > 0 ? `${group.passed}/${group.total}` : "—"}</span>
    </div>
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
