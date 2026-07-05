/**
 * MCP-specific env config — parsed once at startup. SDK-FREE.
 *
 * Workspace resolution:
 *   MCP_WORKSPACE_ID set → use it directly.
 *   MCP_WORKSPACE_ID unset → defer to container.auth.currentWorkspace() at runtime.
 *
 * MCP_REPO is required only by get_conventions. Absent + tool called → P4 error (§5.3).
 */
import { z } from 'zod';

export const McpEnv = z.object({
  MCP_WORKSPACE_ID: z.string().optional(),
  MCP_REPO: z.string().optional(),
  MCP_RUN_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
});
export type McpEnv = z.infer<typeof McpEnv>;

/** Parsed context resolved at startup. */
export interface McpContext {
  /** Workspace UUID if provided via env; undefined = resolve from DB on first call. */
  workspaceId: string | undefined;
  /** "owner/name" string from env, or undefined. */
  repo: string | undefined;
  /** Maximum ms to wait for a blocking run before returning a P4 timeout error. */
  runTimeoutMs: number;
}

/**
 * Parse the MCP env vars. Throws a descriptive Zod error on invalid input.
 * Call once at startup; pass `process.env` or a test override.
 */
export function parseMcpEnv(env: NodeJS.ProcessEnv = process.env): McpContext {
  const parsed = McpEnv.parse(env);
  return {
    workspaceId: parsed.MCP_WORKSPACE_ID,
    repo: parsed.MCP_REPO,
    runTimeoutMs: parsed.MCP_RUN_TIMEOUT_MS,
  };
}
