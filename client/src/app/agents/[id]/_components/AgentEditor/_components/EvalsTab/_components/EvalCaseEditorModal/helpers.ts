import { z } from "zod";

/**
 * Module-local mirror of the server's `ExpectedOutput` boundary schema
 * (`server/src/modules/eval/types.ts`, plan §6.2) — NOT a `@devdigest/shared`
 * contract (the shared `EvalCase.expected_output` field is typed `unknown`
 * on purpose; this is the UI-side copy of the SAME boundary check, per AC-24).
 * `.passthrough()` — a real finding skeleton may carry extra fields
 * (rationale/suggestion/confidence/…) beyond the required minimum; only
 * file/start_line/end_line are enforced as required here.
 */
const FindingSkeleton = z
  .object({
    file: z.string(),
    start_line: z.number().int(),
    end_line: z.number().int(),
    severity: z.string().optional(),
    category: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

const ExpectedOutputSchema = z.array(FindingSkeleton);

export type ExpectedOutputValidation =
  | { ok: true; value: unknown[] }
  | { ok: false; error: "invalidJson" | "invalidShape" };

/** AC-24: well-formed JSON AND, if non-empty, every element has at least
    file (string)/start_line (int)/end_line (int). Empty string == `[]`
    (an intentional must_not_flag case, D1). */
export function validateExpectedOutput(raw: string): ExpectedOutputValidation {
  let parsed: unknown;
  try {
    parsed = raw.trim() === "" ? [] : JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalidJson" };
  }
  const result = ExpectedOutputSchema.safeParse(parsed);
  if (!result.success) return { ok: false, error: "invalidShape" };
  return { ok: true, value: result.data };
}

/** AC-25 — inserted whenever "Finding skeleton" is clicked. Falls back to a
    fresh single-element array if the current text isn't a parseable array. */
export function insertFindingSkeleton(raw: string): string {
  let arr: unknown[];
  try {
    const parsed = raw.trim() === "" ? [] : JSON.parse(raw);
    arr = Array.isArray(parsed) ? parsed : [];
  } catch {
    arr = [];
  }
  arr.push({
    file: "",
    start_line: 1,
    end_line: 1,
    severity: "WARNING",
    category: "bug",
    title: "",
  });
  return JSON.stringify(arr, null, 2);
}

/** Seconds-formatted duration (mirrors RunTraceDrawer/helpers.ts's formatSeconds
    — kept local since that helper isn't part of a shared, importable surface). */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}
