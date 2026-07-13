import { SEV, type IconName } from "@devdigest/ui";
import type { RiskSeverity, Verdict } from "@devdigest/shared";

/** Per-verdict visual meta. `labelKey` resolves under the `verdict` namespace. */
export const VERDICT_META: Record<
  Verdict,
  { c: string; bg: string; icon: IconName; labelKey: string }
> = {
  request_changes: {
    c: "var(--crit)",
    bg: "var(--crit-bg)",
    icon: "XCircle",
    labelKey: "requestChanges",
  },
  approve: { c: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle", labelKey: "approve" },
  comment: { c: "var(--info)", bg: "var(--info-bg)", icon: "MessageSquare", labelKey: "comment" },
};

/**
 * Per-`risk_level` visual meta (SPEC-02) — reuses the `SEV` severity tokens
 * directly rather than hand-rolling a new color map (client/INSIGHTS.md
 * 2026-06-24 / 2026-07-03, a repeat-offender antipattern). `labelKey` isn't
 * consulted for translation (the caller passes a pre-translated `riskLabel`),
 * it just documents which risk level each entry is.
 */
export const RISK_META: Record<
  RiskSeverity,
  { c: string; bg: string; icon: IconName; labelKey: RiskSeverity }
> = {
  high: { c: SEV.CRITICAL.c, bg: SEV.CRITICAL.bg, icon: SEV.CRITICAL.icon, labelKey: "high" },
  medium: { c: SEV.WARNING.c, bg: SEV.WARNING.bg, icon: SEV.WARNING.icon, labelKey: "medium" },
  low: { c: SEV.SUGGESTION.c, bg: SEV.SUGGESTION.bg, icon: SEV.SUGGESTION.icon, labelKey: "low" },
};
