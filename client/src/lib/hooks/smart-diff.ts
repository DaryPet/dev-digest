/* hooks/smart-diff.ts — React Query hook for the Smart Diff feature
   (spec specs/smart-diff.md §5.6). Mirrors hooks/intent.ts.
     GET /pulls/:id/smart-diff → SmartDiff */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiff } from "@devdigest/shared";

/** Read the risk-ordered smart diff for a PR.
 *  Returns before any review has run — finding_lines are empty until reviewed. */
export function useSmartDiff(
  prId: string | number | null | undefined,
): UseQueryResult<SmartDiff> {
  return useQuery({
    queryKey: ["pull", prId, "smart-diff"],
    queryFn: () => api.get<SmartDiff>(`/pulls/${prId}/smart-diff`),
    enabled: prId != null,
  });
}
