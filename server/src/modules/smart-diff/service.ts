import type { SmartDiff, SmartDiffRole, SmartDiffFindingLine, Severity } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewRepository } from '../reviews/repository.js';
import { selectMostBlockingReview } from '../brief/helpers.js';
import { classify } from './classify.js';
import {
  SPLIT_TOTAL_LINES_THRESHOLD,
  SPLIT_CHORE_NAME,
  ROOT_SPLIT_NAME,
} from './constants.js';

// `findings.severity` is a loosely-typed DB text column -- narrow defensively
// (same precedent as client/src/components/SeverityCounts/FindingsHoverCard.tsx).
const KNOWN_SEVERITIES = new Set<Severity>(['CRITICAL', 'WARNING', 'SUGGESTION']);
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/**
 * Smart Diff service (spec `specs/smart-diff.md` §7 T1).
 *
 * getSmartDiff(): loads PR files + the most-blocking review's findings
 * (read-only, workspace-scoped; see `selectMostBlockingReview` for why "most
 * blocking" rather than merely "newest" is required once multiple reviewer
 * agents can run in one batch), classifies each file, composes the SmartDiff
 * shape per §5.2/§5.3. Zero LLM calls on this path.
 *
 * The optional `repo` param is an escape hatch for unit tests that inject a
 * stub ReviewRepository without needing a real DB connection.
 */
export class SmartDiffService {
  private repo: ReviewRepository;

  constructor(container: Container, repo?: ReviewRepository) {
    this.repo = repo ?? container.reviewRepo;
  }

  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    // Step 1 -- workspace-scoped PR lookup (404 when absent or wrong workspace).
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    // Step 2 -- PR file list.
    const prFiles = await this.repo.getPrFiles(prId);

    // Step 3 -- the PR's most-blocking review of kind='review' (reviewsForPull
    // is newest-first). When a multi-agent batch runs several reviewers at
    // once, picking merely the first list entry can land on an unrelated
    // approved pass with zero findings instead of the rejecting/blocking one
    // — the same failure mode PrBriefCard's verdict selection already solves
    // (specs/pr-overview-visual-parity.md §5.1), reused here for consistency.
    const reviewsData = await this.repo.reviewsForPull(prId);
    const reviewKindOnly = reviewsData.filter((r) => r.review.kind === 'review');
    const latestEntry = selectMostBlockingReview(reviewKindOnly);
    const latestFindings = latestEntry?.findings ?? [];

    // Step 4 -- classify each file and compute finding_lines.
    type FileEntry = {
      path: string;
      role: SmartDiffRole;
      additions: number;
      deletions: number;
      finding_lines: SmartDiffFindingLine[];
    };

    const entries: FileEntry[] = prFiles.map((f) => {
      const role = classify(f.path);
      // Non-dismissed findings for this file from the latest review. When a
      // line has more than one finding, keep only the most severe one.
      const bySevLine = new Map<number, Severity>();
      for (const finding of latestFindings) {
        if (finding.file !== f.path || finding.dismissedAt != null) continue;
        const severity = KNOWN_SEVERITIES.has(finding.severity as Severity)
          ? (finding.severity as Severity)
          : 'SUGGESTION';
        const existing = bySevLine.get(finding.startLine);
        if (!existing || SEVERITY_RANK[severity] > SEVERITY_RANK[existing]) {
          bySevLine.set(finding.startLine, severity);
        }
      }
      // Sort ascending by line (spec §5.3).
      const finding_lines: SmartDiffFindingLine[] = [...bySevLine.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([line, severity]) => ({ line, severity }));
      return { path: f.path, role, additions: f.additions, deletions: f.deletions, finding_lines };
    });

    // Step 5 -- group by role in risk-first order; sort within each group.
    const ROLE_ORDER: SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];
    const byRole = new Map<SmartDiffRole, FileEntry[]>();
    for (const e of entries) {
      const bucket = byRole.get(e.role) ?? [];
      bucket.push(e);
      byRole.set(e.role, bucket);
    }

    /**
     * Sort order (spec §5.3):
     *   1. findings count desc
     *   2. additions + deletions desc
     *   3. path asc (deterministic tie-break)
     */
    const sortEntries = (arr: FileEntry[]): FileEntry[] =>
      [...arr].sort((a, b) => {
        const byFindings = b.finding_lines.length - a.finding_lines.length;
        if (byFindings !== 0) return byFindings;
        const bySize = b.additions + b.deletions - (a.additions + a.deletions);
        if (bySize !== 0) return bySize;
        return a.path.localeCompare(b.path);
      });

    const groups = ROLE_ORDER.filter((role) => byRole.has(role)).map((role) => ({
      role,
      files: sortEntries(byRole.get(role)!).map((e) => ({
        path: e.path,
        pseudocode_summary: null,
        additions: e.additions,
        deletions: e.deletions,
        finding_lines: e.finding_lines,
      })),
    }));

    // Step 6 -- split suggestion.
    const totalLines = entries.reduce((sum, e) => sum + e.additions + e.deletions, 0);
    const tooBig = totalLines > SPLIT_TOTAL_LINES_THRESHOLD;

    const proposedSplits: Array<{ name: string; files: string[] }> = [];
    if (tooBig) {
      const coreEntries = entries.filter((e) => e.role === 'core');
      const nonCoreEntries = entries.filter((e) => e.role !== 'core');

      // Group core files by their top-level path segment (first dir or "(root)").
      const coreBySegment = new Map<string, string[]>();
      for (const e of coreEntries) {
        const slash = e.path.indexOf('/');
        const segment = slash === -1 ? ROOT_SPLIT_NAME : e.path.slice(0, slash);
        const bucket = coreBySegment.get(segment) ?? [];
        bucket.push(e.path);
        coreBySegment.set(segment, bucket);
      }
      for (const [name, files] of coreBySegment) {
        proposedSplits.push({ name, files });
      }

      // Catch-all chore split for wiring + boilerplate.
      if (nonCoreEntries.length > 0) {
        proposedSplits.push({
          name: SPLIT_CHORE_NAME,
          files: nonCoreEntries.map((e) => e.path),
        });
      }

      // Order by descending file count (deterministic for ties by insertion order).
      proposedSplits.sort((a, b) => b.files.length - a.files.length);
    }

    return {
      groups,
      split_suggestion: {
        too_big: tooBig,
        total_lines: totalLines,
        proposed_splits: proposedSplits,
      },
    };
  }
}
