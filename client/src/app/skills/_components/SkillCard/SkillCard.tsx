/* SkillCard — name, type badge, description, enabled toggle. No runs/accept-
   rate stats strip: there's no per-skill run aggregate data source yet, so we
   omit it entirely rather than show fake/zero numbers (spec §3). */
"use client";

import React from "react";
import { Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SkillTypeBadge } from "../../../../components/SkillTypeBadge";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <span style={s.name}>{skill.name}</span>
        <SkillTypeBadge type={skill.type} />
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
    </div>
  );
}
