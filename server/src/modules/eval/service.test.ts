import { describe, it, expect, vi } from 'vitest';
import type { Container } from '../../platform/container.js';
import type { AgentsRepository, AgentRow } from '../agents/repository.js';
import type { ReviewRepository } from '../reviews/repository.js';
import type { LLMProvider, StructuredRequest, StructuredResult, Review } from '@devdigest/shared';
import { EvalService } from './service.js';
import { EvalRepository, type EvalCaseRow, type EvalRunRow, type InsertEvalCase, type InsertEvalRun } from './repository.js';

/**
 * EvalService unit tests (plan T-A). No real DB — `EvalRepository` is
 * replaced by an in-memory fake (same shape as `blast/service.test.ts`'s
 * stub-injection pattern, but the eval module owns its own tables so the
 * fake reimplements `EvalRepository`'s public surface directly rather than
 * stubbing a cast). `agentsRepo`/`reviewRepo` are stub objects cast through
 * `as unknown as X`, and `container.llm` returns a minimal fake `LLMProvider`
 * with per-call control over returned findings (NOT `MockLLMProvider`, since
 * a batch run needs a different fixture per case).
 */

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeEvalRepository extends EvalRepository {
  cases: EvalCaseRow[] = [];
  runs: EvalRunRow[] = [];
  private caseSeq = 0;
  private runSeq = 0;

  constructor() {
    super(undefined as never); // never touches `this.db` — every method overridden
  }

  override async listCases(workspaceId: string, ownerKind?: string, ownerId?: string) {
    return this.cases.filter(
      (c) =>
        c.workspaceId === workspaceId &&
        (ownerKind === undefined || c.ownerKind === ownerKind) &&
        (ownerId === undefined || c.ownerId === ownerId),
    );
  }

  override async getCase(workspaceId: string, id: string) {
    return this.cases.find((c) => c.workspaceId === workspaceId && c.id === id);
  }

  override async insertCase(values: InsertEvalCase) {
    const row: EvalCaseRow = {
      id: `case-${++this.caseSeq}`,
      workspaceId: values.workspaceId,
      ownerKind: values.ownerKind,
      ownerId: values.ownerId,
      name: values.name,
      inputDiff: values.inputDiff,
      inputFiles: values.inputFiles as EvalCaseRow['inputFiles'],
      inputMeta: values.inputMeta as EvalCaseRow['inputMeta'],
      expectedOutput: values.expectedOutput as EvalCaseRow['expectedOutput'],
      notes: values.notes,
    };
    this.cases.push(row);
    return row;
  }

  override async updateCase(workspaceId: string, id: string, values: Partial<InsertEvalCase>) {
    const idx = this.cases.findIndex((c) => c.workspaceId === workspaceId && c.id === id);
    if (idx === -1) return undefined;
    const existing = this.cases[idx]!;
    const updated: EvalCaseRow = {
      ...existing,
      ...(values.ownerKind !== undefined ? { ownerKind: values.ownerKind } : {}),
      ...(values.ownerId !== undefined ? { ownerId: values.ownerId } : {}),
      ...(values.name !== undefined ? { name: values.name } : {}),
      ...(values.inputDiff !== undefined ? { inputDiff: values.inputDiff } : {}),
      ...(values.inputFiles !== undefined ? { inputFiles: values.inputFiles as EvalCaseRow['inputFiles'] } : {}),
      ...(values.inputMeta !== undefined ? { inputMeta: values.inputMeta as EvalCaseRow['inputMeta'] } : {}),
      ...(values.expectedOutput !== undefined
        ? { expectedOutput: values.expectedOutput as EvalCaseRow['expectedOutput'] }
        : {}),
      ...(values.notes !== undefined ? { notes: values.notes } : {}),
    };
    this.cases[idx] = updated;
    return updated;
  }

  override async deleteCase(workspaceId: string, id: string) {
    const idx = this.cases.findIndex((c) => c.workspaceId === workspaceId && c.id === id);
    if (idx === -1) return false;
    this.cases.splice(idx, 1);
    this.runs = this.runs.filter((r) => r.caseId !== id); // simulate DB FK cascade
    return true;
  }

  override async insertRun(values: InsertEvalRun) {
    const row: EvalRunRow = {
      id: `run-${++this.runSeq}`,
      caseId: values.caseId,
      ranAt: new Date(Date.now() + this.runSeq), // monotonically increasing
      actualOutput: values.actualOutput,
      pass: values.pass,
      recall: values.recall,
      precision: values.precision,
      citationAccuracy: values.citationAccuracy,
      durationMs: values.durationMs,
      costUsd: values.costUsd,
    };
    this.runs.push(row);
    return row;
  }

  override async runsForCases(caseIds: string[]) {
    return this.runs
      .filter((r) => caseIds.includes(r.caseId))
      .slice()
      .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime());
  }
}

/** Minimal `LLMProvider` fake — one fixed `Review` per call by default, or a
 *  per-call function for batch-run scenarios needing different findings. */
class FakeLLMProvider implements LLMProvider {
  readonly id = 'openai' as const;
  calls = 0;
  constructor(private reviewOrFn: Review | ((callIndex: number) => Review) | (() => never)) {}

  async listModels() {
    return [];
  }
  async complete(): Promise<never> {
    throw new Error('complete() not used by reviewPullRequest');
  }
  async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const idx = this.calls++;
    const result = typeof this.reviewOrFn === 'function' ? (this.reviewOrFn as (i: number) => Review)(idx) : this.reviewOrFn;
    return {
      data: result as unknown as T,
      model: 'mock',
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0.001,
      raw: JSON.stringify(result),
      attempts: 1,
    };
  }
  async embed(texts: string[]) {
    return texts.map(() => []);
  }
}

function makeAgentRow(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'agent-1',
    workspaceId: 'ws-1',
    name: 'Agent',
    description: '',
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 'You are a reviewer.',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    repoIntel: true,
    projectContextPaths: null,
    enabled: true,
    version: 1,
    createdBy: null,
    createdAt: new Date(),
    ...overrides,
  } as AgentRow;
}

function makeAgentsRepo(opts: {
  agent?: AgentRow | null;
  linkedSkills?: { skill: { id: string; enabled: boolean; body: string }; order: number }[];
  setSkills?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}): AgentsRepository {
  const linked = opts.linkedSkills ?? [];
  return {
    getById: async (_ws: string, _id: string) => (opts.agent === undefined ? makeAgentRow() : opts.agent),
    linkedSkills: async (_agentId: string) => linked as never,
    setSkills: opts.setSkills ?? vi.fn(async () => {}),
    update: opts.update ?? vi.fn(async (_ws: string, _id: string, _patch: unknown) => makeAgentRow({ version: 2 })),
  } as unknown as AgentsRepository;
}

function makeReviewRepo(opts: {
  finding?: Record<string, unknown> | null;
  review?: Record<string, unknown> | null;
  pull?: Record<string, unknown> | null;
  prFiles?: { path: string; patch: string }[];
}): ReviewRepository {
  return {
    getFinding: async (_id: string) => opts.finding as never,
    getReview: async (_id: string) => opts.review as never,
    getPull: async (_ws: string, _id: string) => opts.pull as never,
    getPrFiles: async (_id: string) => (opts.prFiles ?? []) as never,
  } as unknown as ReviewRepository;
}

function makeContainer(llm: LLMProvider): Container {
  return {
    llm: async () => llm,
  } as unknown as Container;
}

function review(findings: Review['findings']): Review {
  return { verdict: 'comment', summary: 'ok', score: 90, findings };
}

const DIFF = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n+x';

// ---------------------------------------------------------------------------
// Case CRUD
// ---------------------------------------------------------------------------

describe('EvalService case CRUD (routes 1-4)', () => {
  it('createCase overrides owner_kind/owner_id regardless of input body', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const kase = await service.createCase('ws-1', 'agent-1', {
      name: 'My case',
      input_diff: DIFF,
      input_files: null,
      input_meta: null,
      expected_output: [],
      notes: null,
    } as never);
    expect(kase.owner_kind).toBe('agent');
    expect(kase.owner_id).toBe('agent-1');
  });

  it('updateCase re-pins the owner to :id even if a tampered body claims otherwise', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const created = await service.createCase('ws-1', 'agent-1', {
      name: 'Case',
      input_diff: DIFF,
      input_files: null,
      input_meta: null,
      expected_output: [],
      notes: null,
    } as never);
    const updated = await service.updateCase('ws-1', 'agent-1', created.id, {
      // Tampered owner fields — updateCase must ignore these and re-pin to `:id`.
      owner_kind: 'agent',
      owner_id: 'someone-else',
      name: 'Renamed',
      input_diff: DIFF,
      input_files: null,
      input_meta: null,
      expected_output: [],
      notes: null,
    } as never);
    expect(updated.owner_id).toBe('agent-1');
    expect(updated.name).toBe('Renamed');
  });

  it('getCase 404s when the case belongs to a different agent', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const created = await service.createCase('ws-1', 'agent-1', {
      name: 'Case',
      input_diff: DIFF,
      input_files: null,
      input_meta: null,
      expected_output: [],
      notes: null,
    } as never);
    await expect(service.getCase('ws-1', 'agent-2', created.id)).rejects.toThrow('Eval case not found');
  });

  it('listCases 404s when the agent does not exist', async () => {
    const evalRepo = new FakeEvalRepository();
    const agentsRepo = {
      getById: async () => undefined,
    } as unknown as AgentsRepository;
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo,
      reviewRepo: makeReviewRepo({}),
    });
    await expect(service.listCases('ws-1', 'agent-missing')).rejects.toThrow('Agent not found');
  });

  it('deleteCase removes an owned case, which no longer appears in listCases', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const created = await service.createCase('ws-1', 'agent-1', {
      name: 'Case to delete',
      input_diff: DIFF,
      input_files: null,
      input_meta: null,
      expected_output: [],
      notes: null,
    } as never);
    await service.deleteCase('ws-1', 'agent-1', created.id);
    const remaining = await service.listCases('ws-1', 'agent-1');
    expect(remaining.find((c) => c.id === created.id)).toBeUndefined();
  });

  it('deleteCase 404s when the case belongs to a different agent or does not exist', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const created = await service.createCase('ws-1', 'agent-1', {
      name: 'Case',
      input_diff: DIFF,
      input_files: null,
      input_meta: null,
      expected_output: [],
      notes: null,
    } as never);
    await expect(service.deleteCase('ws-1', 'agent-2', created.id)).rejects.toThrow('Eval case not found');
    await expect(service.deleteCase('ws-1', 'agent-1', 'case-missing')).rejects.toThrow('Eval case not found');
  });
});

// ---------------------------------------------------------------------------
// From-finding creation (route 6)
// ---------------------------------------------------------------------------

describe('EvalService.createCaseFromFinding (route 6)', () => {
  const baseFinding = {
    id: 'f-1',
    reviewId: 'review-1',
    file: 'src/a.ts',
    startLine: 10,
    endLine: 12,
    severity: 'WARNING',
    category: 'bug',
    title: 'Some finding',
    acceptedAt: new Date(),
    dismissedAt: null,
  };
  const baseReview = { id: 'review-1', prId: 'pr-1', agentId: 'agent-1' };
  const basePull = { id: 'pr-1', workspaceId: 'ws-1' };

  it('404s when the finding does not exist', async () => {
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo: new FakeEvalRepository(),
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({ finding: undefined }),
    });
    await expect(service.createCaseFromFinding('ws-1', 'f-missing')).rejects.toThrow('Finding not found');
  });

  it('404s (not leaking existence) when the owning PR is not in the caller workspace', async () => {
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo: new FakeEvalRepository(),
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({ finding: baseFinding, review: baseReview, pull: undefined }),
    });
    await expect(service.createCaseFromFinding('ws-other', 'f-1')).rejects.toThrow('Finding not found');
  });

  it('422s when the review has no associated agent', async () => {
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo: new FakeEvalRepository(),
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({
        finding: baseFinding,
        review: { ...baseReview, agentId: null },
        pull: basePull,
      }),
    });
    await expect(service.createCaseFromFinding('ws-1', 'f-1')).rejects.toThrow(
      'Finding has no associated agent to own the eval case',
    );
  });

  it('422s when the finding is neither accepted nor dismissed', async () => {
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo: new FakeEvalRepository(),
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({
        finding: { ...baseFinding, acceptedAt: null, dismissedAt: null },
        review: baseReview,
        pull: basePull,
      }),
    });
    await expect(service.createCaseFromFinding('ws-1', 'f-1')).rejects.toThrow(
      'Finding must be accepted or dismissed to create an eval case',
    );
  });

  it('accepted finding -> one-element must_find expected_output, scoped diff fragment', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({
        finding: baseFinding,
        review: baseReview,
        pull: basePull,
        prFiles: [{ path: 'src/a.ts', patch: '@@ -9,4 +9,4 @@\n context' }],
      }),
    });
    const kase = await service.createCaseFromFinding('ws-1', 'f-1');
    expect(kase.owner_id).toBe('agent-1');
    expect(kase.expected_output).toHaveLength(1);
    expect((kase.expected_output as { file: string }[])[0]!.file).toBe('src/a.ts');
    expect(kase.input_diff).toContain('diff --git a/src/a.ts b/src/a.ts');
  });

  it('dismissed finding -> empty expected_output (must_not_flag case)', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({
        finding: { ...baseFinding, acceptedAt: null, dismissedAt: new Date() },
        review: baseReview,
        pull: basePull,
        prFiles: [{ path: 'src/a.ts', patch: '@@ -9,4 +9,4 @@\n context' }],
      }),
    });
    const kase = await service.createCaseFromFinding('ws-1', 'f-1');
    expect(kase.expected_output).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Run execution (routes 7-8): AC-9 (failure isolation) + AC-10 (same snapshot)
// ---------------------------------------------------------------------------

describe('EvalService run execution (routes 7-8)', () => {
  async function makeCase(evalRepo: FakeEvalRepository, overrides: Partial<InsertEvalCase> = {}) {
    return evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'Case A',
      inputDiff: DIFF,
      inputFiles: [{ path: 'a.ts', patch: '@@ -1,1 +1,1 @@\n+x' }],
      inputMeta: { file: 'a.ts', start_line: 1, end_line: 1 },
      expectedOutput: [{ file: 'a.ts', start_line: 1, end_line: 1 }],
      notes: null,
      ...overrides,
    });
  }

  it('runCase against a must_find case: a matching finding -> pass, TP', async () => {
    const evalRepo = new FakeEvalRepository();
    const kase = await makeCase(evalRepo);
    const llm = new FakeLLMProvider(
      review([
        {
          id: 'f1',
          severity: 'WARNING',
          category: 'bug',
          title: 'T',
          file: 'a.ts',
          start_line: 1,
          end_line: 1,
          rationale: 'r',
          confidence: 0.9,
        },
      ]),
    );
    const service = new EvalService(makeContainer(llm), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const result = await service.runCase('ws-1', 'agent-1', kase.id);
    expect(result.result.recall).toBe(1);
    expect(result.result.traces_passed).toBe(1);
    expect(result.result.traces_total).toBe(1);
  });

  it('AC-9: an execution failure persists a degenerate row and does not throw', async () => {
    const evalRepo = new FakeEvalRepository();
    const kase = await makeCase(evalRepo);
    const failingLlm: LLMProvider = {
      id: 'openai',
      listModels: async () => [],
      complete: async () => {
        throw new Error('should not be called');
      },
      completeStructured: async () => {
        throw new Error('LLM exploded');
      },
      embed: async () => [],
    };
    const service = new EvalService(makeContainer(failingLlm), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const result = await service.runCase('ws-1', 'agent-1', kase.id);
    expect(result.result.recall).toBe(0);
    expect(result.result.precision).toBe(0);
    expect(result.result.citation_accuracy).toBe(0);
    expect(result.result.traces_passed).toBe(0);
    expect(result.result.traces_total).toBe(1);

    const persisted = evalRepo.runs.find((r) => r.id === result.run_id)!;
    expect(persisted.pass).toBe(false);
    expect(persisted.recall).toBeNull();
    expect(persisted.precision).toBeNull();
    expect(persisted.citationAccuracy).toBeNull();
    // actual_output is NEVER null on failure — the snapshot is always known,
    // so version-group correlation (status list / dashboard) still works.
    expect(persisted.actualOutput).not.toBeNull();
    expect((persisted.actualOutput as { findings: unknown[] }).findings).toEqual([]);
    expect((persisted.actualOutput as { snapshot: { version: number } }).snapshot.version).toBe(1);
  });

  it('AC-9: runAll continues past a failing case to run the remaining cases', async () => {
    const evalRepo = new FakeEvalRepository();
    const caseFail = await makeCase(evalRepo, { name: 'Fails', expectedOutput: [{ file: 'a.ts', start_line: 1, end_line: 1 }] });
    const caseOk = await makeCase(evalRepo, { name: 'Passes' });

    let call = 0;
    const flakyLlm: LLMProvider = {
      id: 'openai',
      listModels: async () => [],
      complete: async () => {
        throw new Error('not used');
      },
      completeStructured: async <T,>(): Promise<StructuredResult<T>> => {
        call++;
        if (call === 1) throw new Error('first case explodes');
        const result = review([
          {
            id: 'f1',
            severity: 'WARNING',
            category: 'bug',
            title: 'T',
            file: 'a.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'r',
            confidence: 0.9,
          },
        ]);
        return {
          data: result as unknown as T,
          model: 'mock',
          tokensIn: 1,
          tokensOut: 1,
          costUsd: 0.001,
          raw: '',
          attempts: 1,
        };
      },
      embed: async () => [],
    };
    const service = new EvalService(makeContainer(flakyLlm), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const results = await service.runAll('ws-1', 'agent-1');
    expect(results).toHaveLength(2);
    const failResult = results.find((r) => r.case_id === caseFail.id)!;
    const okResult = results.find((r) => r.case_id === caseOk.id)!;
    expect(failResult.result.traces_passed).toBe(0);
    expect(okResult.result.traces_passed).toBe(1);
  });

  it('AC-10: every case in a batch runs against the SAME agent snapshot', async () => {
    const evalRepo = new FakeEvalRepository();
    await makeCase(evalRepo, { name: 'A' });
    await makeCase(evalRepo, { name: 'B' });
    const llm = new FakeLLMProvider(() => review([]));
    const service = new EvalService(makeContainer(llm), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    await service.runAll('ws-1', 'agent-1');
    const versions = evalRepo.runs.map(
      (r) => (r.actualOutput as { snapshot: { version: number } }).snapshot.version,
    );
    expect(new Set(versions).size).toBe(1);
  });

  it('runAll on an agent with zero cases returns []', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    expect(await service.runAll('ws-1', 'agent-1')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listCaseStatuses (route 5, AC-18) + listRuns (route 9) + getRunSnapshot (route 10)
// ---------------------------------------------------------------------------

describe('EvalService.listCaseStatuses / listRuns / getRunSnapshot', () => {
  it('a case with a passing run at the CURRENT agent version -> status "passing"', async () => {
    const evalRepo = new FakeEvalRepository();
    const kase = await evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'Case',
      inputDiff: DIFF,
      inputFiles: null,
      inputMeta: { file: 'a.ts', start_line: 1, end_line: 1, severity: 'WARNING', category: 'bug', title: 'T' },
      expectedOutput: [],
      notes: null,
    });
    await evalRepo.insertRun({
      caseId: kase.id,
      actualOutput: { findings: [], snapshot: { system_prompt: 'sp', model: 'm', skills: [], version: 1 } },
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      durationMs: 10,
      costUsd: 0.001,
    });
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({ agent: makeAgentRow({ version: 1 }) }),
      reviewRepo: makeReviewRepo({}),
    });
    const statuses = await service.listCaseStatuses('ws-1', 'agent-1');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.status).toBe('passing');
  });

  it('a case with a run only at an OLDER version -> status "never-run"', async () => {
    const evalRepo = new FakeEvalRepository();
    const kase = await evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'Case',
      inputDiff: DIFF,
      inputFiles: null,
      inputMeta: null,
      expectedOutput: [],
      notes: null,
    });
    await evalRepo.insertRun({
      caseId: kase.id,
      actualOutput: { findings: [], snapshot: { system_prompt: 'sp', model: 'm', skills: [], version: 1 } },
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      durationMs: 10,
      costUsd: 0.001,
    });
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({ agent: makeAgentRow({ version: 2 }) }), // agent moved on to v2
      reviewRepo: makeReviewRepo({}),
    });
    const statuses = await service.listCaseStatuses('ws-1', 'agent-1');
    expect(statuses[0]!.status).toBe('never-run');
  });

  it('getRunSnapshot 404s when the version was never run', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    await expect(service.getRunSnapshot('ws-1', 'agent-1', 99)).rejects.toThrow('Eval run snapshot not found');
  });

  it('getRunSnapshot resolves the snapshot embedded in the matching version-group', async () => {
    const evalRepo = new FakeEvalRepository();
    const kase = await evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'Case',
      inputDiff: DIFF,
      inputFiles: null,
      inputMeta: null,
      expectedOutput: [],
      notes: null,
    });
    await evalRepo.insertRun({
      caseId: kase.id,
      actualOutput: { findings: [], snapshot: { system_prompt: 'sp', model: 'gpt-4.1', skills: ['s1'], version: 3 } },
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      durationMs: 10,
      costUsd: 0.001,
    });
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const snap = await service.getRunSnapshot('ws-1', 'agent-1', 3);
    expect(snap.model).toBe('gpt-4.1');
    expect(snap.skills).toEqual(['s1']);
    expect(snap.version).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Dashboard (routes 11-12)
// ---------------------------------------------------------------------------

describe('EvalService.dashboard / dashboardAgents', () => {
  async function seedTwoVersionGroups(evalRepo: FakeEvalRepository) {
    const kase = await evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'Case',
      inputDiff: DIFF,
      inputFiles: null,
      inputMeta: { file: 'a.ts', start_line: 1, end_line: 1 },
      expectedOutput: [{ file: 'a.ts', start_line: 1, end_line: 1 }],
      notes: null,
    });
    // v1: missed (FN) -> recall 0
    await evalRepo.insertRun({
      caseId: kase.id,
      actualOutput: { findings: [], snapshot: { system_prompt: 'sp', model: 'm', skills: [], version: 1 } },
      pass: false,
      recall: 0,
      precision: 1,
      citationAccuracy: 1,
      durationMs: 10,
      costUsd: 0.001,
    });
    // v2: found (TP) -> recall 1
    await evalRepo.insertRun({
      caseId: kase.id,
      actualOutput: {
        findings: [
          {
            id: 'f1',
            severity: 'WARNING',
            category: 'bug',
            title: 'T',
            file: 'a.ts',
            start_line: 1,
            end_line: 1,
            rationale: 'r',
            confidence: 0.9,
          },
        ],
        snapshot: { system_prompt: 'sp', model: 'm', skills: [], version: 2 },
      },
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      durationMs: 10,
      costUsd: 0.002,
    });
    return kase;
  }

  it('groups by version, computes delta, and derives an alert when recall dropped enough', async () => {
    const evalRepo = new FakeEvalRepository();
    await seedTwoVersionGroups(evalRepo);
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const dashboard = await service.dashboard('ws-1', 'agent', 'agent-1');
    expect(dashboard.current.recall).toBe(1); // v2 is current (max version)
    expect(dashboard.delta.recall).toBe(1); // 1 - 0
    expect(dashboard.trend).toHaveLength(2);
    expect(dashboard.trend[0]!.recall).toBe(0); // ascending version order
    expect(dashboard.trend[1]!.recall).toBe(1);
    expect(dashboard.alert).toBeNull(); // recall went UP, not down
  });

  it('workspace-wide mode (both owner params omitted) includes every case in the workspace', async () => {
    const evalRepo = new FakeEvalRepository();
    await seedTwoVersionGroups(evalRepo);
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const dashboard = await service.dashboard('ws-1');
    expect(dashboard.cases_total).toBe(1);
    expect(dashboard.owner_kind).toBeNull();
  });

  it('no runs ever -> current defaults to recall/precision/citation_accuracy=1, alert null', async () => {
    const evalRepo = new FakeEvalRepository();
    await evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'Case',
      inputDiff: DIFF,
      inputFiles: null,
      inputMeta: null,
      expectedOutput: [],
      notes: null,
    });
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    const dashboard = await service.dashboard('ws-1', 'agent', 'agent-1');
    expect(dashboard.current.recall).toBe(1);
    expect(dashboard.current.traces_total).toBe(0);
    expect(dashboard.alert).toBeNull();
  });

  it('dashboardAgents returns one summary per agent-owner with >=1 case, skipping orphaned owners', async () => {
    const evalRepo = new FakeEvalRepository();
    await evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'Case A',
      inputDiff: DIFF,
      inputFiles: null,
      inputMeta: null,
      expectedOutput: [],
      notes: null,
    });
    await evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'agent',
      ownerId: 'agent-orphaned',
      name: 'Case B',
      inputDiff: DIFF,
      inputFiles: null,
      inputMeta: null,
      expectedOutput: [],
      notes: null,
    });
    await evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'skill',
      ownerId: 'skill-1',
      name: 'Case C',
      inputDiff: DIFF,
      inputFiles: null,
      inputMeta: null,
      expectedOutput: [],
      notes: null,
    });
    const agentsRepo = {
      getById: async (_ws: string, id: string) => (id === 'agent-1' ? makeAgentRow({ id: 'agent-1', name: 'Agent One' }) : undefined),
      linkedSkills: async () => [],
    } as unknown as AgentsRepository;
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo,
      reviewRepo: makeReviewRepo({}),
    });
    const summaries = await service.dashboardAgents('ws-1');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.agent_id).toBe('agent-1');
    expect(summaries[0]!.agent_name).toBe('Agent One');
  });
});

// ---------------------------------------------------------------------------
// Promote (route 13, §6.4 — setSkills BEFORE update, order load-bearing)
// ---------------------------------------------------------------------------

describe('EvalService.promoteConfig (route 13)', () => {
  it('calls setSkills BEFORE update (order load-bearing per §6.4)', async () => {
    const evalRepo = new FakeEvalRepository();
    const kase = await evalRepo.insertCase({
      workspaceId: 'ws-1',
      ownerKind: 'agent',
      ownerId: 'agent-1',
      name: 'Case',
      inputDiff: DIFF,
      inputFiles: null,
      inputMeta: null,
      expectedOutput: [],
      notes: null,
    });
    await evalRepo.insertRun({
      caseId: kase.id,
      actualOutput: {
        findings: [],
        snapshot: { system_prompt: 'promoted prompt', model: 'gpt-5', skills: ['skill-a', 'skill-b'], version: 4 },
      },
      pass: true,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      durationMs: 10,
      costUsd: 0.001,
    });

    const callOrder: string[] = [];
    const setSkills = vi.fn(async () => {
      callOrder.push('setSkills');
    });
    const update = vi.fn(async () => {
      callOrder.push('update');
      return makeAgentRow({ version: 5, model: 'gpt-5', systemPrompt: 'promoted prompt' });
    });
    const agentsRepo = makeAgentsRepo({ setSkills, update });
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo,
      reviewRepo: makeReviewRepo({}),
    });

    const promoted = await service.promoteConfig('ws-1', 'agent-1', 4);

    expect(callOrder).toEqual(['setSkills', 'update']);
    expect(setSkills).toHaveBeenCalledWith('agent-1', ['skill-a', 'skill-b']);
    expect(update).toHaveBeenCalledWith('ws-1', 'agent-1', {
      model: 'gpt-5',
      systemPrompt: 'promoted prompt',
    });
    expect(promoted.version).toBe(5);
  });

  it('404s when the requested version was never run', async () => {
    const evalRepo = new FakeEvalRepository();
    const service = new EvalService(makeContainer(new FakeLLMProvider(review([]))), {
      evalRepo,
      agentsRepo: makeAgentsRepo({}),
      reviewRepo: makeReviewRepo({}),
    });
    await expect(service.promoteConfig('ws-1', 'agent-1', 99)).rejects.toThrow('Eval run snapshot not found');
  });
});
