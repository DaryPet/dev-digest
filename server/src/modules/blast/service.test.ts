import { describe, it, expect } from 'vitest';
import type { Container } from '../../platform/container.js';
import type { ReviewRepository } from '../reviews/repository.js';
import type { RepoIntel, ImpactedRouteRow, BlastResult, IndexState } from '../repo-intel/types.js';
import { BlastService } from './service.js';

/**
 * BlastService unit tests (spec §7 T1).
 *
 * - reviewRepo injected via `overrides.reviewRepo`
 * - repoIntel facade injected via a stub Container with `repoIntel` property
 * - No DB, no LLM, no network.
 */

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

function makeReviewRepo(opts: {
  pull?: { id: string; repoId: string; workspaceId: string } | null;
  files?: Array<{ path: string; additions?: number; deletions?: number }>;
}): ReviewRepository {
  return {
    getPull: async (_ws: string, _id: string) => opts.pull as never,
    getPrFiles: async (_id: string) => (opts.files ?? []).map((f) => ({ path: f.path, additions: f.additions ?? 0, deletions: f.deletions ?? 0 })) as never,
  } as unknown as ReviewRepository;
}

function makeRepoIntelFacade(opts: {
  blastResult?: Partial<BlastResult>;
  impactedRoutes?: ImpactedRouteRow[];
  indexState?: Partial<IndexState>;
}): RepoIntel {
  const blast: BlastResult = {
    changedSymbols: [],
    callers: [],
    impactedEndpoints: [],
    ...opts.blastResult,
  };
  const routes = opts.impactedRoutes ?? [];
  const state: IndexState = {
    repoId: 'repo-1',
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 100,
    lastIndexedSha: 'abc',
    indexerVersion: 2,
    updatedAt: new Date(),
    ...opts.indexState,
  };

  return {
    getBlastRadius: async () => blast,
    getImpactedRoutes: async () => routes,
    getIndexState: async () => state,
  } as unknown as RepoIntel;
}

function makeContainer(repoIntel: RepoIntel): Container {
  return {
    repoIntel,
    get llm() {
      throw new Error('BlastService must not call container.llm');
    },
  } as unknown as Container;
}

const PULL = { id: 'pr-1', repoId: 'repo-1', workspaceId: 'ws-1' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlastService.getBlast', () => {
  // ---- 404 when PR absent --------------------------------------------------

  it('throws NotFoundError when the pull request is not found', async () => {
    const facade = makeRepoIntelFacade({});
    const service = new BlastService(
      makeContainer(facade),
      { reviewRepo: makeReviewRepo({ pull: null }) },
    );
    await expect(service.getBlast('ws-1', 'pr-1')).rejects.toThrow('Pull request not found');
  });

  // ---- grouping: one downstream entry per changed symbol ------------------

  it('emits one downstream entry per changed symbol, including zero-caller symbols', async () => {
    const facade = makeRepoIntelFacade({
      blastResult: {
        changedSymbols: [
          { name: 'alpha', file: 'src/utils.ts', kind: 'function' },
          { name: 'beta', file: 'src/utils.ts', kind: 'function' },
        ],
        callers: [
          { file: 'src/a.ts', symbol: 'fnA', viaSymbol: 'alpha', line: 10, rank: 5 },
        ],
      },
    });
    const service = new BlastService(
      makeContainer(facade),
      { reviewRepo: makeReviewRepo({ pull: PULL, files: [{ path: 'src/utils.ts' }] }) },
    );
    const result = await service.getBlast('ws-1', 'pr-1');
    expect(result.blast.changed_symbols).toHaveLength(2);
    expect(result.blast.downstream).toHaveLength(2);
    // alpha has one caller, beta has zero
    const alpha = result.blast.downstream.find((d) => d.symbol === 'alpha')!;
    const beta = result.blast.downstream.find((d) => d.symbol === 'beta')!;
    expect(alpha.callers).toHaveLength(1);
    expect(beta.callers).toHaveLength(0);
  });

  // ---- per-symbol caller attribution --------------------------------------

  it('attributes callers to their viaSymbol, not globally', async () => {
    const facade = makeRepoIntelFacade({
      blastResult: {
        changedSymbols: [
          { name: 'foo', file: 'src/a.ts', kind: 'function' },
          { name: 'bar', file: 'src/b.ts', kind: 'function' },
        ],
        callers: [
          { file: 'src/x.ts', symbol: 'callerX', viaSymbol: 'foo', line: 1, rank: 1 },
          { file: 'src/y.ts', symbol: 'callerY', viaSymbol: 'bar', line: 2, rank: 2 },
        ],
      },
    });
    const service = new BlastService(
      makeContainer(facade),
      { reviewRepo: makeReviewRepo({ pull: PULL, files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }] }) },
    );
    const result = await service.getBlast('ws-1', 'pr-1');
    const fooEntry = result.blast.downstream.find((d) => d.symbol === 'foo')!;
    const barEntry = result.blast.downstream.find((d) => d.symbol === 'bar')!;
    expect(fooEntry.callers.map((c) => c.name)).toEqual(['callerX']);
    expect(barEntry.callers.map((c) => c.name)).toEqual(['callerY']);
  });

  // ---- summary string format -----------------------------------------------

  it('builds the deterministic summary string', async () => {
    const facade = makeRepoIntelFacade({
      blastResult: {
        changedSymbols: [
          { name: 'fn1', file: 'src/a.ts', kind: 'function' },
          { name: 'fn2', file: 'src/a.ts', kind: 'function' },
        ],
        callers: [
          { file: 'src/x.ts', symbol: 'cx', viaSymbol: 'fn1', line: 1, rank: 1 },
          { file: 'src/y.ts', symbol: 'cy', viaSymbol: 'fn2', line: 2, rank: 2 },
          { file: 'src/z.ts', symbol: 'cz', viaSymbol: 'fn2', line: 3, rank: 3 },
        ],
        factsByFile: {
          'src/x.ts': { endpoints: ['GET /api/users'], crons: [] },
          'src/y.ts': { endpoints: ['POST /api/items'], crons: ['0 * * * *'] },
        },
      },
    });
    const service = new BlastService(
      makeContainer(facade),
      { reviewRepo: makeReviewRepo({ pull: PULL, files: [{ path: 'src/a.ts' }] }) },
    );
    const result = await service.getBlast('ws-1', 'pr-1');
    // S=2 symbols, C=3 callers, E=2 distinct endpoints, K=1 distinct cron
    expect(result.blast.summary).toBe('2 symbols · 3 callers · 2 endpoints · 1 crons');
  });

  // ---- endpoints + crons: union from factsByFile and impactedRoutes -------

  it('merges endpoints from factsByFile and impactedRoutes for the same symbol', async () => {
    const facade = makeRepoIntelFacade({
      blastResult: {
        changedSymbols: [{ name: 'fn1', file: 'src/a.ts', kind: 'function' }],
        callers: [
          { file: 'src/x.ts', symbol: 'cx', viaSymbol: 'fn1', line: 1, rank: 1 },
        ],
        factsByFile: {
          'src/x.ts': { endpoints: ['GET /api/a'], crons: [] },
        },
      },
      impactedRoutes: [
        {
          seedFile: 'src/a.ts',
          file: 'src/routes.ts',
          depth: 1,
          endpoints: ['POST /api/b'],
          crons: ['@daily'],
        },
      ],
    });
    const service = new BlastService(
      makeContainer(facade),
      { reviewRepo: makeReviewRepo({ pull: PULL, files: [{ path: 'src/a.ts' }] }) },
    );
    const result = await service.getBlast('ws-1', 'pr-1');
    const d = result.blast.downstream[0]!;
    expect(d.endpoints_affected).toEqual(['GET /api/a', 'POST /api/b']);
    expect(d.crons_affected).toEqual(['@daily']);
  });

  // ---- degraded passthrough -----------------------------------------------

  it('passes through degraded flag from blastResult', async () => {
    const facade = makeRepoIntelFacade({
      blastResult: { degraded: true, reason: 'no_data' },
      indexState: { status: 'full', degraded: undefined },
    });
    const service = new BlastService(
      makeContainer(facade),
      { reviewRepo: makeReviewRepo({ pull: PULL, files: [] }) },
    );
    const result = await service.getBlast('ws-1', 'pr-1');
    expect(result.index.degraded).toBe(true);
    expect(result.index.reason).toBe('no_data');
  });

  it('passes through degraded flag from indexState', async () => {
    const facade = makeRepoIntelFacade({
      blastResult: { degraded: false },
      indexState: { status: 'degraded', degraded: true, degradedReason: 'index_failed' },
    });
    const service = new BlastService(
      makeContainer(facade),
      { reviewRepo: makeReviewRepo({ pull: PULL, files: [] }) },
    );
    const result = await service.getBlast('ws-1', 'pr-1');
    expect(result.index.degraded).toBe(true);
    expect(result.index.status).toBe('degraded');
  });

  // ---- empty PR (no changed files) ----------------------------------------

  it('returns empty blast for a PR with no files', async () => {
    const facade = makeRepoIntelFacade({});
    const service = new BlastService(
      makeContainer(facade),
      { reviewRepo: makeReviewRepo({ pull: PULL, files: [] }) },
    );
    const result = await service.getBlast('ws-1', 'pr-1');
    expect(result.blast.changed_symbols).toHaveLength(0);
    expect(result.blast.downstream).toHaveLength(0);
    expect(result.blast.summary).toBe('0 symbols · 0 callers · 0 endpoints · 0 crons');
  });

  // ---- no LLM calls --------------------------------------------------------

  it('does not invoke container.llm at any point', async () => {
    const facade = makeRepoIntelFacade({});
    const containerWithLlmGuard = makeContainer(facade);
    const service = new BlastService(
      containerWithLlmGuard,
      { reviewRepo: makeReviewRepo({ pull: PULL, files: [] }) },
    );
    // makeContainer throws if llm is accessed — if this resolves, llm was never called.
    await expect(service.getBlast('ws-1', 'pr-1')).resolves.toBeDefined();
  });
});
