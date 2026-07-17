/* hooks/eval.ts — React Query hooks for the L06 Eval Pipeline (SPEC-03).
   Frozen signatures — plan `plans/eval-pipeline.md` §6.5: T-C/T-D/T-E import
   from this file, do not change a hook's argument order/shape without
   re-syncing those tasks. Mirrors hooks/agents.ts / hooks/skills.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  EvalCase,
  EvalCaseInput,
  EvalDashboard,
  EvalOwnerKind,
  EvalRunRecord,
  EvalRunResult,
} from "@devdigest/shared";

// ---------------------------------------------------------------------------
// Module-local types mirroring `server/src/modules/eval/types.ts` (plan §6.2).
// These are NOT part of `@devdigest/shared` (server-side, module-local only) —
// this is the client's own structurally-identical copy, same as the server's.
// ---------------------------------------------------------------------------

export interface EvalCaseStatus {
  case_id: string;
  name: string;
  status: "passing" | "failing" | "never-run";
  severity: string | null;
  category: string | null;
  title: string | null;
  last_run: EvalRunRecord | null;
}

export interface EvalAgentSummary {
  agent_id: string;
  agent_name: string;
  dashboard: EvalDashboard;
}

export interface RunSnapshot {
  system_prompt: string;
  model: string;
  skills: string[]; // skill ids
  version: number;
}
export type EvalRunSnapshot = RunSnapshot & { ran_at: string };

// ---------------------------------------------------------------------------
// Eval cases
// ---------------------------------------------------------------------------

/** Case list w/ status (passing/failing/never-run) for the agent's Evals tab. */
export function useEvalCaseStatuses(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case-statuses", agentId],
    queryFn: () => api.get<EvalCaseStatus[]>(`/agents/${agentId}/eval-cases/status`),
    enabled: !!agentId,
  });
}

/** A single case's full record (editor modal). */
export function useEvalCase(agentId: string | null | undefined, caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-case", agentId, caseId],
    queryFn: () => api.get<EvalCase>(`/agents/${agentId}/eval-cases/${caseId}`),
    enabled: !!agentId && !!caseId,
  });
}

function invalidateCaseQueries(qc: ReturnType<typeof useQueryClient>, agentId: string | undefined) {
  qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
  qc.invalidateQueries({ queryKey: ["eval-case-statuses", agentId] });
  qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
}

/** Manual/editor create (route 2 — server overrides owner_kind/owner_id to this agent). */
export function useCreateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: (data) => {
      qc.setQueryData(["eval-case", agentId, data.id], data);
      invalidateCaseQueries(qc, agentId ?? undefined);
    },
  });
}

/** "Turn into eval case" from an accepted/dismissed FindingCard (route 6). */
export function useCreateEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.post<EvalCase>(`/findings/${findingId}/eval-case`),
    onSuccess: (data) => invalidateCaseQueries(qc, data.owner_id),
  });
}

/** Editor Save on an existing case — full replace (route 4). */
export function useUpdateEvalCase(agentId: string | null | undefined, caseId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.patch<EvalCase>(`/agents/${agentId}/eval-cases/${caseId}`, input),
    onSuccess: (data) => {
      qc.setQueryData(["eval-case", agentId, caseId], data);
      invalidateCaseQueries(qc, agentId ?? undefined);
    },
  });
}

/** Delete an eval case (route 14). */
export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: boolean }>(`/agents/${agentId}/eval-cases/${caseId}`),
    onSuccess: () => {
      invalidateCaseQueries(qc, agentId ?? undefined);
    },
  });
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/** Single-case run (route 7). */
export function useRunEvalCase(agentId: string | null | undefined, caseId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunResult>(`/agents/${agentId}/eval-cases/${caseId}/run`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-case-statuses", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-case", agentId, caseId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["eval-agent-summaries"] });
    },
  });
}

/** Batch run — every case owned by this agent (route 8). */
export function useRunAllEvals(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunResult[]>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => {
      invalidateCaseQueries(qc, agentId ?? undefined);
      qc.invalidateQueries({ queryKey: ["eval-agent-summaries"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** Aggregate dashboard for one owner (agent) or workspace-wide when omitted (route 11). */
export function useEvalDashboard(ownerKind?: EvalOwnerKind, ownerId?: string) {
  const qs = new URLSearchParams();
  if (ownerKind) qs.set("owner_kind", ownerKind);
  if (ownerId) qs.set("owner_id", ownerId);
  const suffix = qs.toString();
  return useQuery({
    queryKey: ["eval-dashboard", ownerKind ?? null, ownerId ?? null],
    queryFn: () => api.get<EvalDashboard>(`/eval/dashboard${suffix ? `?${suffix}` : ""}`),
  });
}

/** Multi-agent overview rows (route 12). */
export function useEvalAgentSummaries() {
  return useQuery({
    queryKey: ["eval-agent-summaries"],
    queryFn: () => api.get<EvalAgentSummary[]>("/eval/dashboard/agents"),
  });
}

/** A version-group's run snapshot (system_prompt/model/skills) — Compare/Promote (route 10). */
export function useEvalRunSnapshot(agentId: string | null | undefined, version: number | null | undefined) {
  return useQuery({
    queryKey: ["eval-run-snapshot", agentId, version],
    queryFn: () => api.get<EvalRunSnapshot>(`/agents/${agentId}/eval-runs/${version}/snapshot`),
    enabled: !!agentId && version != null,
  });
}

/** Apply a version-group's snapshot config as the agent's live config (route 13, D8). */
export function usePromoteConfig(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.post<Agent>(`/agents/${agentId}/promote-config`, { version }),
    onSuccess: (data) => {
      // Existing keys — other hook files own these caches (agents.ts).
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      qc.invalidateQueries({ queryKey: ["agent-skills", agentId] });
      qc.setQueryData(["agent", agentId], data);
      // New keys — eval data invalidated by owner id (agentId), per plan §6.5.
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    },
  });
}
