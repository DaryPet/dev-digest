import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from './repository.js';
import { SNIPPET_RADIUS } from './constants.js';

/**
 * Pure mappers + small helpers (no I/O). Row → DTO, the re-scan dedup
 * fingerprint, the evidence snippet slicer, and the skill-body markdown
 * generator (spec §6).
 */

/** `conventions` row → API DTO (spec §4 contract `ConventionCandidate`). */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category ?? null,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

/** Re-scan dedup key: (path, normalized rule text). spec §3.4 */
export function fingerprint(path: string, rule: string): string {
  const norm = rule.trim().toLowerCase().replace(/\s+/g, ' ');
  // Strip the line range off a `file:23-31` citation so re-detection at a
  // slightly different line still dedups against the same rejected rule.
  const file = path.replace(/:\d+(-\d+)?$/, '');
  return `${file}::${norm}`;
}

/** Slice ±SNIPPET_RADIUS lines around a 1-based line; returns snippet + range. */
export function sliceSnippet(content: string, line: number): { snippet: string; range: string } {
  const lines = content.split('\n');
  const start = Math.max(1, line - SNIPPET_RADIUS);
  const end = Math.min(lines.length, line + SNIPPET_RADIUS);
  const snippet = lines.slice(start - 1, end).join('\n');
  return { snippet, range: start === end ? `${start}` : `${start}-${end}` };
}

/** kebab-case slug from a rule sentence, for a skill section heading. */
export function slugify(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'rule';
}

/**
 * Generate the skill-body markdown preview (spec §6 / the modal mock):
 *   # <name>
 *   House conventions for `<repo>`. …
 *   ## <slug>
 *   <rule>
 *   Detected in `<file:line>`:
 *   ```
 *   <snippet>
 *   ```
 */
export function buildSkillBody(
  name: string,
  repoFullName: string,
  rows: ConventionRow[],
): string {
  const intro = `House conventions for \`${repoFullName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`;
  const sections = rows.map((r) => {
    const heading = `## ${slugify(r.rule)}`;
    const detected = `Detected in \`${r.evidencePath ?? ''}\`:`;
    const fence = '```';
    return `${heading}\n${r.rule}\n\n${detected}\n${fence}\n${r.evidenceSnippet ?? ''}\n${fence}`;
  });
  return [`# ${name}`, '', intro, '', ...flattenSections(sections)].join('\n');
}

function flattenSections(sections: string[]): string[] {
  const out: string[] = [];
  for (const s of sections) {
    out.push(s, '');
  }
  return out;
}
