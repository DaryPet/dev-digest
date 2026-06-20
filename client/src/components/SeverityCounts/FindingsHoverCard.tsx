/* FindingsHoverCard — floating "N FINDINGS" preview shown on hover over a
   SeverityCounts badge (design: PR-list FINDINGS column + PR-detail timeline
   rows). Each row mirrors the review FindingCard: severity icon badge, title,
   CategoryTag (icon+label), a clickable file:line · confidence, and a short
   rationale.

   Interactive: the card stays open while the cursor is over EITHER the badge
   or the card (a short close grace period bridges the gap between them), so the
   GitHub file link is clickable. Rendered in a portal to <body> with
   position:fixed so it is NOT clipped by an ancestor `overflow: hidden` (the
   PR-list table card clips it otherwise). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Icon, SEV, SeverityBadge, CategoryTag } from "@devdigest/ui";
import type { Severity, Category } from "@devdigest/ui";
import { githubBlobUrl } from "@/lib/github-urls";

export interface FindingsPreviewItem {
  /** Loosely typed: the API's findings.items[].severity/category are plain
   *  strings (DB columns), narrowed defensively at render. */
  severity: string;
  title: string;
  file: string;
  start_line: number;
  category: string;
  confidence: number;
  rationale: string;
}

const CARD_WIDTH = 360;
const CLOSE_DELAY_MS = 140;
const KNOWN_SEVERITIES = new Set<Severity>(["CRITICAL", "WARNING", "SUGGESTION", "INFO"]);
const KNOWN_CATEGORIES = new Set<Category>(["bug", "security", "perf", "style", "test"]);

export function FindingsHoverCard({
  items,
  children,
  repoFullName,
  headSha,
}: {
  items: FindingsPreviewItem[];
  children: React.ReactNode;
  /** owner/repo + head sha — when both present, file:line becomes a GitHub link. */
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const anchorRef = React.useRef<HTMLSpanElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  if (items.length === 0) return <>{children}</>;

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const open = () => {
    cancelClose();
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(r.left, window.innerWidth - CARD_WIDTH - 12);
    setPos({ top: r.bottom + 6, left: Math.max(12, left) });
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPos(null), CLOSE_DELAY_MS);
  };

  const canLink = !!repoFullName && !!headSha;

  return (
    <span
      ref={anchorRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
    >
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              zIndex: 1000,
              width: CARD_WIDTH,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "var(--shadow-modal)",
              padding: "10px 0",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "0 14px 8px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              <Icon.AlertOctagon size={13} />
              {items.length} finding{items.length === 1 ? "" : "s"}
            </div>
            {items.map((f, i) => {
              const severity = (KNOWN_SEVERITIES.has(f.severity as Severity)
                ? f.severity
                : "SUGGESTION") as Severity;
              const category = KNOWN_CATEGORIES.has(f.category as Category)
                ? (f.category as Category)
                : null;
              const href = canLink
                ? githubBlobUrl(repoFullName!, headSha!, f.file, f.start_line)
                : undefined;
              const fileLabel = `${f.file}:${f.start_line}`;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 9,
                    padding: "9px 14px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flexShrink: 0, marginTop: 1 }}>
                    <SeverityBadge severity={severity} compact />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                        {f.title}
                      </span>
                      {category && <CategoryTag category={category} />}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginTop: 3,
                        fontSize: 11.5,
                        color: "var(--text-muted)",
                      }}
                    >
                      {href ? (
                        <a
                          className="mono"
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "var(--accent-text)", textDecoration: "none" }}
                        >
                          {fileLabel}
                        </a>
                      ) : (
                        <span className="mono">{fileLabel}</span>
                      )}
                      <span style={{ color: "var(--ok)" }}>● {Math.round(f.confidence * 100)}% conf</span>
                    </div>
                    {f.rationale && (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          lineHeight: 1.45,
                          color: "var(--text-secondary)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {f.rationale}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </span>
  );
}
