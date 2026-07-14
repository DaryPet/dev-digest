import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { Brief, type Intent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  await db
    .insert(t.prIntent)
    .values({
      prId,
      intent: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
    })
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: { intent: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}

// ---- brief (SPEC-02 PR Why + Risk Brief) -----------------------------------

export async function upsertBrief(db: Db, prId: string, brief: Brief): Promise<void> {
  await db
    .insert(t.prBrief)
    .values({ prId, json: brief })
    .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
}

/**
 * Parse failure => undefined (treated as a cache miss, never throws) so a
 * corrupt/stale-schema row can't 500 the request. A parse failure is still
 * logged loudly: silently treating it as "just recompute" would otherwise
 * hide a schema-drift bug behind a quietly-growing LLM cost/latency spike on
 * every request for that PR (cross-model review finding, 2026-07-13).
 */
export async function getBrief(db: Db, prId: string): Promise<Brief | undefined> {
  const [row] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
  if (!row) return undefined;
  const parsed = Brief.safeParse(row.json);
  if (!parsed.success) {
    console.error(
      `[brief] cached Brief for pr ${prId} failed schema validation — treating as cache miss (will recompute):`,
      parsed.error.message,
    );
    return undefined;
  }
  return parsed.data;
}
