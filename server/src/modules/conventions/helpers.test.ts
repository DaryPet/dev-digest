import { describe, it, expect } from 'vitest';
import {
  fingerprint,
  sliceSnippet,
  slugify,
  buildSkillBody,
  toConventionDto,
} from './helpers.js';
import type { ConventionRow } from './repository.js';

/**
 * Hermetic unit tests for the pure conventions helpers (no DB, no I/O):
 * the re-scan dedup fingerprint, the evidence snippet slicer, the skill-body
 * markdown generator, and the row → DTO mapper.
 */

function row(overrides: Partial<ConventionRow> = {}): ConventionRow {
  return {
    id: 'id-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    category: 'style',
    rule: 'Always use async/await instead of .then() chains',
    evidencePath: 'src/api/users.ts:23-31',
    evidenceSnippet: 'const user = await db.users.find(id);',
    confidence: 0.91,
    status: 'pending',
    createdAt: new Date('2026-06-28T00:00:00.000Z'),
    ...overrides,
  } as ConventionRow;
}

describe('fingerprint', () => {
  it('normalizes case + whitespace and strips the line range so a re-detection dedups', () => {
    const a = fingerprint('src/api/users.ts:23-31', 'Always  use  Async/Await');
    const b = fingerprint('src/api/users.ts:40-45', 'always use async/await');
    expect(a).toBe(b);
  });

  it('distinguishes different files or different rules', () => {
    expect(fingerprint('a.ts:1', 'rule x')).not.toBe(fingerprint('b.ts:1', 'rule x'));
    expect(fingerprint('a.ts:1', 'rule x')).not.toBe(fingerprint('a.ts:1', 'rule y'));
  });
});

describe('sliceSnippet', () => {
  const content = Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join('\n');

  it('clamps the window to file bounds and labels the range', () => {
    expect(sliceSnippet(content, 5).range).toBe('1-9');
    expect(sliceSnippet(content, 1).range).toBe('1-5');
    expect(sliceSnippet(content, 10).range).toBe('6-10');
  });

  it('returns a single-line range for a one-line file', () => {
    const out = sliceSnippet('only', 1);
    expect(out.range).toBe('1');
    expect(out.snippet).toBe('only');
  });
});

describe('slugify', () => {
  it('kebab-cases a rule sentence', () => {
    expect(slugify('Always use async/await instead of .then() chains')).toBe(
      'always-use-async-await-instead-of-then-chains',
    );
  });
  it('falls back to "rule" for empty input', () => {
    expect(slugify('!!!')).toBe('rule');
  });
});

describe('buildSkillBody', () => {
  it('renders the title, intro and one fenced section per candidate', () => {
    const body = buildSkillBody('payments-api-conventions', 'acme/payments-api', [
      row(),
      row({ rule: 'All public route handlers return typed Result<T, ApiError>' }),
    ]);
    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('House conventions for `acme/payments-api`');
    expect(body).toContain('## always-use-async-await-instead-of-then-chains');
    expect(body).toContain('Detected in `src/api/users.ts:23-31`:');
    expect(body).toContain('```');
    expect(body).toContain('const user = await db.users.find(id);');
  });
});

describe('toConventionDto', () => {
  it('maps a row to the contract DTO (ISO created_at, null-safe fields)', () => {
    const dto = toConventionDto(row({ category: null, evidenceSnippet: null, confidence: null }));
    expect(dto).toMatchObject({
      id: 'id-1',
      category: null,
      evidence_snippet: '',
      confidence: 0,
      status: 'pending',
      created_at: '2026-06-28T00:00:00.000Z',
    });
  });
});
