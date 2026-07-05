import { describe, it, expect } from 'vitest';
import { toMcpFinding, toMcpConvention, McpFinding, McpConvention } from './helpers.js';
import type { FindingRow } from '../db/rows.js';
import type { ConventionRow } from '../modules/conventions/repository.js';

/**
 * Unit tests for the compact MCP mapper functions.
 *
 * Verifies P3 (compact whitelisted outputs):
 *   - toMcpFinding strips rationale, suggestion, confidence, reviewId, etc.
 *   - toMcpConvention strips evidenceSnippet; preserves status for all values.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFindingRow(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    id: 'finding-1',
    reviewId: 'review-1',
    file: 'src/config.ts',
    startLine: 10,
    endLine: 12,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded secret',
    rationale: 'A live API key is committed.',
    suggestion: 'Move to env var.',
    confidence: 0.95,
    kind: 'finding',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
    ...overrides,
  } as FindingRow;
}

function makeConventionRow(overrides: Partial<ConventionRow> = {}): ConventionRow {
  return {
    id: 'conv-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    category: 'style',
    rule: 'Use async/await instead of .then()',
    evidencePath: 'src/api/users.ts',
    evidenceSnippet: 'const user = await db.find(id);',
    confidence: 0.9,
    status: 'pending',
    createdAt: new Date('2026-07-05T00:00:00.000Z'),
    ...overrides,
  } as ConventionRow;
}

// ---------------------------------------------------------------------------
// toMcpFinding
// ---------------------------------------------------------------------------

describe('toMcpFinding', () => {
  it('maps the 7 whitelisted fields from a FindingRow', () => {
    const row = makeFindingRow();
    const finding = toMcpFinding(row);

    expect(finding).toEqual({
      id: 'finding-1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded secret',
      file: 'src/config.ts',
      start_line: 10,
      end_line: 12,
    });
  });

  it('does NOT include rationale, suggestion, or confidence', () => {
    const finding = toMcpFinding(makeFindingRow());
    expect(finding).not.toHaveProperty('rationale');
    expect(finding).not.toHaveProperty('suggestion');
    expect(finding).not.toHaveProperty('confidence');
  });

  it('does NOT include reviewId, kind, or acceptedAt', () => {
    const finding = toMcpFinding(makeFindingRow());
    expect(finding).not.toHaveProperty('reviewId');
    expect(finding).not.toHaveProperty('kind');
    expect(finding).not.toHaveProperty('acceptedAt');
    expect(finding).not.toHaveProperty('dismissedAt');
  });

  it('satisfies the McpFinding schema', () => {
    const finding = toMcpFinding(makeFindingRow());
    const parsed = McpFinding.safeParse(finding);
    expect(parsed.success).toBe(true);
  });

  it('maps camelCase startLine/endLine to snake_case start_line/end_line', () => {
    const finding = toMcpFinding(makeFindingRow({ startLine: 5, endLine: 8 }));
    expect(finding.start_line).toBe(5);
    expect(finding.end_line).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// toMcpConvention
// ---------------------------------------------------------------------------

describe('toMcpConvention', () => {
  it('maps the 4 whitelisted fields from a ConventionRow', () => {
    const row = makeConventionRow();
    const conv = toMcpConvention(row);

    expect(conv).toEqual({
      rule: 'Use async/await instead of .then()',
      category: 'style',
      evidence_path: 'src/api/users.ts',
      status: 'pending',
    });
  });

  it('does NOT include evidenceSnippet or confidence', () => {
    const conv = toMcpConvention(makeConventionRow());
    expect(conv).not.toHaveProperty('evidenceSnippet');
    expect(conv).not.toHaveProperty('evidence_snippet');
    expect(conv).not.toHaveProperty('confidence');
    expect(conv).not.toHaveProperty('id');
  });

  it('preserves status=pending', () => {
    expect(toMcpConvention(makeConventionRow({ status: 'pending' })).status).toBe('pending');
  });

  it('preserves status=accepted', () => {
    expect(toMcpConvention(makeConventionRow({ status: 'accepted' })).status).toBe('accepted');
  });

  it('preserves status=rejected', () => {
    expect(toMcpConvention(makeConventionRow({ status: 'rejected' })).status).toBe('rejected');
  });

  it('handles nullable category (passes through as null)', () => {
    const conv = toMcpConvention(makeConventionRow({ category: null }));
    expect(conv.category).toBeNull();
  });

  it('handles null evidencePath by falling back to empty string', () => {
    const conv = toMcpConvention(makeConventionRow({ evidencePath: null as unknown as string }));
    expect(conv.evidence_path).toBe('');
  });

  it('satisfies the McpConvention schema', () => {
    const conv = toMcpConvention(makeConventionRow());
    const parsed = McpConvention.safeParse(conv);
    expect(parsed.success).toBe(true);
  });
});
