"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown, Skeleton, ErrorState, Icon, Textarea, Button } from "@devdigest/ui";
import { useContextPreview, useUpdateContextFile } from "@/lib/hooks/core";
import { ApiError } from "@/lib/api";
import { s } from "../../styles";

/** Wide preview pane for the Project Context page (AC-6) — filename header
    with a Preview|Edit toggle and a "Used by N agents" count; below, the
    rendered markdown (Preview) or a save-able editor (Edit), per the design
    mock. Self-contained: fetches its own preview via useContextPreview. */
export function PreviewPanel({ repoId, path }: { repoId: string; path: string | null }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, error } = useContextPreview(repoId, path);
  const updateFile = useUpdateContextFile(repoId);

  const [mode, setMode] = React.useState<"preview" | "edit">("preview");
  const [draft, setDraft] = React.useState("");

  // Selecting another document always drops back to Preview.
  React.useEffect(() => {
    setMode("preview");
    updateFile.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (!path) {
    return (
      <div style={s.previewPane}>
        <div style={s.previewEmpty}>{t("preview.select")}</div>
      </div>
    );
  }

  const enterEdit = () => {
    setDraft(data?.content ?? "");
    setMode("edit");
  };

  const save = () => {
    updateFile.mutate({ path, content: draft }, { onSuccess: () => setMode("preview") });
  };

  return (
    <div style={s.previewPane}>
      <div style={s.previewHead}>
        <div style={s.headLeft}>
          <div style={s.previewName} title={path}>
            {path.split("/").pop()}
          </div>
          <div style={s.seg} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "preview"}
              style={{ ...s.segBtn, ...(mode === "preview" ? s.segBtnActive : {}) }}
              onClick={() => setMode("preview")}
            >
              {t("preview.tabPreview")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "edit"}
              style={{ ...s.segBtn, ...(mode === "edit" ? s.segBtnActive : {}) }}
              onClick={enterEdit}
            >
              {t("preview.tabEdit")}
            </button>
          </div>
        </div>
        <div style={s.headRight}>
          {data && (
            <span style={s.previewUsedBy}>
              <Icon.Cpu size={14} style={{ color: "var(--text-muted)" }} aria-hidden />
              {t("preview.usedBy", { count: data.used_by_count })}
            </span>
          )}
        </div>
      </div>
      <div style={s.previewBody}>
        <div style={s.previewContent}>
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Skeleton height={12} />
              <Skeleton height={12} />
              <Skeleton height={12} width="70%" />
            </div>
          ) : isError ? (
            <ErrorState
              title={t("preview.loadError")}
              body={error instanceof ApiError ? error.message : undefined}
            />
          ) : mode === "edit" ? (
            <>
              <Textarea mono rows={24} value={draft} onChange={setDraft} />
              {updateFile.error && (
                <div style={s.modalError}>
                  {updateFile.error instanceof ApiError ? updateFile.error.message : String(updateFile.error)}
                </div>
              )}
              <div style={s.editActions}>
                <Button kind="secondary" onClick={() => setMode("preview")}>
                  {t("preview.cancel")}
                </Button>
                <Button kind="primary" loading={updateFile.isPending} onClick={save}>
                  {t("preview.save")}
                </Button>
              </div>
            </>
          ) : (
            <Markdown>{data?.content}</Markdown>
          )}
        </div>
      </div>
    </div>
  );
}
