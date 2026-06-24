"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore, type IconName } from "@devdigest/ui";
import type { RunSummary, PrCommit, FindingRecord } from "@devdigest/shared";
import { RunCostBadge } from "@/components/RunCostBadge/RunCostBadge";
import { SeverityCounts, FindingsHoverCard } from "@/components/SeverityCounts";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 *
 * The badge reflects the review OUTCOME, not just the run lifecycle: a finished
 * run that found blockers reads "rejected" (red), never a green "done". Outcome
 * is derived from the denormalized blocker/finding counts on the run row, so it
 * matches the CI gate (deterministic) rather than the model's verdict.
 */

type Outcome = { key: string; color: string; bg: string; icon: IconName };

function outcomeOf(run: RunSummary): Outcome {
  const status = run.status ?? "";
  if (status === "running")
    return { key: "running", color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" };
  if (status === "failed")
    return { key: "error", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if (status === "cancelled")
    return { key: "cancelled", color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" };
  // Settled ("done"): color by the deterministic outcome.
  if ((run.blockers ?? 0) > 0)
    return { key: "rejected", color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" };
  if ((run.findings_count ?? 0) > 0)
    return { key: "reviewed", color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" };
  return { key: "approved", color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" };
}

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

// --- CommitRow ---------------------------------------------------------

// Commits are markers, not actions — lighter (dashed, transparent) so they read
// as separators between the runs they sit chronologically between.
const commitRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px dashed var(--border)",
  background: "transparent",
};

const commitShaStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
  flexShrink: 0,
};

const commitMessageStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--text-secondary)",
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const commitAuthorStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  flexShrink: 0,
};

function CommitRow({ commit }: { commit: PrCommit }) {
  return (
    <div style={commitRowStyle}>
      <Icon.GitCommit size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span className="mono" style={commitShaStyle}>
        {commit.sha.slice(0, 7)}
      </span>
      <span style={commitMessageStyle} title={commit.message}>
        {commit.message.split("\n")[0]}
      </span>
      <span style={commitAuthorStyle}>{commit.author}</span>
      {commit.committed_at && (
        <span style={commitAuthorStyle}>{new Date(commit.committed_at).toLocaleTimeString()}</span>
      )}
    </div>
  );
}

// --- RunRow -------------------------------------------------------------

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  textAlign: "left",
};

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
};

const agentNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-primary)",
};

const agentButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  fontWeight: 600,
  color: "var(--text-primary)",
};

const agentModelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 400,
  color: "var(--text-muted)",
};

const errorRowStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--crit)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const findingsRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "var(--text-muted)",
};

const metaColStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 2,
  fontSize: 11,
  color: "var(--text-muted)",
  flexShrink: 0,
};

const deleteBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: 3,
  borderRadius: 5,
  color: "var(--text-muted)",
  flexShrink: 0,
  cursor: "pointer",
};

function RunRow({
  run: r,
  findingsByRunId,
  repoFullName,
  headSha,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  run: RunSummary;
  findingsByRunId?: Map<string, FindingRecord[]>;
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const o = outcomeOf(r);
  const settled = r.status === "done";

  return (
    <div style={rowStyle}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${o.key}`)}
      </Badge>
      {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <div style={agentNameStyle}>
          <button
            type="button"
            onClick={() => onGoToReview?.(r.run_id)}
            title={t("timeline.goToReview")}
            style={{
              ...agentButtonStyle,
              cursor: onGoToReview ? "pointer" : "default",
              textDecoration: onGoToReview ? "underline" : "none",
              textDecorationStyle: "dotted",
              textUnderlineOffset: 3,
            }}
          >
            {r.agent_name ?? "Agent"}
          </button>{" "}
          <span className="mono" style={agentModelStyle}>
            {r.provider}/{r.model}
          </span>
        </div>
        {r.status === "failed" && r.error && (
          <div style={errorRowStyle} title={r.error}>
            {r.error}
          </div>
        )}
        {settled && (
          <div style={findingsRowStyle}>
            <FindingsHoverCard
              items={(findingsByRunId?.get(r.run_id) ?? [])
                .filter((f) => !f.dismissed_at)
                .map((f) => ({
                  severity: f.severity,
                  title: f.title,
                  file: f.file,
                  start_line: f.start_line,
                  category: f.category,
                  confidence: f.confidence,
                  rationale: f.rationale,
                }))}
              repoFullName={repoFullName}
              headSha={headSha}
            >
              <SeverityCounts critical={r.blockers} warning={r.warnings} hideZero size={12.5} />
            </FindingsHoverCard>
            {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
          </div>
        )}
      </div>
      <div style={metaColStyle}>
        {settled && (
          <RunCostBadge cost={r.cost_usd} tokensIn={r.tokens_in} tokensOut={r.tokens_out} variant="detailed" />
        )}
        {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(r.run_id)}
        style={iconBtnStyle}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && r.status !== "running" && (
        <span
          role="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(r.run_id)}
          style={deleteBtnStyle}
        >
          <Icon.Trash size={13} />
        </span>
      )}
    </div>
  );
}

// --- RunHistory -----------------------------------------------------------

export function RunHistory({
  runs,
  commits = [],
  findingsByRunId,
  repoFullName,
  headSha,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** This run's findings, keyed by run_id — feeds the severity-badge hover preview. */
  findingsByRunId?: Map<string, FindingRecord[]>;
  /** owner/repo + head sha — make the hover preview's file:line a GitHub link. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) =>
        item.kind === "commit" ? (
          <CommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <RunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            findingsByRunId={findingsByRunId}
            repoFullName={repoFullName}
            headSha={headSha}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}
