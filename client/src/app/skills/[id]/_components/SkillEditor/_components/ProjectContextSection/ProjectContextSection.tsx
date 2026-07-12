"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Markdown, Skeleton, SelectInput } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useContextFiles, useContextPreview, useRepos } from "@/lib/hooks/core";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { ContextDocumentAttachList } from "@/components/ContextDocumentAttachList";
import { s } from "./styles";

/** "Project context to use" section (SPEC-01 AC-14..16) — rendered below the
    skill body field in ConfigTab. Attach/detach + drag-reorder persisted
    directly on the skill (`project_context_paths`); any agent linking this
    skill inherits these documents (AC-17). The repo picker is a non-persisted,
    local UX affordance sourced from useRepos(), hidden in the single-repo case. */
export function ProjectContextSection({ skill }: { skill: Skill }) {
  const t = useTranslations("skillEditor");
  const { data: repos } = useRepos();
  const [pickedRepoId, setPickedRepoId] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const update = useUpdateSkill();

  const repoId = pickedRepoId ?? repos?.[0]?.id ?? null;

  const { data: catalog, isLoading } = useContextFiles(repoId, { skillId: skill.id });
  const preview = useContextPreview(repoId, previewPath);

  const attachedPaths = skill.project_context_paths ?? [];
  const documents = catalog?.documents ?? [];

  const tokensByPath = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of catalog?.attachment?.effective ?? []) m[d.path] = d.approx_tokens;
    return m;
  }, [catalog]);

  const categoryLabels = {
    specs: t("projectContext.contextDocs.category.specs"),
    docs: t("projectContext.contextDocs.category.docs"),
    insights: t("projectContext.contextDocs.category.insights"),
  };

  const persist = (nextPaths: string[]) =>
    update.mutate({ id: skill.id, patch: { project_context_paths: nextPaths } });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <h2 style={s.h2}>{t("projectContext.header", { count: attachedPaths.length })}</h2>
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
      <p style={s.note}>{t("projectContext.inheritNote")}</p>

      <ContextDocumentAttachList
        documents={documents}
        attachable
        attachedPaths={attachedPaths}
        onAttachedChange={persist}
        onPreview={setPreviewPath}
        tokensByPath={tokensByPath}
        isLoading={isLoading}
        filterPlaceholder={t("projectContext.contextDocs.filterPlaceholder")}
        previewLabel={t("projectContext.contextDocs.preview")}
        showPreviewLabel={false}
        categoryLabels={categoryLabels}
        emptyTitle={t("projectContext.empty.title")}
        emptyBody={t("projectContext.empty.body")}
      />

      <div style={s.serializesAs}>
        <div style={s.serializesAsLabel}>{t("projectContext.serializesAs")}</div>
        <pre className="mono" style={s.serializesAsPre}>
          {[t("projectContext.serializesAsHeading"), ...attachedPaths.map((p) => `- ${p}`)].join("\n")}
        </pre>
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
