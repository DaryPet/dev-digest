/* Conventions Extractor — /repos/:repoId/conventions. Scan the cloned repo for
   house conventions, accept/reject candidates with code-grounded evidence, then
   bundle the accepted ones into a Skill. Spec: specs/conventions-extractor.md. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Skeleton, EmptyState, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useConventions, useExtractConventions, usePatchConvention } from "@/lib/hooks/conventions";
import { ApiError } from "@/lib/api";
import { SKELETON_ROWS } from "./constants";
import { relativeTime } from "./helpers";
import { s } from "./styles";
import { ConventionCard } from "./_components/ConventionCard/ConventionCard";
import { CreateSkillFromConventionsModal } from "./_components/CreateSkillFromConventionsModal/CreateSkillFromConventionsModal";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);

  const repoName = activeRepo?.full_name ?? repoId;
  const repoRef = activeRepo?.default_branch ?? "HEAD";
  const items = data?.items ?? [];
  const accepted = items.filter((c) => c.status === "accepted");
  const acceptedIds = accepted.map((c) => c.id);
  const lastScan = relativeTime(data?.meta.lastScanAt ?? null);

  const setStatus = (id: string, status: "accepted" | "rejected") =>
    patch.mutate({ id, patch: { status } });
  const deselectAll = () =>
    accepted.forEach((c) => patch.mutate({ id: c.id, patch: { status: "pending" } }));

  const crumb = [
    { label: t("page.crumbLab") },
    { label: repoName, mono: true },
    { label: t("page.crumbConventions") },
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>
            {t("page.headingPrefix")}
            <span style={s.repoName}>{repoName}</span>
          </h1>
          <p style={s.pageSubtitle}>
            {data
              ? `${t("header.sampleFiles", { count: data.meta.sampleCount })} · ${
                  lastScan ? t("header.lastScan", { when: lastScan }) : t("header.noScan")
                }`
              : t("page.subtitle")}
          </p>
        </div>
        <Button
          kind="secondary"
          icon="RefreshCw"
          onClick={() => extract.mutate()}
          loading={extract.isPending}
          disabled={extract.isPending}
        >
          {extract.isPending
            ? t("page.scanning")
            : items.length === 0
              ? t("page.runExtraction")
              : t("page.rescan")}
        </Button>
      </div>

      <div style={s.toolbar}>
        <Button kind="ghost" icon="X" onClick={deselectAll} disabled={accepted.length === 0}>
          {t("toolbar.deselectAll")}
        </Button>
        <span style={s.acceptedCount}>
          {t("toolbar.acceptedCount", { accepted: accepted.length, total: items.length })}
        </span>
        <div style={s.toolbarSpacer} />
        <Button
          kind="primary"
          icon="Sparkles"
          onClick={() => setModalOpen(true)}
          disabled={accepted.length === 0}
        >
          {t("toolbar.createSkill")}
        </Button>
      </div>

      {isLoading ? (
        <div style={s.list}>
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t("page.extractionFailed")}
          body={error instanceof ApiError ? error.message : t("page.loadError")}
          onRetry={() => refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState icon="ListChecks" title={t("page.empty.title")} body={t("page.empty.body")} />
      ) : (
        <div style={s.list}>
          {items.map((c) => (
            <ConventionCard
              key={c.id}
              candidate={c}
              repoFullName={repoName}
              repoRef={repoRef}
              pending={patch.isPending && patch.variables?.id === c.id}
              onAccept={() => setStatus(c.id, "accepted")}
              onReject={() => setStatus(c.id, "rejected")}
            />
          ))}
        </div>
      )}

      {modalOpen && accepted.length > 0 ? (
        <CreateSkillFromConventionsModal
          repoId={repoId}
          repoFullName={repoName}
          repoName={activeRepo?.name ?? repoName}
          acceptedIds={acceptedIds}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </AppShell>
  );
}
