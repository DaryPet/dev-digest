"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import { useBrief } from "@/lib/hooks/brief";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

interface ReviewFocusSectionProps {
  prId: string | number;
  repoFullName: string | null;
  headSha: string | null;
}

/**
 * "REVIEW FOCUS — READ THESE FIRST" section for the Overview tab (SPEC-02):
 * the Brief's ranked, grounded list of file:line items to read first. Shares
 * the `useBrief` TanStack cache with `PrBriefCard` — no prop drilling.
 *
 * States:
 *  - loading → muted "computing" copy.
 *  - error or empty `review_focus` → one honest empty state (the Brief
 *    request's own error is already surfaced by `PrBriefCard`, so this never
 *    duplicates an error UI).
 *  - populated → each item is a deep link (`githubBlobUrl`, pinned to head
 *    sha, opens in a new tab) — plain text when `repoFullName`/`headSha` is
 *    null, mirroring `BlastRadiusCard`'s caller-link precedent.
 */
export function ReviewFocusSection({ prId, repoFullName, headSha }: ReviewFocusSectionProps) {
  const t = useTranslations("brief");
  const { data, isLoading, isError } = useBrief(prId);
  const items = data?.brief.review_focus ?? [];

  return (
    <section style={s.card}>
      <div style={s.cardHeader}>
        <Icon.ListChecks size={14} style={{ color: "var(--accent-text)" }} aria-hidden />
        <span style={s.cardTitle}>{t("reviewFocus.title")}</span>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {items.length}
        </Badge>
      </div>

      {isLoading ? (
        <span style={s.emptyHint}>{t("reviewFocus.loading")}</span>
      ) : isError || items.length === 0 ? (
        <span style={s.emptyHint}>{t("reviewFocus.empty")}</span>
      ) : (
        <ul style={s.list} aria-label={t("reviewFocus.title")}>
          {items.map((item, i) => {
            const href =
              repoFullName && headSha
                ? githubBlobUrl(repoFullName, headSha, item.file, item.line)
                : null;
            const content = (
              <>
                <span className="mono" style={s.path}>
                  {item.file}:{item.line}
                </span>
                <span style={s.reason}> — {item.reason}</span>
              </>
            );
            return (
              <li key={`${item.file}:${item.line}:${i}`} style={s.listItem}>
                <Icon.Dot size={16} fill="currentColor" style={s.bullet} aria-hidden />
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    style={s.link}
                    data-testid="review-focus-item"
                  >
                    {content}
                  </a>
                ) : (
                  <span style={s.plainText} data-testid="review-focus-item">
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
