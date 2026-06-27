"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

/** Preview tab — read-only render of the skill body as it appears in the
   review agent's prompt. No editing here. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skillEditor");
  return (
    <div style={{ maxWidth: 760 }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>{t("preview.subtitle")}</p>
      {skill.body ? (
        <Markdown>{skill.body}</Markdown>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("preview.empty")}</p>
      )}
    </div>
  );
}
