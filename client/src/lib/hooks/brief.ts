/* hooks/brief.ts — React Query hooks for the PR Why + Risk Brief feature
   (spec specs/SPEC-02-pr-why-risk-brief.md §6.2/§6.8). Mirrors hooks/intent.ts.
     POST /pulls/:id/brief                    → { brief: Brief }         (cache-or-compute)
     POST /pulls/:id/brief  { recompute:true } → { brief: Brief }        (force recompute)
   No separate GET route — both reads and recomputes go through this one POST. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DefaultError, UseQueryResult, UseMutationResult } from "@tanstack/react-query";
import { api } from "../api";
import type { Brief } from "@devdigest/shared";

export interface BriefResponse {
  brief: Brief;
}

const key = (prId: string | number | null | undefined) =>
  ["pull", prId, "brief"] as const;

/** Get-cached-or-compute the PR's Brief. */
export function useBrief(
  prId: string | number | null | undefined,
): UseQueryResult<BriefResponse> {
  return useQuery({
    queryKey: key(prId),
    queryFn: () => api.post<BriefResponse>(`/pulls/${prId}/brief`, {}),
    enabled: prId != null,
  });
}

/** Force a fresh Brief (bypasses the cache); updates the shared cache on success. */
export function useRecomputeBrief(
  prId: string | number,
): UseMutationResult<BriefResponse, DefaultError, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BriefResponse>(`/pulls/${prId}/brief`, { recompute: true }),
    onSuccess: (data) => qc.setQueryData(key(prId), data),
  });
}
