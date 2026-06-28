import { z } from 'zod';

/**
 * Module-local types. The cross-package DTO (`ConventionCandidate`) lives in
 * `@devdigest/shared`; these are the extraction-time shapes the model returns
 * and the list-screen header meta.
 */

/** Raw candidate the extraction model returns, BEFORE code verification (§3.2). */
export const RawCandidate = z.object({
  category: z.string().nullish(),
  rule: z.string().min(1),
  evidence: z.object({
    file: z.string().min(1),
    line: z.number().int().positive(),
  }),
  confidence: z.number().min(0).max(1),
});
export type RawCandidate = z.infer<typeof RawCandidate>;

/** Top-level object the structured call returns (providers require an object). */
export const RawCandidatesEnvelope = z.object({
  candidates: z.array(RawCandidate),
});
export type RawCandidatesEnvelope = z.infer<typeof RawCandidatesEnvelope>;

/** Header metadata for the list screen (spec §4). */
export interface ConventionsMeta {
  /** Number of source files actually read into the sample bundle. */
  sampleCount: number;
  /** ISO timestamp of the newest candidate (`MAX(createdAt)`), or null. */
  lastScanAt: string | null;
}

/** Generated skill-body preview (spec §6) — nothing is persisted here. */
export interface SkillPreview {
  name: string;
  body: string;
  evidence_files: string[];
}
