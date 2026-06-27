/* /skills — Skills Lab two-pane. Left rail = SkillsRail (list + create/import);
   right = a "select a skill" placeholder until one is opened at /skills/:id
   (which renders the same rail beside the editor). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { SkillsRail } from "../SkillsRail";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.twoPane}>
        <SkillsRail />
        <div style={s.rightEmpty}>
          <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
        </div>
      </div>
    </AppShell>
  );
}
