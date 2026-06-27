"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton, EmptyState } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillAgents } from "../../../../../../../lib/hooks/skills";
import { s } from "./styles";

/** Stats tab — minimal: "used by N agents" + the agents linking this skill.
   No pull-frequency/cost/findings-donut metrics — out of scope (no data
   source for those yet, spec §11). */
export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skillEditor");
  const { data: agents, isLoading, isError, refetch } = useSkillAgents(skill.id);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={160} />
        <Skeleton height={48} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  }

  const list = agents ?? [];

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("stats.title")}</h2>
      <p style={s.count}>{t("stats.usedBy", { count: list.length })}</p>
      {list.length === 0 ? (
        <EmptyState icon="Sparkles" title={t("stats.empty")} />
      ) : (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>
            {t("stats.agentsTitle")}
          </h3>
          {list.map((a) => (
            <div key={a.id} style={s.row}>
              <Link href={`/agents/${a.id}?tab=config`} style={s.link}>
                {a.name}
              </Link>
              {!a.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
