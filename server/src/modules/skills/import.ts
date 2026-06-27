import { inflateRawSync } from 'node:zlib';
import path from 'node:path';
import type { SkillType } from '@devdigest/shared';
import { SkillType as SkillTypeSchema } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  CORE_FILENAMES,
  DEFAULT_SKILL_TYPE,
  EXECUTABLE_EXTENSIONS,
  IMPORT_SKILL_SOURCE,
  MAX_IMPORT_BYTES,
} from './constants.js';

/**
 * Skill import — pure parsing, NO I/O and NO persistence.
 *
 * Takes the bytes of an uploaded `.md`/`.markdown` file OR a `.zip` archive and
 * extracts the skill *core* (a markdown body + frontmatter metadata) into a
 * draft. The caller (service/route) returns this draft as a PREVIEW; the skill
 * is only written to the DB after the user confirms (a separate create call).
 *
 * Safety guarantees, by construction:
 *  - Executable / script entries in an archive are NEVER decoded, run, or
 *    stored — only their names are surfaced under `ignored_files`.
 *  - The archive reader handles the two standard ZIP storage methods (stored +
 *    raw deflate via zlib) with no third-party dependency.
 */

/** A parsed-but-unsaved skill, shown to the user before they confirm import. */
export interface SkillImportDraft {
  name: string;
  description: string;
  type: SkillType;
  /** Always the import source — the product extracted this from an upload. */
  source: typeof IMPORT_SKILL_SOURCE;
  body: string;
  /** Non-core markdown/text files kept as evidence (names only here). */
  evidence_files: string[];
}

export interface SkillImportResult {
  draft: SkillImportDraft;
  /** Archive entries skipped as executable/non-text (never decoded or stored). */
  ignored_files: string[];
  /** Human-readable notes about heuristics applied (missing frontmatter, etc.). */
  warnings: string[];
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);

/** Decode a base64 payload into a Buffer, enforcing the size cap. */
export function decodeUpload(base64: string): Buffer {
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    throw new ValidationError('Upload is not valid base64');
  }
  if (buf.length === 0) throw new ValidationError('Upload is empty');
  if (buf.length > MAX_IMPORT_BYTES) {
    throw new ValidationError(`Upload exceeds the ${MAX_IMPORT_BYTES}-byte import limit`);
  }
  return buf;
}

/** True when the bytes start with the ZIP local-file-header magic `PK\x03\x04`. */
export function looksLikeZip(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Parse an upload (markdown file or zip archive) into a preview draft.
 * `filename` is used only to decide markdown-vs-archive when the bytes are
 * ambiguous and to derive a fallback skill name.
 */
export function parseSkillImport(filename: string, bytes: Buffer): SkillImportResult {
  const ext = path.extname(filename).toLowerCase();
  const isZip = looksLikeZip(bytes) || ext === '.zip';

  if (isZip) return parseArchive(filename, bytes);
  if (MARKDOWN_EXTENSIONS.has(ext) || ext === '' || ext === '.txt') {
    return parseMarkdownFile(filename, bytes.toString('utf8'));
  }
  throw new ValidationError(`Unsupported import file type: ${ext || '(none)'} — expected .md or .zip`);
}

function parseMarkdownFile(filename: string, content: string): SkillImportResult {
  const { draft, warnings } = draftFromMarkdown(content, fallbackName(filename), []);
  return { draft, ignored_files: [], warnings };
}

function parseArchive(filename: string, bytes: Buffer): SkillImportResult {
  const entries = readZipEntries(bytes);
  if (entries.length === 0) throw new ValidationError('Archive contains no readable files');

  const ignored: string[] = [];
  const textFiles = new Map<string, string>(); // path → utf8 content

  for (const entry of entries) {
    if (entry.isDir) continue;
    const entryExt = path.extname(entry.name).toLowerCase();
    // Executable/script payload: record the name, never decode or keep it.
    if (EXECUTABLE_EXTENSIONS.has(entryExt)) {
      ignored.push(entry.name);
      continue;
    }
    const data = entry.read();
    if (data === null) {
      ignored.push(entry.name); // unsupported compression — skip safely
      continue;
    }
    textFiles.set(entry.name, data.toString('utf8'));
  }

  const corePath = pickCoreFile([...textFiles.keys()]);
  if (!corePath) {
    throw new ValidationError('Archive has no markdown core (expected SKILL.md or a *.md file)');
  }

  const evidence = [...textFiles.keys()].filter((p) => p !== corePath);
  const { draft, warnings } = draftFromMarkdown(
    textFiles.get(corePath)!,
    fallbackName(corePath),
    evidence,
  );
  if (ignored.length > 0) {
    warnings.push(`Skipped ${ignored.length} executable/non-text file(s); not stored or run.`);
  }
  return { draft, ignored_files: ignored, warnings };
}

/** Choose the archive's core markdown file: preferred names first, else any .md. */
function pickCoreFile(paths: string[]): string | undefined {
  const byBase = (base: string) =>
    paths.find((p) => path.basename(p).toLowerCase() === base);
  for (const candidate of CORE_FILENAMES) {
    const hit = byBase(candidate);
    if (hit) return hit;
  }
  return paths.find((p) => MARKDOWN_EXTENSIONS.has(path.extname(p).toLowerCase()));
}

/**
 * Build a draft from a markdown body: split optional `--- frontmatter ---`,
 * pull name/description/type from it, fall back to the first heading/paragraph.
 */
function draftFromMarkdown(
  raw: string,
  fallback: string,
  evidence: string[],
): { draft: SkillImportDraft; warnings: string[] } {
  const warnings: string[] = [];
  const { frontmatter, body } = splitFrontmatter(raw);

  let name = frontmatter.name?.trim();
  if (!name) {
    name = firstHeading(body) ?? fallback;
    warnings.push('No `name` in frontmatter — derived it from the first heading/filename.');
  }

  let description = frontmatter.description?.trim();
  if (!description) {
    description = firstParagraph(body) ?? '';
    if (!description) warnings.push('No description found — left blank for you to fill in.');
  }

  let type: SkillType = DEFAULT_SKILL_TYPE;
  if (frontmatter.type) {
    const parsed = SkillTypeSchema.safeParse(frontmatter.type.trim());
    if (parsed.success) {
      type = parsed.data;
    } else {
      warnings.push(`Unknown type "${frontmatter.type}" — defaulted to "${DEFAULT_SKILL_TYPE}".`);
    }
  }

  return {
    draft: {
      name,
      description,
      type,
      source: IMPORT_SKILL_SOURCE,
      body: body.trim(),
      evidence_files: evidence,
    },
    warnings,
  };
}

/** Split a leading `---\n…\n---` YAML-ish frontmatter block (flat key: value). */
export function splitFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  const normalized = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
  if (!match) return { frontmatter: {}, body: normalized };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, ''); // strip matching surrounding quotes
    frontmatter[key] = value;
  }
  return { frontmatter, body: normalized.slice(match[0].length) };
}

function firstHeading(body: string): string | undefined {
  for (const line of body.split('\n')) {
    const m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line.trim());
    if (m) return m[1]!.trim();
  }
  return undefined;
}

function firstParagraph(body: string): string | undefined {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return undefined;
}

function fallbackName(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  return base.trim() || 'Imported skill';
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader (central directory) — stored + deflate, no dependency.
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  isDir: boolean;
  /** Decode this entry's bytes, or null if its compression method is unsupported. */
  read: () => Buffer | null;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

function readZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  if (eocd === -1) throw new ValidationError('Not a valid ZIP archive (no end-of-central-directory)');

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16); // central directory offset
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== CENTRAL_SIGNATURE) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    entries.push({
      name,
      isDir: name.endsWith('/'),
      read: () => readLocalData(buf, localOffset, method, compSize),
    });

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Locate the End Of Central Directory record by scanning back from the tail. */
function findEocd(buf: Buffer): number {
  const minPos = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

function readLocalData(
  buf: Buffer,
  localOffset: number,
  method: number,
  compSize: number,
): Buffer | null {
  if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    return null;
  }
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  const dataEnd = dataStart + compSize;
  if (dataEnd > buf.length) return null;
  const compressed = buf.subarray(dataStart, dataEnd);

  if (method === 0) return Buffer.from(compressed); // stored
  if (method === 8) {
    try {
      return inflateRawSync(compressed); // raw deflate
    } catch {
      return null;
    }
  }
  return null; // unsupported method — caller treats as ignored
}
