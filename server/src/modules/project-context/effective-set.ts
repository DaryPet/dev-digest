/**
 * project-context effective-set — pure helpers, no I/O.
 *
 * Effective attach-set computation (AC-17/Assumption 2) and the path-safety
 * guard applied at the agents/skills update() write boundary (defense-in-
 * depth — attach paths only ever originate from checkbox UI, never free
 * text, per the spec's Untrusted-inputs note).
 */

/**
 * Direct paths first (persisted order), then each skill's paths (skill-link
 * order), deduped by path — first occurrence wins position (AC-17).
 */
export function computeEffectiveAttachedPaths(
  directPaths: string[],
  skillPathLists: string[][],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const path of directPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  for (const list of skillPathLists) {
    for (const path of list) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}

/** Rejects any path containing a `..` segment or a leading `/`. */
export function isSafeRelativePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith('/')) return false;
  return !path.split('/').some((segment) => segment === '..');
}
