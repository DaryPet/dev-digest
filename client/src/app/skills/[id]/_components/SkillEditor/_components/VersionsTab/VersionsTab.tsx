"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { s } from "./styles";

/** Versions tab — body snapshot history, newest first. The schema stores no
   per-version label (only `version`, `body`, `created_at`) — show version #
   + date + a short body excerpt, never an invented commit message. Restore
   creates a NEW version with the restored body (server bumps the version
   number; no client-side version bookkeeping). */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skillEditor");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [restoringVersion, setRestoringVersion] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={48} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  }

  const sorted = [...(versions ?? [])].sort((a, b) => b.version - a.version);
  const currentVersion = sorted[0]?.version ?? skill.version;

  if (sorted.length === 0) {
    return (
      <div style={s.wrap}>
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("versions.empty")}</p>
      </div>
    );
  }

  const restore = (version: number, body: string) => {
    setRestoringVersion(version);
    update.mutate(
      { id: skill.id, patch: { body } },
      {
        onSuccess: (data) => toast.success(t("versions.restoredToast", { version: data.version })),
        onSettled: () => setRestoringVersion(null),
      },
    );
  };

  return (
    <div style={s.wrap}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t("versions.title")}</h2>
      {sorted.map((v) => {
        const isCurrent = v.version === currentVersion;
        const excerpt = v.body.slice(0, 80).replace(/\s+/g, " ").trim();
        return (
          <div key={v.version} style={s.row}>
            <span style={s.version}>v{v.version}</span>
            <span style={s.date}>{new Date(v.created_at).toLocaleString()}</span>
            <span style={s.excerpt}>{excerpt}</span>
            {isCurrent && <Badge color="var(--ok)">{t("versions.current")}</Badge>}
            {!isCurrent && (
              <Button
                kind="secondary"
                size="sm"
                onClick={() => restore(v.version, v.body)}
                disabled={restoringVersion === v.version}
              >
                {restoringVersion === v.version ? t("versions.restoring") : t("versions.restore")}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
