import { describe, it, expect } from 'vitest';
import {
  buildFindingDiffFragment,
  computeAlert,
  extractRunFindings,
  extractRunSnapshot,
  extractRunVersion,
  parseExpectedOutput,
  parseInputMetaCoord,
  scoreCase,
  toEvalCaseDto,
  toEvalRunRecordDto,
} from './helpers.js';
import type { EvalCaseRow, EvalRunRow } from './repository.js';

function caseRow(overrides: Partial<EvalCaseRow> = {}): EvalCaseRow {
  return {
    id: 'case-1',
    workspaceId: 'ws-1',
    ownerKind: 'agent',
    ownerId: 'agent-1',
    name: 'A case',
    inputDiff: 'diff --git a/a.ts b/a.ts',
    inputFiles: [{ path: 'a.ts', patch: '' }],
    inputMeta: { file: 'a.ts', start_line: 1, end_line: 1, severity: 'WARNING', category: 'bug', title: 'T' },
    expectedOutput: [],
    notes: null,
    ...overrides,
  };
}

function runRow(overrides: Partial<EvalRunRow> = {}): EvalRunRow {
  return {
    id: 'run-1',
    caseId: 'case-1',
    ranAt: new Date('2026-01-01T00:00:00.000Z'),
    actualOutput: null,
    pass: null,
    recall: null,
    precision: null,
    citationAccuracy: null,
    durationMs: null,
    costUsd: null,
    ...overrides,
  };
}

describe('DTO mapping', () => {
  it('toEvalCaseDto maps camelCase row -> snake_case DTO, defaulting null input_diff to empty string', () => {
    const row = caseRow({ inputDiff: null });
    const dto = toEvalCaseDto(row);
    expect(dto).toEqual({
      id: 'case-1',
      owner_kind: 'agent',
      owner_id: 'agent-1',
      name: 'A case',
      input_diff: '',
      input_files: row.inputFiles,
      input_meta: row.inputMeta,
      expected_output: row.expectedOutput,
      notes: null,
    });
  });

  it('toEvalRunRecordDto maps camelCase row -> snake_case DTO with the given case name', () => {
    const row = runRow({ pass: true, recall: 1, precision: 1, citationAccuracy: 1, durationMs: 500, costUsd: 0.01 });
    const dto = toEvalRunRecordDto(row, 'A case');
    expect(dto).toEqual({
      id: 'run-1',
      case_id: 'case-1',
      case_name: 'A case',
      ran_at: '2026-01-01T00:00:00.000Z',
      actual_output: null,
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 500,
      cost_usd: 0.01,
    });
  });
});

describe('parseExpectedOutput (D1 defensive decode)', () => {
  it('valid skeleton array parses through', () => {
    const raw = [{ file: 'a.ts', start_line: 1, end_line: 2 }];
    expect(parseExpectedOutput(raw)).toEqual(raw);
  });

  it('empty array parses to empty array', () => {
    expect(parseExpectedOutput([])).toEqual([]);
  });

  it('malformed data degrades to [] rather than throwing', () => {
    expect(parseExpectedOutput({ not: 'an array' })).toEqual([]);
    expect(parseExpectedOutput(null)).toEqual([]);
    expect(parseExpectedOutput([{ file: 'a.ts' }])).toEqual([]); // missing start_line/end_line
  });
});

describe('parseInputMetaCoord', () => {
  it('valid coordinate parses through', () => {
    const raw = { file: 'a.ts', start_line: 1, end_line: 2, severity: 'WARNING', category: 'bug', title: 'T' };
    expect(parseInputMetaCoord(raw)).toEqual(raw);
  });

  it('malformed/missing data returns undefined', () => {
    expect(parseInputMetaCoord(null)).toBeUndefined();
    expect(parseInputMetaCoord({})).toBeUndefined();
  });
});

describe('scoreCase (D1/AC-5 dispatch + D6 single overlap primitive)', () => {
  it('non-empty expected_output -> must_find scoring', () => {
    const row = caseRow({ expectedOutput: [{ file: 'a.ts', start_line: 1, end_line: 1 }] });
    const score = scoreCase(row, [
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
    expect(score.pass).toBe(true);
    expect(score.tp).toBe(1);
  });

  it('empty expected_output -> must_not_flag scoring against input_meta', () => {
    const row = caseRow({ expectedOutput: [] });
    const score = scoreCase(row, [
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
    expect(score.pass).toBe(false);
    expect(score.fp).toBe(1);
  });

  it('empty expected_output + missing/malformed input_meta -> vacuous TN (nothing to check)', () => {
    const row = caseRow({ expectedOutput: [], inputMeta: null });
    const score = scoreCase(row, []);
    expect(score).toEqual({ tp: 0, fn: 0, fp: 0, tn: 1, exactTp: 0, pass: true });
  });
});

describe('extractRunVersion / extractRunSnapshot / extractRunFindings (D3/D4)', () => {
  const actualOutput = {
    findings: [{ id: 'f1' }],
    snapshot: { system_prompt: 'sp', model: 'm', skills: ['s1'], version: 3 },
  };

  it('extracts the version embedded in actual_output.snapshot', () => {
    expect(extractRunVersion(actualOutput)).toBe(3);
  });

  it('extracts the full snapshot', () => {
    expect(extractRunSnapshot(actualOutput)).toEqual({ system_prompt: 'sp', model: 'm', skills: ['s1'], version: 3 });
  });

  it('extracts findings', () => {
    expect(extractRunFindings(actualOutput)).toEqual([{ id: 'f1' }]);
  });

  it('all three degrade gracefully on null/malformed actual_output', () => {
    expect(extractRunVersion(null)).toBeNull();
    expect(extractRunSnapshot(null)).toBeNull();
    expect(extractRunFindings(null)).toEqual([]);
    expect(extractRunVersion({})).toBeNull();
    expect(extractRunFindings({ findings: 'not-an-array' })).toEqual([]);
  });
});

describe('buildFindingDiffFragment (route 6, D5)', () => {
  it('builds a single-file diff header matching diffFromPrFiles convention', () => {
    const { input_diff, input_files } = buildFindingDiffFragment('src/a.ts', '@@ -1,1 +1,1 @@\n-old\n+new');
    expect(input_diff).toBe(
      'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n-old\n+new',
    );
    expect(input_files).toEqual([{ path: 'src/a.ts', patch: '@@ -1,1 +1,1 @@\n-old\n+new' }]);
  });
});

describe('computeAlert (D7/AC-33)', () => {
  const base = { recall: 0.9, precision: 0.9, citation_accuracy: 0.9 };

  it('null when there is no preceding version-group', () => {
    expect(computeAlert(base, null, 2)).toBeNull();
  });

  it('null when nothing dropped by >= threshold', () => {
    expect(computeAlert(base, { recall: 0.905, precision: 0.9, citation_accuracy: 0.9 }, 2)).toBeNull();
  });

  it('non-null when recall dropped by >= threshold percentage points', () => {
    const alert = computeAlert({ recall: 0.8, precision: 0.9, citation_accuracy: 0.9 }, base, 2);
    expect(alert).not.toBeNull();
    expect(alert).toContain('Recall');
  });

  it('lists every metric that dropped enough', () => {
    const alert = computeAlert({ recall: 0.5, precision: 0.5, citation_accuracy: 0.9 }, base, 2);
    expect(alert).toContain('Recall');
    expect(alert).toContain('Precision');
    expect(alert).not.toContain('Citation accuracy');
  });
});
