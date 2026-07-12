"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { BlastRadius } from "@devdigest/shared";
import { useBlastRadius } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { s, ENDPOINT_COLOR, CRON_COLOR } from "./styles";

interface Props {
  prId: string | number;
  repoFullName: string | null;
  headSha: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true for callable kinds — adds `()` suffix in display. */
function callable(kind: string): boolean {
  return kind === "function" || kind === "method";
}

/** Truncates a string for SVG `<text>` elements (no CSS text-overflow in SVG). */
function trunc(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// CallerRowItem — one caller row (whole row is the deep link or plain div)
// ---------------------------------------------------------------------------

function CallerRowItem({ label, href }: { label: string; href: string | null }) {
  const [hovered, setHovered] = React.useState(false);
  const textStyle: React.CSSProperties = {
    ...s.callerText,
    ...(hovered && href
      ? { textDecoration: "underline", color: "var(--accent-text)" }
      : {}),
  };

  if (href) {
    return (
      <a
        style={s.callerRow}
        href={href}
        target="_blank"
        rel="noreferrer"
        title={label}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Icon.CornerDownRight size={12} style={s.callerCorner} aria-hidden />
        <span style={textStyle}>{label}</span>
      </a>
    );
  }
  return (
    <div style={s.callerRow} title={label}>
      <Icon.CornerDownRight size={12} style={s.callerCorner} aria-hidden />
      <span style={s.callerText}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DegradedBanner
// ---------------------------------------------------------------------------

function DegradedBanner({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div style={s.degradedBanner} role="alert">
      <Icon.AlertTriangle
        size={14}
        aria-hidden
        style={{ flexShrink: 0, marginTop: 1 }}
      />
      <div style={s.degradedBannerText}>
        <span style={s.degradedBannerTitle}>{t("blast.degraded")}</span>
        <span style={s.degradedBannerHint}>{t("blast.degradedHint")}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlastGraph — dependency-free SVG graph (symbols → callers → endpoints/crons)
// ---------------------------------------------------------------------------

const G_SYM_X = 4;
const G_SYM_W = 150;
const G_CAL_X = G_SYM_X + G_SYM_W + 56; // 210
const G_CAL_W = 185;
const G_EP_X = G_CAL_X + G_CAL_W + 46; // 441
const G_EP_W = 135;
const G_TOTAL_W = G_EP_X + G_EP_W + 4; // 580
const G_NODE_H = 28;
const G_NODE_GAP = 8;
const G_GROUP_GAP = 18;
const G_MAX_CALLERS = 6;
const G_MONO = "var(--font-mono, monospace)";

interface GCallerItem {
  label: string;
  href: string | null;
  y: number;
}
interface GEpItem {
  label: string;
  kind: "endpoint" | "cron";
  y: number;
}
interface GGroup {
  symName: string;
  symFile: string;
  symKind: string;
  symY: number;
  callers: GCallerItem[];
  eps: GEpItem[];
}

function buildGraphLayout(
  blast: BlastRadius,
  repoFullName: string | null,
  headSha: string | null,
): { groups: GGroup[]; totalH: number } {
  let curY = 8;
  const groups: GGroup[] = blast.changed_symbols.map((sym) => {
    const impact = blast.downstream.find((d) => d.symbol === sym.name);
    const callerList = (impact?.callers ?? []).slice(0, G_MAX_CALLERS);
    const extra = Math.max(0, (impact?.callers.length ?? 0) - G_MAX_CALLERS);
    const endpoints = impact?.endpoints_affected ?? [];
    const crons = impact?.crons_affected ?? [];

    const nCallers = callerList.length + (extra > 0 ? 1 : 0);
    const nEps = endpoints.length + crons.length;
    const callerH = nCallers > 0 ? nCallers * (G_NODE_H + G_NODE_GAP) - G_NODE_GAP : 0;
    const epH = nEps > 0 ? nEps * (G_NODE_H + G_NODE_GAP) - G_NODE_GAP : 0;
    const groupH = Math.max(G_NODE_H, callerH, epH);

    const symY = curY + Math.floor((groupH - G_NODE_H) / 2);
    const callerStartY = nCallers > 0 ? curY + Math.floor((groupH - callerH) / 2) : 0;
    const epStartY = nEps > 0 ? curY + Math.floor((groupH - epH) / 2) : 0;

    const callers: GCallerItem[] = [
      ...callerList.map((c, i) => ({
        label: `${c.file}:${c.line}`,
        href:
          repoFullName && headSha
            ? githubBlobUrl(repoFullName, headSha, c.file, c.line)
            : null,
        y: callerStartY + i * (G_NODE_H + G_NODE_GAP),
      })),
      ...(extra > 0
        ? [
            {
              label: `+${extra} more`,
              href: null,
              y: callerStartY + callerList.length * (G_NODE_H + G_NODE_GAP),
            },
          ]
        : []),
    ];

    const eps: GEpItem[] = [
      ...endpoints.map((ep, i) => ({
        label: ep,
        kind: "endpoint" as const,
        y: epStartY + i * (G_NODE_H + G_NODE_GAP),
      })),
      ...crons.map((cron, i) => ({
        label: cron,
        kind: "cron" as const,
        y:
          epStartY +
          endpoints.length * (G_NODE_H + G_NODE_GAP) +
          i * (G_NODE_H + G_NODE_GAP),
      })),
    ];

    curY += groupH + G_GROUP_GAP;
    return { symName: sym.name, symFile: sym.file, symKind: sym.kind, symY, callers, eps };
  });

  const totalH = groups.length === 0 ? 60 : curY - G_GROUP_GAP + 8;
  return { groups, totalH };
}

function BlastGraph({
  blast,
  repoFullName,
  headSha,
}: {
  blast: BlastRadius;
  repoFullName: string | null;
  headSha: string | null;
}) {
  const { groups, totalH } = buildGraphLayout(blast, repoFullName, headSha);

  return (
    <div style={s.graphWrapper}>
      <svg
        data-testid="blast-graph"
        viewBox={`0 0 ${G_TOTAL_W} ${totalH}`}
        width="100%"
        aria-label="blast radius graph"
        style={{ display: "block" }}
      >
        {groups.map(({ symName, symFile, symKind, symY, callers, eps }) => {
          const isCall = callable(symKind);
          const displayName = isCall ? `${symName}()` : symName;
          const symMidY = symY + G_NODE_H / 2;

          return (
            <g key={`${symFile}::${symName}`}>
              {/* Symbol node — blue tinted */}
              <rect
                x={G_SYM_X}
                y={symY}
                width={G_SYM_W}
                height={G_NODE_H}
                rx={6}
                style={{
                  fill: ENDPOINT_COLOR.bg,
                  stroke: ENDPOINT_COLOR.c,
                  strokeWidth: "1",
                }}
              />
              <text
                x={G_SYM_X + 8}
                y={symY + 18}
                style={{
                  fontFamily: G_MONO,
                  fontSize: "11px",
                  fontWeight: "600",
                  fill: ENDPOINT_COLOR.c,
                }}
              >
                {trunc(displayName, 18)}
              </text>

              {/* Caller nodes + edges */}
              {callers.map((item) => {
                const calMidY = item.y + G_NODE_H / 2;
                const edgePath = `M ${G_SYM_X + G_SYM_W} ${symMidY} C ${G_SYM_X + G_SYM_W + 30} ${symMidY} ${G_CAL_X - 30} ${calMidY} ${G_CAL_X} ${calMidY}`;
                const isMore = item.label.startsWith("+") && item.href === null;

                const nodeInner = (
                  <>
                    <path
                      d={edgePath}
                      fill="none"
                      style={{ stroke: "var(--border)", strokeWidth: "1.5" }}
                    />
                    <rect
                      x={G_CAL_X}
                      y={item.y}
                      width={G_CAL_W}
                      height={G_NODE_H}
                      rx={6}
                      style={{
                        fill: "var(--bg-elevated)",
                        stroke: "var(--border)",
                        strokeWidth: "1",
                      }}
                    />
                    <text
                      x={G_CAL_X + 8}
                      y={item.y + 18}
                      style={{
                        fontFamily: G_MONO,
                        fontSize: "11px",
                        fill: isMore ? "var(--text-muted)" : "var(--accent)",
                      }}
                    >
                      {trunc(item.label, 25)}
                    </text>
                  </>
                );

                if (item.href) {
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <title>{item.label}</title>
                      {nodeInner}
                    </a>
                  );
                }
                return <g key={item.label}>{nodeInner}</g>;
              })}

              {/* Endpoint / cron nodes + edges */}
              {eps.map((item) => {
                const epMidY = item.y + G_NODE_H / 2;
                const edgePath = `M ${G_SYM_X + G_SYM_W} ${symMidY} C ${G_SYM_X + G_SYM_W + 70} ${symMidY} ${G_EP_X - 70} ${epMidY} ${G_EP_X} ${epMidY}`;
                const colors =
                  item.kind === "endpoint" ? ENDPOINT_COLOR : CRON_COLOR;
                return (
                  <g key={`${item.kind}:${item.label}`}>
                    <path
                      d={edgePath}
                      fill="none"
                      style={{ stroke: "var(--border)", strokeWidth: "1.5" }}
                    />
                    <rect
                      x={G_EP_X}
                      y={item.y}
                      width={G_EP_W}
                      height={G_NODE_H}
                      rx={6}
                      style={{
                        fill: colors.bg,
                        stroke: colors.c,
                        strokeWidth: "1",
                      }}
                    />
                    <text
                      x={G_EP_X + 8}
                      y={item.y + 18}
                      style={{
                        fontFamily: G_MONO,
                        fontSize: "10px",
                        fill: colors.c,
                      }}
                    >
                      {trunc(item.label, 18)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlastRadiusCard
// ---------------------------------------------------------------------------

/**
 * BLAST RADIUS card + "Prior PRs touching these files" bar for the Overview
 * tab (right column of the PR-brief grid, per the PR-page design).
 *
 * Four states (none blank):
 *  - loading   → "Computing blast radius…" muted text
 *  - empty     → honest "not computed yet" copy (also on error)
 *  - data      → counts header + Tree/Graph toggle + symbol tree or SVG graph
 *  - degraded  → warning badge shown ALONGSIDE data or empty (never replacing them)
 *
 * Header icon: Workflow (closest network/graph glyph in the Icon registry).
 * Count icons: Code (symbols), CornerDownRight (callers), Globe (endpoints), Clock (crons).
 * Endpoint badges: SEV.INFO (blue) — never hand-rolled.
 * Cron badges:     SEV.WARNING (orange) — never hand-rolled.
 *
 * The Prior-PRs bar block is unchanged (separate feature).
 */
export function BlastRadiusCard({ prId, repoFullName, headSha }: Props) {
  const t = useTranslations("brief");
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [view, setView] = React.useState<"tree" | "graph">("tree");
  const [expandedSet, setExpandedSet] = React.useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useBlastRadius(prId);

  const blast = data?.blast;
  const index = data?.index;

  // Expand the first symbol once blast data arrives (one-time initialization).
  const firstSymbolName = blast?.changed_symbols[0]?.name ?? null;
  const initRef = React.useRef(false);
  React.useEffect(() => {
    if (firstSymbolName && !initRef.current) {
      initRef.current = true;
      setExpandedSet(new Set([firstSymbolName]));
    }
  }, [firstSymbolName]);

  // Client-side count computations (never parsed from blast.summary).
  const symbolCount = blast?.changed_symbols.length ?? 0;
  const totalCallers =
    blast?.downstream.reduce((acc, d) => acc + d.callers.length, 0) ?? 0;
  const distinctEndpoints = new Set(
    blast?.downstream.flatMap((d) => d.endpoints_affected) ?? [],
  );
  const distinctCrons = new Set(
    blast?.downstream.flatMap((d) => d.crons_affected) ?? [],
  );

  const isEmpty = symbolCount === 0 && totalCallers === 0;
  const showData = !isLoading && !isError && blast != null && !isEmpty;
  const showEmpty = !isLoading && (isError || blast == null || isEmpty);

  const isDegraded =
    index != null &&
    (index.degraded ||
      index.status === "partial" ||
      index.status === "failed");

  const toggleExpand = (name: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div style={s.card}>
      {/* Header */}
      <div style={s.cardHeader}>
        <Icon.Workflow
          size={14}
          style={{ color: "var(--text-muted)" }}
          aria-hidden
        />
        <span style={s.cardTitle}>{t("block.blast")}</span>
      </div>

      {/* ---- loading ---- */}
      {isLoading && <div style={s.emptyHint}>{t("blast.loading")}</div>}

      {/* ---- empty / error ---- */}
      {showEmpty && (
        <>
          <div style={s.emptyHint}>{t("noBlast")}</div>
          {isDegraded && <DegradedBanner t={t} />}
        </>
      )}

      {/* ---- data state ---- */}
      {showData && blast && (
        <>
          {/* Counts row + Tree / Graph segmented toggle */}
          <div style={s.countRow}>
            {/* Symbol count */}
            <span style={s.countItem}>
              <span style={s.countIcon}>
                <Icon.Code size={12} aria-hidden />
              </span>
              <span style={s.countNum}>{symbolCount}</span>{" "}
              <span style={s.countLabel}>
                {t("blast.symbols", { count: symbolCount })
                  .replace(String(symbolCount), "")
                  .trim()}
              </span>
            </span>

            {/* Caller count */}
            <span style={s.countItem}>
              <span style={s.countIcon}>
                <Icon.CornerDownRight size={12} aria-hidden />
              </span>
              <span style={s.countNum}>{totalCallers}</span>{" "}
              <span style={s.countLabel}>
                {t("blast.callers", { count: totalCallers })
                  .replace(String(totalCallers), "")
                  .trim()}
              </span>
            </span>

            {/* Endpoint count */}
            <span style={s.countItem}>
              <span style={s.countIcon}>
                <Icon.Globe size={12} aria-hidden />
              </span>
              <span style={s.countNum}>{distinctEndpoints.size}</span>{" "}
              <span style={s.countLabel}>
                {t("blast.endpoints", { count: distinctEndpoints.size })
                  .replace(String(distinctEndpoints.size), "")
                  .trim()}
              </span>
            </span>

            {/* Cron count */}
            <span style={s.countItem}>
              <span style={s.countIcon}>
                <Icon.Clock size={12} aria-hidden />
              </span>
              <span style={s.countNum}>{distinctCrons.size}</span>{" "}
              <span style={s.countLabel}>
                {t("blast.crons", { count: distinctCrons.size })
                  .replace(String(distinctCrons.size), "")
                  .trim()}
              </span>
            </span>

            {/* Segmented toggle */}
            <div style={s.togglePill} role="group" aria-label="view mode">
              <button
                type="button"
                style={{
                  ...s.toggleBtn,
                  ...(view === "tree" ? s.toggleBtnActive : {}),
                }}
                onClick={() => setView("tree")}
                aria-pressed={view === "tree"}
              >
                {t("blast.tree")}
              </button>
              <button
                type="button"
                style={{
                  ...s.toggleBtn,
                  ...(view === "graph" ? s.toggleBtnActive : {}),
                }}
                onClick={() => setView("graph")}
                aria-pressed={view === "graph"}
              >
                {t("blast.graph")}
              </button>
            </div>
          </div>

          {/* Tree view */}
          {view === "tree" && (
            <div style={s.symbolList}>
              {blast.changed_symbols.map((sym) => {
                const impact = blast.downstream.find(
                  (d) => d.symbol === sym.name,
                );
                const callerCount = impact?.callers.length ?? 0;
                const symKey = `${sym.file}::${sym.name}`;
                const isExpanded = expandedSet.has(symKey);
                const isCall = callable(sym.kind);
                const displayName = isCall ? `${sym.name}()` : sym.name;

                return (
                  <div key={symKey}>
                    {/* Full-width band row — click anywhere to expand/collapse */}
                    <button
                      type="button"
                      style={s.symbolBand}
                      onClick={() => toggleExpand(symKey)}
                      aria-expanded={isExpanded}
                    >
                      <span style={s.symbolChevron}>
                        {isExpanded ? (
                          <Icon.ChevronDown size={14} aria-hidden />
                        ) : (
                          <Icon.ChevronRight size={14} aria-hidden />
                        )}
                      </span>
                      <span style={s.symbolCodeIcon}>
                        <Icon.Code size={14} aria-hidden />
                      </span>
                      <span style={s.symbolName}>{displayName}</span>
                      <span style={s.symbolCallerCount}>
                        {t("blast.callers", { count: callerCount })}
                      </span>
                    </button>

                    {/* Expanded body: caller tree + badges */}
                    {isExpanded && impact && (
                      <div style={s.expandedBody}>
                        {impact.callers.length > 0 && (
                          <div style={s.callerTree}>
                            {impact.callers.map((caller) => {
                              const label = `${caller.file}:${caller.line}`;
                              const href =
                                repoFullName && headSha
                                  ? githubBlobUrl(
                                      repoFullName,
                                      headSha,
                                      caller.file,
                                      caller.line,
                                    )
                                  : null;
                              return (
                                <CallerRowItem
                                  key={label}
                                  label={label}
                                  href={href}
                                />
                              );
                            })}
                          </div>
                        )}

                        {(impact.endpoints_affected.length > 0 ||
                          impact.crons_affected.length > 0) && (
                          <div style={s.badgeRow}>
                            {impact.endpoints_affected.map((ep) => (
                              <Badge
                                key={ep}
                                icon="Globe"
                                color={ENDPOINT_COLOR.c}
                                bg={ENDPOINT_COLOR.bg}
                                mono
                              >
                                {ep}
                              </Badge>
                            ))}
                            {impact.crons_affected.map((cron) => (
                              <Badge
                                key={cron}
                                icon="Clock"
                                color={CRON_COLOR.c}
                                bg={CRON_COLOR.bg}
                                mono
                              >
                                {cron}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Graph view — real SVG, no external dependencies */}
          {view === "graph" && (
            <BlastGraph
              blast={blast}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          )}

          {isDegraded && <DegradedBanner t={t} />}
        </>
      )}

      {/* Prior-PRs bar — unchanged (separate feature). */}
      <button
        type="button"
        style={s.historyBar}
        onClick={() => setHistoryOpen((v) => !v)}
        aria-expanded={historyOpen}
      >
        <Icon.History
          size={14}
          style={{ color: "var(--text-muted)" }}
          aria-hidden
        />
        <span style={s.historyLabel}>{t("priorPrs")}</span>
        {historyOpen ? (
          <Icon.ChevronDown size={14} style={s.chevron} aria-hidden />
        ) : (
          <Icon.ChevronRight size={14} style={s.chevron} aria-hidden />
        )}
      </button>
      {historyOpen && <div style={s.historyBody}>{t("noHistory")}</div>}
    </div>
  );
}
