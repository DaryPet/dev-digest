"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard/IntentCard";
import { PrBriefCard } from "../PrBriefCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { ReviewFocusSection } from "../ReviewFocusSection";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | number;
  repoFullName: string | null;
  headSha: string | null;
}

/** Overview tab layout per the PR-page design: PR BRIEF verdict card on top,
 *  then a two-column row — Intent card (left) and Blast radius / prior-PRs
 *  column (right). The Description section has been removed per the mock. */
export function OverviewTab({ prId, repoFullName, headSha }: OverviewTabProps) {
  const t = useTranslations("brief");
  return (
    <>
      <section>
        <SectionLabel icon="FileText">{t("prBrief")}</SectionLabel>
        <PrBriefCard prId={prId} />
      </section>

      <div style={s.briefGrid}>
        <IntentCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
        <BlastRadiusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      <ReviewFocusSection prId={prId} repoFullName={repoFullName} headSha={headSha} />
    </>
  );
}
