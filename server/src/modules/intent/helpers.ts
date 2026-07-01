/**
 * Intent classifier — pure helpers (no I/O).
 *
 * extractHunkHeaders: strip diff body lines, keeping only structural markers.
 * extractSpecPaths:   find in-repo spec/doc paths referenced in the PR body.
 */

import { MAX_SPEC_PATHS } from './constants.js';

/**
 * Given a full unified diff patch string (from `pr_files.patch`), return a
 * string containing ONLY the structural header lines:
 *
 *   diff --git a/<file> b/<file>
 *   --- a/<file>
 *   +++ b/<file>
 *   @@ -N,M +N,M @@ optional hunk context
 *
 * All diff body lines (+, -, and context/space lines) are dropped.
 * This drastically reduces token count while preserving structural information.
 */
export function extractHunkHeaders(patch: string): string {
  if (!patch) return '';
  return patch
    .split('\n')
    .filter((line) => {
      // diff meta: diff --git a/... b/...
      if (line.startsWith('diff --git ')) return true;
      // old-file header: --- a/...
      if (line.startsWith('--- ')) return true;
      // new-file header: +++ b/...
      if (line.startsWith('+++ ')) return true;
      // hunk marker: @@ -N,M +N,M @@ ...
      if (line.startsWith('@@ ')) return true;
      // Drop everything else: +added lines, -removed lines, context lines (space prefix),
      // "index abc..def" lines, "\\ No newline at end of file", etc.
      return false;
    })
    .join('\n');
}

/**
 * Pattern: an external HTTP/HTTPS URL — used to sanitize the body before
 * path-matching so that paths embedded in URLs (e.g. `…/blob/main/specs/foo.md`)
 * are not extracted as in-repo paths.
 */
const HTTP_URL_RE = /https?:\/\/\S+/g;

/**
 * Pattern: in-repo spec/doc paths.
 *
 * Matches:
 *   - specs/<path>  (files under the specs/ directory)
 *   - docs/<path>   (files under the docs/ directory)
 *   - <name>.md     (root-level markdown files, e.g. README.md, AGENTS.md)
 *
 * The negative lookbehind `(?<![/\w])` prevents matching paths that are part
 * of a deeper directory (e.g. `/usr/share/specs/foo.md`).
 * The negative lookahead `(?![/\w])` is intentionally absent at the end so that
 * deep nested paths (specs/a/b.md) are captured in full by `[^\s...]`.
 *
 * Note: external URLs are stripped from the body before this regex runs, so
 * paths embedded in URLs are never returned.
 */
const SPEC_PATH_RE =
  /(?<![/\w])((?:specs|docs)\/[^\s`'"<>()\[\]{}\|\\]+|[a-zA-Z0-9_][a-zA-Z0-9_.-]*\.md)(?=[\s`'"<>()\[\]{}\|\\]|$)/g;

/**
 * Extract in-repo spec/doc file paths from a PR body string.
 *
 * - Strips external URLs first (so paths embedded in URLs are never matched).
 * - Matches paths under `specs/`, `docs/`, or root-level `*.md` files.
 * - Returns at most MAX_SPEC_PATHS unique paths (de-duplicated).
 * - Never throws; returns empty array on empty/absent body.
 */
export function extractSpecPaths(body: string): string[] {
  if (!body) return [];

  // Remove external URLs so that embedded paths (e.g. in GitHub blob links) are excluded.
  const sanitized = body.replace(HTTP_URL_RE, '');

  const found: string[] = [];
  for (const m of sanitized.matchAll(SPEC_PATH_RE)) {
    const raw = m[1];
    if (!raw) continue;
    // Strip trailing prose punctuation that was captured greedily before a
    // word boundary (e.g., "specs/foo.md." at end of sentence → "specs/foo.md").
    const path = raw.replace(/[.,;:!?)'"\]}>]+$/, '');
    if (!path) continue;
    // Extra safety guard: should never happen after URL stripping, but reject
    // any path that somehow still contains a protocol separator.
    if (path.includes('://')) continue;
    if (!found.includes(path)) {
      found.push(path);
      if (found.length >= MAX_SPEC_PATHS) break;
    }
  }
  return found;
}
