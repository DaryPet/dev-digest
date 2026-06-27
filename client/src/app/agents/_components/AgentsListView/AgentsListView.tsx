/* /agents — Agents two-pane. Left rail = AgentsRail (list + create); right = a
   "select an agent" placeholder until one is opened at /agents/:id (which
   renders the same rail beside the editor). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { AgentsRail } from "../AgentsRail";
import { s } from "./styles";

export function AgentsListView() {
  const t = useTranslations("agents");

  return (
    <AppShell crumb={[{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb") }]}>
      <div style={s.twoPane}>
        <AgentsRail />
        <div style={s.rightEmpty}>
          <EmptyState icon="Cpu" title={t("list.selectTitle")} body={t("list.selectBody")} />
        </div>
      </div>
    </AppShell>
  );
}
