import { describe, it, expect } from 'vitest';
import type { ReviewWithFindings } from './helpers.js';
import { selectMostBlockingReview } from './helpers.js';

function entry(overrides: Partial<ReviewWithFindings['review']> = {}): ReviewWithFindings {
  return {
    review: {
      id: overrides.id ?? 'review-1',
      workspaceId: 'ws-1',
      prId: 'pr-1',
      agentId: overrides.agentId ?? 'agent-1',
      runId: null,
      kind: 'review',
      verdict: overrides.verdict ?? null,
      summary: null,
      score: null,
      model: null,
      createdAt: new Date().toISOString(),
      ...overrides,
    } as ReviewWithFindings['review'],
    findings: [],
  };
}

describe('selectMostBlockingReview', () => {
  it('returns null when there are no reviews', () => {
    expect(selectMostBlockingReview([])).toBeNull();
  });

  it('returns null when no review carries a verdict', () => {
    const reviews = [entry({ verdict: null })];
    expect(selectMostBlockingReview(reviews)).toBeNull();
  });

  it('picks the highest-ranked verdict across distinct agents', () => {
    const reviews = [
      entry({ id: 'r1', agentId: 'a1', verdict: 'approve' }),
      entry({ id: 'r2', agentId: 'a2', verdict: 'request_changes' }),
      entry({ id: 'r3', agentId: 'a3', verdict: 'comment' }),
    ];
    const winner = selectMostBlockingReview(reviews);
    expect(winner?.review.id).toBe('r2');
    expect(winner?.review.verdict).toBe('request_changes');
  });

  it('deduplicates by agentId, keeping only the first (newest) occurrence per agent', () => {
    const reviews = [
      entry({ id: 'r1-newest', agentId: 'a1', verdict: 'approve' }),
      entry({ id: 'r1-older', agentId: 'a1', verdict: 'request_changes' }),
    ];
    const winner = selectMostBlockingReview(reviews);
    // Only the newest a1 review is considered — its 'approve' verdict wins
    // even though the older (deduped-away) a1 review was more blocking.
    expect(winner?.review.id).toBe('r1-newest');
    expect(winner?.review.verdict).toBe('approve');
  });

  it('breaks a rank tie by keeping the first (newest) candidate in the list', () => {
    const reviews = [
      entry({ id: 'r1', agentId: 'a1', verdict: 'comment' }),
      entry({ id: 'r2', agentId: 'a2', verdict: 'comment' }),
    ];
    const winner = selectMostBlockingReview(reviews);
    expect(winner?.review.id).toBe('r1');
  });

  it('falls back to review id for dedup when agentId is null', () => {
    const reviews = [
      entry({ id: 'r1', agentId: null, verdict: 'request_changes' }),
      entry({ id: 'r2', agentId: null, verdict: 'approve' }),
    ];
    const winner = selectMostBlockingReview(reviews);
    // Different review ids (both agentId null) => both kept as distinct
    // candidates; the more-blocking one wins.
    expect(winner?.review.id).toBe('r1');
  });
});
