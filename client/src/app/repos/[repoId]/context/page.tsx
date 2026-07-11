/* Project Context page — /repos/:repoId/context. Browse every markdown
   document discovered under the repo's specs/docs/insights roots; the toolbar
   creates/uploads documents straight into the local repo clone (attach/detach
   happens on the Agent Context tab and the Skill's Project context section).
   Spec: specs/SPEC-01-project-context-folder.md.
   Layout mirrors the design mock: narrow file-list panel + wide preview. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, EmptyState, Skeleton, Icon, IconBtn } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useContextFiles, useCreateContextFile, useCreateContextFolder } from "@/lib/hooks/core";
import { ApiError } from "@/lib/api";
import { s } from "./styles";
import { PreviewPanel } from "./_components/PreviewPanel";
import { PathModal } from "./_components/PathModal";

const CONTEXT_ROOTS_LABEL = "specs/ · docs/ · insights/";

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

type ModalKind = "file" | "folder" | "upload";

export default function ContextPage() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, error, refetch } = useContextFiles(repoId);
  const createFile = useCreateContextFile(repoId);
  const createFolder = useCreateContextFolder(repoId);

  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<ModalKind | null>(null);
  const [uploadContent, setUploadContent] = React.useState("");
  const [uploadName, setUploadName] = React.useState("");
  const uploadInputRef = React.useRef<HTMLInputElement>(null);

  const repoName = activeRepo?.full_name ?? repoId;
  const documents = React.useMemo(() => data?.documents ?? [], [data]);

  // Mock shows the first document pre-selected — auto-select once loaded.
  React.useEffect(() => {
    const first = documents[0];
    if (selectedPath === null && first) setSelectedPath(first.path);
  }, [selectedPath, documents]);

  const closeModal = () => {
    setModal(null);
    createFile.reset();
    createFolder.reset();
  };

  const onUploadPicked = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((text) => {
      setUploadContent(text);
      setUploadName(file.name);
      setModal("upload");
    });
  };

  const confirmCreateFile = (path: string, content: string) => {
    createFile.mutate(
      { path, content },
      {
        onSuccess: (doc) => {
          setSelectedPath(doc.path);
          closeModal();
        },
      },
    );
  };

  const mutationError = (m: { error: unknown }) =>
    m.error instanceof ApiError ? m.error.message : m.error ? String(m.error) : null;

  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div
        style={s.wrap}
        // Pointer clicks must not leave :focus-visible outlines on the file
        // rows / toolbar buttons (keyboard focus unaffected) — see
        // client/INSIGHTS.md 2026-07-02 (PrDetailHeader precedent).
        onMouseDownCapture={(e) => {
          if ((e.target as HTMLElement).closest("button")) e.preventDefault();
        }}
      >
        <div style={s.filePanel}>
          <div style={s.panelHead}>
            <div style={s.panelLabel}>{t("title")}</div>
            <div style={s.panelRoot} title={data?.root_path ?? undefined}>
              {CONTEXT_ROOTS_LABEL}
            </div>
          </div>

          <div style={s.toolbar}>
            <IconBtn icon="Plus" label={t("toolbar.newFile")} onClick={() => setModal("file")} />
            <IconBtn icon="Folder" label={t("toolbar.newFolder")} onClick={() => setModal("folder")} />
            <IconBtn icon="Upload" label={t("toolbar.upload")} onClick={() => uploadInputRef.current?.click()} />
            <IconBtn icon="RefreshCw" label={t("toolbar.refresh")} onClick={() => void refetch()} />
            <input
              ref={uploadInputRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              style={{ display: "none" }}
              onChange={(e) => {
                onUploadPicked(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <div style={s.fileList}>
            {isError ? (
              <div style={s.panelState}>
                <ErrorState
                  title={t("loadError")}
                  body={error instanceof ApiError ? error.message : undefined}
                />
              </div>
            ) : isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 10px" }}>
                <Skeleton height={16} />
                <Skeleton height={16} />
                <Skeleton height={16} width="70%" />
              </div>
            ) : documents.length === 0 ? (
              <EmptyState title={t("empty.title")} body={t("empty.body")} />
            ) : (
              documents.map((doc) => {
                const active = doc.path === selectedPath;
                return (
                  <button
                    key={doc.path}
                    type="button"
                    style={{ ...s.fileRow, ...(active ? s.fileRowActive : {}) }}
                    title={doc.path}
                    aria-label={`Preview ${fileName(doc.path)}`}
                    aria-current={active || undefined}
                    onClick={() => setSelectedPath(doc.path)}
                  >
                    <Icon.FileText
                      size={14}
                      style={{ color: active ? "var(--accent)" : "var(--text-muted)", flexShrink: 0 }}
                      aria-hidden
                    />
                    <span style={s.fileName}>{fileName(doc.path)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <PreviewPanel repoId={repoId} path={selectedPath} />
      </div>

      {modal === "file" && (
        <PathModal
          title={t("newFile.title")}
          subtitle={t("newFile.subtitle")}
          pathLabel={t("newFile.pathLabel")}
          placeholder={t("newFile.pathPlaceholder")}
          confirmLabel={t("newFile.create")}
          cancelLabel={t("newFile.cancel")}
          initialPath="specs/"
          pending={createFile.isPending}
          error={mutationError(createFile)}
          onConfirm={(path) => confirmCreateFile(path, "")}
          onClose={closeModal}
        />
      )}
      {modal === "upload" && (
        <PathModal
          title={t("toolbar.upload")}
          subtitle={t("newFile.subtitle")}
          pathLabel={t("newFile.pathLabel")}
          placeholder={t("newFile.pathPlaceholder")}
          confirmLabel={t("newFile.create")}
          cancelLabel={t("newFile.cancel")}
          initialPath={`specs/${uploadName}`}
          pending={createFile.isPending}
          error={mutationError(createFile)}
          onConfirm={(path) => confirmCreateFile(path, uploadContent)}
          onClose={closeModal}
        />
      )}
      {modal === "folder" && (
        <PathModal
          title={t("newFolder.title")}
          subtitle={t("newFolder.subtitle")}
          pathLabel={t("newFolder.pathLabel")}
          placeholder={t("newFolder.pathPlaceholder")}
          confirmLabel={t("newFolder.create")}
          cancelLabel={t("newFolder.cancel")}
          initialPath="specs/"
          pending={createFolder.isPending}
          error={mutationError(createFolder)}
          onConfirm={(path) => createFolder.mutate({ path }, { onSuccess: closeModal })}
          onClose={closeModal}
        />
      )}
    </AppShell>
  );
}
