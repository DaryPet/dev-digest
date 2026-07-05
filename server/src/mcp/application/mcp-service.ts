/**
 * McpService — orchestration layer for the 5 MCP tools. SDK-FREE.
 *
 * This is the application layer: it wires the domain (ReviewService,
 * agentsRepo, mcp.repository, runBus) with the compact MCP output shapes.
 * Tool handlers in tools/*.ts call these methods and convert the result to
 * CallToolResult via toolError / toolSuccess.
 *
 * Design principles enforced here:
 *   P1 — result-not-operation: runAgentOnPr blocks until complete.
 *   P3 — compact whitelisted outputs: mappers strip heavy fields.
 *   P4 — errors lead forward: every error path returns { message, next }.
 */
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewService } from '../../modules/reviews/service.js';
import { McpRepository } from '../infrastructure/mcp.repository.js';
import { waitForRun } from './wait-for-run.js';
import { toMcpAgent, toMcpFinding, toMcpConvention } from '../helpers.js';
import type { McpAgent, McpFinding, McpConvention } from '../helpers.js';
import type { McpContext } from '../infrastructure/env.js';

// ---------------------------------------------------------------------------
// P4 error payloads (frozen messages from §5.3)
// ---------------------------------------------------------------------------

export interface McpError {
  kind: 'error';
  message: string;
  next?: string;
}

export type McpResult<T> = { kind: 'ok'; data: T } | McpError;

function ok<T>(data: T): McpResult<T> {
  return { kind: 'ok', data };
}

function err(message: string, next?: string): McpError {
  return { kind: 'error', message, next };
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface ListAgentsResult {
  agents: McpAgent[];
}

export interface RunResult {
  runId: string;
  verdict: string;
  findings: McpFinding[];
}

export interface GetConventionsResult {
  conventions: McpConvention[];
}

// ---------------------------------------------------------------------------
// Testable sub-interfaces (injected in tests, created from container in prod)
// ---------------------------------------------------------------------------

/**
 * Minimal interface of ReviewService methods McpService actually calls.
 * Defined here so tests can inject a stub without the full service.
 */
export interface IReviewService {
  resolveTargets: ReviewService['resolveTargets'];
  runReview: ReviewService['runReview'];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class McpService {
  private reviewService: IReviewService;
  private mcpRepo: McpRepository;

  constructor(
    private container: Container,
    private ctx: McpContext,
    overrides?: {
      reviewService?: IReviewService;
      mcpRepo?: McpRepository;
    },
  ) {
    this.reviewService = overrides?.reviewService ?? new ReviewService(container);
    this.mcpRepo = overrides?.mcpRepo ?? new McpRepository(container.db);
  }

  // -------------------------------------------------------------------------
  // Resolve workspace ID (lazy — falls back to DB default workspace)
  // -------------------------------------------------------------------------

  private _workspaceId?: string;

  async resolveWorkspaceId(): Promise<string> {
    if (this._workspaceId) return this._workspaceId;
    if (this.ctx.workspaceId) {
      this._workspaceId = this.ctx.workspaceId;
      return this._workspaceId;
    }
    const ws = await this.container.auth.currentWorkspace(null);
    this._workspaceId = ws.id;
    return this._workspaceId;
  }

  // -------------------------------------------------------------------------
  // list_agents
  // -------------------------------------------------------------------------

  async listAgents(): Promise<McpResult<ListAgentsResult>> {
    const workspaceId = await this.resolveWorkspaceId();
    const rows = await this.container.agentsRepo.list(workspaceId);
    // Whitelist via the single toMcpAgent mapper (strips system_prompt etc.)
    const agents: McpAgent[] = rows.map(toMcpAgent);
    return ok({ agents });
  }

  // -------------------------------------------------------------------------
  // run_agent_on_pr (blocking)
  // -------------------------------------------------------------------------

  async runAgentOnPr(
    repoFullName: string,
    prNumber: number,
    agentId: string,
  ): Promise<McpResult<RunResult>> {
    const workspaceId = await this.resolveWorkspaceId();

    // 1. Resolve repo
    const repo = await this.mcpRepo.repoByFullName(workspaceId, repoFullName);
    if (!repo) {
      return err(
        `repo "${repoFullName}" not found in this workspace`,
        'add it in DevDigest, then retry',
      );
    }

    // 2. Resolve PR (must already be imported)
    const pr = await this.mcpRepo.prByRepoAndNumber(repo.id, prNumber);
    if (!pr) {
      return err(
        `PR #${prNumber} not found for ${repoFullName}`,
        'open the PR in DevDigest to import it, then retry',
      );
    }

    // 3. Resolve agent (P4 if not found)
    let targets: Awaited<ReturnType<IReviewService['resolveTargets']>>;
    try {
      targets = await this.reviewService.resolveTargets(workspaceId, { agentId });
    } catch (e) {
      if (e instanceof NotFoundError) {
        return err('agent not found', 'call list_agents to get a valid agent id');
      }
      throw e;
    }

    // 4. Start the review (fire-and-forget background run; returns runId immediately)
    const { runs } = await this.reviewService.runReview(workspaceId, pr.id, targets);
    const runId = runs[0]?.run_id;
    if (!runId) {
      return err('failed to create review run', 'retry or check DevDigest');
    }

    // 5. Block until the run completes (P1)
    const waited = await waitForRun(this.container.runBus, runId, this.ctx.runTimeoutMs);
    if (waited.timedOut) {
      return err(
        `run ${runId} is still running after ${waited.elapsedMs}ms`,
        `call get_findings with runId=${runId} once it finishes`,
      );
    }

    // 6. Read result from DB
    return this._readRunResult(runId);
  }

  // -------------------------------------------------------------------------
  // get_findings
  // -------------------------------------------------------------------------

  async getFindings(runId: string): Promise<McpResult<RunResult>> {
    const agentRun = await this.mcpRepo.runStatusById(runId);
    if (!agentRun) {
      return err(
        `run ${runId} is not a completed run`,
        'wait for it to finish, or start one with run_agent_on_pr',
      );
    }

    // Check if the run is still in progress
    if (agentRun.status === 'running') {
      return err(
        `run ${runId} is not a completed run`,
        'wait for it to finish, or start one with run_agent_on_pr',
      );
    }

    // Check if the run failed or was cancelled
    if (agentRun.status === 'failed' || agentRun.status === 'cancelled') {
      const reason = agentRun.error ?? agentRun.status;
      return err(
        `run ${runId} did not complete: ${reason}`,
        'check the run in DevDigest or start a new run',
      );
    }

    return this._readRunResult(runId);
  }

  // -------------------------------------------------------------------------
  // get_conventions
  // -------------------------------------------------------------------------

  async getConventions(): Promise<McpResult<GetConventionsResult>> {
    if (!this.ctx.repo) {
      return err('no repo configured', 'set the MCP_REPO env var to "owner/name"');
    }

    const workspaceId = await this.resolveWorkspaceId();
    const repo = await this.mcpRepo.repoByFullName(workspaceId, this.ctx.repo);
    if (!repo) {
      return err(
        `repo "${this.ctx.repo}" not found in this workspace`,
        'add it in DevDigest, then retry',
      );
    }

    const rows = await this.mcpRepo.conventionsByRepo(workspaceId, repo.id);
    const conventions = rows.map(toMcpConvention);
    return ok({ conventions });
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async _readRunResult(runId: string): Promise<McpResult<RunResult>> {
    const agentRun = await this.mcpRepo.runStatusById(runId);

    // Check for failed/cancelled via DB status (authoritative per INSIGHTS.md 2026-07-03)
    if (agentRun && (agentRun.status === 'failed' || agentRun.status === 'cancelled')) {
      const reason = agentRun.error ?? agentRun.status;
      return err(
        `run ${runId} did not complete: ${reason}`,
        'check the run in DevDigest or start a new run',
      );
    }

    const result = await this.mcpRepo.reviewWithFindingsByRunId(runId);
    if (!result) {
      // Run completed but no review written — treat as failed
      return err(
        `run ${runId} did not complete: no review produced`,
        'check the run in DevDigest or start a new run',
      );
    }

    const { review, findings } = result;
    return ok({
      runId,
      verdict: review.verdict ?? 'unknown',
      findings: findings.map(toMcpFinding),
    });
  }
}
