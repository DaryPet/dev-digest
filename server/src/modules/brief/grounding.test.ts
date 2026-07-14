import { describe, it, expect } from 'vitest';
import type { Brief, BlastRadius, SmartDiff } from '@devdigest/shared';
import { buildGroundingSet, groundBrief } from './grounding.js';

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: 'core',
      files: [
        {
          path: 'src/a.ts',
          pseudocode_summary: null,
          additions: 5,
          deletions: 1,
          finding_lines: [
            { line: 10, severity: 'WARNING' },
            { line: 20, severity: 'CRITICAL' },
          ],
        },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
};

const BLAST: BlastRadius = {
  changed_symbols: [{ name: 'foo', file: 'src/a.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'foo',
      callers: [{ name: 'caller', file: 'src/b.ts', line: 42 }],
      endpoints_affected: ['GET /api/foo'],
      crons_affected: ['0 * * * *'],
    },
  ],
  summary: '1 symbols · 1 callers · 1 endpoints · 1 crons',
};

describe('buildGroundingSet', () => {
  it('collects known files, endpoints/crons, and lines from smartDiff + blast', () => {
    const g = buildGroundingSet(SMART_DIFF, BLAST);
    expect(g.knownFiles.has('src/a.ts')).toBe(true);
    expect(g.knownEndpointsOrCrons.has('GET /api/foo')).toBe(true);
    expect(g.knownEndpointsOrCrons.has('0 * * * *')).toBe(true);
    expect(g.knownLinesByFile.get('src/a.ts')?.has(10)).toBe(true);
    expect(g.knownLinesByFile.get('src/a.ts')?.has(20)).toBe(true);
    expect(g.knownLinesByFile.get('src/b.ts')?.has(42)).toBe(true);
  });
});

describe('groundBrief', () => {
  it('keeps a risk with a grounded file_ref and drops one with none (unprefixed — legacy fallback path)', () => {
    const g = buildGroundingSet(SMART_DIFF, BLAST);
    const raw: Brief = {
      what: 'what',
      why: 'why',
      risk_level: 'medium',
      risks: [
        { title: 'grounded (file)', explanation: 'e', file_refs: ['src/a.ts'] },
        { title: 'grounded (endpoint)', explanation: 'e', file_refs: ['GET /api/foo'] },
        { title: 'ungrounded', explanation: 'e', file_refs: ['src/nonexistent.ts'] },
      ],
      review_focus: [],
    };
    const grounded = groundBrief(raw, g);
    expect(grounded.risks.map((r) => r.title)).toEqual(['grounded (file)', 'grounded (endpoint)']);
  });

  // ---- FILE:/ENDPOINT:/CRON: prefix convention (cross-model review finding, 2026-07-13) ----

  it('checks a FILE:-prefixed ref only against knownFiles, an ENDPOINT:/CRON:-prefixed ref only against knownEndpointsOrCrons', () => {
    const g = buildGroundingSet(SMART_DIFF, BLAST);
    const raw: Brief = {
      what: 'what',
      why: 'why',
      risk_level: 'medium',
      risks: [
        { title: 'grounded (FILE:)', explanation: 'e', file_refs: ['FILE:src/a.ts'] },
        { title: 'grounded (ENDPOINT:)', explanation: 'e', file_refs: ['ENDPOINT:GET /api/foo'] },
        { title: 'grounded (CRON:)', explanation: 'e', file_refs: ['CRON:0 * * * *'] },
        { title: 'ungrounded (FILE: on an endpoint string)', explanation: 'e', file_refs: ['FILE:GET /api/foo'] },
        { title: 'ungrounded (ENDPOINT: on a file path)', explanation: 'e', file_refs: ['ENDPOINT:src/a.ts'] },
      ],
      review_focus: [],
    };
    const grounded = groundBrief(raw, g);
    expect(grounded.risks.map((r) => r.title)).toEqual([
      'grounded (FILE:)',
      'grounded (ENDPOINT:)',
      'grounded (CRON:)',
    ]);
  });

  it('keeps a review_focus item with a known (file, line) and drops one with an unknown line', () => {
    const g = buildGroundingSet(SMART_DIFF, BLAST);
    const raw: Brief = {
      what: 'what',
      why: 'why',
      risk_level: 'low',
      risks: [],
      review_focus: [
        { file: 'src/a.ts', line: 10, reason: 'grounded (finding line)' },
        { file: 'src/b.ts', line: 42, reason: 'grounded (caller line)' },
        { file: 'src/a.ts', line: 999, reason: 'ungrounded line' },
        { file: 'src/unknown.ts', line: 1, reason: 'ungrounded file' },
      ],
    };
    const grounded = groundBrief(raw, g);
    expect(grounded.review_focus.map((r) => r.reason)).toEqual([
      'grounded (finding line)',
      'grounded (caller line)',
    ]);
  });

  it('is a pure function — does not mutate the input Brief', () => {
    const g = buildGroundingSet(SMART_DIFF, BLAST);
    const raw: Brief = {
      what: 'what',
      why: 'why',
      risk_level: 'high',
      risks: [{ title: 't', explanation: 'e', file_refs: ['src/unknown.ts'] }],
      review_focus: [],
    };
    const before = JSON.parse(JSON.stringify(raw));
    groundBrief(raw, g);
    expect(raw).toEqual(before);
  });
});
