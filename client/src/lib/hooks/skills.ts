/* hooks/skills.ts — React Query hooks for the Skills Lab (list + per-skill
   editor) and the import flow. Mirrors hooks/agents.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Skill, SkillSource, SkillType } from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled" | "evidence_files">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

export interface SkillVersion {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** Agents linking this skill (Stats tab — "used by N agents"). */
export interface SkillAgentUsage {
  id: string;
  name: string;
  enabled: boolean;
}

export function useSkillAgents(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-agents", id],
    queryFn: () => api.get<SkillAgentUsage[]>(`/skills/${id}/agents`),
    enabled: !!id,
  });
}

/** A parsed-but-unsaved skill, returned by the import preview (pure parse, no write). */
export interface SkillImportDraft {
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  evidence_files: string[];
}

export interface SkillImportResult {
  draft: SkillImportDraft;
  ignored_files: string[];
  warnings: string[];
}

export interface ImportSkillInput {
  filename: string;
  content_base64: string;
}

/** Pure preview of an uploaded file/zip — does NOT persist anything. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: ImportSkillInput) => api.post<SkillImportResult>("/skills/import", input),
  });
}
