import { describe, it, expect } from 'vitest';
import type { Container } from '../../platform/container.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { SmartDiffService } from './service.js';
import { SPLIT_TOTAL_LINES_THRESHOLD, SPLIT_CHORE_NAME, ROOT_SPLIT_NAME } from './constants.js';

/**
 * Service composition tests (spec `specs/smart-diff.md` §8 T1).
 *
 * Uses a stub ReviewRepository injected through the optional second constructor
 * param -- no DB, no LLM, no network.
 */

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

type StubPull = { id: string; workspaceId: string };
type StubFile = { path: string; additions: number; deletions: number };
type StubFinding = { file: string; startLine: number; dismissedAt: Date | null };
type StubReviewEntry = {
  review: { id: string; kind: 'review' | 'summary'; createdAt: Date };
  findings: StubFinding[];
};

function makeRepo(opts: {
  pull?: StubPull | null;
  files?: StubFile[];
  reviews?: StubReviewEntry[];
}): ReviewRepository {
  return {
    getPull: async (_ws: string, _id: string) => opts.pull as never,
    getPrFiles: async (_id: string) => (opts.files ?? []) as never,
    reviewsForPull: async (_id: string) => (opts.reviews ?? []) as never,
  } as unknown as ReviewRepository;
}

/** Minimal container stub -- the service must NOT call container.llm. */
const noLlmContainer: Container = {
  get llm() {
    throw new Error('SmartDiffService must not call container.llm');
  },
} as unknown as Container;

const PULL = { id: 'pr-1', workspaceId: 'ws-1' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SmartDiffService.getSmartDiff', () => {
  // ---- 404 when PR absent -------------------------------------------------

  it('throws NotFoundError when the pull request is not found', async () => {
    const service = new SmartDiffService(noLlmContainer, makeRepo({ pull: null }));
    await expect(service.getSmartDiff('ws-1', 'pr-1')).rejects.toThrow('Pull request not found');
  });

  // ---- no-review case: finding_lines all empty ----------------------------

  it('returns all empty finding_lines when no reviews exist', async () => {
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [
          { path: 'src/service.ts', additions: 10, deletions: 2 },
          { path: 'pnpm-lock.yaml', additions: 5, deletions: 3 },
        ],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    for (const group of result.groups) {
      for (const file of group.files) {
        expect(file.finding_lines).toEqual([]);
      }
    }
  });

  // ---- group order: core -> wiring -> boilerplate -------------------------

  it('emits groups in risk-first order: core, wiring, boilerplate', async () => {
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [
          { path: 'pnpm-lock.yaml', additions: 1, deletions: 1 }, // boilerplate
          { path: 'tsconfig.json', additions: 2, deletions: 0 },   // wiring
          { path: 'src/service.ts', additions: 20, deletions: 5 }, // core
        ],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    const roles = result.groups.map((g) => g.role);
    expect(roles).toEqual(['core', 'wiring', 'boilerplate']);
  });

  // ---- empty groups omitted -----------------------------------------------

  it('omits empty groups (no wiring files -> no wiring group)', async () => {
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [
          { path: 'src/service.ts', additions: 10, deletions: 0 },
          { path: 'pnpm-lock.yaml', additions: 1, deletions: 0 },
        ],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'boilerplate']);
  });

  // ---- file sort within a group ------------------------------------------

  it('sorts files within a group: findings desc, size desc, path asc', async () => {
    const reviewDate = new Date();
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [
          { path: 'src/alpha.ts', additions: 5, deletions: 0 },  // 0 findings, size=5
          { path: 'src/beta.ts', additions: 20, deletions: 5 },  // 1 finding, size=25
          { path: 'src/gamma.ts', additions: 20, deletions: 5 }, // 0 findings, size=25
        ],
        reviews: [
          {
            review: { id: 'rev-1', kind: 'review', createdAt: reviewDate },
            findings: [
              { file: 'src/beta.ts', startLine: 10, dismissedAt: null },
            ],
          },
        ],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    const coreGroup = result.groups.find((g) => g.role === 'core')!;
    const paths = coreGroup.files.map((f) => f.path);
    // beta.ts has 1 finding -> first; gamma.ts and alpha.ts both have 0 findings,
    // same size tie -> gamma (20+5=25) > alpha (5+0=5) -> then path asc for same size.
    expect(paths).toEqual(['src/beta.ts', 'src/gamma.ts', 'src/alpha.ts']);
  });

  // ---- finding_lines: dismissed excluded, deduped, sorted asc -------------

  it('populates finding_lines from the latest review, excluding dismissed findings', async () => {
    const reviewDate = new Date();
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [{ path: 'src/service.ts', additions: 50, deletions: 10 }],
        reviews: [
          {
            review: { id: 'rev-1', kind: 'review', createdAt: reviewDate },
            findings: [
              { file: 'src/service.ts', startLine: 30, dismissedAt: null },    // kept
              { file: 'src/service.ts', startLine: 10, dismissedAt: null },    // kept
              { file: 'src/service.ts', startLine: 10, dismissedAt: null },    // dup -> deduped
              { file: 'src/service.ts', startLine: 5, dismissedAt: new Date() }, // dismissed -> excluded
            ],
          },
        ],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    const file = result.groups[0]!.files[0]!;
    expect(file.finding_lines).toEqual([10, 30]); // deduped, sorted asc, dismissed excluded
  });

  // ---- only the LATEST review of kind='review' is used --------------------

  it('uses only the latest review (kind=review), ignoring older reviews and summaries', async () => {
    const older = new Date('2026-01-01');
    const newer = new Date('2026-06-01');
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [{ path: 'src/service.ts', additions: 10, deletions: 0 }],
        reviews: [
          // Newest first (reviewsForPull contract).
          {
            review: { id: 'rev-newest', kind: 'review', createdAt: newer },
            findings: [
              { file: 'src/service.ts', startLine: 7, dismissedAt: null },
            ],
          },
          {
            // This summary's findings must not appear (kind !== 'review').
            review: { id: 'sum-1', kind: 'summary', createdAt: newer },
            findings: [
              { file: 'src/service.ts', startLine: 99, dismissedAt: null },
            ],
          },
          {
            // Older review -- must not contribute.
            review: { id: 'rev-old', kind: 'review', createdAt: older },
            findings: [
              { file: 'src/service.ts', startLine: 42, dismissedAt: null },
            ],
          },
        ],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    const file = result.groups[0]!.files[0]!;
    expect(file.finding_lines).toEqual([7]); // only from rev-newest
  });

  // ---- total_lines and too_big --------------------------------------------

  it('computes total_lines as sum of additions + deletions across all files', async () => {
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [
          { path: 'src/a.ts', additions: 100, deletions: 50 },
          { path: 'pnpm-lock.yaml', additions: 200, deletions: 100 },
        ],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    expect(result.split_suggestion.total_lines).toBe(450);
  });

  it('sets too_big=false when total_lines <= threshold', async () => {
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [{ path: 'src/a.ts', additions: SPLIT_TOTAL_LINES_THRESHOLD, deletions: 0 }],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  it('sets too_big=true when total_lines > threshold', async () => {
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [{ path: 'src/a.ts', additions: SPLIT_TOTAL_LINES_THRESHOLD + 1, deletions: 0 }],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    expect(result.split_suggestion.too_big).toBe(true);
  });

  // ---- proposed_splits when too_big ---------------------------------------

  it('groups core files by top-level segment in proposed_splits', async () => {
    // Each core file uses SPLIT_TOTAL_LINES_THRESHOLD+1 additions to force too_big.
    const bigN = Math.ceil((SPLIT_TOTAL_LINES_THRESHOLD + 1) / 3);
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [
          { path: 'src/modules/auth/service.ts', additions: bigN, deletions: 0 },
          { path: 'src/modules/auth/routes.ts', additions: bigN, deletions: 0 },
          { path: 'src/modules/billing/service.ts', additions: bigN, deletions: 0 },
        ],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    const splits = result.split_suggestion.proposed_splits;
    // All files are under 'src/', so one split named 'src' with 3 files.
    expect(splits.length).toBe(1);
    expect(splits[0]!.name).toBe('src');
    expect(splits[0]!.files).toHaveLength(3);
  });

  it('uses (root) as segment name for core files at the repository root', async () => {
    const bigN = SPLIT_TOTAL_LINES_THRESHOLD + 1;
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [{ path: 'main.ts', additions: bigN, deletions: 0 }],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    const splits = result.split_suggestion.proposed_splits;
    expect(splits[0]!.name).toBe(ROOT_SPLIT_NAME);
  });

  it('appends a chore split for wiring and boilerplate files when too_big', async () => {
    const bigN = Math.ceil((SPLIT_TOTAL_LINES_THRESHOLD + 1) / 2);
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [
          { path: 'src/service.ts', additions: bigN, deletions: 0 },     // core -> src split
          { path: 'pnpm-lock.yaml', additions: bigN, deletions: 0 },     // boilerplate -> chore
        ],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    const splits = result.split_suggestion.proposed_splits;
    const choreSplit = splits.find((s) => s.name === SPLIT_CHORE_NAME);
    expect(choreSplit).toBeDefined();
    expect(choreSplit!.files).toContain('pnpm-lock.yaml');
  });

  it('orders proposed_splits by file count descending', async () => {
    // 'src' segment: 2 files; 'lib' segment: 1 file; chore: 1 file.
    // Expected order: src (2) -> then lib and chore (1 each, stable by insertion).
    const bigN = Math.ceil((SPLIT_TOTAL_LINES_THRESHOLD + 1) / 4);
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [
          { path: 'src/a.ts', additions: bigN, deletions: 0 },
          { path: 'src/b.ts', additions: bigN, deletions: 0 },
          { path: 'lib/c.ts', additions: bigN, deletions: 0 },
          { path: 'pnpm-lock.yaml', additions: bigN, deletions: 0 }, // boilerplate -> chore
        ],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    const splits = result.split_suggestion.proposed_splits;
    expect(splits[0]!.name).toBe('src'); // 2 files -> first
  });

  // ---- single-file boilerplate-only PR (§11 edge case) --------------------

  it('handles a PR with only a lock file (single boilerplate group, too_big=false)', async () => {
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [{ path: 'pnpm-lock.yaml', additions: 50, deletions: 30 }],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.role).toBe('boilerplate');
    expect(result.split_suggestion.too_big).toBe(false);
  });

  // ---- empty PR (no files) ------------------------------------------------

  it('returns an empty groups array and too_big=false for a PR with no files', async () => {
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({ pull: PULL, files: [], reviews: [] }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    expect(result.groups).toEqual([]);
    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.total_lines).toBe(0);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  // ---- pseudocode_summary is always null ----------------------------------

  it('always sets pseudocode_summary to null (out of scope)', async () => {
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [{ path: 'src/service.ts', additions: 1, deletions: 0 }],
        reviews: [],
      }),
    );
    const result = await service.getSmartDiff('ws-1', 'pr-1');
    for (const group of result.groups) {
      for (const file of group.files) {
        expect(file.pseudocode_summary).toBeNull();
      }
    }
  });

  // ---- assert no LLM provider is constructed ------------------------------

  it('does not invoke container.llm at any point', async () => {
    // noLlmContainer.llm throws if accessed -- if this test passes, llm was never called.
    const service = new SmartDiffService(
      noLlmContainer,
      makeRepo({
        pull: PULL,
        files: [
          { path: 'src/service.ts', additions: 10, deletions: 0 },
          { path: 'pnpm-lock.yaml', additions: 5, deletions: 0 },
        ],
        reviews: [
          {
            review: { id: 'rev-1', kind: 'review', createdAt: new Date() },
            findings: [{ file: 'src/service.ts', startLine: 3, dismissedAt: null }],
          },
        ],
      }),
    );
    // Should complete without error.
    await expect(service.getSmartDiff('ws-1', 'pr-1')).resolves.toBeDefined();
  });
});
