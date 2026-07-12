import { describe, it, expect } from 'vitest';
import type { RepoRef, RunTrace } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { RunBus } from '../../platform/sse.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { ProjectContextService } from '../project-context/service.js';
import { ReviewRunExecutor } from './run-executor.js';
import type { ReviewRepository, PullRow } from './repository.js';
import type { AgentRow } from '../../db/rows.js';
import * as schema from '../../db/schema.js';

/**
 * ReviewRunExecutor unit tests — no DB/Docker. `container`/`repo`/`agents` are
 * hand-built stubs (same technique as `agents-versions.it.test.ts`'s
 * `new AgentsService({ db } as unknown as Container)`), so these run
 * everywhere `./node_modules/.bin/vitest run "run-executor"` does.
 *
 * Covers the Project Context (SPEC-01) wiring at §6.6: AC-20 (unreadable
 * attached path silently excluded, run still succeeds) and an AC-27-style
 * check (attached spec text present in the assembled prompt + trace).
 */

const VALID_REVIEW_FIXTURE = { verdict: 'approve', summary: 'Looks fine.', score: 95, findings: [] };

function makeRepo(): { repo: ReviewRepository; traces: Record<string, RunTrace> } {
  const traces: Record<string, RunTrace> = {};
  const repo = {
    getIntent: async () => undefined,
    getPrFiles: async () => [],
    insertReview: async () => ({ id: 'review-1' }) as never,
    insertFindings: async () => [],
    markReviewed: async () => undefined,
    completeAgentRun: async () => undefined,
    saveRunTrace: async (runId: string, trace: RunTrace) => {
      traces[runId] = trace;
    },
  } as unknown as ReviewRepository;
  return { repo, traces };
}

function makeContainer(files: Record<string, string>): Container {
  const git = {
    clonePathFor: (r: RepoRef) => `/mock/clones/${r.owner}/${r.name}`,
    diff: async () => ({
      raw: 'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
      files: [
        {
          path: 'src/config.ts',
          additions: 1,
          deletions: 0,
          hunks: [{ file: 'src/config.ts', oldStart: 10, oldLines: 3, newStart: 10, newLines: 4, newLineNumbers: [11] }],
        },
      ],
    }),
    readFile: async (_repo: RepoRef, path: string) => files[path] ?? '',
  } as unknown as Container['git'];

  const fakeContainer = {
    git,
    db: {} as never,
    runBus: new RunBus(),
    tokenizer: { count: (t: string) => t.length },
    llm: async () => new MockLLMProvider('openai', { structured: VALID_REVIEW_FIXTURE }),
  } as unknown as Container;

  (fakeContainer as unknown as { projectContextService: ProjectContextService }).projectContextService =
    new ProjectContextService(fakeContainer);

  return fakeContainer;
}

const baseAgent = {
  id: 'agent-1',
  workspaceId: 'ws-1',
  name: 'Reviewer',
  description: '',
  provider: 'openai',
  model: 'gpt-4o-mini',
  systemPrompt: 'Review the diff.',
  outputSchema: null,
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: false, // skip repo-intel enrichment entirely for this unit test
  enabled: true,
  version: 1,
  createdBy: null,
  createdAt: new Date(),
} satisfies Omit<AgentRow, 'projectContextPaths'>;

const pull = {
  id: 'pr-1',
  workspaceId: 'ws-1',
  repoId: 'repo-1',
  number: 42,
  title: 'Add feature',
  author: 'dev',
  branch: 'feat',
  base: 'main',
  headSha: 'abc123',
  lastReviewedSha: null,
  additions: 1,
  deletions: 1,
  filesCount: 1,
  status: 'needs_review',
  body: null,
  openedAt: new Date(),
  updatedAt: new Date(),
} as unknown as PullRow;

const repoRow = {
  id: 'repo-1',
  workspaceId: 'ws-1',
  owner: 'acme',
  name: 'widgets',
  fullName: 'acme/widgets',
  defaultBranch: 'main',
  clonePath: null,
  lastPolledAt: null,
  createdBy: null,
  createdAt: new Date(),
} as unknown as typeof schema.repos.$inferSelect;

describe('ReviewRunExecutor — Project Context wiring', () => {
  it('AC-20: silently excludes an attached path that is not readable in the PR repo', async () => {
    const { repo, traces } = makeRepo();
    const container = makeContainer({ 'specs/foo.md': 'Spec: module api/ must not import db/ directly.' });
    const agent: AgentRow = { ...baseAgent, projectContextPaths: ['specs/foo.md', 'specs/missing.md'] };
    const agentsRepo = { linkedSkills: async () => [] } as unknown as Container['agentsRepo'];

    const executor = new ReviewRunExecutor(container, repo, agentsRepo);
    await executor.executeRuns('ws-1', pull, repoRow, [{ agent, runId: 'run-1' }]);

    const trace = traces['run-1'];
    expect(trace).toBeDefined();
    expect(trace!.specs_read).toEqual(['specs/foo.md']);
  });

  it('AC-27-style: attached spec text is present in the assembled prompt + trace', async () => {
    const { repo, traces } = makeRepo();
    const invariant = 'Invariant: module `api/` must not import `db/` directly.';
    const container = makeContainer({ 'specs/foo.md': invariant });
    const agent: AgentRow = { ...baseAgent, projectContextPaths: ['specs/foo.md'] };
    const agentsRepo = { linkedSkills: async () => [] } as unknown as Container['agentsRepo'];

    const executor = new ReviewRunExecutor(container, repo, agentsRepo);
    await executor.executeRuns('ws-1', pull, repoRow, [{ agent, runId: 'run-2' }]);

    const trace = traces['run-2'];
    expect(trace!.specs_read).toEqual(['specs/foo.md']);
    expect(trace!.prompt_assembly.specs).toContain(invariant);
    expect(trace!.specs_tokens).not.toBeNull();
    expect(trace!.specs_tokens).toBeGreaterThan(0);
  });

  it('leaves specs_read/specs_tokens empty/null when the effective attached set is empty', async () => {
    const { repo, traces } = makeRepo();
    const container = makeContainer({});
    const agent: AgentRow = { ...baseAgent, projectContextPaths: [] };
    const agentsRepo = { linkedSkills: async () => [] } as unknown as Container['agentsRepo'];

    const executor = new ReviewRunExecutor(container, repo, agentsRepo);
    await executor.executeRuns('ws-1', pull, repoRow, [{ agent, runId: 'run-3' }]);

    const trace = traces['run-3'];
    expect(trace!.specs_read).toEqual([]);
    expect(trace!.specs_tokens).toBeNull();
    expect(trace!.prompt_assembly.specs).toBeFalsy();
  });

  it('inherits a linked (enabled) skill\'s attached paths into the effective set (AC-17)', async () => {
    const { repo, traces } = makeRepo();
    const container = makeContainer({ 'docs/skill-doc.md': 'Skill-attached doc content.' });
    const agent: AgentRow = { ...baseAgent, projectContextPaths: [] };
    const agentsRepo = {
      linkedSkills: async () => [
        {
          skill: { enabled: true, projectContextPaths: ['docs/skill-doc.md'] },
          order: 0,
        },
      ],
    } as unknown as Container['agentsRepo'];

    const executor = new ReviewRunExecutor(container, repo, agentsRepo);
    await executor.executeRuns('ws-1', pull, repoRow, [{ agent, runId: 'run-4' }]);

    const trace = traces['run-4'];
    expect(trace!.specs_read).toEqual(['docs/skill-doc.md']);
    expect(trace!.prompt_assembly.specs).toContain('Skill-attached doc content.');
  });
});
