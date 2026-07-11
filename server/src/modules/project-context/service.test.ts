import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ProjectContextService } from './service.js';
import type { ProjectContextRepository, RepoBasics } from './repository.js';
import type { SkillsRepository } from '../skills/repository.js';

/**
 * Unit-level tests: a real tmp-dir clone root (discovery is genuine filesystem
 * I/O) + a fake Container (git.readFile/clonePathFor + agentsRepo stubbed;
 * `repo`/`skillsRepo` fields overridden post-construction the same way
 * `test/repo-intel-facade-degraded.test.ts` overrides a private repo field —
 * no DB, no Docker needed).
 */
describe('ProjectContextService', () => {
  let root: string;
  const repoRef: RepoRef = { owner: 'acme', name: 'widgets' };
  const repoBasics: RepoBasics = { id: 'repo-1', owner: 'acme', name: 'widgets', clonePath: null };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pc-service-'));
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', 'a.md'), 'Spec A content');
    await writeFile(join(root, 'specs', 'b.md'), 'Spec B content');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function makeService(opts?: {
    repoBasics?: RepoBasics | undefined;
    agentsRepo?: Partial<Container['agentsRepo']>;
    skillsRepo?: Partial<SkillsRepository>;
  }) {
    const files: Record<string, string> = { 'specs/a.md': 'Spec A content', 'specs/b.md': 'Spec B content' };
    const git = {
      clonePathFor: () => root,
      readFile: async (_repo: RepoRef, path: string) => files[path] ?? '',
    } as unknown as Container['git'];

    const fakeContainer = {
      git,
      db: {} as never,
      tokenizer: { count: (t: string) => t.length },
      agentsRepo: opts?.agentsRepo ?? {
        list: async () => [],
        linkedSkills: async () => [],
        getById: async () => undefined,
      },
    } as unknown as Container;

    const service = new ProjectContextService(fakeContainer);
    (service as unknown as { repo: Pick<ProjectContextRepository, 'getRepoBasics'> }).repo = {
      getRepoBasics: async () => (opts && 'repoBasics' in opts ? opts.repoBasics : repoBasics),
    };
    (service as unknown as { skillsRepo: Pick<SkillsRepository, 'getById'> }).skillsRepo = {
      getById: async () => undefined,
      ...opts?.skillsRepo,
    };
    return service;
  }

  it('getCatalog returns the discovered documents + clone root path (AC-5)', async () => {
    const service = makeService();
    const catalog = await service.getCatalog('ws-1', 'repo-1');
    expect(catalog.root_path).toBe(root);
    expect(catalog.documents.map((d) => d.path).sort()).toEqual(['specs/a.md', 'specs/b.md']);
    expect(catalog.attachment).toBeNull();
  });

  it('getCatalog throws NotFoundError when the repo is not in the workspace', async () => {
    const service = makeService({ repoBasics: undefined });
    await expect(service.getCatalog('ws-1', 'repo-1')).rejects.toThrow(NotFoundError);
  });

  it('getCatalog builds an agent attachment: effective set + per-doc/total approx tokens (AC-12/13/18)', async () => {
    const service = makeService({
      agentsRepo: {
        getById: async () => ({ id: 'agent-1', projectContextPaths: ['specs/a.md'] }) as never,
        linkedSkills: async () =>
          [
            { skill: { enabled: true, projectContextPaths: ['specs/b.md', 'specs/a.md'] }, order: 0 },
          ] as never,
        list: async () => [],
      },
    });
    const catalog = await service.getCatalog('ws-1', 'repo-1', { agentId: 'agent-1' });
    expect(catalog.attachment?.attached_paths).toEqual(['specs/a.md']);
    // effective = direct(a) + skill(b, a already seen → dropped) = [a, b] (AC-17).
    expect(catalog.attachment?.effective.map((d) => d.path)).toEqual(['specs/a.md', 'specs/b.md']);
    expect(catalog.attachment?.total_approx_tokens).toBeGreaterThan(0);
  });

  it("getCatalog builds a skill attachment from the skill's own list only", async () => {
    const service = makeService({
      skillsRepo: {
        getById: async () => ({ id: 'skill-1', projectContextPaths: ['specs/b.md'] }) as never,
      },
    });
    const catalog = await service.getCatalog('ws-1', 'repo-1', { skillId: 'skill-1' });
    expect(catalog.attachment?.attached_paths).toEqual(['specs/b.md']);
    expect(catalog.attachment?.effective.map((d) => d.path)).toEqual(['specs/b.md']);
  });

  it('getCatalog omits documents from `effective` that no longer exist in the fresh catalog', async () => {
    const service = makeService({
      agentsRepo: {
        getById: async () => ({ id: 'agent-1', projectContextPaths: ['specs/a.md', 'specs/deleted.md'] }) as never,
        linkedSkills: async () => [],
        list: async () => [],
      },
    });
    const catalog = await service.getCatalog('ws-1', 'repo-1', { agentId: 'agent-1' });
    expect(catalog.attachment?.attached_paths).toEqual(['specs/a.md', 'specs/deleted.md']);
    expect(catalog.attachment?.effective.map((d) => d.path)).toEqual(['specs/a.md']);
  });

  it('getPreview returns content + used_by_count, validated against a fresh discovery (AC-6)', async () => {
    const service = makeService({
      agentsRepo: {
        list: async () => [{ id: 'agent-1', projectContextPaths: ['specs/a.md'] } as never],
        linkedSkills: async () => [],
        getById: async () => undefined,
      },
    });
    const preview = await service.getPreview('ws-1', 'repo-1', 'specs/a.md');
    expect(preview?.content).toBe('Spec A content');
    expect(preview?.category).toBe('specs');
    expect(preview?.used_by_count).toBe(1);
  });

  it('getPreview returns undefined for a path not in the fresh catalog (AC-4 freshness)', async () => {
    const service = makeService();
    const preview = await service.getPreview('ws-1', 'repo-1', 'specs/deleted.md');
    expect(preview).toBeUndefined();
  });

  it('getPreview throws NotFoundError when the repo is not in the workspace', async () => {
    const service = makeService({ repoBasics: undefined });
    await expect(service.getPreview('ws-1', 'repo-1', 'specs/a.md')).rejects.toThrow(NotFoundError);
  });

  it('resolveForRun reads effective paths and silently drops unreadable ones (AC-20)', async () => {
    const service = makeService();
    const { specs, specsRead } = await service.resolveForRun(repoRef, ['specs/a.md', 'specs/missing.md']);
    expect(specsRead).toEqual(['specs/a.md']);
    expect(specs).toEqual(['Spec A content']);
  });

  it('resolveForRun returns empty arrays for an empty effective set (AC-21 — no extra work)', async () => {
    const service = makeService();
    const { specs, specsRead } = await service.resolveForRun(repoRef, []);
    expect(specs).toEqual([]);
    expect(specsRead).toEqual([]);
  });
});
