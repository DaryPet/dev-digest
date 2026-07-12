import { describe, it, expect } from 'vitest';
import { isConfigChange, type ConfigChangePatch } from './helpers.js';

/**
 * `project_context_paths` is deliberately NOT part of `ConfigChangePatch` —
 * toggling/reordering attached Project Context documents must never bump an
 * agent's `version` or snapshot `agent_versions` (spec §6.4).
 */
describe('isConfigChange', () => {
  const existing = {
    name: 'A',
    description: 'd',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    systemPrompt: 'sys',
    strategy: 'single-pass' as const,
    ciFailOn: 'critical' as const,
    repoIntel: true,
  };

  it('does NOT bump version for a patch that only touches project_context_paths', () => {
    // project_context_paths is deliberately absent from ConfigChangePatch —
    // cast simulates the real call site (repository.update passes the full
    // UpdateAgent-shaped patch, which DOES carry this field structurally).
    const patch = { projectContextPaths: ['specs/a.md'] } as unknown as ConfigChangePatch;
    expect(isConfigChange(existing, patch)).toBe(false);
  });

  it('still bumps version for a genuine config field change', () => {
    expect(isConfigChange(existing, { model: 'gpt-4o' })).toBe(true);
  });

  it('does NOT bump version for an empty patch', () => {
    expect(isConfigChange(existing, {})).toBe(false);
  });
});
