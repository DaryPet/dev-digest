import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalOwnerKind } from '@devdigest/shared';

/**
 * Eval data-access. The ONLY file in the module that touches the DB (onion:
 * data-access layer). Owns `eval_cases` + `eval_runs` — reused exactly as
 * they exist today (D3), no migration. `eval_cases.workspace_id` scopes
 * everything; `eval_runs` has no workspace column of its own (D4's per-case
 * rows are always reached through their owning case), so every run query
 * here is joined/filtered through `eval_cases` by the callers in `service.ts`.
 */

import type { EvalCaseRow, EvalRunRow } from '../../db/rows.js';
export type { EvalCaseRow, EvalRunRow };

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputFiles: unknown;
  inputMeta: unknown;
  expectedOutput: unknown;
  notes: string | null;
}

export type UpdateEvalCase = Partial<InsertEvalCase>;

export interface InsertEvalRun {
  caseId: string;
  actualOutput: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
}

export class EvalRepository {
  constructor(private db: Db) {}

  /** Cases in the workspace, optionally narrowed by owner. Omitting both
   *  `ownerKind`/`ownerId` lists every case in the workspace (dashboard's
   *  workspace-wide mode, route 11/12). */
  async listCases(
    workspaceId: string,
    ownerKind?: EvalOwnerKind,
    ownerId?: string,
  ): Promise<EvalCaseRow[]> {
    const conditions = [eq(t.evalCases.workspaceId, workspaceId)];
    if (ownerKind) conditions.push(eq(t.evalCases.ownerKind, ownerKind));
    if (ownerId) conditions.push(eq(t.evalCases.ownerId, ownerId));
    return this.db
      .select()
      .from(t.evalCases)
      .where(and(...conditions));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db.insert(t.evalCases).values(values).returning();
    return row!;
  }

  /** Full replace (route 4, PATCH). Workspace-scoped. */
  async updateCase(
    workspaceId: string,
    id: string,
    values: UpdateEvalCase,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set(values)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db.insert(t.evalRuns).values(values).returning();
    return row!;
  }

  /** All persisted runs for the given case ids, newest first. */
  async runsForCases(caseIds: string[]): Promise<EvalRunRow[]> {
    if (caseIds.length === 0) return [];
    return this.db
      .select()
      .from(t.evalRuns)
      .where(inArray(t.evalRuns.caseId, caseIds))
      .orderBy(desc(t.evalRuns.ranAt));
  }
}
