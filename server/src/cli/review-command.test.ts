/**
 * Unit tests for cli/review-command.ts.
 *
 * No real git, DB, or LLM calls. All dependencies are injected via the
 * ReviewCommandDeps interface.
 */
import { describe, it, expect, vi } from 'vitest';
import { runReviewCommand } from './review-command.js';
import type { ReviewCommandDeps, ReviewCommandOptions } from './review-command.js';
import type { AgentRow } from '../db/rows.js';
import type { ReviewOutcome } from '@devdigest/reviewer-core';
import type { LLMProvider, Finding } from '@devdigest/shared';
import { NotAGitRepoError } from './git-diff.js';
import { ConfigError } from '../platform/errors.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_WS = 'ws-test-1';

const DEFAULT_AGENT: AgentRow = {
  id: 'agent-1',
  workspaceId: DEFAULT_WS,
  name: 'General Reviewer',
  description: 'General code review',
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  systemPrompt: 'Review the code.',
  outputSchema: null,
  strategy: 'single-pass',
  ciFailOn: 'critical',
  repoIntel: false,
  projectContextPaths: null,
  enabled: true,
  version: 1,
  createdBy: null,
  createdAt: new Date('2026-07-05T00:00:00.000Z'),
};

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'CRITICAL',
    category: 'bug',
    title: 'Test finding',
    file: 'src/api.ts',
    start_line: 10,
    end_line: 15,
    rationale: 'This is a problem.',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    ...overrides,
  };
}

function makeOutcome(findings: Finding[] = []): ReviewOutcome {
  return {
    review: {
      verdict: 'request_changes',
      summary: 'Issues found.',
      score: 55,
      findings,
    },
    grounding: '2/3 passed',
    dropped: [],
    mode: 'single-pass',
    assembly: {} as never,
    chunks: [],
    tokensIn: 100,
    tokensOut: 50,
    costUsd: null,
    raw: '',
  };
}

/** A minimal valid git diff for one file. */
const SAMPLE_DIFF = `diff --git a/src/api.ts b/src/api.ts
index 1234567..abcdef0 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -10,6 +10,9 @@
 const x = 1;
+const y = 2;
+const z = 3;
`;

const DEFAULT_OPTS: ReviewCommandOptions = {
  mode: 'working',
  agentName: 'General Reviewer',
  targetDir: '/fake/repo',
};

interface CapturedDeps extends ReviewCommandDeps {
  stderrLines: string[];
  stdoutLines: string[];
}

function makeDeps(overrides: {
  rawDiff?: string;
  gitError?: Error;
  agents?: AgentRow[];
  workspaceId?: string;
  llmError?: Error;
  outcome?: ReviewOutcome;
}): CapturedDeps {
  const stderrLines: string[] = [];
  const stdoutLines: string[] = [];

  return {
    stderrLines,
    stdoutLines,
    getGitDiff: async (_cwd: string) => {
      if (overrides.gitError) throw overrides.gitError;
      return overrides.rawDiff ?? SAMPLE_DIFF;
    },
    listAgents: async (_wsId: string) => overrides.agents ?? [DEFAULT_AGENT],
    getCurrentWorkspace: async () => ({ id: overrides.workspaceId ?? DEFAULT_WS }),
    getLlm: async (_provider: string): Promise<LLMProvider> => {
      if (overrides.llmError) throw overrides.llmError;
      return {} as LLMProvider;
    },
    doReview: async (_input) => {
      if (!overrides.outcome) {
        throw new Error('doReview stub: no outcome configured');
      }
      return overrides.outcome;
    },
    stderr: (msg) => stderrLines.push(msg),
    stdout: (msg) => stdoutLines.push(msg),
  };
}

// ---------------------------------------------------------------------------
// Empty diff
// ---------------------------------------------------------------------------

describe('runReviewCommand — empty diff', () => {
  it('exits 0 and prints "No changes in working tree." for empty diff', async () => {
    const deps = makeDeps({ rawDiff: '' });
    const code = await runReviewCommand(DEFAULT_OPTS, deps);
    expect(code).toBe(0);
    expect(deps.stdoutLines).toContain('No changes in working tree.');
  });

  it('exits 0 for whitespace-only diff', async () => {
    const deps = makeDeps({ rawDiff: '   \n\n  ' });
    const code = await runReviewCommand(DEFAULT_OPTS, deps);
    expect(code).toBe(0);
    expect(deps.stdoutLines).toContain('No changes in working tree.');
  });
});

// ---------------------------------------------------------------------------
// Not a git repo
// ---------------------------------------------------------------------------

describe('runReviewCommand — not a git repo', () => {
  it('exits 2 and writes error to stderr', async () => {
    const deps = makeDeps({ gitError: new NotAGitRepoError('/fake/repo') });
    const code = await runReviewCommand(DEFAULT_OPTS, deps);
    expect(code).toBe(2);
    expect(deps.stderrLines.some((l) => l.includes('not a git repository'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Agent not found
// ---------------------------------------------------------------------------

describe('runReviewCommand — agent not found', () => {
  it('exits 2 and lists available agents', async () => {
    const deps = makeDeps({
      agents: [{ ...DEFAULT_AGENT, name: 'Security Reviewer' }],
    });
    const code = await runReviewCommand(
      { ...DEFAULT_OPTS, agentName: 'Nonexistent Agent' },
      deps,
    );
    expect(code).toBe(2);
    expect(deps.stderrLines.some((l) => l.includes('Nonexistent Agent'))).toBe(true);
    expect(deps.stderrLines.some((l) => l.includes('Security Reviewer'))).toBe(true);
  });

  it('exits 2 listing "(none)" when workspace has no agents', async () => {
    const deps = makeDeps({ agents: [] });
    const code = await runReviewCommand(DEFAULT_OPTS, deps);
    expect(code).toBe(2);
    expect(deps.stderrLines.some((l) => l.includes('(none)'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ConfigError
// ---------------------------------------------------------------------------

describe('runReviewCommand — ConfigError', () => {
  it('exits 2 with the ConfigError message when LLM key is missing', async () => {
    const deps = makeDeps({
      llmError: new ConfigError('OPENROUTER_API_KEY is not configured'),
      outcome: makeOutcome([]),
    });
    const code = await runReviewCommand(DEFAULT_OPTS, deps);
    expect(code).toBe(2);
    expect(deps.stderrLines.some((l) => l.includes('OPENROUTER_API_KEY'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Successful review — no blockers
// ---------------------------------------------------------------------------

describe('runReviewCommand — successful review, no blockers', () => {
  it('exits 0 when outcome has no CRITICAL findings (gate: critical)', async () => {
    const outcome = makeOutcome([
      makeFinding({ severity: 'SUGGESTION', id: 'f1' }),
    ]);
    const deps = makeDeps({ outcome });
    const code = await runReviewCommand(DEFAULT_OPTS, deps);
    expect(code).toBe(0);
  });

  it('writes the formatted review to stdout', async () => {
    const outcome = makeOutcome([]);
    const deps = makeDeps({ outcome });
    await runReviewCommand(DEFAULT_OPTS, deps);
    const fullOutput = deps.stdoutLines.join('\n');
    expect(fullOutput).toContain('DevDigest review');
    expect(fullOutput).toContain('VERDICT:');
    expect(fullOutput).toContain('GROUNDING:');
    expect(fullOutput).toContain('finding(s)');
  });
});

// ---------------------------------------------------------------------------
// Successful review — with blockers
// ---------------------------------------------------------------------------

describe('runReviewCommand — successful review, with blockers', () => {
  it('exits 1 when outcome has CRITICAL findings (gate: critical)', async () => {
    const outcome = makeOutcome([makeFinding({ severity: 'CRITICAL', id: 'f1' })]);
    const deps = makeDeps({ outcome });
    const code = await runReviewCommand(DEFAULT_OPTS, deps);
    expect(code).toBe(1);
  });

  it('exits 1 for WARNING finding with warning gate', async () => {
    const agent: AgentRow = { ...DEFAULT_AGENT, ciFailOn: 'warning' };
    const outcome = makeOutcome([makeFinding({ severity: 'WARNING', id: 'f1' })]);
    const deps = makeDeps({ agents: [agent], outcome });
    const code = await runReviewCommand(DEFAULT_OPTS, deps);
    expect(code).toBe(1);
  });

  it('includes finding details in stdout output', async () => {
    const outcome = makeOutcome([
      makeFinding({
        severity: 'CRITICAL',
        file: 'src/auth.ts',
        start_line: 30,
        end_line: 35,
        title: 'SQL injection risk',
        rationale: 'User input passed directly to query.',
        suggestion: 'Use parameterized queries.',
        id: 'f1',
      }),
    ]);
    const deps = makeDeps({ outcome });
    await runReviewCommand(DEFAULT_OPTS, deps);
    const fullOutput = deps.stdoutLines.join('\n');
    expect(fullOutput).toContain('[CRITICAL] src/auth.ts:30-35 — SQL injection risk');
    expect(fullOutput).toContain('User input passed directly to query.');
    expect(fullOutput).toContain('Suggestion: Use parameterized queries.');
  });
});

// ---------------------------------------------------------------------------
// onEvent → stderr
// ---------------------------------------------------------------------------

describe('runReviewCommand — onEvent to stderr', () => {
  it('passes onEvent that writes [kind] msg to stderr', async () => {
    const outcome = makeOutcome([]);
    let capturedOnEvent: ((e: { kind: string; msg: string }) => void) | undefined;

    const deps = makeDeps({ outcome });
    // Override doReview to capture onEvent
    deps.doReview = async (input) => {
      capturedOnEvent = input.onEvent as (e: { kind: string; msg: string }) => void;
      return outcome;
    };

    await runReviewCommand(DEFAULT_OPTS, deps);
    expect(capturedOnEvent).toBeDefined();

    // Simulate an event
    capturedOnEvent!({ kind: 'start', msg: 'Starting review' });
    expect(deps.stderrLines.some((l) => l.includes('[start] Starting review'))).toBe(true);
  });
});
