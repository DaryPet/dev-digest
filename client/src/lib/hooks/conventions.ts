/* hooks/conventions.ts — React Query hooks for the Conventions Extractor
   (spec specs/conventions-extractor.md). Mirrors hooks/skills.ts.
     GET   /repos/:id/conventions               → list + header meta
     POST  /repos/:id/conventions/extract       → scan → verified candidates
     PATCH /repos/:id/conventions/:cid          → accept/reject OR edit rule
     POST  /repos/:id/conventions/skill-preview → generated skill-body preview
   The actual Skill row is created via useCreateSkill() (hooks/skills.ts). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";

export interface ConventionsResponse {
  items: ConventionCandidate[];
  meta: { sampleCount: number; lastScanAt: string | null };
}

export interface SkillPreviewResponse {
  name: string;
  body: string;
  evidence_files: string[];
}

const key = (repoId: string | null | undefined) => ["conventions", repoId] as const;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionsResponse>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionsResponse>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(key(repoId), data),
  });
}

export type ConventionPatch = { status: ConventionStatus } | { rule: string };

export function usePatchConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionPatch }) =>
      api.patch<ConventionCandidate>(`/repos/${repoId}/conventions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}

export function useConventionSkillPreview(repoId: string) {
  return useMutation({
    mutationFn: (body: { candidateIds: string[]; name?: string }) =>
      api.post<SkillPreviewResponse>(`/repos/${repoId}/conventions/skill-preview`, body),
  });
}
