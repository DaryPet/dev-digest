/**
 * Brief grounding — pure, deterministic post-processing over the raw LLM
 * output (spec `specs/SPEC-02-pr-why-risk-brief.md` AC-5/6/7/8).
 *
 * The model can cite a file/endpoint/cron/line that doesn't actually exist in
 * the blast radius or smart diff it was given; `groundBrief` strips any such
 * ungrounded item rather than trusting the model's citation.
 */
import type { Brief, BlastRadius, SmartDiff } from '@devdigest/shared';

export interface GroundingSet {
  /** All smartDiff.groups[].files[].path. */
  knownFiles: Set<string>;
  /** Union of blast.downstream[].{endpoints_affected, crons_affected}. */
  knownEndpointsOrCrons: Set<string>;
  /** blast callers' (file, line) UNION smartDiff finding_lines' (path, line). */
  knownLinesByFile: Map<string, Set<number>>;
}

function addLine(map: Map<string, Set<number>>, file: string, line: number): void {
  const set = map.get(file) ?? new Set<number>();
  set.add(line);
  map.set(file, set);
}

export function buildGroundingSet(smartDiff: SmartDiff, blast: BlastRadius): GroundingSet {
  const knownFiles = new Set<string>();
  const knownLinesByFile = new Map<string, Set<number>>();
  for (const group of smartDiff.groups) {
    for (const file of group.files) {
      knownFiles.add(file.path);
      for (const line of file.finding_lines) {
        addLine(knownLinesByFile, file.path, line);
      }
    }
  }

  const knownEndpointsOrCrons = new Set<string>();
  for (const d of blast.downstream) {
    for (const ep of d.endpoints_affected) knownEndpointsOrCrons.add(ep);
    for (const cron of d.crons_affected) knownEndpointsOrCrons.add(cron);
    for (const c of d.callers) addLine(knownLinesByFile, c.file, c.line);
  }

  return { knownFiles, knownEndpointsOrCrons, knownLinesByFile };
}

/**
 * Drop ungrounded items from a raw Brief:
 *  - risks: kept only when at least one file_ref is a known file OR a known
 *    endpoint/cron string (AC-5/6).
 *  - review_focus: kept only when the (file, line) pair is a known line
 *    (AC-7/8).
 */
export function groundBrief(raw: Brief, g: GroundingSet): Brief {
  const risks = raw.risks.filter((risk) =>
    risk.file_refs.some((ref) => g.knownFiles.has(ref) || g.knownEndpointsOrCrons.has(ref)),
  );
  const review_focus = raw.review_focus.filter(
    (item) => g.knownLinesByFile.get(item.file)?.has(item.line) ?? false,
  );
  return { ...raw, risks, review_focus };
}
