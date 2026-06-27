/* SkillTypeBadge — shared color/label/icon for a Skill's `type`, used in the
   Skills list cards, the Skill editor header, and the agent Skills tab. ONE
   canonical map (mirrors the SEV/CAT pattern in vendor/ui/primitives/tokens.ts)
   so no component hand-rolls a Record<SkillType, string>. */
"use client";

import React from "react";
import { Badge, type IconName } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";

export const SKILL_TYPE_META: Record<
  SkillType,
  { color: string; bg: string; icon: IconName; label: string }
> = {
  rubric: { color: "var(--sugg)", bg: "var(--sugg-bg)", icon: "ListChecks", label: "rubric" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)", icon: "FileText", label: "convention" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "Shield", label: "security" },
  custom: { color: "var(--info)", bg: "var(--info-bg)", icon: "Sparkles", label: "custom" },
};

export function SkillTypeBadge({ type }: { type: SkillType }) {
  const meta = SKILL_TYPE_META[type];
  return (
    <Badge color={meta.color} bg={meta.bg} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}
