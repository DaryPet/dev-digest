"use client";

import { useTranslations } from "next-intl";
import { Button, IconBtn } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { ConfidenceBar } from "../ConfidenceBar/ConfidenceBar";
import { parseEvidence } from "../../helpers";
import { s } from "../../styles";

/** One candidate convention: rule + clickable evidence (path:line → GitHub) +
    code snippet + confidence bar + Accept/Reject. Presentational — accept/reject
    are lifted to the page (which owns the patch mutation). */
export function ConventionCard({
  candidate,
  repoFullName,
  repoRef,
  pending,
  onAccept,
  onReject,
}: {
  candidate: ConventionCandidate;
  repoFullName: string;
  repoRef: string;
  pending: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const t = useTranslations("conventions");
  const ev = parseEvidence(candidate.evidence_path);
  const href = githubBlobUrl(repoFullName, repoRef, ev.file, ev.start, ev.end);

  const copy = () => {
    void navigator.clipboard?.writeText(candidate.evidence_snippet);
  };

  return (
    <div style={s.card(candidate.status)}>
      <div style={s.cardHead}>
        <div>
          <div style={s.rule}>{candidate.rule}</div>
          {candidate.category ? <div style={s.category}>{candidate.category}</div> : null}
        </div>
      </div>

      <div style={s.evidenceBox}>
        <div style={s.evidenceHead}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            style={s.evidenceLink}
            aria-label={t("card.viewOnGithub")}
          >
            {candidate.evidence_path}
          </a>
          <IconBtn icon="Copy" label={t("card.viewOnGithub")} onClick={copy} size={26} />
        </div>
        <pre style={s.snippet}>{candidate.evidence_snippet}</pre>
      </div>

      <div style={s.cardFoot}>
        <ConfidenceBar value={candidate.confidence} label={t("card.confidence")} />
        <div style={s.cardActions}>
          <Button
            kind={candidate.status === "accepted" ? "primary" : "secondary"}
            icon="Check"
            onClick={onAccept}
            loading={pending}
            disabled={pending}
          >
            {candidate.status === "accepted" ? t("card.accepted") : t("card.acceptAsSkill")}
          </Button>
          <Button
            kind={candidate.status === "rejected" ? "danger" : "ghost"}
            icon="X"
            onClick={onReject}
            disabled={pending}
          >
            {t("card.reject")}
          </Button>
        </div>
      </div>
    </div>
  );
}
