import { describe, it, expect } from 'vitest';
import { McpRepository } from './mcp.repository.js';
import type { Db } from '../../db/client.js';

/**
 * Unit tests for McpRepository (SDK-free, no real DB).
 *
 * Uses a minimal Drizzle-lookalike stub to exercise the repository's
 * not-found / found paths and the two-query reviewWithFindingsByRunId.
 *
 * The stub captures the chain .select().from(table).where(cond) and
 * returns preset rows from a map keyed by the Drizzle table name symbol.
 */

// ---------------------------------------------------------------------------
// Stub DB builder
// ---------------------------------------------------------------------------

const DRIZZLE_NAME = Symbol.for('drizzle:Name');

/**
 * Create a stub Db that responds to `.select().from(table).where(cond)`
 * chains. The `tables` map is keyed by the Drizzle table name (the string
 * registered under `Symbol('drizzle:Name')`). Each select call pops the
 * first response queued for that table.
 *
 * For multi-query methods (reviewWithFindingsByRunId calls `reviews` then
 * `findings`), queue multiple responses per table key.
 */
function makeStubDb(tables: Record<string, unknown[][]>): Db {
  const queues: Record<string, unknown[][]> = {};
  for (const [k, responses] of Object.entries(tables)) {
    queues[k] = [...responses];
  }

  const buildChain = (tableName: string) => ({
    from: (_table: unknown) => {
      const name = (_table as Record<symbol, string>)[DRIZZLE_NAME] ?? tableName;
      return {
        where: (_cond: unknown) => {
          const queue = queues[name];
          const rows = queue?.shift() ?? [];
          return Promise.resolve(rows);
        },
      };
    },
  });

  return {
    select: () => ({
      from: (table: unknown) => {
        const name = (table as Record<symbol, string>)[DRIZZLE_NAME];
        return {
          where: (_cond: unknown) => {
            const queue = queues[name ?? ''];
            const rows = queue?.shift() ?? [];
            return Promise.resolve(rows);
          },
        };
      },
    }),
  } as unknown as Db;
}

// ---------------------------------------------------------------------------
// Row fixtures
// ---------------------------------------------------------------------------

const REPO_ROW = {
  id: 'repo-1',
  workspaceId: 'ws-1',
  owner: 'acme',
  name: 'api',
  fullName: 'acme/api',
  defaultBranch: 'main',
  clonePath: null,
  lastPolledAt: null,
  createdBy: null,
  createdAt: new Date(),
};

const PR_ROW = {
  id: 'pr-1',
  workspaceId: 'ws-1',
  repoId: 'repo-1',
  number: 42,
  title: 'Add rate limiting',
  author: 'alice',
  branch: 'feat/rl',
  base: 'main',
  headSha: 'abc123',
  lastReviewedSha: null,
  additions: 10,
  deletions: 2,
  filesCount: 3,
  status: 'needs_review',
  body: null,
  openedAt: null,
  updatedAt: null,
};

const REVIEW_ROW = {
  id: 'review-1',
  workspaceId: 'ws-1',
  prId: 'pr-1',
  agentId: 'agent-1',
  runId: 'run-1',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'Issues found.',
  score: 42,
  model: 'deepseek',
  createdAt: new Date(),
};

const FINDING_ROW = {
  id: 'finding-1',
  reviewId: 'review-1',
  file: 'src/main.ts',
  startLine: 10,
  endLine: 10,
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hardcoded secret',
  rationale: 'Bad key.',
  suggestion: null,
  confidence: 0.9,
  kind: 'finding',
  trifectaComponents: null,
  acceptedAt: null,
  dismissedAt: null,
};

const AGENT_RUN_ROW = {
  id: 'run-1',
  workspaceId: 'ws-1',
  agentId: 'agent-1',
  prId: 'pr-1',
  ranAt: new Date(),
  provider: 'openrouter',
  model: 'deepseek',
  durationMs: 1200,
  tokensIn: 1000,
  tokensOut: 200,
  costUsd: 0.002,
  status: 'done',
  error: null,
  source: 'local',
  findingsCount: 1,
  grounding: null,
  score: 42,
  blockers: 1,
};

const CONVENTION_ROW = {
  id: 'conv-1',
  workspaceId: 'ws-1',
  repoId: 'repo-1',
  category: 'style',
  rule: 'Use async/await',
  evidencePath: 'src/api.ts',
  evidenceSnippet: 'snippet',
  confidence: 0.9,
  status: 'pending',
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// repoByFullName
// ---------------------------------------------------------------------------

describe('McpRepository.repoByFullName', () => {
  it('returns the repo row when found', async () => {
    const db = makeStubDb({ repos: [[REPO_ROW]] });
    const repo = new McpRepository(db);
    const result = await repo.repoByFullName('ws-1', 'acme/api');
    expect(result).toMatchObject({ id: 'repo-1', fullName: 'acme/api' });
  });

  it('returns undefined when not found (empty result set)', async () => {
    const db = makeStubDb({ repos: [[]] });
    const repo = new McpRepository(db);
    const result = await repo.repoByFullName('ws-1', 'acme/missing');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// prByRepoAndNumber
// ---------------------------------------------------------------------------

describe('McpRepository.prByRepoAndNumber', () => {
  it('returns the PR row when found', async () => {
    const db = makeStubDb({ pull_requests: [[PR_ROW]] });
    const repo = new McpRepository(db);
    const result = await repo.prByRepoAndNumber('repo-1', 42);
    expect(result).toMatchObject({ id: 'pr-1', number: 42 });
  });

  it('returns undefined when PR is not found', async () => {
    const db = makeStubDb({ pull_requests: [[]] });
    const repo = new McpRepository(db);
    const result = await repo.prByRepoAndNumber('repo-1', 999);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// reviewWithFindingsByRunId
// ---------------------------------------------------------------------------

describe('McpRepository.reviewWithFindingsByRunId', () => {
  it('returns review + findings when run exists', async () => {
    // Two sequential selects: reviews, then findings
    const db = makeStubDb({
      reviews: [[REVIEW_ROW]],
      findings: [[FINDING_ROW]],
    });
    const repo = new McpRepository(db);
    const result = await repo.reviewWithFindingsByRunId('run-1');
    expect(result).toBeDefined();
    expect(result!.review.id).toBe('review-1');
    expect(result!.findings).toHaveLength(1);
    expect(result!.findings[0]!.id).toBe('finding-1');
  });

  it('returns undefined when no review exists for the run', async () => {
    const db = makeStubDb({ reviews: [[]] });
    const repo = new McpRepository(db);
    const result = await repo.reviewWithFindingsByRunId('run-missing');
    expect(result).toBeUndefined();
  });

  it('returns empty findings array when review exists but no findings', async () => {
    const db = makeStubDb({
      reviews: [[REVIEW_ROW]],
      findings: [[]], // no findings
    });
    const repo = new McpRepository(db);
    const result = await repo.reviewWithFindingsByRunId('run-1');
    expect(result).toBeDefined();
    expect(result!.findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// runStatusById
// ---------------------------------------------------------------------------

describe('McpRepository.runStatusById', () => {
  it('returns the agent_run row when found', async () => {
    const db = makeStubDb({ agent_runs: [[AGENT_RUN_ROW]] });
    const repo = new McpRepository(db);
    const result = await repo.runStatusById('run-1');
    expect(result).toMatchObject({ id: 'run-1', status: 'done' });
  });

  it('returns undefined when run is not found', async () => {
    const db = makeStubDb({ agent_runs: [[]] });
    const repo = new McpRepository(db);
    const result = await repo.runStatusById('run-missing');
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// conventionsByRepo
// ---------------------------------------------------------------------------

describe('McpRepository.conventionsByRepo', () => {
  it('returns all conventions (all statuses) for a repo', async () => {
    const pending = { ...CONVENTION_ROW, id: 'c1', status: 'pending' };
    const accepted = { ...CONVENTION_ROW, id: 'c2', status: 'accepted' };
    const rejected = { ...CONVENTION_ROW, id: 'c3', status: 'rejected' };

    const db = makeStubDb({ conventions: [[pending, accepted, rejected]] });
    const repo = new McpRepository(db);
    const result = await repo.conventionsByRepo('ws-1', 'repo-1');
    expect(result).toHaveLength(3);
    const statuses = result.map((c) => c.status);
    expect(statuses).toContain('pending');
    expect(statuses).toContain('accepted');
    expect(statuses).toContain('rejected');
  });

  it('returns empty array when no conventions exist', async () => {
    const db = makeStubDb({ conventions: [[]] });
    const repo = new McpRepository(db);
    const result = await repo.conventionsByRepo('ws-1', 'repo-empty');
    expect(result).toHaveLength(0);
  });
});
