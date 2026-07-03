/* SmartDiffViewer — risk-ordered diff layout.
   Classifies changed files as core / wiring / boilerplate (from the server),
   overlays "N findings" badges from the latest review, and supports badge-click
   → scroll-to-finding-line.  All token-free (no LLM call on this path).

   Layout per the design mock: a "Reviewer-ordered diff" section label with a
   files/± summary, flat group labels (bullet + name + description + count),
   and one card per file. Files with findings auto-expand; everything else
   (lock files included) starts collapsed.

   Mount: top of the Files-changed tab (DiffTab.tsx), above the flat DiffViewer.
   Spec: specs/smart-diff.md §7 T2 (+ §13 design-parity amendment).
*/
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Skeleton } from "@devdigest/ui";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { parsePatch } from "@/components/diff-viewer";
import type {
  PrFile,
  SmartDiffRole,
  SmartDiffGroup,
  SmartDiffFile,
} from "@devdigest/shared";
import { s, ROLE_BULLET } from "./styles";

// ----- Types -----

/** Which diff layout the Files-changed tab shows. */
export type SmartDiffOrder = "smart" | "original";

interface SmartDiffViewerProps {
  /** PR uuid — passed from DiffTab which receives it from the page. */
  prId: string | null;
  /** Full PrFile list from the PR detail — needed for patch content. */
  files: PrFile[];
  /** Current order mode; "original" renders only the header + toggle
   *  (DiffTab shows the flat DiffViewer below in that mode). */
  mode: SmartDiffOrder;
  onModeChange: (mode: SmartDiffOrder) => void;
}

// Canonical display order: risk first.
const ROLE_ORDER: SmartDiffRole[] = ["core", "wiring", "boilerplate"];

// ----- FileDiff sub-component -----
// Renders a file's unified-diff patch with per-line refs for scroll-to-finding.
// Intentionally not using the shared FileCard/CodeLine because those components
// expose no external open-state or scroll API (spec §11).

interface FileDiffProps {
  file: PrFile;
  findingLines: number[];
  noDiffText: string;
}

function FileDiff({ file, findingLines, noDiffText }: FileDiffProps) {
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const findingSet = React.useMemo(() => new Set(findingLines), [findingLines]);

  if (lines.length === 0) {
    return <div style={s.noDiff}>{noDiffText}</div>;
  }

  return (
    <div style={s.fileDiff}>
      {lines.map((ln, i) => {
        if (ln.kind === "hunk") {
          return (
            <div key={i} className="mono" style={s.hunkLine}>
              {ln.text}
            </div>
          );
        }

        // finding_lines are new-file line numbers (start_line from findings).
        const lineNo = ln.newNo;
        const isFinding = lineNo != null && findingSet.has(lineNo);

        const bg =
          ln.kind === "add"
            ? "var(--code-add)"
            : ln.kind === "del"
              ? "var(--code-del)"
              : isFinding
                ? "var(--warn-bg)"
                : "transparent";

        const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
        const signColor =
          ln.kind === "add"
            ? "var(--code-add-text)"
            : ln.kind === "del"
              ? "var(--code-del-text)"
              : "var(--text-muted)";

        // data-sd-line is placed on finding lines so the badge-click handler
        // can querySelector them and call scrollIntoView.
        const findingAttr =
          isFinding && lineNo != null
            ? { "data-sd-line": String(lineNo) }
            : {};

        return (
          <div
            key={i}
            style={{ ...s.diffLine, background: bg }}
            {...findingAttr}
          >
            <span className="mono tnum" style={s.lineNo}>
              {ln.newNo ?? ln.oldNo ?? ""}
            </span>
            <span className="mono" style={{ ...s.lineSign, color: signColor }}>
              {sign}
            </span>
            <span className="mono" style={s.lineText}>
              {ln.text || " "}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ----- SmartDiffViewer -----

export function SmartDiffViewer({
  prId,
  files,
  mode,
  onModeChange,
}: SmartDiffViewerProps) {
  const t = useTranslations("smartDiff");
  const { data, isLoading } = useSmartDiff(prId);

  // Per-file open override. A file with no override auto-expands when the
  // latest review flagged it (finding_lines non-empty) and starts collapsed
  // otherwise — lock files / boilerplate therefore start collapsed.
  const [openOverrides, setOpenOverrides] = React.useState<
    Map<string, boolean>
  >(() => new Map());

  // Ref map: path → container div (used to querySelector for scroll targets).
  const containerRefs = React.useRef<Map<string, HTMLDivElement | null>>(
    new Map(),
  );

  // Pending scroll set by badge click; consumed after the next render
  // (when the file's diff is now in the DOM).
  const pendingScrollRef = React.useRef<{ path: string; line: number } | null>(
    null,
  );

  // Cross-reference by path to get the PrFile (patch) for each SmartDiffFile.
  const fileMap = React.useMemo(() => {
    const m = new Map<string, PrFile>();
    for (const f of files) m.set(f.path, f);
    return m;
  }, [files]);

  // Pre-compute role copy once per render to avoid dynamic t() key strings.
  const roleLabels: Record<SmartDiffRole, string> = {
    core: t("roles.core"),
    wiring: t("roles.wiring"),
    boilerplate: t("roles.boilerplate"),
  };
  const roleDescriptions: Record<SmartDiffRole, string> = {
    core: t("roleDescriptions.core"),
    wiring: t("roleDescriptions.wiring"),
    boilerplate: t("roleDescriptions.boilerplate"),
  };

  // After openOverrides changes (file opened), scroll to any pending target.
  React.useEffect(() => {
    if (!pendingScrollRef.current) return;
    const { path, line } = pendingScrollRef.current;
    const container = containerRefs.current.get(path);
    if (!container) return;
    const el = container.querySelector(`[data-sd-line="${line}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      pendingScrollRef.current = null;
    }
  }, [openOverrides]);

  const isFileOpen = (sdFile: SmartDiffFile): boolean =>
    openOverrides.get(sdFile.path) ?? sdFile.finding_lines.length > 0;

  const toggleFile = (path: string, currentlyOpen: boolean) => {
    setOpenOverrides((prev) => new Map(prev).set(path, !currentlyOpen));
  };

  /** Expand the file (if needed) and scroll to the first finding line. */
  const handleBadgeClick = (
    path: string,
    firstLine: number,
    currentlyOpen: boolean,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation(); // don't toggle the file header click
    if (currentlyOpen) {
      // File already open — scroll directly (DOM element is present).
      const container = containerRefs.current.get(path);
      const el = container?.querySelector(`[data-sd-line="${firstLine}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      // File closed — mark pending and open; the effect fires after render.
      pendingScrollRef.current = { path, line: firstLine };
      setOpenOverrides((prev) => new Map(prev).set(path, true));
    }
  };

  // Nothing to render when there's no PR.
  if (!prId) return null;

  // Header totals come from the PrFile list so the header (and the order
  // toggle) render instantly in both modes; the query feeds only the groups.
  let totalAdd = 0;
  let totalDel = 0;
  for (const f of files) {
    totalAdd += f.additions;
    totalDel += f.deletions;
  }

  // Enforce canonical role order. The server omits empty groups (§5.3) but
  // the layout always shows all three sections — an empty one renders its
  // label with "0 files" so the risk ordering stays visible on any PR.
  const orderedGroups: SmartDiffGroup[] = data
    ? ROLE_ORDER.map(
        (role) =>
          data.groups.find((g) => g.role === role) ?? { role, files: [] },
      )
    : [];

  return (
    <div style={s.wrapper}>
      <div style={s.sectionLabel}>
        <Icon.Code size={13} aria-hidden />
        <span>{t("sectionLabel")}</span>
      </div>

      <div style={s.summaryRow}>
        <span>{t("filesSummary", { count: files.length })}</span>
        <span>·</span>
        <span className="mono tnum" style={s.addText}>
          +{totalAdd}
        </span>
        <span className="mono tnum" style={s.delText}>
          −{totalDel}
        </span>

        {/* Smart order / Original order pill toggle (design mock). */}
        <div style={s.orderToggle} role="group" aria-label={t("orderToggle")}>
          <button
            type="button"
            style={{
              ...s.orderBtn,
              ...(mode === "smart" ? s.orderBtnActive : {}),
            }}
            aria-pressed={mode === "smart"}
            onClick={() => onModeChange("smart")}
          >
            {t("smartOrder")}
          </button>
          <button
            type="button"
            style={{
              ...s.orderBtn,
              ...(mode === "original" ? s.orderBtnActive : {}),
            }}
            aria-pressed={mode === "original"}
            onClick={() => onModeChange("original")}
          >
            {t("originalOrder")}
          </button>
        </div>
      </div>

      {mode === "smart" && isLoading && (
        <div aria-label={t("loading")}>
          <Skeleton height={32} />
          <Skeleton height={120} />
        </div>
      )}

      {mode === "smart" && data && (
        <>
          {data.split_suggestion.too_big && (
            <div style={s.splitBanner} role="alert">
              <Icon.AlertTriangle size={14} aria-hidden />
              <span>
                {t("splitSuggestion")} —{" "}
                {t("totalLines", {
                  total: data.split_suggestion.total_lines,
                })}
              </span>
            </div>
          )}

          {orderedGroups.map((group) => {
        const { role, files: groupFiles } = group;

        return (
          <div key={role} style={s.group} data-role={role}>
            {/* Flat group label row (mock): bullet + name + description + count. */}
            <div style={s.groupHeader}>
              <span
                style={{ ...s.groupBullet, background: ROLE_BULLET[role] }}
                aria-hidden
              />
              <span style={s.groupTitle}>{roleLabels[role]}</span>
              <span style={s.groupDesc}>{roleDescriptions[role]}</span>
              <span style={s.groupCount}>
                {t("fileCount", { count: groupFiles.length })}
              </span>
            </div>

            {groupFiles.length === 0 && (
              <div style={s.emptyGroup}>{t("emptyGroup")}</div>
            )}

            <div style={s.fileList}>
              {groupFiles.map((sdFile) => {
                const prFile = fileMap.get(sdFile.path);
                const open = isFileOpen(sdFile);
                const hasFindingLines = sdFile.finding_lines.length > 0;
                // noUncheckedIndexedAccess: [0] is number | undefined.
                const firstFindingLine = sdFile.finding_lines[0];

                return (
                  <div
                    key={sdFile.path}
                    style={s.fileCard}
                    ref={(el) => {
                      containerRefs.current.set(sdFile.path, el);
                    }}
                  >
                    {/* File header — click toggles the diff open/closed. */}
                    <div
                      style={s.fileHeader}
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => toggleFile(sdFile.path, open)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleFile(sdFile.path, open);
                        }
                      }}
                    >
                      <Icon.ChevronRight
                        size={13}
                        style={{
                          color: "var(--text-muted)",
                          transform: open ? "rotate(90deg)" : "none",
                          transition: "transform .12s",
                          flexShrink: 0,
                        }}
                        aria-hidden
                      />
                      <Icon.FileText
                        size={14}
                        style={{ color: "var(--text-muted)", flexShrink: 0 }}
                        aria-hidden
                      />
                      <span
                        className="mono"
                        style={s.filePath}
                        title={sdFile.path}
                      >
                        {sdFile.path}
                      </span>
                      {hasFindingLines && (
                        <span style={s.findingDot} aria-hidden />
                      )}
                      <span style={s.headerSpacer} />
                      <span className="mono tnum" style={s.fileStat}>
                        <span style={s.addText}>+{sdFile.additions}</span>{" "}
                        <span style={s.delText}>−{sdFile.deletions}</span>
                      </span>

                      {/* Findings badge — only when finding_lines is non-empty. */}
                      {hasFindingLines && firstFindingLine != null && (
                        <button
                          type="button"
                          style={s.findingsBadge}
                          onClick={(e) =>
                            handleBadgeClick(
                              sdFile.path,
                              firstFindingLine,
                              open,
                              e,
                            )
                          }
                          aria-label={t("findings", {
                            count: sdFile.finding_lines.length,
                          })}
                        >
                          <Icon.AlertTriangle size={12} aria-hidden />
                          {t("findings", { count: sdFile.finding_lines.length })}
                        </button>
                      )}
                    </div>

                    {/* Diff content — rendered only when the file is expanded. */}
                    {open && prFile && (
                      <FileDiff
                        file={prFile}
                        findingLines={sdFile.finding_lines}
                        noDiffText={t("noDiff")}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
          })}
        </>
      )}
    </div>
  );
}
