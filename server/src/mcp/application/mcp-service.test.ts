import { describe, it, expect } from 'vitest';
import { McpService } from './mcp-service.js';
import { RunBus } from '../../platform/sse.js';
import type { McpContext } from '../infrastructure/env.js';
import type { McpRepository } from '../infrastructure/mcp.repository.js';
import type { Container } from '../../platform/container.js';
import type { AgentRow } from '../../db/rows.js';
import { NotFoundError } from '../../platform/errors.js';
import type { IBlastService } from './mcp-service.js';
import type { BlastResponse } from '../../modules/blast/schemas.js';

/**
 * Unit tests for McpService (SDK-free, no real DB, no network).
 *
 * Uses stub McpRepository and stub ReviewService injected via the overrides
 * constructor param. Exercises:
 *   - list_agents: passes through agentsRepo rows as compact McpAgents.
 *   - run_agent_on_pr: repo-not-found → P4; PR-not-found → P4;
 *     agent-not-found → P4; blocking orchestration returns {runId,verdict,findings}.
 *   - get_findings: not-found → P4; running → P4; failed → P4; done → ok.
 *   - get_conventions: MCP_REPO absent → P4; repo-not-found → P4; ok path.
 *   - get_blast_radius: repo-not-found → P4; PR-not-found → P4; ok path.
 */

// ---------------------------------------------------------------------------
// Stub builders
// ---------------------------------------------------------------------------

const DEFAULT_WS = 'ws-test-1';
const DEFAULT_REPO_ID = 'repo-id-1';
const DEFAULT_PR_ID = 'pr-id-1';

const DEFAULT_AGENT_ROW: AgentRow = {
  id: 'agent-1',
  workspaceId: DEFAULT_WS,
  name: 'Security Reviewer',
  description: 'Reviews for security issues',
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  systemPrompt: 'You are a security reviewer.',
  outputSchema: null,
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: true,
  enabled: true,
  version: 1,
  createdBy: null,
  createdAt: new Date('2026-07-05T00:00:00.000Z'),
};

/** Stub McpRepository with preset return values. */
function makeRepo(opts: {
  repo?: ReturnType<McpRepository['repoByFullName']> extends Promise<infer T> ? T : never;
  pr?: ReturnType<McpRepository['prByRepoAndNumber']> extends Promise<infer T> ? T : never;
  reviewResult?: ReturnType<McpRepository['reviewWithFindingsByRunId']> extends Promise<infer T> ? T : never;
  agentRun?: ReturnType<McpRepository['runStatusById']> extends Promise<infer T> ? T : never;
  conventions?: ReturnType<McpRepository['conventionsByRepo']> extends Promise<infer T> ? T : never;
}): McpRepository {
  return {
    repoByFullName: async () => opts.repo,
    prByRepoAndNumber: async () => opts.pr,
    reviewWithFindingsByRunId: async () => opts.reviewResult,
    runStatusById: async () => opts.agentRun,
    conventionsByRepo: async () => opts.conventions ?? [],
  } as unknown as McpRepository;
}

/** Stub AgentsRepository */
function makeAgentsRepo(agents: AgentRow[] = []) {
  return {
    list: async () => agents,
    listEnabled: async () => agents.filter((a) => a.enabled),
    getById: async (_ws: string, id: string) => agents.find((a) => a.id === id),
  };
}

/** Stub Container — minimal subset needed by McpService */
function makeContainer(opts: {
  agents?: AgentRow[];
  workspaceId?: string;
  runBus?: RunBus;
}): Container {
  const bus = opts.runBus ?? new RunBus();
  return {
    auth: {
      currentWorkspace: async () => ({ id: opts.workspaceId ?? DEFAULT_WS, name: 'default' }),
    },
    agentsRepo: makeAgentsRepo(opts.agents ?? [DEFAULT_AGENT_ROW]),
    runBus: bus,
    // Other container fields not needed by these tests:
    db: null as never,
    config: null as never,
    secrets: null as never,
    jobs: null as never,
    git: null as never,
    codeIndex: null as never,
    repoIntel: null as never,
    depgraph: null as never,
    tokenizer: null as never,
    priceBook: null as never,
    reviewRepo: null as never,
    github: null as never,
    llm: null as never,
    embedder: null as never,
    invalidateSecretCaches: () => {},
  } as unknown as Container;
}

/** Stub IReviewService */
function makeReviewService(opts: {
  targets?: AgentRow[];
  runId?: string;
  throwOnResolve?: Error;
}) {
  return {
    resolveTargets: async (_ws: string, { agentId }: { agentId?: string }) => {
      if (opts.throwOnResolve) throw opts.throwOnResolve;
      return opts.targets ?? [DEFAULT_AGENT_ROW];
    },
    runReview: async () => ({
      runs: [{ run_id: opts.runId ?? 'run-1', agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
      reviews: [],
    }),
  };
}

/** Stub IBlastService */
function makeBlastService(opts: {
  result?: BlastResponse;
  throwNotFound?: boolean;
}): IBlastService {
  return {
    getBlast: async (_workspaceId: string, _prId: string) => {
      if (opts.throwNotFound) throw new NotFoundError('Pull request not found');
      if (opts.result) return opts.result;
      throw new Error('makeBlastService: no result configured');
    },
  };
}

const DEFAULT_CTX: McpContext = {
  workspaceId: DEFAULT_WS,
  repo: 'acme/payments-api',
  runTimeoutMs: 30_000,
};

const DEFAULT_REPO_ROW = {
  id: DEFAULT_REPO_ID,
  workspaceId: DEFAULT_WS,
  owner: 'acme',
  name: 'payments-api',
  fullName: 'acme/payments-api',
  defaultBranch: 'main',
  clonePath: null,
  lastPolledAt: null,
  createdBy: null,
  createdAt: new Date(),
};

const DEFAULT_PR_ROW = {
  id: DEFAULT_PR_ID,
  workspaceId: DEFAULT_WS,
  repoId: DEFAULT_REPO_ID,
  number: 42,
  title: 'Add rate limiting',
  author: 'alice',
  branch: 'feat/rl',
  base: 'main',
  headSha: 'a1b2c3d4',
  lastReviewedSha: null,
  additions: 10,
  deletions: 2,
  filesCount: 3,
  status: 'needs_review',
  body: null,
  openedAt: null,
  updatedAt: null,
};

const DEFAULT_REVIEW_ROW = {
  id: 'review-1',
  workspaceId: DEFAULT_WS,
  prId: DEFAULT_PR_ID,
  agentId: 'agent-1',
  runId: 'run-1',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'Found security issues.',
  score: 40,
  model: 'deepseek/deepseek-v4-flash',
  createdAt: new Date(),
};

const DEFAULT_FINDING_ROW = {
  id: 'finding-1',
  reviewId: 'review-1',
  file: 'src/config.ts',
  startLine: 11,
  endLine: 11,
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hardcoded Stripe key',
  rationale: 'Live key committed.',
  suggestion: 'Use env var.',
  confidence: 0.95,
  kind: 'finding',
  trifectaComponents: null,
  acceptedAt: null,
  dismissedAt: null,
};

const DEFAULT_AGENT_RUN_ROW = {
  id: 'run-1',
  workspaceId: DEFAULT_WS,
  agentId: 'agent-1',
  prId: DEFAULT_PR_ID,
  ranAt: new Date(),
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  durationMs: 1200,
  tokensIn: 1000,
  tokensOut: 200,
  costUsd: 0.002,
  status: 'done',
  error: null,
  source: 'local',
  findingsCount: 1,
  grounding: null,
  score: 40,
  blockers: 1,
};

const DEFAULT_BLAST_RESPONSE: BlastResponse = {
  blast: {
    changed_symbols: [{ name: 'processPayment', file: 'src/payments.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'processPayment',
        callers: [{ name: 'chargeUser', file: 'src/billing.ts', line: 42 }],
        endpoints_affected: ['POST /api/checkout'],
        crons_affected: [],
      },
    ],
    summary: '1 symbols · 1 callers · 1 endpoints · 0 crons',
  },
  index: {
    status: 'full',
    degraded: false,
    reason: null,
  },
};

// ---------------------------------------------------------------------------
// list_agents
// ---------------------------------------------------------------------------

describe('McpService.listAgents', () => {
  it('returns compact McpAgent list (no system_prompt)', async () => {
    const service = new McpService(
      makeContainer({ agents: [DEFAULT_AGENT_ROW] }),
      DEFAULT_CTX,
    );
    const result = await service.listAgents();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const [agent] = result.data.agents;
      expect(agent).toMatchObject({
        id: 'agent-1',
        name: 'Security Reviewer',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        enabled: true,
        version: 1,
      });
      expect(agent).not.toHaveProperty('systemPrompt');
      expect(agent).not.toHaveProperty('system_prompt');
    }
  });

  it('returns empty list when no agents exist', async () => {
    const service = new McpService(makeContainer({ agents: [] }), DEFAULT_CTX);
    const result = await service.listAgents();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data.agents).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// run_agent_on_pr
// ---------------------------------------------------------------------------

describe('McpService.runAgentOnPr', () => {
  it('returns P4 error when repo is not found', async () => {
    const bus = new RunBus();
    const service = new McpService(
      makeContainer({ runBus: bus }),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({ repo: undefined }),
        reviewService: makeReviewService({}),
      },
    );

    const result = await service.runAgentOnPr('acme/api', 42, 'agent-1');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('not found in this workspace');
      expect(result.next).toBe('add it in DevDigest, then retry');
    }
  });

  it('returns P4 error when PR is not imported', async () => {
    const bus = new RunBus();
    const service = new McpService(
      makeContainer({ runBus: bus }),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({ repo: DEFAULT_REPO_ROW as never, pr: undefined }),
        reviewService: makeReviewService({}),
      },
    );

    const result = await service.runAgentOnPr('acme/payments-api', 99, 'agent-1');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('PR #99 not found for acme/payments-api');
      expect(result.next).toBe('open the PR in DevDigest to import it, then retry');
    }
  });

  it('returns P4 error when agent is not found', async () => {
    const bus = new RunBus();
    const service = new McpService(
      makeContainer({ runBus: bus }),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({
          repo: DEFAULT_REPO_ROW as never,
          pr: DEFAULT_PR_ROW as never,
        }),
        reviewService: makeReviewService({
          throwOnResolve: new NotFoundError('Agent not found'),
        }),
      },
    );

    const result = await service.runAgentOnPr('acme/payments-api', 42, 'bad-agent');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toBe('agent not found');
      expect(result.next).toBe('call list_agents to get a valid agent id');
    }
  });

  it('blocks until runBus.complete fires and returns compact result', async () => {
    const bus = new RunBus();

    const service = new McpService(
      makeContainer({ runBus: bus }),
      { ...DEFAULT_CTX, runTimeoutMs: 30_000 },
      {
        mcpRepo: makeRepo({
          repo: DEFAULT_REPO_ROW as never,
          pr: DEFAULT_PR_ROW as never,
          reviewResult: {
            review: DEFAULT_REVIEW_ROW as never,
            findings: [DEFAULT_FINDING_ROW as never],
          },
          agentRun: DEFAULT_AGENT_RUN_ROW as never,
        }),
        reviewService: makeReviewService({ runId: 'run-1' }),
      },
    );

    // Simulate the background review completing
    const runPromise = service.runAgentOnPr('acme/payments-api', 42, 'agent-1');
    // Yield so the waitForRun subscription is set up
    await Promise.resolve();
    bus.complete('run-1');

    const result = await runPromise;
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data.runId).toBe('run-1');
      expect(result.data.verdict).toBe('request_changes');
      expect(result.data.findings).toHaveLength(1);
      expect(result.data.findings[0]).toMatchObject({
        id: 'finding-1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe key',
      });
      // Verify compact fields — no heavy fields
      expect(result.data.findings[0]).not.toHaveProperty('rationale');
      expect(result.data.findings[0]).not.toHaveProperty('suggestion');
    }
  });

  it('returns P4 timeout error with runId when run exceeds timeout', async () => {
    const bus = new RunBus();

    const service = new McpService(
      makeContainer({ runBus: bus }),
      { ...DEFAULT_CTX, runTimeoutMs: 10 }, // 10ms timeout
      {
        mcpRepo: makeRepo({
          repo: DEFAULT_REPO_ROW as never,
          pr: DEFAULT_PR_ROW as never,
        }),
        reviewService: makeReviewService({ runId: 'run-slow' }),
      },
    );

    // Don't complete the run — let it timeout
    const result = await service.runAgentOnPr('acme/payments-api', 42, 'agent-1');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('run-slow');
      expect(result.message).toContain('is still running after');
      expect(result.next).toContain('get_findings with runId=run-slow');
    }
  });
});

// ---------------------------------------------------------------------------
// get_findings
// ---------------------------------------------------------------------------

describe('McpService.getFindings', () => {
  it('returns P4 when run does not exist', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      { mcpRepo: makeRepo({ agentRun: undefined }) },
    );
    const result = await service.getFindings('run-missing');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('run-missing');
      expect(result.message).toContain('not a completed run');
      expect(result.next).toContain('run_agent_on_pr');
    }
  });

  it('returns P4 when run is still running', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({
          agentRun: { ...DEFAULT_AGENT_RUN_ROW, status: 'running', error: null } as never,
        }),
      },
    );
    const result = await service.getFindings('run-running');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('not a completed run');
    }
  });

  it('returns P4 when run failed with error message', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({
          agentRun: {
            ...DEFAULT_AGENT_RUN_ROW,
            status: 'failed',
            error: 'LLM quota exceeded',
          } as never,
        }),
      },
    );
    const result = await service.getFindings('run-failed');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('did not complete: LLM quota exceeded');
      expect(result.next).toBe('check the run in DevDigest or start a new run');
    }
  });

  it('returns P4 when run was cancelled', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({
          agentRun: { ...DEFAULT_AGENT_RUN_ROW, status: 'cancelled', error: null } as never,
        }),
      },
    );
    const result = await service.getFindings('run-cancelled');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('did not complete: cancelled');
    }
  });

  it('returns compact findings for a completed run', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({
          agentRun: DEFAULT_AGENT_RUN_ROW as never,
          reviewResult: {
            review: DEFAULT_REVIEW_ROW as never,
            findings: [DEFAULT_FINDING_ROW as never],
          },
        }),
      },
    );
    const result = await service.getFindings('run-1');
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data.runId).toBe('run-1');
      expect(result.data.verdict).toBe('request_changes');
      expect(result.data.findings).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// get_conventions
// ---------------------------------------------------------------------------

describe('McpService.getConventions', () => {
  it('returns P4 when MCP_REPO is not set', async () => {
    const service = new McpService(
      makeContainer({}),
      { ...DEFAULT_CTX, repo: undefined },
      { mcpRepo: makeRepo({}) },
    );
    const result = await service.getConventions();
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toBe('no repo configured');
      expect(result.next).toBe('set the MCP_REPO env var to "owner/name"');
    }
  });

  it('returns P4 when repo is not found in this workspace', async () => {
    const service = new McpService(
      makeContainer({}),
      { ...DEFAULT_CTX, repo: 'acme/unknown-repo' },
      { mcpRepo: makeRepo({ repo: undefined }) },
    );
    const result = await service.getConventions();
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('not found in this workspace');
    }
  });

  it('returns all conventions (all statuses, no filtering)', async () => {
    const conv = (status: 'pending' | 'accepted' | 'rejected', id: string) => ({
      id,
      workspaceId: DEFAULT_WS,
      repoId: DEFAULT_REPO_ID,
      category: 'style',
      rule: `Rule ${id}`,
      evidencePath: `src/file-${id}.ts`,
      evidenceSnippet: 'code snippet',
      confidence: 0.9,
      status,
      createdAt: new Date(),
    });

    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({
          repo: DEFAULT_REPO_ROW as never,
          conventions: [
            conv('pending', 'c1'),
            conv('accepted', 'c2'),
            conv('rejected', 'c3'),
          ] as never,
        }),
      },
    );

    const result = await service.getConventions();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const statuses = result.data.conventions.map((c) => c.status);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('accepted');
      expect(statuses).toContain('rejected');
      expect(result.data.conventions).toHaveLength(3);
    }
  });

  it('does not include evidenceSnippet in convention output', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({
          repo: DEFAULT_REPO_ROW as never,
          conventions: [
            {
              id: 'c1',
              workspaceId: DEFAULT_WS,
              repoId: DEFAULT_REPO_ID,
              category: 'style',
              rule: 'Use async/await',
              evidencePath: 'src/api.ts',
              evidenceSnippet: 'SECRET_SNIPPET',
              confidence: 0.9,
              status: 'accepted',
              createdAt: new Date(),
            },
          ] as never,
        }),
      },
    );

    const result = await service.getConventions();
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const conv = result.data.conventions[0];
      expect(JSON.stringify(conv)).not.toContain('SECRET_SNIPPET');
      expect(conv).not.toHaveProperty('evidenceSnippet');
      expect(conv).not.toHaveProperty('evidence_snippet');
    }
  });
});

// ---------------------------------------------------------------------------
// get_blast_radius
// ---------------------------------------------------------------------------

describe('McpService.getBlastRadius', () => {
  it('returns P4 error when repo is not found', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({ repo: undefined }),
        blastService: makeBlastService({ result: DEFAULT_BLAST_RESPONSE }),
      },
    );

    const result = await service.getBlastRadius('acme/unknown-repo', 42);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('not found in this workspace');
      expect(result.next).toBe('add it in DevDigest, then retry');
    }
  });

  it('returns P4 error when PR is not found', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({ repo: DEFAULT_REPO_ROW as never, pr: undefined }),
        blastService: makeBlastService({ result: DEFAULT_BLAST_RESPONSE }),
      },
    );

    const result = await service.getBlastRadius('acme/payments-api', 99);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('PR #99 not found for acme/payments-api');
      expect(result.next).toBe('open the PR in DevDigest to import it, then retry');
    }
  });

  it('returns P4 error when BlastService throws NotFoundError', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({
          repo: DEFAULT_REPO_ROW as never,
          pr: DEFAULT_PR_ROW as never,
        }),
        blastService: makeBlastService({ throwNotFound: true }),
      },
    );

    const result = await service.getBlastRadius('acme/payments-api', 42);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toContain('PR #42 not found for acme/payments-api');
      expect(result.next).toBe('open the PR in DevDigest to import it, then retry');
    }
  });

  it('returns BlastResponse on success', async () => {
    const service = new McpService(
      makeContainer({}),
      DEFAULT_CTX,
      {
        mcpRepo: makeRepo({
          repo: DEFAULT_REPO_ROW as never,
          pr: DEFAULT_PR_ROW as never,
        }),
        blastService: makeBlastService({ result: DEFAULT_BLAST_RESPONSE }),
      },
    );

    const result = await service.getBlastRadius('acme/payments-api', 42);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data.blast.changed_symbols).toHaveLength(1);
      expect(result.data.blast.changed_symbols[0]!.name).toBe('processPayment');
      expect(result.data.blast.downstream).toHaveLength(1);
      expect(result.data.blast.downstream[0]!.callers).toHaveLength(1);
      expect(result.data.index.status).toBe('full');
      expect(result.data.index.degraded).toBe(false);
    }
  });
});
