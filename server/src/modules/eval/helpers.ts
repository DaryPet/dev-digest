import type { EvalCase, EvalRunRecord, Finding } from '@devdigest/shared';
import type { EvalCaseRow, EvalRunRow } from './repository.js';
import { ExpectedOutput, InputMetaCoord, type FindingSkeleton, type RunSnapshot } from './types.js';
import { scoreMustFind, scoreMustNotFlag, type CaseScore } from './scoring.js';

/**
 * Pure DTO mapping + defensive jsonb decoding for the eval module. No I/O.
 */

// ---- DTO mapping ------------------------------------------------------------

export function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalCase['owner_kind'],
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    expected_output: row.expectedOutput,
    notes: row.notes,
  };
}

export function toEvalRunRecordDto(row: EvalRunRow, caseName: string | null): EvalRunRecord {
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: caseName,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput,
    pass: row.pass,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
  };
}

// ---- defensive jsonb decoding ------------------------------------------------

/**
 * Parse `expected_output` (D1) defensively — malformed/legacy stored data
 * degrades to `[]` (functionally a must_not_flag case) rather than throwing
 * mid-batch. Strict validation at the WRITE boundary (AC-24) is the editor's
 * job (T-B), not this read-time helper's.
 */
export function parseExpectedOutput(raw: unknown): FindingSkeleton[] {
  const parsed = ExpectedOutput.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/**
 * Parse the origin coordinate stored in `input_meta` (D5). `undefined` when
 * missing/malformed — every case this module creates itself (routes 2/4/6)
 * always populates a valid one; a case with neither a must_find skeleton nor
 * a valid `input_meta` coordinate has nothing to score against and vacuously
 * scores a TN (see `scoreCase` below).
 */
export function parseInputMetaCoord(raw: unknown): InputMetaCoord | undefined {
  const parsed = InputMetaCoord.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * D1/AC-5 — case type is derived PURELY from `expected_output.length`; D6 —
 * ONE overlap primitive, applied to a different coordinate source depending
 * on type. No separate branch beyond this dispatch.
 */
export function scoreCase(
  caseRow: Pick<EvalCaseRow, 'expectedOutput' | 'inputMeta'>,
  actual: Finding[],
): CaseScore {
  const expected = parseExpectedOutput(caseRow.expectedOutput);
  if (expected.length > 0) return scoreMustFind(expected, actual);
  const coord = parseInputMetaCoord(caseRow.inputMeta);
  if (!coord) return { tp: 0, fn: 0, fp: 0, tn: 1, exactTp: 0, pass: true };
  return scoreMustNotFlag(coord, actual);
}

/** Extract the run-group version embedded in a persisted row's
 *  `actual_output.snapshot.version` (D3/D4). `null` for a failed run
 *  (`actual_output` is null, AC-9) or malformed data. */
export function extractRunVersion(actualOutput: unknown): number | null {
  const snapshot = extractRunSnapshot(actualOutput);
  return snapshot ? snapshot.version : null;
}

/** Extract the full `RunSnapshot` embedded in a persisted row's
 *  `actual_output.snapshot` (D3). `null` for a failed run or malformed data. */
export function extractRunSnapshot(actualOutput: unknown): RunSnapshot | null {
  if (!actualOutput || typeof actualOutput !== 'object') return null;
  const snapshot = (actualOutput as { snapshot?: unknown }).snapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  const s = snapshot as Partial<RunSnapshot>;
  if (
    typeof s.system_prompt !== 'string' ||
    typeof s.model !== 'string' ||
    !Array.isArray(s.skills) ||
    typeof s.version !== 'number'
  ) {
    return null;
  }
  return { system_prompt: s.system_prompt, model: s.model, skills: s.skills as string[], version: s.version };
}

/** Extract the grounded findings embedded in a persisted row's
 *  `actual_output.findings` (D3). `[]` for a failed run or malformed data. */
export function extractRunFindings(actualOutput: unknown): Finding[] {
  if (!actualOutput || typeof actualOutput !== 'object') return [];
  const findings = (actualOutput as { findings?: unknown }).findings;
  return Array.isArray(findings) ? (findings as Finding[]) : [];
}

// ---- diff-fragment construction (route 6, D5) --------------------------------

/**
 * Build the `input_diff`/`input_files` snapshot for "Turn into eval case"
 * (route 6) — a diff fragment scoped to the ONE origin file, using the exact
 * header convention `diffFromPrFiles` uses (`modules/reviews/diff-loader.ts`)
 * so `parseUnifiedDiff` round-trips it at run time (spec §6.3).
 */
export function buildFindingDiffFragment(
  file: string,
  patch: string,
): { input_diff: string; input_files: unknown } {
  const input_diff = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n${patch}`;
  return { input_diff, input_files: [{ path: file, patch }] };
}

// ---- dashboard alert (D7, AC-33) --------------------------------------------

export interface MetricTriple {
  recall: number;
  precision: number;
  citation_accuracy: number;
}

/**
 * D7/AC-33 — a non-null alert string when recall, precision, or
 * citation_accuracy dropped by >= `thresholdPP` percentage points versus the
 * immediately preceding version-group; null when there is no preceding group
 * (first run ever) or no metric dropped enough.
 */
export function computeAlert(
  current: MetricTriple,
  previous: MetricTriple | null,
  thresholdPP: number,
): string | null {
  if (!previous) return null;
  const drops: string[] = [];
  const check = (label: string, curr: number, prev: number) => {
    const dropPP = (prev - curr) * 100;
    if (dropPP >= thresholdPP) drops.push(`${label} down ${dropPP.toFixed(1)}pp`);
  };
  check('Recall', current.recall, previous.recall);
  check('Precision', current.precision, previous.precision);
  check('Citation accuracy', current.citation_accuracy, previous.citation_accuracy);
  return drops.length > 0 ? drops.join('; ') : null;
}
