import type { Finding } from '@devdigest/shared';
import type { FindingSkeleton, InputMetaCoord } from './types.js';

/**
 * Code-only eval scoring (spec §C, AC-11–16). Pure, zero-I/O, no LLM call —
 * a NEW, SEPARATE primitive from `reviewer-core/src/grounding.ts`'s citation
 * gate (which stays unmodified; see `specs/eval-pipeline.md` "Risks / notes").
 * Both happen to be file+line-intersection ideas, but this file does not
 * import from or depend on grounding.ts in any way.
 */

/** Minimal file + line-range coordinate. */
export interface Coord {
  file: string;
  start_line: number;
  end_line: number;
}

/**
 * AC-11/D6 — the ONE overlap primitive used by every scoring path: same
 * `file` AND `[start_line, end_line]` intersects.
 */
export function overlaps(a: Coord, b: Coord): boolean {
  return a.file === b.file && a.start_line <= b.end_line && b.start_line <= a.end_line;
}

/**
 * One case's raw score components — TP/FN/FP/TN counts, `exactTp` (TPs whose
 * lines matched EXACTLY, the citation_accuracy numerator, AC-14), and the
 * case-level pass/fail (AC-15).
 */
export interface CaseScore {
  tp: number;
  fn: number;
  fp: number;
  tn: number;
  exactTp: number;
  pass: boolean;
}

/**
 * AC-12 — must_find scoring: 1:1 match each `expected` skeleton against
 * `actual` findings via the overlap primitive (each actual finding consumed
 * by at most one match, first-match-wins). An unmatched expected element is
 * one FN; a matched one is one TP (and one `exactTp` when the actual
 * finding's lines match the skeleton's EXACTLY). AC-15: the case passes only
 * when every expected element matched (`fn === 0`).
 */
export function scoreMustFind(expected: FindingSkeleton[], actual: Finding[]): CaseScore {
  const usedActual = new Set<number>();
  let tp = 0;
  let fn = 0;
  let exactTp = 0;
  for (const exp of expected) {
    const idx = actual.findIndex((a, i) => !usedActual.has(i) && overlaps(exp, a));
    if (idx === -1) {
      fn++;
      continue;
    }
    usedActual.add(idx);
    tp++;
    const match = actual[idx]!;
    if (match.start_line === exp.start_line && match.end_line === exp.end_line) exactTp++;
  }
  return { tp, fn, fp: 0, tn: 0, exactTp, pass: fn === 0 };
}

/**
 * AC-13/D6 — must_not_flag scoring: any actual finding overlapping the ONE
 * origin coordinate stored in `input_meta` counts as exactly one FP for the
 * case; no overlap counts as one TN. AC-15: the case passes only on a TN. An
 * unrelated actual finding elsewhere in the diff fragment that does NOT
 * overlap the coordinate does not count as an FP (edge case in the spec).
 */
export function scoreMustNotFlag(coord: InputMetaCoord, actual: Finding[]): CaseScore {
  const flagged = actual.some((a) => overlaps(coord, a));
  return flagged
    ? { tp: 0, fn: 0, fp: 1, tn: 0, exactTp: 0, pass: false }
    : { tp: 0, fn: 0, fp: 0, tn: 1, exactTp: 0, pass: true };
}

/** Aggregate of one or more `CaseScore`s — the `EvalRun`-shaped numbers. */
export interface AggregateScore {
  recall: number;
  precision: number;
  citation_accuracy: number;
  traces_passed: number;
  traces_total: number;
}

/**
 * AC-14/AC-16 — micro-average recall/precision/citation_accuracy over a SET
 * of case scores (a single case for a per-case run, or every case in a
 * batch/version-group for the dashboard aggregate), with the approved
 * zero-denominator convention (spec §6.3, developer-approved):
 *   - recall = 1 when TP+FN = 0 ("nothing expected, nothing missed")
 *   - precision = 1 when TP+FP = 0 ("nothing claimed, nothing wrong")
 *   - citation_accuracy = 1 when TP = 0
 * `traces_total`/`traces_passed` count CASES (AC-16), not skeleton elements.
 */
export function aggregateScores(scores: CaseScore[]): AggregateScore {
  let tp = 0;
  let fn = 0;
  let fp = 0;
  let exactTp = 0;
  let passed = 0;
  for (const s of scores) {
    tp += s.tp;
    fn += s.fn;
    fp += s.fp;
    exactTp += s.exactTp;
    if (s.pass) passed++;
  }
  return {
    recall: tp + fn === 0 ? 1 : tp / (tp + fn),
    precision: tp + fp === 0 ? 1 : tp / (tp + fp),
    citation_accuracy: tp === 0 ? 1 : exactTp / tp,
    traces_passed: passed,
    traces_total: scores.length,
  };
}
