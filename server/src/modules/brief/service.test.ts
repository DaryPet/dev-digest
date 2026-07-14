import { describe, it, expect } from 'vitest';
import { FEATURE_MODELS, type Brief } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { NotFoundError } from '../../platform/errors.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { BriefService } from './service.js';
import type { ReviewWithFindings } from './helpers.js';

/**
 * BriefService unit tests (spec `specs/SPEC-02-pr-why-risk-brief.md`).
 *
 * - reviewRepo/blastService/smartDiffService/projectContextService injected
 *   via `overrides` — no real DB, no network.
 * - `container.db` is stubbed only for `resolveFeatureModel`'s settings read
 *   (returns no rows -> falls back to the FEATURE_MODELS registry default).
 */

const PULL = { id: 'pr-1', repoId: 'repo-1', workspaceId: 'ws-1', number: 42, title: 'Add feature', body: 'Body text' };
const REPO_ROW = { id: 'repo-1', owner: 'acme', name: 'widgets' };

const EMPTY_BLAST = {
  blast: { changed_symbols: [], downstream: [], summary: '0 symbols · 0 callers · 0 endpoints · 0 crons' },
  index: { status: 'full' as const, degraded: false, reason: null },
};

const EMPTY_SMART_DIFF = {
  groups: [],
  split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
};

const RAW_BRIEF: Brief = {
  what: 'Adds a feature.',
  why: 'Requested by the team.',
  risk_level: 'low',
  risks: [],
  review_focus: [],
};

function makeDb(rows: unknown[] = []) {
  return {
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
  };
}

function makeReviewRepo(opts: {
  pull?: unknown;
  repo?: unknown;
  intent?: unknown;
  reviews?: ReviewWithFindings[];
  briefStore?: { value: Brief | undefined };
}): ReviewRepository {
  const store = opts.briefStore ?? { value: undefined };
  return {
    getPull: async () => opts.pull,
    getRepo: async () => opts.repo,
    getIntent: async () => opts.intent,
    reviewsForPull: async () => opts.reviews ?? [],
    getBrief: async () => store.value,
    upsertBrief: async (_prId: string, brief: Brief) => {
      store.value = brief;
    },
  } as unknown as ReviewRepository;
}

function makeContainer(opts: { llm?: MockLLMProvider; dbRows?: unknown[] } = {}): Container {
  const llmProvider = opts.llm ?? new MockLLMProvider('openai', { structured: RAW_BRIEF });
  return {
    db: makeDb(opts.dbRows ?? []),
    llm: async () => llmProvider,
    github: async () => {
      throw new Error('offline');
    },
    agentsRepo: {
      getById: async () => undefined,
      linkedSkills: async () => [],
    },
  } as unknown as Container;
}

function makeService(container: Container, reviewRepo: ReviewRepository): BriefService {
  return new BriefService(container, {
    reviewRepo,
    blastService: { getBlast: async () => EMPTY_BLAST },
    smartDiffService: { getSmartDiff: async () => EMPTY_SMART_DIFF },
    projectContextService: { resolveForRun: async () => ({ specs: [], specsRead: [] }) },
  });
}

describe('BriefService.getBrief', () => {
  it('throws NotFoundError when the pull request is not found', async () => {
    const repo = makeReviewRepo({ pull: undefined });
    const service = makeService(makeContainer(), repo);
    await expect(service.getBrief('ws-1', 'pr-1', {})).rejects.toThrow(NotFoundError);
  });

  it('returns the cached brief with zero LLM calls when recompute is false and a cache row exists', async () => {
    const cached: Brief = { ...RAW_BRIEF, what: 'Cached brief' };
    const store = { value: cached };
    const repo = makeReviewRepo({ pull: PULL, repo: REPO_ROW, briefStore: store });
    const container = {
      db: makeDb(),
      llm: async () => {
        throw new Error('BriefService must not call container.llm on a cache hit');
      },
      github: async () => {
        throw new Error('offline');
      },
      agentsRepo: { getById: async () => undefined, linkedSkills: async () => [] },
    } as unknown as Container;
    const service = makeService(container, repo);

    const result = await service.getBrief('ws-1', 'pr-1', { recompute: false });
    expect(result.brief).toEqual(cached);
  });

  it('computes and persists a brief on the first call (no cached row)', async () => {
    const store: { value: Brief | undefined } = { value: undefined };
    const repo = makeReviewRepo({ pull: PULL, repo: REPO_ROW, briefStore: store });
    const service = makeService(makeContainer(), repo);

    const result = await service.getBrief('ws-1', 'pr-1', {});
    expect(result.brief.what).toBe(RAW_BRIEF.what);
    expect(store.value).toEqual(result.brief);
  });

  it('recomputes even when a cache row exists when recompute:true is passed', async () => {
    const store: { value: Brief | undefined } = { value: { ...RAW_BRIEF, what: 'Stale cached brief' } };
    const repo = makeReviewRepo({ pull: PULL, repo: REPO_ROW, briefStore: store });
    const llm = new MockLLMProvider('openai', { structured: { ...RAW_BRIEF, what: 'Freshly computed' } });
    const service = makeService(makeContainer({ llm }), repo);

    const result = await service.getBrief('ws-1', 'pr-1', { recompute: true });
    expect(result.brief.what).toBe('Freshly computed');
    expect(store.value?.what).toBe('Freshly computed');
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
  });

  it('leaves any prior cached row untouched when the LLM call throws (AC-12)', async () => {
    const original: Brief = { ...RAW_BRIEF, what: 'Original cached brief' };
    const store: { value: Brief | undefined } = { value: original };
    const repo = makeReviewRepo({ pull: PULL, repo: REPO_ROW, briefStore: store });
    const throwingLlm = {
      id: 'openai' as const,
      listModels: async () => [],
      complete: async () => {
        throw new Error('should not be called');
      },
      completeStructured: async () => {
        throw new Error('LLM provider error');
      },
      embed: async () => [],
    };
    const service = makeService(makeContainer({ llm: throwingLlm as unknown as MockLLMProvider }), repo);

    await expect(service.getBrief('ws-1', 'pr-1', { recompute: true })).rejects.toThrow('LLM provider error');
    // upsertBrief was never reached -> the pre-seeded cache row is unchanged.
    expect(store.value).toEqual(original);
  });

  it('degrades gracefully (omits specs, still returns a Brief) when Project Context resolution throws', async () => {
    const store: { value: Brief | undefined } = { value: undefined };
    const reviews: ReviewWithFindings[] = [
      {
        review: {
          id: 'rev-1',
          agentId: 'agent-1',
          verdict: 'comment',
          kind: 'review',
          createdAt: new Date(),
        } as never,
        findings: [],
      },
    ];
    const repo = makeReviewRepo({ pull: PULL, repo: REPO_ROW, briefStore: store, reviews });
    const container = {
      db: makeDb(),
      llm: async () => new MockLLMProvider('openai', { structured: RAW_BRIEF }),
      github: async () => {
        throw new Error('offline');
      },
      agentsRepo: {
        // Simulates a broken/unreachable agents repo — must not 500 the request.
        getById: async () => {
          throw new Error('agents repo unavailable');
        },
        linkedSkills: async () => [],
      },
    } as unknown as Container;
    const service = makeService(container, repo);

    const result = await service.getBrief('ws-1', 'pr-1', {});
    expect(result.brief.what).toBe(RAW_BRIEF.what);
    expect(store.value).toEqual(result.brief);
  });

  it('resolves the risk_brief feature slot to openrouter/deepseek-v4-flash by default', () => {
    const def = FEATURE_MODELS.find((f) => f.id === 'risk_brief');
    expect(def?.defaultProvider).toBe('openrouter');
    expect(def?.defaultModel).toBe('deepseek/deepseek-v4-flash');
  });
});
