import { describe, it, expect } from 'vitest';
import { toolError, toolSuccess } from './errors.js';

/**
 * Unit tests for the P4 error shaping helper.
 *
 * Verifies:
 *   - toolError sets isError: true and wraps { error, next? } as JSON text.
 *   - toolSuccess wraps the payload as JSON text without isError.
 */

/** Narrow content[0] to { text: string } safely. */
function textOf(result: ReturnType<typeof toolError>): string {
  const item = result.content[0];
  if (!item || item.type !== 'text') throw new Error('Expected text content');
  return item.text;
}

describe('toolError', () => {
  it('sets isError: true', () => {
    const result = toolError('something went wrong');
    expect(result.isError).toBe(true);
  });

  it('embeds the error message in the JSON payload', () => {
    const result = toolError('agent not found');
    const payload = JSON.parse(textOf(result));
    expect(payload.error).toBe('agent not found');
  });

  it('includes `next` when provided', () => {
    const result = toolError('agent not found', 'call list_agents to get a valid agent id');
    const payload = JSON.parse(textOf(result));
    expect(payload.next).toBe('call list_agents to get a valid agent id');
  });

  it('omits `next` key when not provided', () => {
    const result = toolError('bare error');
    const payload = JSON.parse(textOf(result));
    expect(payload).not.toHaveProperty('next');
  });

  it('content[0] has type "text"', () => {
    const result = toolError('x');
    expect(result.content[0]?.type).toBe('text');
  });

  it('uses the exact frozen P4 messages for repo-not-found', () => {
    const result = toolError(
      'repo "acme/api" not found in this workspace',
      'add it in DevDigest, then retry',
    );
    const payload = JSON.parse(textOf(result));
    expect(payload.error).toContain('not found in this workspace');
    expect(payload.next).toBe('add it in DevDigest, then retry');
  });
});

describe('toolSuccess', () => {
  it('does NOT set isError', () => {
    const result = toolSuccess({ agents: [] });
    expect(result.isError).toBeFalsy();
  });

  it('embeds the output as serialized JSON text', () => {
    const output = { runId: 'run-1', verdict: 'approved', findings: [] };
    const result = toolSuccess(output);
    const parsed = JSON.parse(textOf(result));
    expect(parsed).toEqual(output);
  });

  it('content[0] has type "text"', () => {
    const result = toolSuccess({ ok: true });
    expect(result.content[0]?.type).toBe('text');
  });
});
