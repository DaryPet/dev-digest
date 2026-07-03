import { describe, it, expect } from 'vitest';
import { extractHunkHeaders, extractSpecPaths } from './helpers.js';

/**
 * Hermetic unit tests for the pure intent helpers (no DB, no I/O):
 *   extractHunkHeaders — keeps diff structural markers, drops diff body lines
 *   extractSpecPaths   — finds in-repo spec/doc paths, never external URLs
 */

// ---- fixtures ---------------------------------------------------------------

/**
 * A two-hunk unified diff patch.  Tests confirm that ONLY the marker lines
 * survive `extractHunkHeaders`; the added/removed/context body is dropped.
 */
const TWO_HUNK_PATCH = `diff --git a/src/service.ts b/src/service.ts
index abc1234..def5678 100644
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,5 +1,6 @@
 import { foo } from './foo.js';
+import { bar } from './bar.js';

 export class Service {
   constructor() {}
@@ -20,3 +21,4 @@
 function helper() {
-  return 42;
+  return 43;
 }
+// added comment
`;

// ---- extractHunkHeaders -----------------------------------------------------

describe('extractHunkHeaders', () => {
  it('keeps diff --git, ---, +++, and @@ lines from a two-hunk patch', () => {
    const out = extractHunkHeaders(TWO_HUNK_PATCH);
    expect(out).toContain('diff --git a/src/service.ts b/src/service.ts');
    expect(out).toContain('--- a/src/service.ts');
    expect(out).toContain('+++ b/src/service.ts');
    expect(out).toContain('@@ -1,5 +1,6 @@');
    expect(out).toContain('@@ -20,3 +21,4 @@');
  });

  it('drops the index meta line', () => {
    const out = extractHunkHeaders(TWO_HUNK_PATCH);
    expect(out).not.toContain('index abc1234');
  });

  it('drops added lines (+)', () => {
    const out = extractHunkHeaders(TWO_HUNK_PATCH);
    expect(out).not.toContain("import { bar }");
    expect(out).not.toContain('// added comment');
  });

  it('drops removed lines (-)', () => {
    const out = extractHunkHeaders(TWO_HUNK_PATCH);
    expect(out).not.toContain('return 42');
  });

  it('drops context (space-prefixed) lines', () => {
    const out = extractHunkHeaders(TWO_HUNK_PATCH);
    expect(out).not.toContain("import { foo }");
    expect(out).not.toContain('export class Service');
    expect(out).not.toContain('function helper');
  });

  it('returns empty string for an empty patch', () => {
    expect(extractHunkHeaders('')).toBe('');
  });

  it('produces only structural lines (no +/- body content at all)', () => {
    const lines = extractHunkHeaders(TWO_HUNK_PATCH).split('\n').filter(Boolean);
    for (const line of lines) {
      const isHeader =
        line.startsWith('diff --git ') ||
        line.startsWith('--- ') ||
        line.startsWith('+++ ') ||
        line.startsWith('@@ ');
      expect(isHeader, `unexpected body line: ${line}`).toBe(true);
    }
  });
});

// ---- extractSpecPaths -------------------------------------------------------

describe('extractSpecPaths', () => {
  it('matches a specs/ path in plain prose', () => {
    const paths = extractSpecPaths('See specs/intent-layer.md for the full plan.');
    expect(paths).toEqual(['specs/intent-layer.md']);
  });

  it('matches a docs/ path', () => {
    const paths = extractSpecPaths('Refer to docs/agent-prompts/README.md for prompt format.');
    expect(paths).toContain('docs/agent-prompts/README.md');
  });

  it('matches a root-level .md file', () => {
    const paths = extractSpecPaths('Updated AGENTS.md to document the new flow.');
    expect(paths).toContain('AGENTS.md');
  });

  it('does NOT match an https:// URL even if it contains specs/ in the path', () => {
    const paths = extractSpecPaths(
      'See https://github.com/org/repo/blob/main/specs/foo.md for context.',
    );
    // The path is embedded in a URL — must not be extracted.
    expect(paths).toEqual([]);
  });

  it('does NOT match an http:// URL', () => {
    const paths = extractSpecPaths('See http://example.com/docs/guide.md.');
    expect(paths).toEqual([]);
  });

  it('extracts both a specs/ and docs/ path from the same body', () => {
    const body = 'Implements specs/intent-layer.md. Also see docs/api.md.';
    const paths = extractSpecPaths(body);
    expect(paths).toContain('specs/intent-layer.md');
    expect(paths).toContain('docs/api.md');
  });

  it('caps results at MAX_SPEC_PATHS (3)', () => {
    const body =
      'specs/a.md specs/b.md specs/c.md specs/d.md specs/e.md';
    const paths = extractSpecPaths(body);
    expect(paths.length).toBeLessThanOrEqual(3);
  });

  it('de-duplicates repeated paths', () => {
    const paths = extractSpecPaths('specs/foo.md and again specs/foo.md');
    expect(paths.filter((p) => p === 'specs/foo.md').length).toBe(1);
  });

  it('returns [] for an empty body', () => {
    expect(extractSpecPaths('')).toEqual([]);
  });

  it('ignores non-.md root-level files that are not under specs/ or docs/', () => {
    const paths = extractSpecPaths('Changed src/service.ts and package.json.');
    // package.json is not .md, src/service.ts is not under specs/ or docs/
    expect(paths).toEqual([]);
  });
});
