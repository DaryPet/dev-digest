import type { Container } from '../../platform/container.js';
import type { AgentsRepository, AgentRow } from '../agents/repository.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { toAgentDto } from '../agents/helpers.js';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type {
  Agent,
  EvalCase,
  EvalCaseInput,
  EvalDashboard,
  EvalOwnerKind,
  EvalRunRecord,
  EvalRunResult,
  EvalTrendPoint,
  Provider,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { EvalRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
import {
  buildFindingDiffFragment,
  computeAlert,
  extractRunFindings,
  extractRunSnapshot,
  extractRunVersion,
  parseInputMetaCoord,
  scoreCase,
  toEvalCaseDto,
  toEvalRunRecordDto,
} from './helpers.js';
import { aggregateScores, type CaseScore } from './scoring.js';
import type { EvalAgentSummary, EvalCaseStatus, EvalRunSnapshot, RunSnapshot } from './types.js';
import { ALERT_THRESHOLD_PP, EVAL_REVIEW_STRATEGY, RECENT_RUNS_LIMIT } from './constants.js';

/**
 * Eval — application service (spec `specs/eval-pipeline.md`, plan
 * `plans/eval-pipeline.md` T-A).
 *
 * Case CRUD (routes 1-4), from-finding creation (route 6, resolved via the
 * shared `container.reviewRepo`), run execution (routes 7-8, reusing
 * `reviewer-core`'s `reviewPullRequest` — the SAME engine + grounding gate
 * the normal PR review path uses), code-only scoring (`scoring.ts`), the
 * dashboard aggregate (routes 9-12, D4 — always derived by grouping/summing
 * persisted per-case rows within a version-group, never stored separately),
 * and Promote (route 13, §6.4 — `setSkills` BEFORE `update`, order load-bearing).
 *
 * Cross-domain reads go through `container.agentsRepo`/`container.reviewRepo`
 * (never `new AgentsRepository(...)`/`new ReviewRepository(...)`); `eval_cases`/
 * `eval_runs` are this module's OWN tables, owned by `EvalRepository`.
 */
export class EvalService {
  private repo: EvalRepository;
  private agentsRepo: AgentsRepository;
  private reviewRepo: ReviewRepository;

  constructor(
    private container: Container,
    overrides?: {
      evalRepo?: EvalRepository;
      agentsRepo?: AgentsRepository;
      reviewRepo?: ReviewRepository;
    },
  ) {
    this.repo = overrides?.evalRepo ?? new EvalRepository(container.db);
    this.agentsRepo = overrides?.agentsRepo ?? container.agentsRepo;
    this.reviewRepo = overrides?.reviewRepo ?? container.reviewRepo;
  }

  // ============================================================ Case CRUD (routes 1-4)

  async listCases(workspaceId: string, agentId: string): Promise<EvalCase[]> {
    await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listCases(workspaceId, 'agent', agentId);
    return rows.map(toEvalCaseDto);
  }

  /** Route 2 — server OVERRIDES `owner_kind`/`owner_id` regardless of body. */
  async createCase(workspaceId: string, agentId: string, input: EvalCaseInput): Promise<EvalCase> {
    await this.requireAgent(workspaceId, agentId);
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files ?? null,
      inputMeta: input.input_meta ?? null,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
    });
    return toEvalCaseDto(row);
  }

  async getCase(workspaceId: string, agentId: string, caseId: string): Promise<EvalCase> {
    await this.requireAgent(workspaceId, agentId);
    const row = await this.requireOwnedCase(workspaceId, agentId, caseId);
    return toEvalCaseDto(row);
  }

  /** Route 4 — full replace (editor Save). Owner is re-pinned to `:id`, same
   *  as create, so a tampered body can never reassign a case to another agent. */
  async updateCase(
    workspaceId: string,
    agentId: string,
    caseId: string,
    input: EvalCaseInput,
  ): Promise<EvalCase> {
    await this.requireAgent(workspaceId, agentId);
    await this.requireOwnedCase(workspaceId, agentId, caseId);
    const row = await this.repo.updateCase(workspaceId, caseId, {
      ownerKind: 'agent',
      ownerId: agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files ?? null,
      inputMeta: input.input_meta ?? null,
      expectedOutput: input.expected_output,
      notes: input.notes ?? null,
    });
    if (!row) throw new NotFoundError('Eval case not found');
    return toEvalCaseDto(row);
  }

  /** Route 14 (new) — delete a case. Ownership re-verified via
   *  `requireOwnedCase` (same pattern as update/get), repo call is itself
   *  workspace-scoped as a second guard; `eval_runs` cascade via the DB FK,
   *  no explicit run deletion needed. */
  async deleteCase(workspaceId: string, agentId: string, caseId: string): Promise<void> {
    await this.requireAgent(workspaceId, agentId);
    await this.requireOwnedCase(workspaceId, agentId, caseId);
    const ok = await this.repo.deleteCase(workspaceId, caseId);
    if (!ok) throw new NotFoundError('Eval case not found');
  }

  /** Route 5 — AC-18: status from the case's row in the CURRENT version-group
   *  (`agent.version`); no row in that group → 'never-run'. */
  async listCaseStatuses(workspaceId: string, agentId: string): Promise<EvalCaseStatus[]> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    const runs = await this.repo.runsForCases(cases.map((c) => c.id));
    return cases.map((kase) => {
      const currentRun = runs.find(
        (r) => r.caseId === kase.id && extractRunVersion(r.actualOutput) === agent.version,
      );
      const coord = parseInputMetaCoord(kase.inputMeta);
      return {
        case_id: kase.id,
        name: kase.name,
        status: currentRun ? (currentRun.pass ? 'passing' : 'failing') : 'never-run',
        severity: coord?.severity ?? null,
        category: coord?.category ?? null,
        title: coord?.title ?? null,
        last_run: currentRun ? toEvalRunRecordDto(currentRun, kase.name) : null,
      };
    });
  }

  // ============================================================ From-finding creation (route 6)

  /**
   * Route 6 — "Turn into eval case" (AC-1-6). Resolves finding -> review ->
   * agent -> PR files entirely server-side via `container.reviewRepo`
   * (§6.1). Workspace-scoped defensively via `getPull` (`getFinding` itself
   * is not workspace-scoped — see security note in the handoff report).
   */
  async createCaseFromFinding(workspaceId: string, findingId: string): Promise<EvalCase> {
    const finding = await this.reviewRepo.getFinding(findingId);
    if (!finding) throw new NotFoundError('Finding not found');

    const review = await this.reviewRepo.getReview(finding.reviewId);
    if (!review) throw new NotFoundError('Finding not found');
    if (!review.agentId) {
      throw new ValidationError('Finding has no associated agent to own the eval case');
    }

    // Workspace-scoping: getFinding/getReview aren't workspace-scoped, so
    // verify the owning PR is actually in the caller's workspace via the
    // scoped getPull — 404 (not leaking existence) if it isn't.
    const pull = await this.reviewRepo.getPull(workspaceId, review.prId);
    if (!pull) throw new NotFoundError('Finding not found');

    if (!finding.acceptedAt && !finding.dismissedAt) {
      throw new ValidationError('Finding must be accepted or dismissed to create an eval case');
    }

    const prFiles = await this.reviewRepo.getPrFiles(review.prId);
    const prFile = prFiles.find((f) => f.path === finding.file);
    const { input_diff, input_files } = buildFindingDiffFragment(finding.file, prFile?.patch ?? '');

    const input_meta = {
      file: finding.file,
      start_line: finding.startLine,
      end_line: finding.endLine,
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
    };

    // AC-1/AC-2/D1: accepted -> one-element must_find skeleton; dismissed -> [].
    const expected_output = finding.acceptedAt
      ? [
          {
            file: finding.file,
            start_line: finding.startLine,
            end_line: finding.endLine,
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
          },
        ]
      : [];

    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: review.agentId,
      name: finding.title,
      inputDiff: input_diff,
      inputFiles: input_files,
      inputMeta: input_meta,
      expectedOutput: expected_output,
      notes: null,
    });
    return toEvalCaseDto(row);
  }

  // ============================================================ Run execution (routes 7-8)

  /** Route 7 — run ONE case against the agent's current live snapshot. */
  async runCase(workspaceId: string, agentId: string, caseId: string): Promise<EvalRunResult> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const kase = await this.requireOwnedCase(workspaceId, agentId, caseId);
    const snapshot = await this.buildSnapshot(agent);
    return this.executeCase(kase, agent, snapshot);
  }

  /**
   * Route 8 — run every case owned by the agent. AC-9: a case's execution
   * failure still persists that case's row and does NOT abort remaining
   * cases (`executeCase` never rethrows). AC-10: every case in this
   * invocation runs against the identical agent snapshot (built ONCE, before
   * the loop).
   */
  async runAll(workspaceId: string, agentId: string): Promise<EvalRunResult[]> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    if (cases.length === 0) return [];
    const snapshot = await this.buildSnapshot(agent);
    const results: EvalRunResult[] = [];
    for (const kase of cases) {
      results.push(await this.executeCase(kase, agent, snapshot));
    }
    return results;
  }

  /** Route 9 — every persisted run for this agent's cases, `ran_at` desc. */
  async listRuns(workspaceId: string, agentId: string): Promise<EvalRunRecord[]> {
    await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    const caseById = new Map(cases.map((c) => [c.id, c]));
    const runs = await this.repo.runsForCases(cases.map((c) => c.id));
    return runs.map((r) => toEvalRunRecordDto(r, caseById.get(r.caseId)?.name ?? null));
  }

  /** Route 10 — the run snapshot for a given version-group (Compare/Promote). */
  async getRunSnapshot(workspaceId: string, agentId: string, version: number): Promise<EvalRunSnapshot> {
    await this.requireAgent(workspaceId, agentId);
    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    const runs = await this.repo.runsForCases(cases.map((c) => c.id));
    const match = runs.find((r) => extractRunVersion(r.actualOutput) === version);
    if (!match) throw new NotFoundError('Eval run snapshot not found');
    const snapshot = extractRunSnapshot(match.actualOutput);
    if (!snapshot) throw new NotFoundError('Eval run snapshot not found');
    return { ...snapshot, ran_at: match.ranAt.toISOString() };
  }

  // ============================================================ Dashboard (routes 11-12)

  /** Route 11 — aggregate dashboard for an owner, or workspace-wide when both
   *  `ownerKind`/`ownerId` are omitted. */
  async dashboard(
    workspaceId: string,
    ownerKind?: EvalOwnerKind,
    ownerId?: string,
  ): Promise<EvalDashboard> {
    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    const caseById = new Map(cases.map((c) => [c.id, c]));
    const runs = await this.repo.runsForCases(cases.map((c) => c.id)); // ran_at desc

    // D4 — group per-case rows by the version-group embedded in their
    // snapshot; "current" = the group with the max version among those present.
    const groups = new Map<number, EvalRunRow[]>();
    for (const run of runs) {
      const version = extractRunVersion(run.actualOutput);
      if (version === null) continue; // malformed/legacy row — excluded from grouping
      const list = groups.get(version) ?? [];
      list.push(run);
      groups.set(version, list);
    }
    const versionsDesc = [...groups.keys()].sort((a, b) => b - a);
    const currentVersion = versionsDesc[0];
    const previousVersion = versionsDesc[1];

    const currentSummary =
      currentVersion !== undefined ? this.summarizeGroup(groups.get(currentVersion)!, caseById) : null;
    const previousSummary =
      previousVersion !== undefined ? this.summarizeGroup(groups.get(previousVersion)!, caseById) : null;

    const current = currentSummary ?? {
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      traces_passed: 0,
      traces_total: 0,
      cost_usd: null,
      ran_at: null,
    };

    const delta = {
      recall: previousSummary ? current.recall - previousSummary.recall : 0,
      precision: previousSummary ? current.precision - previousSummary.precision : 0,
      citation_accuracy: previousSummary
        ? current.citation_accuracy - previousSummary.citation_accuracy
        : 0,
    };

    const alert = computeAlert(current, previousSummary, ALERT_THRESHOLD_PP);

    // Trend — one point per version-group, chronological (ascending version).
    const trend: EvalTrendPoint[] = versionsDesc
      .slice()
      .sort((a, b) => a - b)
      .map((version) => {
        const summary = this.summarizeGroup(groups.get(version)!, caseById);
        return {
          ran_at: summary.ran_at ?? new Date(0).toISOString(),
          recall: summary.recall,
          precision: summary.precision,
          citation_accuracy: summary.citation_accuracy,
          pass_rate: summary.traces_total === 0 ? 1 : summary.traces_passed / summary.traces_total,
          cost_usd: summary.cost_usd,
        };
      });

    const recentRuns = runs
      .slice(0, RECENT_RUNS_LIMIT)
      .map((r) => toEvalRunRecordDto(r, caseById.get(r.caseId)?.name ?? null));

    return {
      owner_kind: ownerKind ?? null,
      owner_id: ownerId ?? null,
      cases_total: cases.length,
      current: {
        recall: current.recall,
        precision: current.precision,
        citation_accuracy: current.citation_accuracy,
        traces_passed: current.traces_passed,
        traces_total: current.traces_total,
        cost_usd: current.cost_usd,
      },
      delta,
      trend,
      recent_runs: recentRuns,
      alert,
    };
  }

  /** Route 12 — one summary per agent owning >=1 eval case (AC-29). */
  async dashboardAgents(workspaceId: string): Promise<EvalAgentSummary[]> {
    const cases = await this.repo.listCases(workspaceId);
    const agentIds = [...new Set(cases.filter((c) => c.ownerKind === 'agent').map((c) => c.ownerId))];
    const summaries: EvalAgentSummary[] = [];
    for (const agentId of agentIds) {
      const agent = await this.agentsRepo.getById(workspaceId, agentId);
      if (!agent) continue; // orphaned owner id — skip rather than 500
      const dashboard = await this.dashboard(workspaceId, 'agent', agentId);
      summaries.push({ agent_id: agent.id, agent_name: agent.name, dashboard });
    }
    return summaries;
  }

  // ============================================================ Promote (route 13)

  /**
   * Route 13 — apply a version-group's run snapshot as the agent's live
   * config (D8). §6.4: `setSkills` FIRST (no version bump), THEN `update`
   * (bumps version + snapshots — `snapshotVersion()` reads CURRENT skills, so
   * reversing this order would snapshot the OLD skill set into the new
   * `agent_versions` row).
   */
  async promoteConfig(workspaceId: string, agentId: string, version: number): Promise<Agent> {
    await this.requireAgent(workspaceId, agentId);
    const snapshot = await this.getRunSnapshot(workspaceId, agentId, version);

    await this.agentsRepo.setSkills(agentId, snapshot.skills); // 1) skills FIRST
    const updated = await this.agentsRepo.update(workspaceId, agentId, {
      model: snapshot.model,
      systemPrompt: snapshot.system_prompt,
    }); // 2) bumps version + snapshots (reads current skills)
    if (!updated) throw new NotFoundError('Agent not found');
    return toAgentDto(updated);
  }

  // ============================================================ internals

  private async requireAgent(workspaceId: string, agentId: string): Promise<AgentRow> {
    const agent = await this.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private async requireOwnedCase(
    workspaceId: string,
    agentId: string,
    caseId: string,
  ): Promise<EvalCaseRow> {
    const row = await this.repo.getCase(workspaceId, caseId);
    if (!row || row.ownerKind !== 'agent' || row.ownerId !== agentId) {
      throw new NotFoundError('Eval case not found');
    }
    return row;
  }

  /**
   * Agent snapshot for a run invocation (D3). `skills` in the snapshot is
   * EVERY linked skill id (mirrors `agent_versions.configJson.skills`'s
   * format, built from `skillIdsForAgent` — NOT filtered by enabled); the
   * prompt itself only receives ENABLED skill bodies, matching the normal
   * review pipeline (`run-executor.ts`) exactly.
   */
  private async buildSnapshot(
    agent: AgentRow,
  ): Promise<{ runSnapshot: RunSnapshot; skillBodies: string[] }> {
    const linkedSkills = await this.agentsRepo.linkedSkills(agent.id);
    return {
      runSnapshot: {
        system_prompt: agent.systemPrompt,
        model: agent.model,
        skills: linkedSkills.map((l) => l.skill.id),
        version: agent.version,
      },
      skillBodies: linkedSkills.filter((l) => l.skill.enabled).map((l) => l.skill.body),
    };
  }

  /**
   * Execute one case: parse its diff fragment, run it through
   * `reviewPullRequest` (SAME engine + citation-grounding gate as a normal
   * PR review — no parallel review path), score it (code-only), and persist
   * the row. Never rethrows (AC-9) — a failure still persists a row and
   * returns the degenerate `EvalRun` shape (spec §6.3).
   */
  private async executeCase(
    kase: EvalCaseRow,
    agent: AgentRow,
    snapshot: { runSnapshot: RunSnapshot; skillBodies: string[] },
  ): Promise<EvalRunResult> {
    const start = Date.now();
    try {
      const llm = await this.container.llm(agent.provider as Provider);
      const diff = parseUnifiedDiff(kase.inputDiff ?? '');
      const outcome = await reviewPullRequest({
        systemPrompt: snapshot.runSnapshot.system_prompt,
        model: snapshot.runSnapshot.model,
        diff,
        llm,
        strategy: EVAL_REVIEW_STRATEGY,
        ...(snapshot.skillBodies.length > 0 ? { skills: snapshot.skillBodies } : {}),
        task: `Eval case: ${kase.name}`,
      });
      const findings = outcome.review.findings;
      const durationMs = Date.now() - start;
      const score = scoreCase(kase, findings);
      const agg = aggregateScores([score]);
      const actualOutput = { findings, snapshot: snapshot.runSnapshot };

      const row = await this.repo.insertRun({
        caseId: kase.id,
        actualOutput,
        pass: score.pass,
        recall: agg.recall,
        precision: agg.precision,
        citationAccuracy: agg.citation_accuracy,
        durationMs,
        costUsd: outcome.costUsd,
      });

      return {
        run_id: row.id,
        case_id: kase.id,
        result: {
          recall: agg.recall,
          precision: agg.precision,
          citation_accuracy: agg.citation_accuracy,
          traces_passed: agg.traces_passed,
          traces_total: agg.traces_total,
          duration_ms: durationMs,
          cost_usd: outcome.costUsd,
          per_trace: [{ name: kase.name, pass: score.pass, expected: kase.expectedOutput, actual: findings }],
        },
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      // The agent snapshot itself is known even though the LLM call failed —
      // store it (with empty findings) so version-group correlation (status
      // list, dashboard grouping, Compare/Promote) still works for this row.
      const actualOutput = { findings: [], snapshot: snapshot.runSnapshot };
      const row = await this.repo.insertRun({
        caseId: kase.id,
        actualOutput,
        pass: false,
        recall: null,
        precision: null,
        citationAccuracy: null,
        durationMs,
        costUsd: null,
      });

      return {
        run_id: row.id,
        case_id: kase.id,
        result: {
          recall: 0,
          precision: 0,
          citation_accuracy: 0,
          traces_passed: 0,
          traces_total: 1,
          duration_ms: durationMs,
          cost_usd: null,
          per_trace: [
            {
              name: kase.name,
              pass: false,
              expected: kase.expectedOutput,
              actual: { error: (err as Error).message },
            },
          ],
        },
      };
    }
  }

  /**
   * Aggregate one version-group of persisted rows (D4 — always derived by
   * grouping/summing per-case rows, never stored separately). recall/
   * precision/citation_accuracy are re-derived (via `scoreCase` +
   * `aggregateScores`, the SAME pure scoring used at run time) from ONLY the
   * successfully-executed rows in the group (`recall !== null`); a failed
   * row still counts toward `traces_total` (and never toward
   * `traces_passed`, since its persisted `pass` is always false) via its own
   * stored `pass` field, decoupled from the recall/precision recompute.
   */
  private summarizeGroup(
    groupRuns: EvalRunRow[],
    caseById: Map<string, EvalCaseRow>,
  ): {
    recall: number;
    precision: number;
    citation_accuracy: number;
    traces_passed: number;
    traces_total: number;
    cost_usd: number | null;
    ran_at: string;
  } {
    const successfulScores: CaseScore[] = [];
    let costSum: number | null = null;
    let passedCount = 0;
    for (const r of groupRuns) {
      if (r.pass) passedCount++;
      if (r.costUsd != null) costSum = (costSum ?? 0) + r.costUsd;
      if (r.recall === null) continue; // execution failure — excluded from the metric recompute
      const kase = caseById.get(r.caseId);
      if (!kase) continue;
      successfulScores.push(scoreCase(kase, extractRunFindings(r.actualOutput)));
    }
    const agg = aggregateScores(successfulScores);
    const ranAt = groupRuns.reduce((max, r) => (r.ranAt > max ? r.ranAt : max), groupRuns[0]!.ranAt);
    return {
      recall: agg.recall,
      precision: agg.precision,
      citation_accuracy: agg.citation_accuracy,
      traces_passed: passedCount,
      traces_total: groupRuns.length,
      cost_usd: costSum,
      ran_at: ranAt.toISOString(),
    };
  }
}
