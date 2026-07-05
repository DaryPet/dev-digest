/**
 * get_blast_radius tool registration — STUB. [presentation, imports SDK]
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolSuccess } from '../errors.js';
import { getBlastRadiusInput } from '../schemas.js';

export function registerGetBlastRadius(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      description: 'STUB: blast radius of a PR (not implemented yet).',
      inputSchema: getBlastRadiusInput,
    },
    async (_args: { repo: string; pr: number }) => {
      return toolSuccess({
        status: 'not_implemented',
        message: 'Blast radius analysis is not yet implemented. Check back in a future version.',
      });
    },
  );
}
