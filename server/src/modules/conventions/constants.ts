/**
 * Conventions Extractor — module constants (sample budget, config globs, the
 * extraction prompt, snippet sizing). See `specs/conventions-extractor.md`.
 */

/** Top-N ranked files sampled for convention extraction (spec §2). */
export const SAMPLE_FILE_COUNT = 12;

/**
 * Tooling configs read from the clone root and appended to the sample bundle
 * (best-effort — missing ones are silently skipped). spec §2.
 */
export const CONFIG_FILES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'tsconfig.json',
  'tsconfig.base.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
] as const;

/** First N lines of each sample file fed to the model (keeps tokens bounded and
 *  keeps cited line numbers meaningful). */
export const MAX_SAMPLE_LINES = 200;

/** Lines of context sliced around a cited evidence line for the stored snippet. */
export const SNIPPET_RADIUS = 4;

export const EXTRACT_SCHEMA_NAME = 'ConventionCandidates';

export const EXTRACT_SYSTEM_PROMPT = `You analyze a software repository's existing source code and propose CODE-STYLE CONVENTIONS the project already follows — naming, error-handling shape, module boundaries, API patterns, etc.

Rules:
- Only propose a convention you can point to in the PROVIDED files with a specific file path and line number.
- Each candidate MUST cite real evidence: the exact file path as given in the bundle and the 1-based line number where it is visible (the bundle prefixes every line with "N| ").
- Prefer a few high-signal, genuinely-followed conventions over many speculative guesses.
- "rule" is a short imperative sentence, e.g. "Always use async/await instead of .then() chains".
- "category" is one of: naming, error-handling, architecture, api, style, testing, other.
- "confidence" is 0..1 — how consistently the repo follows this.
- Do NOT invent files or lines. If unsure, omit the candidate.`;
