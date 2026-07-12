/* hooks/core.ts — typed React Query hooks over the F1 API (contracts):
   settings, secrets, repos, pulls, and project context. Scaffolding screens use
   these; feature-domain hooks live in the sibling files (agents/reviews/trace/…)
   and are re-exported alongside these from hooks/index.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Settings,
  SettingsUpdate,
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Repo,
  PrMeta,
  PrDetail,
  ProjectContextCatalog,
  ProjectContextDocument,
  ProjectContextPreview,
} from "../types";

// ---- Settings (F1: GET/PUT /settings, POST /settings/test-connection) ----
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => api.put<Settings>("/settings", patch),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnTestProvider | { provider: ConnTestProvider; key?: string }) => {
      const body = typeof input === "string" ? { provider: input } : input;
      return api.post<ConnTestResult>("/settings/test-connection", body);
    },
    // Saving/validating a provider key can change which models resolve — drop the
    // cached (possibly empty) model lists so the agent picker refetches, and
    // refresh the "Configured / Not set" key-status badges.
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: ["provider-models"] });
        qc.invalidateQueries({ queryKey: ["secrets-status"] });
      }
    },
  });
}

/** Which provider keys are configured (booleans only — never the values). */
export function useSecretsStatus() {
  return useQuery({
    queryKey: ["secrets-status"],
    queryFn: () => api.get<SecretsStatus>("/settings/secrets-status"),
    staleTime: 30_000,
  });
}

// ---- Repos (F1: GET/POST /repos, refresh, delete) ----
export function useRepos() {
  return useQuery({
    queryKey: ["repos"],
    queryFn: () => api.get<Repo[]>("/repos"),
  });
}

export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post<Repo>("/repos", { url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });
}

export function useRefreshRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<Repo>(`/repos/${repoId}/refresh`),
    onSuccess: (_d, repoId) => {
      qc.invalidateQueries({ queryKey: ["repos"] });
      qc.invalidateQueries({ queryKey: ["pulls", repoId] });
    },
  });
}

export function useDeleteRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.del<{ deleted: string }>(`/repos/${repoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["repos"] }),
  });
}

// ---- Pull requests (F1: GET /repos/:id/pulls, GET /pulls/:id) ----
export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["pulls", repoId],
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    // Auto-refresh PR statuses: re-sync from GitHub every 60s while the page is
    // open, and whenever the window regains focus.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePullDetail(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: ["pull", prId],
    queryFn: () => api.get<PrDetail>(`/pulls/${prId}`),
    enabled: prId != null,
  });
}

// ---- Project Context (SPEC-01: GET /repos/:id/context[/preview]) ----
export interface ContextFilesOpts {
  agentId?: string | null;
  skillId?: string | null;
}

/** Catalog of discovered specs/docs/insights documents for a repo. Passing
    agentId or skillId (mutually exclusive) additionally returns `.attachment`
    (that agent's/skill's effective attached set + token estimates). */
export function useContextFiles(repoId: string | null | undefined, opts?: ContextFilesOpts) {
  const agentId = opts?.agentId ?? null;
  const skillId = opts?.skillId ?? null;
  return useQuery({
    queryKey: ["context", repoId, agentId, skillId],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (agentId) qs.set("agent_id", agentId);
      if (skillId) qs.set("skill_id", skillId);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return api.get<ProjectContextCatalog>(`/repos/${repoId}/context${suffix}`);
    },
    enabled: !!repoId,
  });
}

/** Full content + "used by N agents" for one discovered document (Preview action). */
export function useContextPreview(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-preview", repoId, path],
    queryFn: () =>
      api.get<ProjectContextPreview>(`/repos/${repoId}/context/preview?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}

/** Create a new .md document in the repo clone (toolbar "+" / Upload). */
export function useCreateContextFile(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { path: string; content: string }) =>
      api.post<ProjectContextDocument>(`/repos/${repoId}/context/files`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["context", repoId] });
    },
  });
}

/** Overwrite an existing document's content (preview pane Edit mode). */
export function useUpdateContextFile(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { path: string; content: string }) =>
      api.put<ProjectContextDocument>(`/repos/${repoId}/context/files`, body),
    onSuccess: (_doc, body) => {
      void qc.invalidateQueries({ queryKey: ["context-preview", repoId, body.path] });
      void qc.invalidateQueries({ queryKey: ["context", repoId] });
    },
  });
}

/** Create a folder under one of the context roots (toolbar folder action). */
export function useCreateContextFolder(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { path: string }) =>
      api.post<{ path: string }>(`/repos/${repoId}/context/folders`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["context", repoId] });
    },
  });
}
