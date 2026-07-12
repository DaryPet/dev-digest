import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * project-context data-access. This module has no tables of its own — it only
 * needs the minimal repo shape (git identity) to resolve a clone root via
 * `container.git.clonePathFor`. Reads `repos` directly (same pattern as
 * `repo-intel/repository.ts`'s `getRepoBasics`), workspace-scoped.
 */

export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

export class ProjectContextRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped repo lookup — undefined if absent / foreign tenant. */
  async getRepoBasics(workspaceId: string, repoId: string): Promise<RepoBasics | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }
}
