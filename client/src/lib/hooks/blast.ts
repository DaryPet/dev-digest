/* hooks/blast.ts — React Query hook for the blast-radius feature.
   GET /pulls/:id/blast → BlastResponse
   queryKey: ["pull", prId, "blast"], enabled when prId != null.
   BlastRadius type lives in @devdigest/shared (vendored); the wrapper interfaces
   BlastIndexInfo / BlastResponse are local — server-side repo-intel types don't
   ship to the client. Same precedent as RepoIntelState in repo-intel.ts. */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

export interface BlastIndexInfo {
  status: "full" | "partial" | "degraded" | "failed";
  degraded: boolean;
  reason: string | null;
}

export interface BlastResponse {
  blast: BlastRadius;
  index: BlastIndexInfo;
}

/** GET /pulls/:id/blast — queryKey ["pull", prId, "blast"], enabled when prId != null. */
export function useBlastRadius(
  prId: string | number | null | undefined,
): UseQueryResult<BlastResponse> {
  return useQuery({
    queryKey: ["pull", prId, "blast"],
    queryFn: () => api.get<BlastResponse>(`/pulls/${prId}/blast`),
    enabled: prId != null,
  });
}
