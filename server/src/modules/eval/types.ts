import { z } from 'zod';
import { Severity, FindingCategory } from '@devdigest/shared';
import type { EvalDashboard, EvalRunRecord } from '@devdigest/shared';

/**
 * Module-local types (plan `plans/eval-pipeline.md` §6.2) — NOT added to
 * `@devdigest/shared`. The cross-package eval contracts (`EvalCase`,
 * `EvalCaseInput`, `EvalRun`, `EvalRunRecord`, `EvalDashboard`, …) already
 * live in `@devdigest/shared` (`contracts/knowledge.ts` + `contracts/eval-ci.ts`);
 * these are server-internal shapes for the run snapshot, case-status list, and
 * multi-agent summary.
 */

/**
 * One finding coordinate + descriptive fields. Used both as an
 * `expected_output` element (must_find, D1) and — via `InputMetaCoord` below
 * — as the origin coordinate stored in `input_meta` for BOTH case types (D5).
 */
export const FindingSkeleton = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: Severity.optional(),
  category: FindingCategory.optional(),
  title: z.string().optional(),
});
export type FindingSkeleton = z.infer<typeof FindingSkeleton>;

/**
 * `expected_output` decoded shape — AC-24 boundary validation (enforced by
 * the editor, T-B). Non-empty = must_find; empty = must_not_flag (D1). Parsed
 * defensively at scoring time (see `helpers.ts#parseExpectedOutput`) —
 * malformed/legacy stored data degrades to `[]` rather than throwing
 * mid-batch (AC-9's failure isolation is about EXECUTION failures, not data
 * shape, so scoring itself must never throw).
 */
export const ExpectedOutput = z.array(FindingSkeleton);
export type ExpectedOutput = z.infer<typeof ExpectedOutput>;

/**
 * The origin-finding coordinate copied into every case's `input_meta` (D5) —
 * same shape for both case types. Only `file`/`start_line`/`end_line` are
 * required for must_not_flag scoring (D6); the rest are display-only
 * (severity·category badge, AC-18).
 *
 * Internal helper type — not part of the frozen §6.2 list, but needed to
 * safely decode the `unknown` `input_meta` jsonb column at scoring time.
 */
export const InputMetaCoord = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: Severity.optional().nullable(),
  category: FindingCategory.optional().nullable(),
  title: z.string().optional().nullable(),
});
export type InputMetaCoord = z.infer<typeof InputMetaCoord>;

/**
 * Embedded in every `eval_runs.actual_output.snapshot` (D3). `skills` is
 * skill IDs (uuid strings), matching `agent_versions.configJson.skills`'s
 * existing format — required so Promote (route 13) can feed them straight
 * into `agentsRepo.setSkills()`.
 */
export interface RunSnapshot {
  system_prompt: string;
  model: string;
  skills: string[];
  version: number;
}

/** Response of `GET /agents/:id/eval-runs/:version/snapshot` (route 10). */
export type EvalRunSnapshot = RunSnapshot & { ran_at: string };

/** Response element of `GET /agents/:id/eval-cases/status` (route 5, AC-18). */
export interface EvalCaseStatus {
  case_id: string;
  name: string;
  status: 'passing' | 'failing' | 'never-run';
  severity: string | null;
  category: string | null;
  title: string | null;
  last_run: EvalRunRecord | null;
}

/** Response element of `GET /eval/dashboard/agents` (route 12, AC-29). */
export interface EvalAgentSummary {
  agent_id: string;
  agent_name: string;
  dashboard: EvalDashboard;
}
