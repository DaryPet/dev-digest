import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    project_context_paths: row.projectContextPaths ?? [],
  };
}

/** Fields whose change bumps the skill's `version` (body only). */
export interface SkillBodyChangePatch {
  body?: string;
}

/**
 * True when a patch changes the skill's body relative to the existing row —
 * the only change that bumps `version` and snapshots `skill_versions`.
 * Metadata-only edits (incl. `project_context_paths`) never bump it.
 */
export function isBodyChange(
  existing: Pick<SkillRow, 'body'>,
  patch: SkillBodyChangePatch,
): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}
