/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default type when an import can't determine one from frontmatter. */
export const DEFAULT_SKILL_TYPE = 'custom' as const;

/**
 * Source recorded for skills created via the import flow (markdown file or
 * archive). The product *extracts* the skill core from the upload, so
 * `extracted` is the truthful provenance (vs. `manual` typed in the editor).
 */
export const IMPORT_SKILL_SOURCE = 'extracted' as const;

/**
 * Preferred core-file names inside an archive, in priority order (matched
 * case-insensitively). The first present one becomes the skill body.
 */
export const CORE_FILENAMES = ['skill.md', 'readme.md', 'index.md'] as const;

/**
 * Hard cap on an uploaded archive/file (decoded bytes). Keeps a hostile upload
 * from blowing the request memory budget. 2 MiB is generous for a markdown
 * skill + a few evidence files.
 */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/**
 * Extensions treated as executable / non-markdown payload. The import NEVER
 * decodes, runs, or stores these — it only records their names under
 * `ignored_files` so the preview can show the user what was skipped. This is
 * the "executable parts of an archive are not processed" guarantee.
 */
export const EXECUTABLE_EXTENSIONS = new Set([
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.bat',
  '.cmd',
  '.ps1',
  '.exe',
  '.com',
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.py',
  '.rb',
  '.pl',
  '.php',
  '.jar',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.app',
  '.scpt',
  '.vbs',
  '.wsf',
]);
