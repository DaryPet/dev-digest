/**
 * project-context module constants (spec `specs/SPEC-01-project-context-folder.md`).
 *
 * Any markdown file under one of these root directory names, at any depth in a
 * repo's clone, is a candidate "project context" document (AC-1/AC-2).
 */

/** Directory names scanned for markdown documents, at any depth (Assumption 1). */
export const DEFAULT_ROOT_NAMES = ['specs', 'docs', 'insights'] as const;

/** Walk stops enumerating further files once this many documents are found. */
export const MAX_DISCOVERED_FILES = 2000;

/**
 * Per-document cap when assembling the RUN-TIME prompt block (`resolveForRun`).
 * Content beyond this is truncated with a `…[truncated]` note. The Preview
 * panel is NOT capped by this — see MAX_PREVIEW_READ_BYTES.
 */
export const MAX_SPEC_CHARS = 20_000;

/**
 * Hard read guard for the Preview panel — avoids a pathological huge file
 * blowing up memory/response size. The Preview is otherwise shown uncapped.
 */
export const MAX_PREVIEW_READ_BYTES = 400 * 1024;

/** Appended to a document's content when it is truncated for the run prompt. */
export const TRUNCATION_NOTE = '\n\n…[truncated]';
