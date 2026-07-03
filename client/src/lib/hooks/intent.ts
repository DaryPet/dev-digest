/* hooks/intent.ts — React Query hooks for the PR Intent feature
   (spec specs/intent-layer.md §5.2). Mirrors hooks/conventions.ts.
     GET  /pulls/:id/intent               → { intent: Intent | null }
     POST /pulls/:id/intent/compute       → { intent: Intent } */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Intent } from "@devdigest/shared";

export interface IntentResponse {
  intent: Intent | null;
}

const key = (prId: string | number | null | undefined) =>
  ["pull", prId, "intent"] as const;

/** Read the stored intent for a PR (null when never computed). */
export function useIntent(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: key(prId),
    queryFn: () => api.get<IntentResponse>(`/pulls/${prId}/intent`),
    enabled: prId != null,
  });
}

/** Trigger (re)computation of the PR intent; updates the cache on success. */
export function useComputeIntent(prId: string | number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<IntentResponse>(`/pulls/${prId}/intent/compute`),
    onSuccess: (data) => qc.setQueryData(key(prId), data),
  });
}
