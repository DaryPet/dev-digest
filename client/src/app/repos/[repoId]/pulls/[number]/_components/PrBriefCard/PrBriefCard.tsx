"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import type { ReviewRecord } from "@devdigest/shared";
import { VerdictBanner } from "../VerdictBanner";
import { s } from "./styles";

interface PrBriefCardProps {
  prId: string | number;
}

/** Rank for verdict blocking severity: higher = more blocking. */
const BLOCKING_RANK: Record<string, number> = {
  request_changes: 3,
  comment: 2,
  approve: 1,
};

/**
 * Given the (newest-first) reviews list, return the single most-blocking verdict
 * across all agents' latest passes.
 *
 * Steps:
 * 1. Deduplicate by agent key (agent_id ?? agent_name ?? id) — keep only the
 *    newest review per agent (first occurrence since the list is newest-first).
 * 2. Retain only reviews that carry a verdict.
 * 3. Pick the candidate with the highest BLOCKING_RANK; on a tie keep the
 *    first in list (= newest created_at).
 */
function selectMostBlockingReview(reviews: ReviewRecord[]): ReviewRecord | null {
  // Step 1: deduplicate — first occurrence per agent key is the newest.
  const seen = new Set<string>();
  const latestPass: ReviewRecord[] = [];
  for (const r of reviews) {
    const key = r.agent_id ?? r.agent_name ?? r.id;
    if (!seen.has(key)) {
      seen.add(key);
      latestPass.push(r);
    }
  }

  // Step 2: only verdict-bearing reviews matter for the brief.
  const candidates = latestPass.filter((r) => r.verdict != null);
  if (candidates.length === 0) return null;

  // Step 3: highest blocking rank; ties go to the first (newest) candidate.
  // candidates[0] is safe — we returned null above when the array is empty.
  const first = candidates[0]!;
  return candidates.reduce<ReviewRecord>((best, r) => {
    const rankR = BLOCKING_RANK[r.verdict!] ?? 0;
    const rankB = BLOCKING_RANK[best.verdict!] ?? 0;
    return rankR > rankB ? r : best;
  }, first);
}

/** PR BRIEF verdict card for the Overview tab (per the PR-page design):
 *  most-blocking verdict across all agents' latest passes + findings/blockers
 *  badge + summary + PR score ring with the run's cost/tokens underneath.
 *  Honest empty state when no review has run yet — no fabricated data. */
export function PrBriefCard({ prId }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const id = String(prId);
  const { data: reviews, isLoading } = usePrReviews(id);
  const { data: runs } = usePrRuns(id);

  if (isLoading) {
    return (
      <div style={s.emptyCard}>
        <Skeleton height={18} width={280} />
        <Skeleton height={14} width="70%" />
      </div>
    );
  }

  // Select the most-blocking verdict across all agents' latest review passes.
  const selected = selectMostBlockingReview(reviews ?? []);
  if (!selected || !selected.verdict) {
    return (
      <div style={s.emptyCard}>
        <div style={s.emptyTitle}>{t("unavailable")}</div>
        <div style={s.emptyHint}>{t("unavailableHint")}</div>
      </div>
    );
  }

  // Cost/tokens/blockers live on the run row that produced the selected review.
  const run = selected.run_id ? runs?.find((r) => r.run_id === selected.run_id) : undefined;

  return (
    <VerdictBanner
      verdict={selected.verdict}
      summary={selected.summary}
      score={selected.score}
      findingsCount={selected.findings.length}
      blockers={run?.blockers ?? 0}
      cost={run?.cost_usd ?? null}
      tokensIn={run?.tokens_in}
      tokensOut={run?.tokens_out}
    />
  );
}
