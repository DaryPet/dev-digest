/**
 * project-context reader — discovery (step 1).
 *
 * Walks a repo clone directory and returns every `.md` file located at any
 * depth under a directory whose NAME matches one of the configured root names
 * (default: specs, docs, insights) — equivalent to the glob
 * `**\/{specs,docs,insights}/**\/*.md` (AC-1/AC-2).
 *
 * Mirrors `repo-intel/pipeline/walk.ts`'s established walk pattern (never
 * follow symlinks, tolerate unreadable dirs, stable sort). Adds:
 *   - a real-path escape guard (AC-3) as defense-in-depth on top of the
 *     symlink skip — catches the case where a directory entry's declared
 *     type doesn't match reality (network mounts / platform quirks).
 *   - category tracking: the innermost matching root-name ancestor wins (a
 *     nested `docs/specs/x.md` categorizes as `specs`, not `docs`).
 *
 * Pure-ish: fs ops in, plain data out. Never throws — an unreadable/missing
 * root (repo not yet cloned) yields an empty list.
 */
import { readdir, realpath } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { DEFAULT_ROOT_NAMES, MAX_DISCOVERED_FILES } from './constants.js';

export interface DiscoveredDocument {
  path: string;
  category: 'specs' | 'docs' | 'insights';
}

export async function discoverDocuments(
  rootPath: string,
  rootNames: readonly string[] = DEFAULT_ROOT_NAMES,
): Promise<DiscoveredDocument[]> {
  const out: DiscoveredDocument[] = [];
  const rootSet = new Set(rootNames);

  let realRoot: string;
  try {
    realRoot = await realpath(rootPath);
  } catch {
    // Repo not cloned yet / root missing — degrade to an empty catalog.
    return [];
  }

  await walkDir(rootPath, realRoot, rootSet, undefined, out);

  // Stable order: alphabetical relpath (matches the walk.ts precedent).
  out.sort((a, b) => a.path.localeCompare(b.path));
  if (out.length > MAX_DISCOVERED_FILES) out.length = MAX_DISCOVERED_FILES;
  return out;
}

async function walkDir(
  dir: string,
  realRoot: string,
  rootSet: ReadonlySet<string>,
  activeCategory: string | undefined,
  out: DiscoveredDocument[],
): Promise<void> {
  if (out.length >= MAX_DISCOVERED_FILES) return;

  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Unreadable directory (permissions, dangling symlink target) — skip
    // cleanly so discovery keeps making progress elsewhere in the clone.
    return;
  }

  for (const entry of entries) {
    if (out.length >= MAX_DISCOVERED_FILES) return;
    if (entry.isSymbolicLink()) continue; // never follow symlinks (AC-3)

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      const nextCategory = rootSet.has(entry.name) ? entry.name : activeCategory;
      await walkDir(full, realRoot, rootSet, nextCategory, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!activeCategory) continue; // not under any configured root dir
    if (extname(entry.name).toLowerCase() !== '.md') continue;

    // Defense-in-depth escape guard (AC-3): resolve the real path and verify
    // it's still inside the clone root. Symlinks are already skipped above;
    // this also catches dangling entries (excluded) and platform quirks
    // where a symlink's Dirent type doesn't come back as expected.
    let real: string;
    try {
      real = await realpath(full);
    } catch {
      continue;
    }
    if (real !== realRoot && !real.startsWith(realRoot + sep)) continue;

    const rel = relative(realRoot, real).split(sep).join('/');
    out.push({ path: rel, category: activeCategory as DiscoveredDocument['category'] });
  }
}
