/**
 * Frozen tool input/output Zod contracts (§5.2).
 *
 * SDK-FREE — these schemas are used both for validation (in tests) and as
 * the inputSchema ZodRawShape passed to McpServer.registerTool.
 *
 * Input schemas are ZodRawShape (plain record of Zod fields, NOT z.object).
 * Output schemas are z.object wrappers — used for documentation & tests only.
 */
import { z } from 'zod';
import { McpAgent, McpFinding, McpConvention } from './helpers.js';

// ---------------------------------------------------------------------------
// Tool input raw shapes (ZodRawShape — passed to registerTool inputSchema)
// ---------------------------------------------------------------------------

/** list_agents — no input */
export const listAgentsInput = {} as const;

/** run_agent_on_pr — flat input */
export const runAgentOnPrInput = {
  repo: z.string().describe('owner/name of the repository'),
  pr: z.number().int().positive().describe('PR number'),
  agent: z.string().describe('agent id (from list_agents)'),
} as const;

/** get_findings — flat input */
export const getFindingsInput = {
  runId: z.string().describe('run id from run_agent_on_pr'),
} as const;

/** get_conventions — no input (repo resolved from env) */
export const getConventionsInput = {} as const;

/** get_blast_radius — minimal future-compatible flat shape */
export const getBlastRadiusInput = {
  repo: z.string().describe('owner/name of the repository'),
  pr: z.number().int().describe('PR number'),
} as const;

// ---------------------------------------------------------------------------
// Tool output shapes (z.object — for documentation & test assertions)
// ---------------------------------------------------------------------------

export const ListAgentsOutput = z.object({
  agents: z.array(McpAgent),
});
export type ListAgentsOutput = z.infer<typeof ListAgentsOutput>;

export const RunAgentOnPrOutput = z.object({
  runId: z.string(),
  verdict: z.string(),
  findings: z.array(McpFinding),
});
export type RunAgentOnPrOutput = z.infer<typeof RunAgentOnPrOutput>;

export const GetFindingsOutput = z.object({
  runId: z.string(),
  verdict: z.string(),
  findings: z.array(McpFinding),
});
export type GetFindingsOutput = z.infer<typeof GetFindingsOutput>;

export const GetConventionsOutput = z.object({
  conventions: z.array(McpConvention),
});
export type GetConventionsOutput = z.infer<typeof GetConventionsOutput>;

export const GetBlastRadiusOutput = z.object({
  status: z.literal('not_implemented'),
  message: z.string(),
});
export type GetBlastRadiusOutput = z.infer<typeof GetBlastRadiusOutput>;
