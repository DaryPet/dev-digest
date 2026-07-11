import type { IconName } from "@devdigest/ui";
import type { ProjectContextCategory } from "@devdigest/shared";

/** Category badge color/icon — one canonical map (mirrors SkillTypeBadge's
    SKILL_TYPE_META pattern), never hand-picked per call site. */
export const CATEGORY_META: Record<ProjectContextCategory, { color: string; bg: string; icon: IconName }> = {
  specs: { color: "var(--accent)", bg: "var(--accent-bg)", icon: "FileText" },
  docs: { color: "var(--info)", bg: "var(--info-bg)", icon: "File" },
  insights: { color: "var(--sugg)", bg: "var(--sugg-bg)", icon: "Lightbulb" },
};
