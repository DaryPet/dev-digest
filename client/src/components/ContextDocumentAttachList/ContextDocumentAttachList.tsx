"use client";

import React from "react";
import { Checkbox, EmptyState, Icon, Skeleton, Badge } from "@devdigest/ui";
import type { ProjectContextDocument, ProjectContextCategory } from "@devdigest/shared";
import { CATEGORY_META } from "./constants";
import { s } from "./styles";

export interface ContextDocumentAttachListProps {
  /** Full discovered catalog for the repo (order = discovery order). */
  documents: ProjectContextDocument[];
  /** false = read-only browse (Project Context page): no checkbox/drag handle. */
  attachable: boolean;
  /** Persisted, ordered attach list. Required when attachable=true. */
  attachedPaths?: string[];
  /** Called with the next persisted (attached-only, ordered) path list after a
      toggle or a drag-reorder. Required when attachable=true. */
  onAttachedChange?: (nextPaths: string[]) => void;
  /** Preview action for a row (any mode). */
  onPreview: (path: string) => void;
  /** Optional per-document approx token estimate (AC-18), keyed by path. */
  tokensByPath?: Record<string, number>;
  /** Highlights the currently previewed/selected row (read-only mode). */
  selectedPath?: string | null;
  isLoading?: boolean;
  filterPlaceholder: string;
  previewLabel: string;
  /** false = icon-only Preview button (skill section per design); default true. */
  showPreviewLabel?: boolean;
  categoryLabels: Record<ProjectContextCategory, string>;
  emptyTitle: string;
  emptyBody?: string;
}

function filename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/** Shared row-list for Project Context documents, reused by the Project
    Context page (read-only), the Agent Editor's Context tab, and the Skill
    Editor's "Project context to use" section (attach-capable). State machine
    (order/dragIndex/filter/checked/persist-on-toggle-drop) mirrors AgentEditor's
    SkillsTab. Row = drag handle (attachable only) + checkbox (attachable only)
    + filename + path + category badge + Preview action. */
export function ContextDocumentAttachList({
  documents,
  attachable,
  attachedPaths,
  onAttachedChange,
  onPreview,
  tokensByPath,
  selectedPath,
  isLoading,
  filterPlaceholder,
  previewLabel,
  showPreviewLabel = true,
  categoryLabels,
  emptyTitle,
  emptyBody,
}: ContextDocumentAttachListProps) {
  const attached = attachedPaths ?? [];
  const attachedSet = React.useMemo(() => new Set(attached), [attached]);

  // Local display order: attached (in persisted order) first, then the rest of
  // the catalog — seeded once per catalog, NOT re-sorted on toggle/drag: rows
  // must stay where they are while the user checks/unchecks (only an explicit
  // drag moves a row). Read-only mode keeps catalog order.
  const [order, setOrder] = React.useState<string[]>([]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [filter, setFilter] = React.useState("");
  const seededRef = React.useRef<string>("");

  React.useEffect(() => {
    if (isLoading) return;
    const all = documents.map((d) => d.path);
    const next = attachable ? [...attached, ...all.filter((p) => !attachedSet.has(p))] : all;
    const key = `${attachable}|${[...all].sort().join(",")}`;
    if (seededRef.current !== key) {
      seededRef.current = key;
      setOrder(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents, attachable, isLoading]);

  const docByPath = React.useMemo(() => {
    const m = new Map<string, ProjectContextDocument>();
    for (const d of documents) m.set(d.path, d);
    return m;
  }, [documents]);

  const persist = (nextOrder: string[]) => onAttachedChange?.(nextOrder.filter((p) => attachedSet.has(p)));

  const toggle = (path: string) => {
    const next = new Set(attachedSet);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onAttachedChange?.(order.filter((p) => next.has(p)));
  };

  const onDrop = (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) return setDragIndex(null);
    const next = [...order];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(toIndex, 0, moved!);
    setOrder(next);
    setDragIndex(null);
    persist(next);
  };

  const q = filter.trim().toLowerCase();

  if (isLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  if (documents.length === 0) {
    return <EmptyState icon="FileText" title={emptyTitle} body={emptyBody} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.filter}>
        <Icon.Filter size={13} style={s.filterIcon} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={filterPlaceholder}
          style={s.filterInput}
        />
      </div>
      <div style={s.list}>
        {order.map((path, idx) => {
          const doc = docByPath.get(path);
          if (!doc) return null;
          const name = filename(path);
          if (q && !name.toLowerCase().includes(q) && !path.toLowerCase().includes(q)) return null;
          const checked = attachedSet.has(path);
          const cat = CATEGORY_META[doc.category];
          const tokens = tokensByPath?.[path];
          return (
            <div
              key={path}
              draggable={attachable}
              onDragStart={attachable ? () => setDragIndex(idx) : undefined}
              onDragOver={attachable ? (e) => e.preventDefault() : undefined}
              onDrop={attachable ? () => onDrop(idx) : undefined}
              onDragEnd={attachable ? () => setDragIndex(null) : undefined}
              style={s.row(checked, dragIndex === idx, selectedPath === path)}
            >
              {attachable && (
                <span style={s.grip} aria-hidden>
                  <Icon.Menu size={15} />
                </span>
              )}
              {attachable && <Checkbox checked={checked} onChange={() => toggle(path)} />}
              <div style={s.info}>
                <span className="mono" style={s.name}>
                  {name}
                </span>
                <span className="mono" style={s.path}>
                  {path}
                </span>
              </div>
              {tokens != null && <span style={s.tokens}>{"≈" + tokens}</span>}
              <Badge color={cat.color} bg={cat.bg} icon={cat.icon}>
                {categoryLabels[doc.category]}
              </Badge>
              <button
                type="button"
                title={previewLabel}
                aria-label={`${previewLabel} ${name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPreview(path);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: showPreviewLabel ? "5px 12px" : 6,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  fontSize: 12.5,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <Icon.Eye size={13} />
                {showPreviewLabel && previewLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
