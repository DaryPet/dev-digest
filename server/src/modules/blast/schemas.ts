/**
 * Blast module — local Zod schemas.
 *
 * NOTE: the vendor `BlastRadius` type (vendored, do-not-touch) is imported and
 * COMPOSED here — never re-defined or modified. This wrapper adds index-state
 * metadata around the existing shared shape.
 */
import { z } from 'zod';
import { BlastRadius } from '@devdigest/shared';

export { BlastRadius };

export const BlastIndexInfo = z.object({
  status: z.enum(['full', 'partial', 'degraded', 'failed']),
  /** True when results came from a fallback / incomplete index. */
  degraded: z.boolean(),
  reason: z.string().nullable(),
});
export type BlastIndexInfo = z.infer<typeof BlastIndexInfo>;

export const BlastResponse = z.object({
  blast: BlastRadius,
  index: BlastIndexInfo,
});
export type BlastResponse = z.infer<typeof BlastResponse>;
