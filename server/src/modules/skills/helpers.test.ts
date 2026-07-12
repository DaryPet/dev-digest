import { describe, it, expect } from 'vitest';
import { isBodyChange, type SkillBodyChangePatch } from './helpers.js';

/**
 * `project_context_paths` is deliberately outside `isBodyChange` — toggling/
 * reordering attached Project Context documents must never bump a skill's
 * `version` or snapshot `skill_versions` (spec §6.4).
 */
describe('isBodyChange', () => {
  const existing = { body: 'old body' };

  it('does NOT bump version for a patch that only touches project_context_paths', () => {
    // project_context_paths is deliberately absent from SkillBodyChangePatch —
    // cast simulates the real call site (repository.update passes the full
    // UpdateSkill-shaped patch, which DOES carry this field structurally).
    const patch = { projectContextPaths: ['specs/a.md'] } as unknown as SkillBodyChangePatch;
    expect(isBodyChange(existing, patch)).toBe(false);
  });

  it('bumps version when body actually changes', () => {
    expect(isBodyChange(existing, { body: 'new body' })).toBe(true);
  });

  it('does NOT bump version when body is provided but identical', () => {
    expect(isBodyChange(existing, { body: 'old body' })).toBe(false);
  });

  it('does NOT bump version for an empty patch', () => {
    expect(isBodyChange(existing, {})).toBe(false);
  });
});
