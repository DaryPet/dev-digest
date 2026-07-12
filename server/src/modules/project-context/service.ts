import type { Container } from '../../platform/container.js';
import type {
  ProjectContextAttachment,
  ProjectContextCatalog,
  ProjectContextDocument,
  ProjectContextEffectiveDocument,
  ProjectContextPreview,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsRepository } from '../skills/repository.js';
import { ProjectContextRepository } from './repository.js';
import { discoverDocuments } from './reader.js';
import { createDocumentFile, updateDocumentFile, createContextFolder, WriterError } from './writer.js';
import { computeEffectiveAttachedPaths } from './effective-set.js';
import { DEFAULT_ROOT_NAMES, MAX_PREVIEW_READ_BYTES, MAX_SPEC_CHARS, TRUNCATION_NOTE } from './constants.js';

/**
 * project-context service. Discovery + effective-set resolution + run-time
 * read, over a repo's clone (no chunking/embedding/indexing — see the spec's
 * Non-goals).
 *
 * `skillsRepo` is constructed directly here (own `Db`, own field) rather than
 * via a `container.skillsRepo` accessor — the container's cross-domain
 * getters are limited to `agentsRepo`/`reviewRepo`; this mirrors the already-
 * accepted precedent for a third cross-domain read (`intent`/`smart-diff`
 * construct `ReviewRepository` directly — see server/INSIGHTS.md 2026-07-03).
 */
export class ProjectContextService {
  private repo: ProjectContextRepository;
  private skillsRepo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new ProjectContextRepository(container.db);
    this.skillsRepo = new SkillsRepository(container.db);
  }

  /**
   * Full document catalog for a repo, plus an optional `.attachment` slot when
   * the caller asked about a specific agent or skill (AC-8/AC-14).
   */
  async getCatalog(
    workspaceId: string,
    repoId: string,
    opts?: { agentId?: string; skillId?: string },
  ): Promise<ProjectContextCatalog> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');

    const repoRef = { owner: repoBasics.owner, name: repoBasics.name };
    const rootPath = this.container.git.clonePathFor(repoRef);
    const discovered = await discoverDocuments(rootPath, DEFAULT_ROOT_NAMES);
    const documents: ProjectContextDocument[] = discovered.map((d) => ({
      path: d.path,
      category: d.category,
    }));
    const catalogByPath = new Map(documents.map((d) => [d.path, d]));

    let attachment: ProjectContextAttachment | null = null;
    if (opts?.agentId) {
      attachment = await this.buildAgentAttachment(workspaceId, repoRef, opts.agentId, catalogByPath);
    } else if (opts?.skillId) {
      attachment = await this.buildSkillAttachment(workspaceId, repoRef, opts.skillId, catalogByPath);
    }

    return { root_path: rootPath, documents, attachment };
  }

  /**
   * Preview panel content for one document. Validates `path` against a FRESH
   * `discoverDocuments()` call (never the client-supplied value blindly) —
   * satisfies AC-3's escape guard and AC-4's freshness in one place. Returns
   * `undefined` when the path isn't part of the current catalog (stale/
   * unknown path); throws when the repo itself isn't in the workspace.
   */
  async getPreview(
    workspaceId: string,
    repoId: string,
    path: string,
  ): Promise<ProjectContextPreview | undefined> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');

    const repoRef = { owner: repoBasics.owner, name: repoBasics.name };
    const rootPath = this.container.git.clonePathFor(repoRef);
    const discovered = await discoverDocuments(rootPath, DEFAULT_ROOT_NAMES);
    const match = discovered.find((d) => d.path === path);
    if (!match) return undefined;

    let content = '';
    try {
      content = await this.container.git.readFile(repoRef, match.path);
    } catch {
      content = '';
    }
    // Hard read guard (400 KB) — the Preview panel is otherwise uncapped.
    if (Buffer.byteLength(content, 'utf8') > MAX_PREVIEW_READ_BYTES) {
      content = content.slice(0, MAX_PREVIEW_READ_BYTES) + TRUNCATION_NOTE;
    }

    const usedByCount = await this.countUsedBy(workspaceId, match.path);
    return { path: match.path, category: match.category, content, used_by_count: usedByCount };
  }

  /**
   * Run-time resolve: reads each effective path via `container.git.readFile`,
   * silently drops unreadable ones (AC-20). Returns specs in effective order +
   * the paths actually read. Zero additional LLM calls (AC-21).
   */
  async resolveForRun(
    repo: { owner: string; name: string },
    effectivePaths: string[],
  ): Promise<{ specs: string[]; specsRead: string[] }> {
    const specs: string[] = [];
    const specsRead: string[] = [];

    for (const path of effectivePaths) {
      let content: string;
      try {
        content = await this.container.git.readFile(repo, path);
      } catch {
        continue; // AC-20 — unreadable path silently excluded, never fails the run.
      }
      // MockGitClient (tests) returns '' for an unknown path rather than
      // throwing — same "silently drop" precedent as the intent module.
      if (!content) continue;

      specs.push(
        content.length > MAX_SPEC_CHARS ? content.slice(0, MAX_SPEC_CHARS) + TRUNCATION_NOTE : content,
      );
      specsRead.push(path);
    }

    return { specs, specsRead };
  }

  /**
   * Create a NEW markdown document in the repo's clone (Project Context page
   * toolbar: "+" and Upload). The path must sit under one of the configured
   * context roots so the file is immediately discoverable.
   */
  async createDocument(
    workspaceId: string,
    repoId: string,
    path: string,
    content: string,
  ): Promise<ProjectContextDocument> {
    const rootPath = await this.rootPathFor(workspaceId, repoId);
    const cleaned = await this.mapWriterErrors(() => createDocumentFile(rootPath, path, content));
    return { path: cleaned, category: categoryOf(cleaned) };
  }

  /** Overwrite an EXISTING document's content (preview pane Edit mode). */
  async updateDocument(
    workspaceId: string,
    repoId: string,
    path: string,
    content: string,
  ): Promise<ProjectContextDocument> {
    const rootPath = await this.rootPathFor(workspaceId, repoId);
    // Freshness/escape guard (same as getPreview): only currently-discovered
    // documents are editable — never a client-supplied path taken blindly.
    const discovered = await discoverDocuments(rootPath, DEFAULT_ROOT_NAMES);
    const match = discovered.find((d) => d.path === path);
    if (!match) throw new NotFoundError('Document not found');
    await this.mapWriterErrors(() => updateDocumentFile(rootPath, match.path, content));
    return { path: match.path, category: match.category };
  }

  /** Create a folder under one of the context roots (toolbar folder action). */
  async createFolder(workspaceId: string, repoId: string, path: string): Promise<{ path: string }> {
    const rootPath = await this.rootPathFor(workspaceId, repoId);
    const cleaned = await this.mapWriterErrors(() => createContextFolder(rootPath, path));
    return { path: cleaned };
  }

  // ---- internals ------------------------------------------------------------

  private async rootPathFor(workspaceId: string, repoId: string): Promise<string> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');
    return this.container.git.clonePathFor({ owner: repoBasics.owner, name: repoBasics.name });
  }

  private async mapWriterErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof WriterError) {
        if (err.code === 'NOT_FOUND') throw new NotFoundError(err.message);
        throw new ValidationError(err.message);
      }
      throw err;
    }
  }

  private async buildAgentAttachment(
    workspaceId: string,
    repoRef: { owner: string; name: string },
    agentId: string,
    catalogByPath: Map<string, ProjectContextDocument>,
  ): Promise<ProjectContextAttachment | null> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return null;

    const linkedSkills = await this.container.agentsRepo.linkedSkills(agent.id);
    const skillPathLists = linkedSkills
      .filter((l) => l.skill.enabled)
      .map((l) => l.skill.projectContextPaths ?? []);
    const directPaths = agent.projectContextPaths ?? [];
    const effectivePaths = computeEffectiveAttachedPaths(directPaths, skillPathLists);
    const effective = await this.buildEffectiveDocuments(repoRef, effectivePaths, catalogByPath);

    return {
      attached_paths: directPaths,
      effective,
      total_approx_tokens: effective.reduce((sum, d) => sum + d.approx_tokens, 0),
    };
  }

  private async buildSkillAttachment(
    workspaceId: string,
    repoRef: { owner: string; name: string },
    skillId: string,
    catalogByPath: Map<string, ProjectContextDocument>,
  ): Promise<ProjectContextAttachment | null> {
    const skill = await this.skillsRepo.getById(workspaceId, skillId);
    if (!skill) return null;

    // A skill's own list only (AC-17's note: no further nesting for skills).
    const directPaths = skill.projectContextPaths ?? [];
    const effective = await this.buildEffectiveDocuments(repoRef, directPaths, catalogByPath);

    return {
      attached_paths: directPaths,
      effective,
      total_approx_tokens: effective.reduce((sum, d) => sum + d.approx_tokens, 0),
    };
  }

  /**
   * Token estimate per effective document (AC-13/AC-18), reusing the
   * project's tokenizer. Paths no longer present in the fresh catalog are
   * dropped (freshness precedent, AC-4) — their category would be unknown.
   */
  private async buildEffectiveDocuments(
    repoRef: { owner: string; name: string },
    paths: string[],
    catalogByPath: Map<string, ProjectContextDocument>,
  ): Promise<ProjectContextEffectiveDocument[]> {
    const out: ProjectContextEffectiveDocument[] = [];
    for (const path of paths) {
      const doc = catalogByPath.get(path);
      if (!doc) continue;
      let content = '';
      try {
        content = await this.container.git.readFile(repoRef, path);
      } catch {
        content = '';
      }
      out.push({
        path: doc.path,
        category: doc.category,
        approx_tokens: this.container.tokenizer.count(content),
      });
    }
    return out;
  }

  /**
   * Count of agents whose EFFECTIVE attached set (direct + enabled linked
   * skills, same rule as run-time resolution) currently includes `path`
   * (AC-6). Reuses `container.agentsRepo` — never `new AgentsRepository(...)`
   * directly (server/INSIGHTS.md 2026-07-03).
   */
  private async countUsedBy(workspaceId: string, path: string): Promise<number> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    const linkedByAgent = await this.container.agentsRepo.linkedSkillsForAgents(
      agents.map((a) => a.id),
    );
    let count = 0;
    for (const agent of agents) {
      const linkedSkills = linkedByAgent.get(agent.id) ?? [];
      const skillPathLists = linkedSkills
        .filter((l) => l.skill.enabled)
        .map((l) => l.skill.projectContextPaths ?? []);
      const effective = computeEffectiveAttachedPaths(agent.projectContextPaths ?? [], skillPathLists);
      if (effective.includes(path)) count += 1;
    }
    return count;
  }
}

/**
 * Category of a freshly-created path: the INNERMOST root-name segment of its
 * directory part wins — same rule as discovery ("a nested `docs/specs/x.md`
 * categorizes as `specs`, not `docs`", reader.ts).
 */
function categoryOf(cleanedPath: string): ProjectContextDocument['category'] {
  const dirSegments = cleanedPath.split('/').slice(0, -1);
  for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
    const seg = dirSegments[i];
    if ((DEFAULT_ROOT_NAMES as readonly string[]).includes(seg!)) {
      return seg as ProjectContextDocument['category'];
    }
  }
  // Unreachable: writer's checkRelPath already requires a root segment.
  return 'docs';
}
