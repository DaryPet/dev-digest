/* AgentsRail — left list rail for the Agents two-pane (the /agents landing and
   the /agents/:id editor share it). Search + Add (Create/templates) + AgentCard
   list. Pure presentation/navigation; data, mutations and the create flow are
   unchanged from the former AgentsListView grid. Mirrors SkillsRail. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useAgents, useUpdateAgent } from "../../../../lib/hooks/agents";
import { AgentCard } from "../AgentCard";
import { CreateAgentModal } from "../AgentsListView/_components/CreateAgentModal";
import { TEMPLATES } from "../AgentsListView/constants";
import { filterAgents } from "../AgentsListView/helpers";
import { s } from "./styles";

export function AgentsRail({ activeId }: { activeId?: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const update = useUpdateAgent();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterAgents(agents ?? [], search);

  return (
    <div style={s.rail}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.header}>
        <h1 style={s.title}>{t("list.title")}</h1>
        <Dropdown
          width={220}
          align="right"
          trigger={
            <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
              {t("list.addAgent")}
            </Button>
          }
          items={[
            { label: t("list.createFromScratch"), icon: "Edit", onClick: () => setCreating(true) },
            { divider: true },
            ...TEMPLATES.map((tp) => ({
              label: tp,
              icon: "Cpu" as const,
              muted: true,
              onClick: () => setCreating(true),
            })),
          ]}
        />
      </div>

      <div style={s.searchWrap}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("list.searchPlaceholder")}
          style={s.searchInput}
        />
      </div>

      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={92} />
            <Skeleton height={92} />
            <Skeleton height={92} />
          </>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Cpu"
            title={t("list.emptyTitle")}
            body={t("list.emptyBody")}
            cta={t("list.emptyCta")}
            onCta={() => setCreating(true)}
          />
        )}
        {list.map((a) => (
          <AgentCard
            key={a.id}
            ag={a}
            active={a.id === activeId}
            onClick={() => router.push(`/agents/${a.id}?tab=config`)}
            onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}
