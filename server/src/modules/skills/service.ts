import type { Container } from '../../platform/container.js';
import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto } from './helpers.js';
import { decodeUpload, parseSkillImport, type SkillImportResult } from './import.js';
import { ValidationError } from '../../platform/errors.js';
import { isSafeRelativePath } from '../project-context/effective-set.js';

/**
 * A1 — skills service. Business logic for the Skills Lab (list/grid + editor)
 * and the import flow.
 *
 * A Skill = name + description (its directive interface) + type + markdown body
 * + enabled. The body is versioned via `skill_versions` (repository). Import is
 * a PURE parse → preview; nothing is written until the user confirms via the
 * normal create path.
 */

// Re-exported for consumers that map rows themselves.
export { toSkillDto } from './helpers.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  evidence_files?: string[] | null;
  /** Ordered repo-relative paths of manually-attached Project Context
   *  documents (AC-15). Path only, never the document text. */
  project_context_paths?: string[] | null;
}

/**
 * Defense-in-depth guard at the write boundary (attach paths only ever come
 * from checkbox UI, never free text, but we don't trust that blindly).
 */
function assertSafeProjectContextPaths(paths: string[]): void {
  if (paths.some((p) => !isSafeRelativePath(p))) {
    throw new ValidationError('project_context_paths contains an unsafe path');
  }
}

/** A single body snapshot (DTO over a `skill_versions` row). */
export interface SkillVersionDto {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      evidenceFiles: input.evidence_files ?? null,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    if (patch.project_context_paths) {
      assertSafeProjectContextPaths(patch.project_context_paths);
    }
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.evidence_files !== undefined ? { evidenceFiles: patch.evidence_files } : {}),
      ...(patch.project_context_paths !== undefined
        ? { projectContextPaths: patch.project_context_paths }
        : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /** Body version history for a skill, newest first; undefined if not in workspace. */
  async listVersions(
    workspaceId: string,
    id: string,
  ): Promise<SkillVersionDto[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map((r) => ({
      skill_id: r.skillId,
      version: r.version,
      body: r.body,
      created_at: r.createdAt.toISOString(),
    }));
  }

  /**
   * Parse an uploaded markdown file or archive into a PREVIEW draft. Pure — no
   * DB write. The client shows the preview, then calls `create` with the
   * confirmed fields to actually save. Executable archive parts are never run
   * or stored (see import.ts).
   */
  importPreview(filename: string, contentBase64: string): SkillImportResult {
    const bytes = decodeUpload(contentBase64);
    return parseSkillImport(filename, bytes);
  }

  /**
   * Agents that link this skill (Skill editor → Stats tab). Returns undefined
   * when the skill isn't in this workspace (route → 404).
   */
  async agentsUsing(
    workspaceId: string,
    skillId: string,
  ): Promise<Array<{ id: string; name: string; enabled: boolean }> | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    return this.repo.agentsLinkingSkill(workspaceId, skillId);
  }
}
