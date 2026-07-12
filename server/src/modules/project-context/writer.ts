/**
 * project-context writer — infrastructure for the Project Context page's
 * toolbar (new file / new folder / upload / edit). Sibling of `reader.ts`,
 * which owns the same module's filesystem access for discovery; services call
 * these helpers rather than touching `fs` directly.
 *
 * Every write is guarded the same way discovery filters reads (AC-3 spirit):
 *   - the resolved absolute target must stay inside the clone root;
 *   - the repo-relative path must contain a configured root-name segment
 *     (specs/docs/insights) — otherwise the result would be invisible to
 *     discovery and unusable as context;
 *   - files must be `.md`.
 *
 * Throws plain Error with a `code` — the service maps them onto AppErrors.
 */
import { mkdir, writeFile, realpath, access } from 'node:fs/promises';
import { dirname, extname, isAbsolute, normalize, resolve, sep } from 'node:path';
import { DEFAULT_ROOT_NAMES } from './constants.js';

export type WriterErrorCode = 'INVALID_PATH' | 'ALREADY_EXISTS' | 'NOT_FOUND' | 'ROOT_MISSING';

export class WriterError extends Error {
  constructor(
    public code: WriterErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Normalized repo-relative path (posix separators) or a WriterError. */
function checkRelPath(
  relPath: string,
  rootNames: readonly string[],
  kind: 'file' | 'folder',
): string {
  const cleaned = relPath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!cleaned) throw new WriterError('INVALID_PATH', 'Path is empty');
  if (isAbsolute(cleaned) || cleaned.split('/').some((seg) => seg === '..' || seg === '' || seg === '.')) {
    throw new WriterError('INVALID_PATH', 'Path must be repo-relative without ".." segments');
  }

  const segments = cleaned.split('/');
  const dirSegments = kind === 'file' ? segments.slice(0, -1) : segments;
  if (!dirSegments.some((seg) => rootNames.includes(seg))) {
    throw new WriterError(
      'INVALID_PATH',
      `Path must be under one of the context roots: ${rootNames.map((r) => `${r}/`).join(', ')}`,
    );
  }
  if (kind === 'file' && extname(cleaned).toLowerCase() !== '.md') {
    throw new WriterError('INVALID_PATH', 'Only .md files can be created here');
  }
  return cleaned;
}

/** Absolute target inside the clone root, or a WriterError. */
async function resolveInsideRoot(rootPath: string, cleaned: string): Promise<string> {
  let realRoot: string;
  try {
    realRoot = await realpath(rootPath);
  } catch {
    throw new WriterError('ROOT_MISSING', 'Repo clone is not available on disk');
  }
  const target = resolve(realRoot, cleaned.split('/').join(sep));
  if (target !== realRoot && !target.startsWith(realRoot + sep)) {
    throw new WriterError('INVALID_PATH', 'Path escapes the repo clone');
  }
  return normalize(target);
}

/** Create a NEW markdown document. Fails if the file already exists. */
export async function createDocumentFile(
  rootPath: string,
  relPath: string,
  content: string,
  rootNames: readonly string[] = DEFAULT_ROOT_NAMES,
): Promise<string> {
  const cleaned = checkRelPath(relPath, rootNames, 'file');
  const target = await resolveInsideRoot(rootPath, cleaned);
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new WriterError('ALREADY_EXISTS', `${cleaned} already exists`);
    }
    throw err;
  }
  return cleaned;
}

/** Overwrite an EXISTING markdown document (Edit mode save). */
export async function updateDocumentFile(
  rootPath: string,
  relPath: string,
  content: string,
  rootNames: readonly string[] = DEFAULT_ROOT_NAMES,
): Promise<string> {
  const cleaned = checkRelPath(relPath, rootNames, 'file');
  const target = await resolveInsideRoot(rootPath, cleaned);
  try {
    await access(target);
  } catch {
    throw new WriterError('NOT_FOUND', `${cleaned} does not exist`);
  }
  await writeFile(target, content, 'utf8');
  return cleaned;
}

/** Create a folder (any depth) under one of the context roots. Idempotent. */
export async function createContextFolder(
  rootPath: string,
  relPath: string,
  rootNames: readonly string[] = DEFAULT_ROOT_NAMES,
): Promise<string> {
  const cleaned = checkRelPath(relPath, rootNames, 'folder');
  const target = await resolveInsideRoot(rootPath, cleaned);
  await mkdir(target, { recursive: true });
  return cleaned;
}
