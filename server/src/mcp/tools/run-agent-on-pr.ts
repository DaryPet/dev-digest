/**
 * run_agent_on_pr tool registration. [presentation, imports SDK]
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toolError, toolSuccess } from '../errors.js';
import { runAgentOnPrInput } from '../schemas.js';
import type { McpService } from '../application/mcp-service.js';

export function registerRunAgentOnPr(server: McpServer, service: McpService): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      description:
        'Run one review agent on a PR and block until it finishes; returns verdict + findings.',
      inputSchema: runAgentOnPrInput,
    },
    async (args: { repo: string; pr: number; agent: string }) => {
      const result = await service.runAgentOnPr(args.repo, args.pr, args.agent);
      if (result.kind === 'error') return toolError(result.message, result.next);
      return toolSuccess(result.data);
    },
  );
}
