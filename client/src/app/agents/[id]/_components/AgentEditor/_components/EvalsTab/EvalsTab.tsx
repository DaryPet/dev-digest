"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, MetricCard, Modal, SeverityBadge, CategoryTag, Skeleton, Icon, IconBtn, type Category, type Severity } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import {
  useDeleteEvalCase,
  useEvalCaseStatuses,
  useEvalDashboard,
  useRunAllEvals,
  useRunEvalCase,
  type EvalCaseStatus,
} from "@/lib/hooks/eval";
import { EvalCaseEditorModal } from "./_components/EvalCaseEditorModal";
import { s } from "./styles";

/** Evals tab (SPEC-03 Group D, AC-17..22) — this agent's gold-set metrics
    (current version-group vs. the immediately preceding one) plus the case
    list with per-case status/run, "Run all evals", and the new-case editor. */
export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const { data: statuses, isLoading: statusesLoading } = useEvalCaseStatuses(agent.id);
  const { data: dashboard, isLoading: dashboardLoading } = useEvalDashboard("agent", agent.id);
  const runAll = useRunAllEvals(agent.id);

  const [modalCaseId, setModalCaseId] = React.useState<string | null | undefined>(undefined); // undefined = closed

  const cases = statuses ?? [];
  const passing = cases.filter((c) => c.status === "passing").length;

  const trend = dashboard?.trend ?? [];
  const current = dashboard?.current;
  const delta = dashboard?.delta;

  return (
    <div style={s.wrap}>
      <div style={s.metricsLabel}>
        <Icon.Target size={14} style={{ color: "var(--text-secondary)" }} />
        <span style={s.metricsLabelText}>{t("evalsTab.metricsTitle")}</span>
      </div>

      {dashboardLoading ? (
        <div style={s.metricsGrid}>
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
          <Skeleton height={92} />
        </div>
      ) : (
        <div style={s.metricsGrid}>
          <MetricCard
            label={t("evalsTab.metrics.recall")}
            value={current ? `${Math.round(current.recall * 100)}%` : "—"}
            delta={delta ? delta.recall * 100 : undefined}
            trend={trend.map((p) => p.recall * 100)}
          />
          <MetricCard
            label={t("evalsTab.metrics.precision")}
            value={current ? `${Math.round(current.precision * 100)}%` : "—"}
            delta={delta ? delta.precision * 100 : undefined}
            trend={trend.map((p) => p.precision * 100)}
          />
          <MetricCard
            label={t("evalsTab.metrics.citationAccuracy")}
            value={current ? `${Math.round(current.citation_accuracy * 100)}%` : "—"}
            delta={delta ? delta.citation_accuracy * 100 : undefined}
            trend={trend.map((p) => p.citation_accuracy * 100)}
          />
          <MetricCard
            label={t("evalsTab.metrics.tracesPassed")}
            value={current ? `${current.traces_passed}/${current.traces_total}` : "—"}
            trend={trend.map((p) => p.pass_rate * 100)}
          />
        </div>
      )}

      <div style={s.casesHeader}>
        <div style={s.casesHeaderLeft}>
          <h3 style={s.h3}>{t("evalsTab.casesHeading")}</h3>
          {!statusesLoading && (
            <span style={s.passingCounter}>{t("evalsTab.passingCounter", { passing, total: cases.length })}</span>
          )}
        </div>
        <div style={s.headerActions}>
          <Button
            kind="secondary"
            icon="RefreshCw"
            onClick={() => runAll.mutate()}
            disabled={runAll.isPending || cases.length === 0}
            loading={runAll.isPending}
          >
            {runAll.isPending ? t("evalsTab.running") : t("evalsTab.runAll")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={() => setModalCaseId(null)}>
            {t("evalsTab.newCase")}
          </Button>
        </div>
      </div>

      {statusesLoading ? (
        <div style={s.list}>
          <Skeleton height={52} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      ) : cases.length === 0 ? (
        <EmptyState icon="FlaskConical" title={t("evalsTab.casesHeading")} body={t("evalsTab.emptyCases")} />
      ) : (
        <div style={s.list}>
          {cases.map((c) => (
            <EvalCaseRow key={c.case_id} agentId={agent.id} status={c} onEdit={() => setModalCaseId(c.case_id)} />
          ))}
        </div>
      )}

      {modalCaseId !== undefined && (
        <EvalCaseEditorModal
          agentId={agent.id}
          caseId={modalCaseId}
          lastRun={modalCaseId ? cases.find((c) => c.case_id === modalCaseId)?.last_run ?? null : null}
          onClose={() => setModalCaseId(undefined)}
        />
      )}
    </div>
  );
}

const STATUS_COLOR: Record<string, { c: string; bg: string }> = {
  passing: { c: "var(--ok)", bg: "var(--ok-bg)" },
  failing: { c: "var(--crit)", bg: "var(--crit-bg)" },
  "never-run": { c: "var(--text-muted)", bg: "var(--bg-hover)" },
  running: { c: "var(--accent)", bg: "var(--accent-bg)" },
};

function EvalCaseRow({
  agentId,
  status,
  onEdit,
}: {
  agentId: string;
  status: EvalCaseStatus;
  onEdit: () => void;
}) {
  const t = useTranslations("eval");
  const run = useRunEvalCase(agentId, status.case_id);
  const del = useDeleteEvalCase(agentId);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const effectiveStatus = run.isPending ? "running" : status.status;
  const statusColor = STATUS_COLOR[effectiveStatus] ?? STATUS_COLOR["never-run"]!;
  const statusLabel = run.isPending
    ? t("evalsTab.running")
    : status.status === "passing"
      ? t("evalsTab.passed")
      : status.status === "failing"
        ? t("evalsTab.failed")
        : t("evalsTab.neverRun");

  const handleConfirmDelete = () => {
    del.mutate(status.case_id);
    setConfirmDelete(false);
  };

  return (
    <div style={s.row}>
      <div style={s.rowMain}>
        <div style={s.rowNameLine}>
          <span style={s.name}>{status.name}</span>
          <span style={s.statusBadge(statusColor.c, statusColor.bg)}>{statusLabel}</span>
        </div>
        {(status.severity || status.category) && (
          <div style={s.rowMeta}>
            {status.severity && <SeverityBadge severity={status.severity as Severity} compact />}
            {status.category && <CategoryTag category={status.category as Category} />}
          </div>
        )}
      </div>
      <div style={s.rowActions}>
        <IconBtn
          icon="Play"
          label={run.isPending ? t("evalsTab.running") : t("evalsTab.run")}
          onClick={() => !run.isPending && run.mutate()}
        />
        <IconBtn icon="Edit" label={t("evalsTab.edit")} onClick={onEdit} />
        <IconBtn icon="Trash" label={t("evalsTab.delete")} danger onClick={() => setConfirmDelete(true)} />
      </div>

      {confirmDelete && (
        <Modal
          width={420}
          title={t("evalsTab.deleteConfirmTitle")}
          onClose={() => setConfirmDelete(false)}
          footer={
            <div style={s.deleteModalFooter}>
              <Button kind="secondary" onClick={() => setConfirmDelete(false)}>
                {t("caseEditor.cancel")}
              </Button>
              <Button kind="danger" icon="Trash" loading={del.isPending} onClick={handleConfirmDelete}>
                {t("evalsTab.delete")}
              </Button>
            </div>
          }
        >
          <p style={s.deleteModalBody}>{t("evalsTab.deleteConfirmBody", { name: status.name })}</p>
        </Modal>
      )}
    </div>
  );
}
