"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Markdown, Skeleton, SelectInput } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useContextFiles, useContextPreview, useRepos } from "@/lib/hooks/core";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { ContextDocumentAttachList } from "@/components/ContextDocumentAttachList";
import { s } from "./styles";

/** Context tab (SPEC-01 AC-8..13) — the full discovered document catalog for
    the agent's repo, attach/detach + drag-reorder persisted directly on the
    agent (`project_context_paths`). The repo picker is a non-persisted, local
    UX affordance (agents carry no repo binding) sourced from useRepos(),
    hidden entirely in the single-repo workspace case. */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: repos } = useRepos();
  const [pickedRepoId, setPickedRepoId] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const update = useUpdateAgent();

  const repoId = pickedRepoId ?? repos?.[0]?.id ?? null;

  const { data: catalog, isLoading } = useContextFiles(repoId, { agentId: agent.id });
  const preview = useContextPreview(repoId, previewPath);

  const attachedPaths = agent.project_context_paths ?? [];
  const documents = catalog?.documents ?? [];
  const totalTokens = catalog?.attachment?.total_approx_tokens ?? 0;

  const tokensByPath = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of catalog?.attachment?.effective ?? []) m[d.path] = d.approx_tokens;
    return m;
  }, [catalog]);

  const categoryLabels = {
    specs: t("context.contextDocs.category.specs"),
    docs: t("context.contextDocs.category.docs"),
    insights: t("context.contextDocs.category.insights"),
  };

  const persist = (nextPaths: string[]) =>
    update.mutate({ id: agent.id, patch: { project_context_paths: nextPaths } });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <h2 style={s.h2}>{t("context.header", { attached: attachedPaths.length, total: documents.length })}</h2>
        </div>
        {repos && repos.length > 1 && (
          <div style={s.repoPicker}>
            <SelectInput
              value={repoId ?? ""}
              onChange={setPickedRepoId}
              options={repos.map((r) => ({ value: r.id, label: r.full_name }))}
            />
          </div>
        )}
      </div>

      <ContextDocumentAttachList
        documents={documents}
        attachable
        attachedPaths={attachedPaths}
        onAttachedChange={persist}
        onPreview={setPreviewPath}
        tokensByPath={tokensByPath}
        isLoading={isLoading}
        filterPlaceholder={t("context.contextDocs.filterPlaceholder")}
        previewLabel={t("context.contextDocs.preview")}
        categoryLabels={categoryLabels}
        emptyTitle={t("context.empty.title")}
        emptyBody={t("context.empty.body")}
      />

      <div style={s.footer}>
        <span style={s.footerTokens}>{t("context.footer.tokenTotal", { count: totalTokens })}</span>
        <span style={s.footerNote}>{t("context.footer.untrustedNote")}</span>
      </div>

      {previewPath && (
        <Modal width={720} title={previewPath.split("/").pop()} onClose={() => setPreviewPath(null)}>
          <div style={{ padding: 20 }}>
            {preview.isLoading ? <Skeleton height={100} /> : <Markdown>{preview.data?.content}</Markdown>}
          </div>
        </Modal>
      )}
    </div>
  );
}
