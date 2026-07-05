import { describe, it, expect } from 'vitest';
import { parseMcpEnv, McpEnv } from './env.js';

/**
 * Unit tests for MCP env parsing (SDK-free).
 *
 * Verifies:
 *   - McpEnv schema parses valid inputs.
 *   - Default values for optional fields.
 *   - MCP_WORKSPACE_ID / MCP_REPO optional paths.
 *   - MCP_RUN_TIMEOUT_MS coercion and default.
 */

describe('McpEnv schema', () => {
  it('accepts an empty env (all fields optional)', () => {
    const result = McpEnv.safeParse({});
    expect(result.success).toBe(true);
  });

  it('defaults MCP_RUN_TIMEOUT_MS to 300000', () => {
    const parsed = McpEnv.parse({});
    expect(parsed.MCP_RUN_TIMEOUT_MS).toBe(300_000);
  });

  it('coerces MCP_RUN_TIMEOUT_MS string to number', () => {
    const parsed = McpEnv.parse({ MCP_RUN_TIMEOUT_MS: '60000' });
    expect(parsed.MCP_RUN_TIMEOUT_MS).toBe(60_000);
  });

  it('rejects non-positive MCP_RUN_TIMEOUT_MS', () => {
    const result = McpEnv.safeParse({ MCP_RUN_TIMEOUT_MS: '-1' });
    expect(result.success).toBe(false);
  });

  it('passes through MCP_WORKSPACE_ID', () => {
    const parsed = McpEnv.parse({ MCP_WORKSPACE_ID: 'ws-uuid-123' });
    expect(parsed.MCP_WORKSPACE_ID).toBe('ws-uuid-123');
  });

  it('passes through MCP_REPO', () => {
    const parsed = McpEnv.parse({ MCP_REPO: 'acme/payments-api' });
    expect(parsed.MCP_REPO).toBe('acme/payments-api');
  });
});

describe('parseMcpEnv', () => {
  it('returns undefined workspaceId when MCP_WORKSPACE_ID is not set', () => {
    const ctx = parseMcpEnv({} as NodeJS.ProcessEnv);
    expect(ctx.workspaceId).toBeUndefined();
  });

  it('returns the workspace id from env when set', () => {
    const ctx = parseMcpEnv({ MCP_WORKSPACE_ID: 'ws-42' } as NodeJS.ProcessEnv);
    expect(ctx.workspaceId).toBe('ws-42');
  });

  it('returns undefined repo when MCP_REPO is not set', () => {
    const ctx = parseMcpEnv({} as NodeJS.ProcessEnv);
    expect(ctx.repo).toBeUndefined();
  });

  it('returns the repo from env when set', () => {
    const ctx = parseMcpEnv({ MCP_REPO: 'acme/api' } as NodeJS.ProcessEnv);
    expect(ctx.repo).toBe('acme/api');
  });

  it('applies the default timeout (300s)', () => {
    const ctx = parseMcpEnv({} as NodeJS.ProcessEnv);
    expect(ctx.runTimeoutMs).toBe(300_000);
  });

  it('reads a custom timeout from env', () => {
    const ctx = parseMcpEnv({ MCP_RUN_TIMEOUT_MS: '30000' } as NodeJS.ProcessEnv);
    expect(ctx.runTimeoutMs).toBe(30_000);
  });
});
