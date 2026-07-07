/**
 * BlastService — composes facade reads into the BlastResponse shape.
 *
 * Zero LLM calls on this path (no container.llm). All data comes from the
 * repoIntel facade (persistent index or degraded ripgrep fallback) and
 * reviewRepo (PR meta / file list).
 *
 * Composition rules (frozen, see specs/blast-radius.md §5.2):
 *   1. PR lookup — 404 if absent; changed files list.
 *   2. Facade reads: getBlastRadius, getImpactedRoutes, getIndexState.
 *   3. changed_symbols = blastResult.changedSymbols -> {name, file, kind}.
 *   4. downstream = one entry per changed symbol (including zero-caller symbols).
 *   5. summary = deterministic counts string.
 *   6. index = composed degraded flags.
 */
import type { Container } from '../../platform/container.js';
import type { ReviewRepository } from '../reviews/repository.js';
import { NotFoundError } from '../../platform/errors.js';
import type { BlastResponse } from './schemas.js';

export class BlastService {
  private readonly reviewRepo: ReviewRepository;
  private readonly container: Container;

  constructor(container: Container, overrides?: { reviewRepo?: ReviewRepository }) {
    this.container = container;
    this.reviewRepo = overrides?.reviewRepo ?? container.reviewRepo;
  }

  /** @throws NotFoundError('Pull request not found') — 404, same as smart-diff */
  async getBlast(workspaceId: string, prId: string): Promise<BlastResponse> {
    // Rule 1: PR lookup + changed files.
    const pull = await this.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const prFiles = await this.reviewRepo.getPrFiles(prId);
    const changedFiles = prFiles.map((f) => f.path);

    // Rule 2: facade reads (pure index reads — no LLM, no clone I/O).
    const [blastResult, impactedRoutes, state] = await Promise.all([
      this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles),
      this.container.repoIntel.getImpactedRoutes(pull.repoId, changedFiles),
      this.container.repoIntel.getIndexState(pull.repoId),
    ]);

    // Rule 3: changed_symbols.
    const changedSymbols = blastResult.changedSymbols.map((s) => ({
      name: s.name,
      file: s.file,
      kind: s.kind,
    }));

    const factsByFile = blastResult.factsByFile ?? {};

    // Rule 4: one downstream entry per changed symbol (including zero-caller ones).
    const downstream = changedSymbols.map((symbol) => {
      const symbolCallers = blastResult.callers
        .filter((c) => c.viaSymbol === symbol.name)
        .map((c) => ({ name: c.symbol, file: c.file, line: c.line }));

      // endpoints_affected = dedup union of:
      //   factsByFile[callerFile].endpoints for each caller of this symbol
      //   + impactedRoutes where seedFile === symbol.file -> endpoints
      const endpointSet = new Set<string>();
      for (const c of symbolCallers) {
        for (const ep of factsByFile[c.file]?.endpoints ?? []) {
          endpointSet.add(ep);
        }
      }
      for (const route of impactedRoutes) {
        if (route.seedFile === symbol.file) {
          for (const ep of route.endpoints) endpointSet.add(ep);
        }
      }

      // crons_affected = same union over crons.
      const cronSet = new Set<string>();
      for (const c of symbolCallers) {
        for (const cron of factsByFile[c.file]?.crons ?? []) {
          cronSet.add(cron);
        }
      }
      for (const route of impactedRoutes) {
        if (route.seedFile === symbol.file) {
          for (const cron of route.crons) cronSet.add(cron);
        }
      }

      return {
        symbol: symbol.name,
        callers: symbolCallers,
        endpoints_affected: [...endpointSet].sort(),
        crons_affected: [...cronSet].sort(),
      };
    });

    // Rule 5: deterministic summary (U+00B7 middle dot).
    const S = changedSymbols.length;
    const C = downstream.reduce((sum, d) => sum + d.callers.length, 0);
    const allEndpoints = new Set<string>();
    const allCrons = new Set<string>();
    for (const d of downstream) {
      for (const ep of d.endpoints_affected) allEndpoints.add(ep);
      for (const cron of d.crons_affected) allCrons.add(cron);
    }
    const E = allEndpoints.size;
    const K = allCrons.size;
    const summary = `${S} symbols · ${C} callers · ${E} endpoints · ${K} crons`;

    // Rule 6: index info.
    const index = {
      status: state.status as 'full' | 'partial' | 'degraded' | 'failed',
      degraded: (blastResult.degraded ?? false) || (state.degraded ?? false),
      reason: (blastResult.reason ?? state.degradedReason ?? null) as string | null,
    };

    return {
      blast: {
        changed_symbols: changedSymbols,
        downstream,
        summary,
      },
      index,
    };
  }
}
