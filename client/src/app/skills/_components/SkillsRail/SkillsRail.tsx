/* SkillsRail — left list rail for the Skills two-pane (the /skills landing and
   the /skills/:id editor share it). Search + Add (Create/Import) + SkillCard
   list. Pure presentation/navigation; data, mutations and the import flow are
   unchanged from the former SkillsListView grid. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useSkills, useCreateSkill, useUpdateSkill } from "../../../../lib/hooks/skills";
import { useToast } from "../../../../lib/toast";
import { SkillCard } from "../SkillCard";
import { ImportSkillDialog } from "../ImportSkillDialog";
import { filterSkills } from "../SkillsListView/helpers";
import { s } from "./styles";

export function SkillsRail({ activeId }: { activeId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [importing, setImporting] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterSkills(skills ?? [], search);

  const createBlank = () => {
    create.mutate(
      {
        name: t("page.defaultName"),
        description: "",
        type: "custom",
        body: "",
      },
      {
        onSuccess: (skill) => router.push(`/skills/${skill.id}`),
        onError: () => toast.error(t("drawer.importFailed")),
      },
    );
  };

  return (
    <div style={s.rail}>
      {importing && <ImportSkillDialog onClose={() => setImporting(false)} />}
      <div style={s.header}>
        <h1 style={s.title}>{t("page.heading")}</h1>
        <Dropdown
          width={220}
          align="right"
          trigger={
            <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
              {t("page.addSkill")}
            </Button>
          }
          items={[
            { label: t("page.createOption"), icon: "Edit", onClick: createBlank },
            { label: t("page.importOption"), icon: "Upload", onClick: () => setImporting(true) },
          ]}
        />
      </div>

      <div style={s.searchWrap}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("page.searchPlaceholder")}
          style={s.searchInput}
        />
      </div>

      <div style={s.list}>
        {isLoading && (
          <>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setImporting(true)}
          />
        )}
        {list.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={sk}
            active={sk.id === activeId}
            onClick={() => router.push(`/skills/${sk.id}`)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}
