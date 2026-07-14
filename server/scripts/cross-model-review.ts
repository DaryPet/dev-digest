/**
 * cross-model-review.ts — one-off script (not part of the app).
 *
 * SPEC-02's TЗ requires the implementation plan to go through an independent
 * "cross-model review": handed cold (no chat context) to a model of a
 * DIFFERENT family than the one that wrote it (Claude wrote plan.md; this
 * sends it to Gemini via OpenRouter, in the role of a staff engineer), and
 * the findings recorded as a note.
 *
 * Usage (from server/):
 *   ./node_modules/.bin/tsx scripts/cross-model-review.ts <plan.md path> <output .md path>
 *
 * Example:
 *   ./node_modules/.bin/tsx scripts/cross-model-review.ts \
 *     ../plans/pr-why-risk-brief.md \
 *     ../docs/reviews/cross-model-review-pr-why-risk-brief.md
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { OpenRouterProvider } from '@devdigest/reviewer-core';

const MODEL = 'google/gemini-2.5-pro';

const ReviewOutput = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      severity: z.enum(['blocker', 'concern', 'nit']),
      point: z.string(),
    }),
  ),
  verdict: z.string(),
});
type ReviewOutput = z.infer<typeof ReviewOutput>;

const SYSTEM_PROMPT = `You are a staff engineer performing an independent, cold review of an
implementation plan you have never seen before and have no other context on. The plan was
written by a different AI system for a feature called "PR Why + Risk Brief" in a PR-review
tool called DevDigest.

Review it as you would a colleague's design doc before implementation starts. Look for:
- Gaps or ambiguities in the frozen interface contracts
- Wrong assumptions about data availability or timing
- Missing edge cases
- Scope creep or scope that's too narrow relative to what the plan itself claims to solve
- Anything a reviewer would flag before approving this plan to be built

Do not be polite for politeness's sake — a plan with no real issues can get zero findings,
but don't invent problems either.`;

async function main() {
  const [, , planPathArg, outPathArg] = process.argv;
  if (!planPathArg || !outPathArg) {
    console.error('Usage: tsx scripts/cross-model-review.ts <plan.md path> <output .md path>');
    process.exit(1);
  }
  const planPath = resolve(planPathArg);
  const outPath = resolve(outPathArg);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set in the environment.');
    process.exit(1);
  }

  const planContent = readFileSync(planPath, 'utf-8');
  console.log(`Read ${planContent.length} chars from ${planPath}`);
  console.log(`Sending to ${MODEL} via OpenRouter...`);

  const provider = new OpenRouterProvider(apiKey);
  const result = await provider.completeStructured<ReviewOutput>({
    model: MODEL,
    schema: ReviewOutput,
    schemaName: 'CrossModelReview',
    temperature: 0.2,
    maxTokens: 16000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: planContent },
    ],
  });

  console.log(`Done — ${result.tokensIn} in / ${result.tokensOut} out, cost=${result.costUsd ?? 'unknown'}`);

  const { summary, findings, verdict } = result.data;
  const findingsMd = findings.length
    ? findings
        .map((f) => `- **[${f.severity}]** ${f.point}`)
        .join('\n')
    : '_No findings raised._';

  const note = `# Cross-model review — ${planPathArg}

**Reviewer model:** ${MODEL} (via OpenRouter) — independent family from the Claude-based
pipeline (spec-creator / implementation-planner / implementer / architecture-reviewer /
plan-verifier) that produced this plan. Given the plan cold, with no other chat context.

**Tokens:** ${result.tokensIn} in / ${result.tokensOut} out · **Cost:** ${result.costUsd != null ? `$${result.costUsd.toFixed(4)}` : 'unknown'}

## Summary
${summary}

## Findings
${findingsMd}

## Verdict
${verdict}
`;

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, note, 'utf-8');
  console.log(`Wrote review note to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
