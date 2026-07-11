import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverDocuments } from './reader.js';
import { MAX_DISCOVERED_FILES } from './constants.js';

describe('discoverDocuments', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pc-reader-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('discovers .md files at any depth under configured root names (AC-1)', async () => {
    await mkdir(join(root, 'specs', 'nested'), { recursive: true });
    await writeFile(join(root, 'specs', 'a.md'), '# A');
    await writeFile(join(root, 'specs', 'nested', 'b.md'), '# B');
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs', 'c.md'), '# C');
    // Not under a configured root — must be excluded.
    await writeFile(join(root, 'README.md'), '# root readme');

    const docs = await discoverDocuments(root, ['specs', 'docs', 'insights']);
    expect(docs.map((d) => d.path).sort()).toEqual(['docs/c.md', 'specs/a.md', 'specs/nested/b.md']);
    expect(docs.find((d) => d.path === 'specs/a.md')?.category).toBe('specs');
    expect(docs.find((d) => d.path === 'docs/c.md')?.category).toBe('docs');
  });

  it('uses a configured root-name override instead of the default set (AC-2)', async () => {
    await mkdir(join(root, 'custom'), { recursive: true });
    await writeFile(join(root, 'custom', 'x.md'), '# X');
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', 'y.md'), '# Y');

    const docs = await discoverDocuments(root, ['custom']);
    expect(docs.map((d) => d.path)).toEqual(['custom/x.md']);
  });

  it('never follows a symlinked directory pointing outside the clone root (AC-3)', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'pc-outside-'));
    try {
      await writeFile(join(outside, 'secret.md'), '# secret');
      await mkdir(join(root, 'specs'), { recursive: true });
      await symlink(outside, join(root, 'specs', 'escape'), 'dir');

      const docs = await discoverDocuments(root, ['specs']);
      expect(docs).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('never follows a symlinked file pointing outside the clone root (AC-3)', async () => {
    const outsideDir = await mkdtemp(join(tmpdir(), 'pc-outfile-'));
    try {
      const outsideFile = join(outsideDir, 'secret.md');
      await writeFile(outsideFile, '# secret');
      await mkdir(join(root, 'specs'), { recursive: true });
      await symlink(outsideFile, join(root, 'specs', 'link.md'), 'file');

      const docs = await discoverDocuments(root, ['specs']);
      expect(docs).toEqual([]);
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('ignores non-.md files', async () => {
    await mkdir(join(root, 'specs'), { recursive: true });
    await writeFile(join(root, 'specs', 'a.txt'), 'not markdown');
    const docs = await discoverDocuments(root, ['specs']);
    expect(docs).toEqual([]);
  });

  it('returns [] when the root does not exist (repo not cloned yet)', async () => {
    const docs = await discoverDocuments(join(root, 'does-not-exist'), ['specs']);
    expect(docs).toEqual([]);
  });

  it('caps enumeration at MAX_DISCOVERED_FILES', async () => {
    await mkdir(join(root, 'specs'), { recursive: true });
    const n = MAX_DISCOVERED_FILES + 5;
    await Promise.all(
      Array.from({ length: n }, (_, i) => writeFile(join(root, 'specs', `f${i}.md`), '# f')),
    );
    const docs = await discoverDocuments(root, ['specs']);
    expect(docs.length).toBe(MAX_DISCOVERED_FILES);
  }, 30_000);
});
