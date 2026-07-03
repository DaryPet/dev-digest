import type { SmartDiffRole } from '@devdigest/shared';
import { BOILERPLATE_PATTERNS, WIRING_PATTERNS } from './constants.js';

/**
 * Classify a changed file path as `core` | `wiring` | `boilerplate`.
 *
 * Precedence is **boilerplate -> wiring -> core** so a lock file that also
 * matches a wiring pattern (e.g. pnpm-lock.yaml matches /(ya?ml)$/) is always
 * classified as boilerplate. `core` is the default when nothing matches.
 *
 * All pattern lists live in `constants.ts` -- never inline thresholds here.
 */
export function classify(path: string): SmartDiffRole {
  if (BOILERPLATE_PATTERNS.some((p) => p.test(path))) return 'boilerplate';
  if (WIRING_PATTERNS.some((p) => p.test(path))) return 'wiring';
  return 'core';
}
