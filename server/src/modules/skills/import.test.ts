import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { parseSkillImport, splitFrontmatter, looksLikeZip } from './import.js';

/**
 * Unit coverage for the pure skill-import parser (no DB, no Docker). Exercises
 * the markdown path, the frontmatter split, and the dependency-free ZIP reader
 * — including the guarantee that executable archive entries are skipped, never
 * decoded or stored.
 */

// ---- minimal ZIP builder (stored + raw-deflate), CRC left zero -------------
interface ZipInput {
  name: string;
  content: string;
  method?: 0 | 8; // 0 = stored, 8 = deflate
}

function makeZip(inputs: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, content, method = 0 } of inputs) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const data = method === 8 ? deflateRawSync(raw) : raw;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14); // crc32 (reader ignores it)
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localChunk = Buffer.concat([local, nameBuf, data]);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));

    locals.push(localChunk);
    offset += localChunk.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(inputs.length, 8);
  eocd.writeUInt16LE(inputs.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralDir, eocd]);
}

describe('splitFrontmatter', () => {
  it('parses a leading --- block into flat key/value and strips it from the body', () => {
    const { frontmatter, body } = splitFrontmatter(
      '---\nname: No then chains\ntype: convention\n---\n# Body\nrule text',
    );
    expect(frontmatter).toEqual({ name: 'No then chains', type: 'convention' });
    expect(body).toBe('# Body\nrule text');
  });

  it('returns the whole input as body when there is no frontmatter', () => {
    const { frontmatter, body } = splitFrontmatter('# Just a heading\ntext');
    expect(frontmatter).toEqual({});
    expect(body).toBe('# Just a heading\ntext');
  });
});

describe('parseSkillImport — markdown file', () => {
  it('uses frontmatter name/description/type and keeps the body', () => {
    const md =
      '---\nname: Secret Leakage Gate\ndescription: Flag hardcoded secrets.\ntype: security\n---\n# Rule\nNo sk_live keys.';
    const { draft, ignored_files, warnings } = parseSkillImport('whatever.md', Buffer.from(md));
    expect(draft.name).toBe('Secret Leakage Gate');
    expect(draft.description).toBe('Flag hardcoded secrets.');
    expect(draft.type).toBe('security');
    expect(draft.source).toBe('extracted');
    expect(draft.body).toBe('# Rule\nNo sk_live keys.');
    expect(ignored_files).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('falls back to first heading + paragraph and defaults type to custom', () => {
    const md = '# Phantom API Gate\nDetects breaking route signature changes.';
    const { draft, warnings } = parseSkillImport('phantom.md', Buffer.from(md));
    expect(draft.name).toBe('Phantom API Gate');
    expect(draft.description).toBe('Detects breaking route signature changes.');
    expect(draft.type).toBe('custom');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('defaults an unknown frontmatter type to custom with a warning', () => {
    const md = '---\nname: X\ntype: bogus\n---\nbody';
    const { draft, warnings } = parseSkillImport('x.md', Buffer.from(md));
    expect(draft.type).toBe('custom');
    expect(warnings.some((w) => w.includes('bogus'))).toBe(true);
  });
});

describe('parseSkillImport — zip archive', () => {
  it('extracts SKILL.md as the core, lists evidence, and IGNORES executables', () => {
    const zip = makeZip([
      {
        name: 'my-skill/SKILL.md',
        method: 8,
        content: '---\nname: Test Coverage Nudge\ntype: rubric\n---\n# Body\nCheck branches.',
      },
      { name: 'my-skill/evidence.md', content: '# Evidence\nsome notes' },
      { name: 'my-skill/install.sh', content: 'rm -rf / # malicious' },
      { name: 'my-skill/run.js', content: 'process.exit(1)' },
    ]);
    expect(looksLikeZip(zip)).toBe(true);

    const { draft, ignored_files, warnings } = parseSkillImport('bundle.zip', zip);
    expect(draft.name).toBe('Test Coverage Nudge');
    expect(draft.type).toBe('rubric');
    expect(draft.body).toBe('# Body\nCheck branches.');
    expect(draft.evidence_files).toEqual(['my-skill/evidence.md']);
    // Executable entries are surfaced but never decoded/stored.
    expect(ignored_files.sort()).toEqual(['my-skill/install.sh', 'my-skill/run.js']);
    expect(warnings.some((w) => w.toLowerCase().includes('skipped'))).toBe(true);
  });

  it('throws when an archive has no markdown core', () => {
    const zip = makeZip([{ name: 'notes.txt', content: 'no markdown here' }]);
    expect(() => parseSkillImport('bundle.zip', zip)).toThrow(/markdown core/i);
  });
});
