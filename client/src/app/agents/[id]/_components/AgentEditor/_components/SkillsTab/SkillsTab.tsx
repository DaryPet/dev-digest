"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, EmptyState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { SkillTypeBadge } from "../../../../../../../components/SkillTypeBadge";
import { s } from "./styles";

/** Skills tab — attach (check) / detach (uncheck) and drag-to-reorder the whole
    skill catalog for an agent. Checked = linked; order top→bottom is the block
    order in the assembled review prompt (server `run-executor.ts` appends
    linked skills in `agent_skills.order`). */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: links, isLoading: linksLoading } = useAgentSkills(agent.id);
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const setAgentSkills = useSetAgentSkills();

  const skillById = React.useMemo(() => {
    const m = new Map<string, Skill>();
    for (const sk of skills ?? []) m.set(sk.id, sk);
    return m;
  }, [skills]);

  const linkedIds = React.useMemo(
    () => [...(links ?? [])].sort((a, b) => a.order - b.order).map((l) => l.skill_id),
    [links],
  );
  const linkedSet = React.useMemo(() => new Set(linkedIds), [linkedIds]);

  // Local display order over the full catalog: linked (in saved order) first,
  // then the rest. Re-seeded only when the agent or the set of skills changes —
  // not on every persist — so local drags/toggles don't jump.
  const [order, setOrder] = React.useState<string[]>([]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [filter, setFilter] = React.useState("");
  const seededRef = React.useRef<string>("");

  React.useEffect(() => {
    if (linksLoading || skillsLoading) return;
    const all = (skills ?? []).map((sk) => sk.id);
    const next = [...linkedIds, ...all.filter((id) => !linkedSet.has(id))];
    const key = `${agent.id}|${[...all].sort().join(",")}`;
    if (seededRef.current !== key) {
      seededRef.current = key;
      setOrder(next);
    }
  }, [agent.id, skills, linkedIds, linkedSet, linksLoading, skillsLoading]);

  const persistLinked = (nextOrder: string[]) =>
    setAgentSkills.mutate({ agentId: agent.id, skillIds: nextOrder.filter((id) => linkedSet.has(id)) });

  const toggleLink = (id: string) => {
    const nextLinked = new Set(linkedSet);
    if (nextLinked.has(id)) nextLinked.delete(id);
    else nextLinked.add(id);
    setAgentSkills.mutate({ agentId: agent.id, skillIds: order.filter((x) => nextLinked.has(x)) });
  };

  const onDrop = (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) return setDragIndex(null);
    const next = [...order];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(toIndex, 0, moved!);
    setOrder(next);
    setDragIndex(null);
    persistLinked(next);
  };

  const q = filter.trim().toLowerCase();
  const isLoading = linksLoading || skillsLoading;
  const total = skills?.length ?? 0;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.titleRow}>
          <h2 style={s.h2}>{t("skills.title")}</h2>
          {!isLoading && (
            <span style={s.countPill}>{t("skills.enabledCount", { linked: linkedIds.length, total })}</span>
          )}
        </div>
        <div style={s.filter}>
          <Icon.Filter size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : total === 0 ? (
        <EmptyState icon="Sparkles" title={t("skills.title")} body={t("skills.orderHint")} />
      ) : (
        <div style={s.list}>
          {order.map((id, idx) => {
            const skill = skillById.get(id);
            if (!skill) return null;
            if (q && !skill.name.toLowerCase().includes(q)) return null;
            const checked = linkedSet.has(id);
            return (
              <div
                key={id}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                onDragEnd={() => setDragIndex(null)}
                style={s.row(checked, dragIndex === idx)}
              >
                <span style={s.grip} aria-hidden>
                  <Icon.Menu size={15} />
                </span>
                <Checkbox checked={checked} onChange={() => toggleLink(id)} />
                <span className="mono" style={s.name}>
                  {skill.name}
                </span>
                <SkillTypeBadge type={skill.type} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
