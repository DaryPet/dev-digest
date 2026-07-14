/**
 * Brief module — pure helpers (no I/O).
 *
 * `selectMostBlockingReview` is a deliberate 1:1 port of the client's
 * `PrBriefCard.tsx` algorithm (see server/INSIGHTS.md dual-declaration note
 * and the plan's §13 risk) — it operates on
 * `{ review: ReviewRow; findings: FindingRow[] }[]` instead of
 * `ReviewRecord[]` since the server never has the client's flattened shape.
 * Any change to the ranking algorithm must be mirrored in BOTH files.
 */
import type { FindingRow, ReviewRow } from '../reviews/repository.js';

export interface ReviewWithFindings {
  review: ReviewRow;
  findings: FindingRow[];
}

/** Rank for verdict blocking severity: higher = more blocking. */
const BLOCKING_RANK: Record<string, number> = {
  request_changes: 3,
  comment: 2,
  approve: 1,
};

/**
 * Given the (newest-first) reviews-with-findings list, return the single
 * most-blocking verdict across all agents' latest passes.
 *
 * Steps:
 * 1. Deduplicate by agent key (agentId ?? review id) — keep only the newest
 *    review per agent (first occurrence since the list is newest-first).
 * 2. Retain only reviews that carry a verdict.
 * 3. Pick the candidate with the highest BLOCKING_RANK; on a tie keep the
 *    first in list (= newest createdAt).
 */
export function selectMostBlockingReview(
  reviews: ReviewWithFindings[],
): ReviewWithFindings | null {
  // Step 1: deduplicate — first occurrence per agent key is the newest.
  const seen = new Set<string>();
  const latestPass: ReviewWithFindings[] = [];
  for (const entry of reviews) {
    const key = entry.review.agentId ?? entry.review.id;
    if (!seen.has(key)) {
      seen.add(key);
      latestPass.push(entry);
    }
  }

  // Step 2: only verdict-bearing reviews matter for the brief.
  const candidates = latestPass.filter((entry) => entry.review.verdict != null);
  if (candidates.length === 0) return null;

  // Step 3: highest blocking rank; ties go to the first (newest) candidate.
  const first = candidates[0]!;
  return candidates.reduce<ReviewWithFindings>((best, entry) => {
    const rankEntry = BLOCKING_RANK[entry.review.verdict!] ?? 0;
    const rankBest = BLOCKING_RANK[best.review.verdict!] ?? 0;
    return rankEntry > rankBest ? entry : best;
  }, first);
}
