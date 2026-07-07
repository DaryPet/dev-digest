/**
 * Unit tests for cli/format.ts — pure formatting + exit-code decision.
 *
 * No I/O, no DB, no LLM. Tests the output format and exit-code matrix.
 */
import { describe, it, expect } from 'vitest';
import { formatReviewOutput } from './format.js';
import type { ReviewOutcome } from '@devdigest/reviewer-core';
import type { Finding, CiFailOn } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function makeOutcome(findings: Finding[], grounding = '3/3 passed'): ReviewOutcome {
  return {
    review: {
      verdict: 'request_changes',
      summary: 'Issues found.',
      score: 55,
      findings,
    },
    grounding,
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

const DEFAULT_OPTS = {
  mode: 'working',
  agentName: 'General Reviewer',
  agentProvider: 'openrouter',
  agentModel: 'deepseek/deepseek-v4-flash',
  filesCount: 4,
};

// ---------------------------------------------------------------------------
// Header / structure tests
// ---------------------------------------------------------------------------

describe('formatReviewOutput — header', () => {
  it('produces the header line with mode, agent name, and provider/model', () => {
    const { output } = formatReviewOutput(makeOutcome([]), 'critical', DEFAULT_OPTS);
    const lines = output.split('\n');
    expect(lines[0]).toBe(
      'DevDigest review — mode: working · agent: General Reviewer (openrouter/deepseek/deepseek-v4-flash)',
    );
  });

  it('produces the diff file count on line 2', () => {
    const { output } = formatReviewOutput(makeOutcome([]), 'critical', {
      ...DEFAULT_OPTS,
      filesCount: 7,
    });
    const lines = output.split('\n');
    expect(lines[1]).toBe('Diff: 7 file(s)');
  });

  it('produces verdict and score line', () => {
    const { output } = formatReviewOutput(makeOutcome([]), 'critical', DEFAULT_OPTS);
    expect(output).toContain('VERDICT: request_changes   SCORE: 55');
  });

  it('produces grounding line', () => {
    const { output } = formatReviewOutput(makeOutcome([]), 'critical', DEFAULT_OPTS);
    expect(output).toContain('GROUNDING: 3/3 passed');
  });
});

// ---------------------------------------------------------------------------
// Finding format tests
// ---------------------------------------------------------------------------

describe('formatReviewOutput — finding format', () => {
  it('formats a CRITICAL finding without suggestion', () => {
    const finding = makeFinding({
      severity: 'CRITICAL',
      file: 'src/api/users.ts',
      start_line: 45,
      end_line: 52,
      title: 'N+1 query in user list',
      rationale: 'Loop issues one query per user.',
      suggestion: null,
    });
    const { output } = formatReviewOutput(makeOutcome([finding]), 'critical', DEFAULT_OPTS);
    expect(output).toContain('[CRITICAL] src/api/users.ts:45-52 — N+1 query in user list');
    expect(output).toContain('  Loop issues one query per user.');
    expect(output).not.toContain('Suggestion:');
  });

  it('formats a finding with suggestion', () => {
    const finding = makeFinding({
      severity: 'WARNING',
      file: 'src/db.ts',
      start_line: 10,
      end_line: 10,
      title: 'Missing index',
      rationale: 'Full table scan on every request.',
      suggestion: 'Add index on user_id column.',
    });
    const { output } = formatReviewOutput(makeOutcome([finding]), 'warning', DEFAULT_OPTS);
    expect(output).toContain('[WARNING] src/db.ts:10-10 — Missing index');
    expect(output).toContain('  Full table scan on every request.');
    expect(output).toContain('  Suggestion: Add index on user_id column.');
  });

  it('includes a blank line before each finding block', () => {
    const f1 = makeFinding({ title: 'Finding 1', id: 'f1' });
    const f2 = makeFinding({ title: 'Finding 2', id: 'f2' });
    const { output } = formatReviewOutput(makeOutcome([f1, f2]), 'critical', DEFAULT_OPTS);
    // Each [SEVERITY] line should be preceded by an empty line
    const lines = output.split('\n');
    const idx1 = lines.findIndex((l) => l.includes('Finding 1'));
    const idx2 = lines.findIndex((l) => l.includes('Finding 2'));
    expect(lines[idx1 - 1]).toBe('');
    expect(lines[idx2 - 1]).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Footer format tests
// ---------------------------------------------------------------------------

describe('formatReviewOutput — footer', () => {
  it('shows finding count and blocker count with gate label', () => {
    const findings = [
      makeFinding({ severity: 'CRITICAL', id: 'f1' }),
      makeFinding({ severity: 'WARNING', id: 'f2' }),
    ];
    const { output } = formatReviewOutput(makeOutcome(findings), 'critical', DEFAULT_OPTS);
    // 1 CRITICAL blocker with critical gate
    expect(output).toContain('2 finding(s) · 1 blocker(s) (gate: CRITICAL)');
  });

  it('shows 0 finding(s) when no findings', () => {
    const { output } = formatReviewOutput(makeOutcome([]), 'critical', DEFAULT_OPTS);
    expect(output).toContain('0 finding(s) · 0 blocker(s) (gate: CRITICAL)');
  });

  it('uppercases the gate name', () => {
    const { output } = formatReviewOutput(makeOutcome([]), 'warning', DEFAULT_OPTS);
    expect(output).toContain('(gate: WARNING)');
  });
});

// ---------------------------------------------------------------------------
// Exit-code matrix
// ---------------------------------------------------------------------------

describe('formatReviewOutput — exit code', () => {
  it('returns exit code 0 when no findings', () => {
    const { exitCode } = formatReviewOutput(makeOutcome([]), 'critical', DEFAULT_OPTS);
    expect(exitCode).toBe(0);
  });

  it('returns exit code 0 when findings are below the gate (SUGGESTION with critical gate)', () => {
    const findings = [
      makeFinding({ severity: 'SUGGESTION', id: 'f1' }),
      makeFinding({ severity: 'SUGGESTION', id: 'f2' }),
    ];
    const { exitCode } = formatReviewOutput(makeOutcome(findings), 'critical', DEFAULT_OPTS);
    expect(exitCode).toBe(0);
  });

  it('returns exit code 0 when gate is "never"', () => {
    const findings = [makeFinding({ severity: 'CRITICAL', id: 'f1' })];
    const { exitCode } = formatReviewOutput(makeOutcome(findings), 'never', DEFAULT_OPTS);
    expect(exitCode).toBe(0);
  });

  it('returns exit code 1 when CRITICAL finding with critical gate', () => {
    const findings = [makeFinding({ severity: 'CRITICAL', id: 'f1' })];
    const { exitCode } = formatReviewOutput(makeOutcome(findings), 'critical', DEFAULT_OPTS);
    expect(exitCode).toBe(1);
  });

  it('returns exit code 1 when WARNING finding with warning gate', () => {
    const findings = [makeFinding({ severity: 'WARNING', id: 'f1' })];
    const { exitCode } = formatReviewOutput(makeOutcome(findings), 'warning', DEFAULT_OPTS);
    expect(exitCode).toBe(1);
  });

  it('returns exit code 1 when any finding with "any" gate', () => {
    const findings = [makeFinding({ severity: 'SUGGESTION', id: 'f1' })];
    const { exitCode } = formatReviewOutput(makeOutcome(findings), 'any', DEFAULT_OPTS);
    expect(exitCode).toBe(1);
  });

  it('counts only findings at or above the gate', () => {
    const findings = [
      makeFinding({ severity: 'CRITICAL', id: 'f1' }),
      makeFinding({ severity: 'WARNING', id: 'f2' }),
      makeFinding({ severity: 'SUGGESTION', id: 'f3' }),
    ];
    const { output, exitCode } = formatReviewOutput(makeOutcome(findings), 'critical', DEFAULT_OPTS);
    // Only CRITICAL is a blocker
    expect(output).toContain('3 finding(s) · 1 blocker(s) (gate: CRITICAL)');
    expect(exitCode).toBe(1);
  });
});
