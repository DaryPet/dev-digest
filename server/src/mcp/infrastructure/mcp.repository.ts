/**
 * MCP-owned thin read repository. SDK-FREE.
 *
 * Rationale: the three lookups this module needs (repo-by-fullName+ws,
 * pr-by-repoId+number, review+findings-by-runId) are not exposed by any
 * existing container getter. Rather than add new methods to ReviewRepository
 * (owned by the reviews module), we read those tables directly here —
 * the exact precedent set by ConventionsRepository reading `repos`
 * (conventions/repository.ts comment). The WRITE path still goes through
 * the public ReviewService — we never duplicate run logic.
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

// ---------------------------------------------------------------------------
// Exported row types for callers
// ---------------------------------------------------------------------------

export type RepoRow = typeof t.repos.$inferSelect;
export type PrRow = typeof t.pullRequests.$inferSelect;
export type ReviewRow = typeof t.reviews.$inferSelect;
export type FindingRow = typeof t.findings.$inferSelect;
export type AgentRunRow = typeof t.agentRuns.$inferSelect;
export type ConventionRow = typeof t.conventions.$inferSelect;

export interface ReviewWithFindings {
  review: ReviewRow;
  findings: FindingRow[];
}

// ---------------------------------------------------------------------------
// Repository class
// ---------------------------------------------------------------------------

export class McpRepository {
  constructor(private db: Db) {}

  /**
   * Resolve a repo by its full name ("owner/name") within a workspace.
   * Returns undefined if the repo is not known to DevDigest.
   */
  async repoByFullName(workspaceId: string, fullName: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, fullName)));
    return row;
  }

  /**
   * Resolve a pull request by repoId + PR number.
   * Returns undefined if the PR is not yet imported in DevDigest.
   */
  async prByRepoAndNumber(repoId: string, number: number): Promise<PrRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, number)));
    return row;
  }

  /**
   * Fetch the review + its findings for a given runId.
   * Returns undefined if no review has been written for that run yet.
   */
  async reviewWithFindingsByRunId(runId: string): Promise<ReviewWithFindings | undefined> {
    const [review] = await this.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.runId, runId));
    if (!review) return undefined;

    const findings = await this.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.reviewId, review.id));

    return { review, findings };
  }

  /**
   * Fetch the agent_run row for a run (status, error, etc.).
   * Returns undefined if no such run exists.
   */
  async runStatusById(runId: string): Promise<AgentRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.id, runId));
    return row;
  }

  /**
   * Fetch ALL conventions for a repo (no status filter — all statuses exposed).
   * Mirrors ConventionsRepository.listByRepo but from the MCP-owned layer.
   */
  async conventionsByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
        ),
      );
  }
}
