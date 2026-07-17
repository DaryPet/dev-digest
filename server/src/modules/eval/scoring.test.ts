import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { overlaps, scoreMustFind, scoreMustNotFlag, aggregateScores } from './scoring.js';
import type { FindingSkeleton, InputMetaCoord } from './types.js';

/**
 * Pure scoring unit tests (spec §C, AC-11-16). No DB, no LLM — `overlaps`/
 * `scoreMustFind`/`scoreMustNotFlag`/`aggregateScores` are plain functions.
 */

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Some finding',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'because',
    confidence: 0.9,
    ...overrides,
  };
}

function skeleton(overrides: Partial<FindingSkeleton> = {}): FindingSkeleton {
  return { file: 'src/a.ts', start_line: 10, end_line: 12, ...overrides };
}

describe('overlaps (AC-11/D6)', () => {
  it('true for same file with intersecting ranges', () => {
    expect(overlaps({ file: 'a.ts', start_line: 5, end_line: 10 }, { file: 'a.ts', start_line: 8, end_line: 12 })).toBe(
      true,
    );
  });

  it('true for identical single-line coordinates', () => {
    expect(overlaps({ file: 'a.ts', start_line: 5, end_line: 5 }, { file: 'a.ts', start_line: 5, end_line: 5 })).toBe(
      true,
    );
  });

  it('false for different files even with the same line range', () => {
    expect(overlaps({ file: 'a.ts', start_line: 5, end_line: 10 }, { file: 'b.ts', start_line: 5, end_line: 10 })).toBe(
      false,
    );
  });

  it('false for same file with disjoint ranges', () => {
    expect(overlaps({ file: 'a.ts', start_line: 1, end_line: 3 }, { file: 'a.ts', start_line: 4, end_line: 6 })).toBe(
      false,
    );
  });
});

describe('scoreMustFind (AC-12/AC-14/AC-15)', () => {
  it('one expected element matched exactly -> TP + exact citation, case passes', () => {
    const score = scoreMustFind([skeleton()], [finding()]);
    expect(score).toEqual({ tp: 1, fn: 0, fp: 0, tn: 0, exactTp: 1, pass: true });
  });

  it('matched but with a different (overlapping, non-exact) line range -> TP without exact citation', () => {
    const score = scoreMustFind([skeleton({ start_line: 10, end_line: 12 })], [finding({ start_line: 11, end_line: 15 })]);
    expect(score).toEqual({ tp: 1, fn: 0, fp: 0, tn: 0, exactTp: 0, pass: true });
  });

  it('unmatched expected element -> FN, case fails', () => {
    const score = scoreMustFind([skeleton({ file: 'other.ts' })], [finding()]);
    expect(score).toEqual({ tp: 0, fn: 1, fp: 0, tn: 0, exactTp: 0, pass: false });
  });

  it('1:1 matching — one actual finding is consumed by at most one expected element', () => {
    const expected = [skeleton(), skeleton()]; // two identical skeletons
    const actual = [finding()]; // only one actual finding
    const score = scoreMustFind(expected, actual);
    expect(score.tp).toBe(1);
    expect(score.fn).toBe(1);
    expect(score.pass).toBe(false); // AC-15: only passes when ALL expected matched
  });

  it('partial match: some matched, some not -> mixed TP/FN, case still fails (AC-15 edge case)', () => {
    const expected = [skeleton({ start_line: 10, end_line: 12 }), skeleton({ file: 'other.ts' })];
    const actual = [finding({ start_line: 10, end_line: 12 })];
    const score = scoreMustFind(expected, actual);
    expect(score.tp).toBe(1);
    expect(score.fn).toBe(1);
    expect(score.pass).toBe(false);
  });
});

describe('scoreMustNotFlag (AC-13/D6)', () => {
  const coord: InputMetaCoord = { file: 'src/a.ts', start_line: 10, end_line: 12 };

  it('no overlapping actual finding -> TN, case passes', () => {
    const score = scoreMustNotFlag(coord, [finding({ file: 'other.ts' })]);
    expect(score).toEqual({ tp: 0, fn: 0, fp: 0, tn: 1, exactTp: 0, pass: true });
  });

  it('an overlapping actual finding -> exactly one FP regardless of how many overlap, case fails', () => {
    const score = scoreMustNotFlag(coord, [finding(), finding({ id: 'f2', start_line: 11, end_line: 11 })]);
    expect(score).toEqual({ tp: 0, fn: 0, fp: 1, tn: 0, exactTp: 0, pass: false });
  });

  it('an unrelated finding elsewhere in the fragment (no overlap) does not count as FP', () => {
    const score = scoreMustNotFlag(coord, [finding({ file: 'src/a.ts', start_line: 50, end_line: 52 })]);
    expect(score).toEqual({ tp: 0, fn: 0, fp: 0, tn: 1, exactTp: 0, pass: true });
  });
});

describe('aggregateScores (AC-14/AC-16, zero-denominator convention §6.3)', () => {
  it('empty set -> recall/precision/citation_accuracy all 1 (nothing expected, nothing missed)', () => {
    expect(aggregateScores([])).toEqual({
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      traces_passed: 0,
      traces_total: 0,
    });
  });

  it('a lone must_not_flag TN -> recall=1 (no must_find denom), precision=1 (no FP), citation_accuracy=1 (TP=0)', () => {
    const agg = aggregateScores([{ tp: 0, fn: 0, fp: 0, tn: 1, exactTp: 0, pass: true }]);
    expect(agg).toEqual({ recall: 1, precision: 1, citation_accuracy: 1, traces_passed: 1, traces_total: 1 });
  });

  it('micro-averages TP/FN/FP across multiple cases, not a simple average of per-case ratios', () => {
    // case 1: must_find, 1 TP + 1 FN (recall 0.5 alone)
    const case1 = { tp: 1, fn: 1, fp: 0, tn: 0, exactTp: 1, pass: false };
    // case 2: must_find, 1 TP + 0 FN (recall 1 alone)
    const case2 = { tp: 1, fn: 0, fp: 0, tn: 0, exactTp: 0, pass: true };
    const agg = aggregateScores([case1, case2]);
    // micro-average: tp=2, fn=1 -> recall = 2/3, not (0.5+1)/2 = 0.75
    expect(agg.recall).toBeCloseTo(2 / 3);
    expect(agg.citation_accuracy).toBeCloseTo(1 / 2); // exactTp=1 of tp=2
    expect(agg.traces_passed).toBe(1);
    expect(agg.traces_total).toBe(2);
  });

  it('precision aggregates must_find TPs together with must_not_flag FPs in the same run', () => {
    const mustFind = { tp: 2, fn: 0, fp: 0, tn: 0, exactTp: 2, pass: true };
    const mustNotFlag = { tp: 0, fn: 0, fp: 1, tn: 0, exactTp: 0, pass: false };
    const agg = aggregateScores([mustFind, mustNotFlag]);
    expect(agg.precision).toBeCloseTo(2 / 3); // tp=2 / (tp=2 + fp=1)
    expect(agg.traces_passed).toBe(1);
    expect(agg.traces_total).toBe(2);
  });
});
