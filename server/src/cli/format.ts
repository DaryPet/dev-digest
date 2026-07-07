/**
 * CLI output formatter — pure, unit-testable, no I/O.
 *
 * Produces the structured stdout block for `devdigest review` and computes
 * the exit-code decision (0 = clean, 1 = blockers present).
 *
 * Unicode literals use escapes to avoid non-ASCII corruption in tooling:
 *   — = em dash (—)
 *   · = middle dot (·)
 */
import type { ReviewOutcome } from '@devdigest/reviewer-core';
import { countBlockers } from '@devdigest/reviewer-core';
import type { CiFailOn, Finding } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FormatOptions {
  mode: string;
  agentName: string;
  agentProvider: string;
  agentModel: string;
  filesCount: number;
}

export interface FormatResult {
  output: string;
  exitCode: 0 | 1;
}

// ---------------------------------------------------------------------------
// Main formatter
// ---------------------------------------------------------------------------

/**
 * Format a completed review outcome into the CLI output block.
 *
 * Output structure (all stdout):
 *   DevDigest review — mode: <m> · agent: <n> (<p>/<model>)
 *   Diff: N file(s)
 *
 *   VERDICT: <v>   SCORE: <s>
 *   GROUNDING: <g>
 *
 *   [SEV] file:start-end — title
 *     rationale
 *     Suggestion: suggestion (optional)
 *
 *   N finding(s) · M blocker(s) (gate: GATE)
 */
export function formatReviewOutput(
  outcome: ReviewOutcome,
  ciFailOn: CiFailOn,
  opts: FormatOptions,
): FormatResult {
  const { review, grounding } = outcome;
  const findings: Finding[] = review.findings;
  const blockers = countBlockers(findings, ciFailOn);

  const lines: string[] = [];

  // Header block
  lines.push(
    `DevDigest review — mode: ${opts.mode} · agent: ${opts.agentName} (${opts.agentProvider}/${opts.agentModel})`,
  );
  lines.push(`Diff: ${opts.filesCount} file(s)`);

  // Verdict/score/grounding block
  lines.push('');
  lines.push(`VERDICT: ${review.verdict}   SCORE: ${review.score}`);
  lines.push(`GROUNDING: ${grounding}`);

  // Findings
  for (const f of findings) {
    lines.push('');
    lines.push(`[${f.severity}] ${f.file}:${f.start_line}-${f.end_line} — ${f.title}`);
    lines.push(`  ${f.rationale}`);
    if (f.suggestion) {
      lines.push(`  Suggestion: ${f.suggestion}`);
    }
  }

  // Footer
  lines.push('');
  lines.push(
    `${findings.length} finding(s) · ${blockers} blocker(s) (gate: ${ciFailOn.toUpperCase()})`,
  );

  return {
    output: lines.join('\n'),
    exitCode: blockers > 0 ? 1 : 0,
  };
}
