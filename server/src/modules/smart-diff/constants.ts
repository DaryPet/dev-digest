/**
 * Smart Diff constants (spec `specs/smart-diff.md` §5.5).
 *
 * Every threshold, pattern list, and schema name lives here -- never inlined in
 * service or route logic (acceptance criterion #7).
 */

export const SMART_DIFF_SCHEMA_NAME = 'SmartDiff';

/** Matched FIRST. Lock files, generated/build output, snapshots, minified. */
export const BOILERPLATE_PATTERNS: RegExp[] = [
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock|go\.sum)$/,
  /(^|\/)(dist|build|out|coverage|\.next)\//,
  /(^|\/)__snapshots__\//,
  /\.snap$/,
  /\.min\.(js|css)$/,
];

/** Matched SECOND. Configs, CI, barrels, ambient types, manifests. */
export const WIRING_PATTERNS: RegExp[] = [
  /(^|\/)(index)\.(ts|tsx|js|jsx)$/, // barrels
  /\.config\.(js|cjs|mjs|ts)$/,
  /(^|\/)(tsconfig[^/]*\.json|package\.json)$/,
  /(^|\/)\.(eslintrc|prettierrc|npmrc|nvmrc)[^/]*$/, // dotfile configs
  /\.(ya?ml)$/, // CI / compose
  /(^|\/)Dockerfile$/,
  /(^|\/)\.env[^/]*$/,
  /\.d\.ts$/,
];

/** total_lines above this => split_suggestion.too_big = true. */
export const SPLIT_TOTAL_LINES_THRESHOLD = 500;

/** Name of the catch-all split holding wiring + boilerplate files. */
export const SPLIT_CHORE_NAME = 'chore: config & generated';

/** Label used when a core file has no directory (repo root). */
export const ROOT_SPLIT_NAME = '(root)';
