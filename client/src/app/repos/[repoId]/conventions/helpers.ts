/** Pure helpers for the conventions page (no React). */

export interface ParsedEvidence {
  file: string;
  start?: number;
  end?: number;
}

/** Split a stored `evidence_path` citation ("src/api/users.ts:23-31") into its
    file path and line range, so the GitHub deep-link gets file + numeric lines. */
export function parseEvidence(evidencePath: string): ParsedEvidence {
  const m = evidencePath.match(/^(.*):(\d+)(?:-(\d+))?$/);
  if (!m) return { file: evidencePath };
  return { file: m[1] ?? evidencePath, start: Number(m[2]), end: m[3] ? Number(m[3]) : undefined };
}

/** Compact "Xm/Xh/Xd ago" label for the header's last-scan time. */
export function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const min = Math.round((Date.now() - then) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
