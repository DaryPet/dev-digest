/**
 * get_blast_radius tool registration. [presentation, imports SDK]
 *
 * SDK-isolation preserved: McpService returns McpResult<BlastResponse>;
 * this handler converts via toolError/toolSuccess — no business logic here.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolError, toolSuccess } from '../errors.js';
import { getBlastRadiusInput } from '../schemas.js';
import type { McpService } from '../application/mcp-service.js';

export function registerGetBlastRadius(server: McpServer, service: McpService): void {
  server.registerTool(
    'get_blast_radius',
    {
      description:
        'Return the blast radius of a PR: changed symbols, callers, impacted endpoints and crons. Zero LLM calls — reads the persistent code index only.',
      inputSchema: getBlastRadiusInput,
    },
    async (args: { repo: string; pr: number }) => {
      const result = await service.getBlastRadius(args.repo, args.pr);
      if (result.kind === 'error') return toolError(result.message, result.next);
      return toolSuccess(result.data);
    },
  );
}
